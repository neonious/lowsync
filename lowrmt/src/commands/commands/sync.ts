import fs = require('fs-extra');
import { RawConfig, Config, getConfigPath } from '../../config';
import inquirer = require('inquirer');
import { InitOptions, StatusOptions, StartOptions, UpdateOptions, StopOptions, SettingsOptions, MonitorOptions, SyncOptions } from '../../args';
import { isUndefined } from 'util';
import replaceExt = require('replace-ext');
import { ArgumentOutOfRangeError } from 'rxjs';
import { RunError } from '../../runError';
import { Command } from '../command';
import { injectable, inject } from 'inversify';
import * as prettyjson from 'prettyjson';
import { map, mapValues, pickBy, size, uniq, keyBy, omit, isEqual, cloneDeep, values, differenceBy } from 'lodash';
import { pad } from 'underscore.string';
import * as rimraf from 'rimraf';
const md5File = require('md5-file/promise');
import { LOWTYPES } from '../../ioc/types';
import { parseString } from 'xml2js';
import { getStatusText } from 'http-status-codes';
const babel = require("babel-core");
import * as minimatch from 'minimatch';
import * as path from 'path';
import { TYPES } from '@common/src/types';
import { WebdavService, GetRequestError, WebdavNoProgressOptions } from '@common/src/services/http/webdav';
import { HttpService } from '@common/src/services/http/http';
import { HostPrefixHandler } from '@common/src/hooks/hostPrefix';
import { loadJsonFile, saveJsonFile } from '@common/src/common/jsonUtil';
import { isJavascriptFile } from '@common/src/common/pathUtil';
import { preparePostData } from '@common/src/common/miscUtil';

interface SizeMd5 {
    size: number;
    md5: string;
}

interface PathFileInfo extends SizeMd5 {
    path: string;
}
type PathDirInfo = string;
type PathInfo = PathFileInfo | PathDirInfo;

function getStatusTextNoError(status: number) {
    try {
        getStatusText(status);
    } catch{
        return null;
    }
}

interface PropfindData {
    multistatus: {
        response: {
            href: string;
            propstat: {
                prop: {
                    getcontentlength: string;
                    md5sum: string;
                } | {}
            }
        }[]
    }
}

namespace Action {
    export interface SyncToRemote {
        type: 'syncToRemote';
    }

    export interface SyncToLocal {
        type: 'syncToLocal';
    }

    export interface UpdateBase {
        type: 'updateBase';
    }

    export interface Confirm {
        type: 'confirm';
    }

    export type UserSyncChoice = SyncToRemote | SyncToLocal;
    export type NonConfirmAction = UserSyncChoice | UpdateBase;
    export type Action = NonConfirmAction | Confirm;
}
type Action = Action.Action;
type NonConfirmAction = Action.Action;
type UserSyncChoice = Action.UserSyncChoice;
type SubAction = Action.Action & {
    path: string;
}

namespace Sig {
    abstract class AbstractSig {
        readonly abstract type: 'file' | 'dir';
        isFile(): this is File { return this.type === 'file' }
        isDirectory(): this is Dir { return this.type === 'dir' }
    }
    export class File extends AbstractSig {
        readonly type = 'file';
        constructor(public readonly data: Sig.Data.File) {
            super();
        }
    }
    export class Dir extends AbstractSig {
        readonly type = 'dir';
        constructor(public readonly data: Sig.Data.Dir) {
            super();
        }
        setData(file: string, data: Data | null, replace: boolean) {
            let curSig: Sig.Data.Dir = this.data;
            const parts = file.split(path.sep);
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    if (!data) {
                        delete curSig[part];
                    } else {
                        if (replace || !curSig[part] || !Data.isDir(data) || !Data.isDir(curSig[part])) {
                            curSig[part] = data;
                        }
                    }
                    break;
                }
                const subSig = curSig[part];
                if (!subSig || !Data.isDir(subSig)) {
                    curSig[part] = {}
                }
                curSig = curSig[part] as Sig.Data.Dir;
            }
        }
    }
    export function create(data: Sig.Data): Sig {
        if (Data.isDir(data)) {
            return new Dir(data);
        }
        return new File(data);
    }
    export namespace Data {
        export interface File extends SizeMd5 {
        }

        export interface Dir {
            [name: string]: Dir | File;
        }

        export function isDir(sig: Data): sig is Dir {
            return !('md5' in sig && typeof (sig as File).md5 === 'string');
        }
    }
    export type Data = Data.Dir | Data.File;
}
type Sig = Sig.Dir | Sig.File;

class SubSyncLocation {
    static create(path: string, sig: Sig | null): ISubSyncLocation {
        if (!sig)
            return new NoneSyncLocation(path);
        if (sig.isDirectory()) {
            return new DirSyncLocation(path, sig);
        }
        return new FileSyncLocation(path, sig);
    }
}

type Constructor<T> = new (...args: any[]) => T;
function mixinPathSyncLocation<TT extends 'dir' | 'file' | 'none', T extends Constructor<ISyncLocationBase>>(Base: T) {
    return class extends Base implements IPathSyncLocation<TT> {
        isFile(): this is IFileSyncLocation {
            return this.type === 'file';
        }
        isDirectory(): this is IDirSyncLocation {
            return this.type === 'dir';
        }
        isNone(): this is INoneSyncLocation {
            return this.type === 'none';
        }

        readonly type: TT;
        readonly path: string;

        constructor(...args: any[]) {
            super(args[0]);

            const { path: file, type } = args[0] as { path: string, type: TT };

            this.type = type;
            this.path = file;
        }
    }
}

interface ISyncLocationBase {
    deepEquals(other: ISyncLocationBase): boolean;
    getData(): Sig.Data | null;
    readonly children: ISubSyncLocation[];
    getByName(name: string): ISubSyncLocation;
    getByPath(path: string): ISubSyncLocation;
}
interface IContainerSyncLocation {
}
interface IPathSyncLocation<T extends 'dir' | 'file' | 'none'> {
    readonly type: T;
    readonly path: string;
    isFile(): this is IFileSyncLocation;
    isDirectory(): this is IDirSyncLocation;
    isNone(): this is INoneSyncLocation;
}

interface IDirSyncLocation extends ISyncLocationBase, IPathSyncLocation<'dir'>, IContainerSyncLocation {
}
interface IFileSyncLocation extends ISyncLocationBase, IPathSyncLocation<'file'> {
}
interface INoneSyncLocation extends ISyncLocationBase, IPathSyncLocation<'none'> {
}
type ISubSyncLocation = IDirSyncLocation | IFileSyncLocation | INoneSyncLocation;
interface IRootSyncLocation extends ISyncLocationBase, IContainerSyncLocation {
}
type IRootOrSubSyncLocation = IRootSyncLocation | ISubSyncLocation

interface ISyncInfoBase {
    readonly local: ISubSyncLocation;
    readonly remote: ISubSyncLocation;
    readonly base: ISubSyncLocation;
    readonly names: string[];
    getByName(name: string): ISubSyncInfo;
    getByPath(path: string): ISubSyncInfo;
}
interface IContainerSyncInfo<T extends IContainerSyncLocation> {
}
interface IPathSyncInfo {
    readonly path: string;
}
interface IRootSyncInfo extends ISyncInfoBase, IContainerSyncInfo<IRootSyncLocation> { }
type ISubSyncInfo = ISyncInfoBase & IPathSyncInfo;

class SyncLocationBase implements ISyncLocationBase {
    private args: { path: string, type: string, sig: Sig | null };
    constructor(...args: any[]) {
        this.args = args[0];
        const { path: file, sig } = args[0] as { path: string | null, sig: Sig.Dir };
        this._path = file;

        if (sig && Sig.Data.isDir(sig.data)) {
            const names = Object.keys(sig.data);
            names.forEach(name => {
                const subPath = file ? path.join(file, name) : name;
                const subSig = Sig.create(sig.data[name]);
                this._children[name] = SubSyncLocation.create(subPath, subSig);
            });
            this.children.push(...values(this._children));
        }

    }
    deepEquals(other: SyncLocationBase): boolean {
        if (this.args.type === other.args.type) {
            return isEqual(this.args.sig && this.args.sig.data, other.args.sig && other.args.sig.data);
        }
        return false;
    }
    getData(): Sig.Data | null {
        return this.args.sig && this.args.sig.data || null;
    }
    private _children: Dict<ISubSyncLocation> = {};
    readonly children: ISubSyncLocation[] = [];

    private _path: string | null;

    getByName(name: string): ISubSyncLocation {
        return this._children[name] || new NoneSyncLocation(this._path ? path.join(this._path, name) : name)
    }

    getByPath(file: string): ISubSyncLocation {
        let result = this as IRootOrSubSyncLocation;
        const parts = file.split(path.sep);
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const next = result.getByName(part);
            if (next.isNone())
                return next;
            if (next.isFile() && i !== parts.length - 1) {
                return new NoneSyncLocation(file);
            }
            result = next;
        }
        return result as ISubSyncLocation;
    }
}

class RootSyncLocation extends SyncLocationBase {
    constructor(private sig: Sig.Dir) {
        super({ sig });
    }
}
class FileSyncLocation extends mixinPathSyncLocation<'file', Constructor<SyncLocationBase>>(SyncLocationBase) {
    constructor(path: string, sig: Sig | null) {
        super({ path, type: 'file', sig });
    }
}
class DirSyncLocation extends mixinPathSyncLocation<'dir', Constructor<SyncLocationBase>>(SyncLocationBase) {
    constructor(path: string, sig: Sig.Dir) {
        super({ path, type: 'dir', sig });
    }
}
class NoneSyncLocation extends mixinPathSyncLocation<'none', Constructor<SyncLocationBase>>(SyncLocationBase) {
    constructor(path: string) {
        super({ path, type: 'none', sig: null });
    }
}

class SyncInfoBase {

    public local: ISubSyncLocation;
    public remote: ISubSyncLocation;
    public base: ISubSyncLocation;
    private _path: string | null;

    constructor(...args: any[]) {
        const { path, local, remote, base } = args[0];

        this._path = path;
        this.local = local;
        this.remote = remote;
        this.base = base;
    }

    private _names?: string[];
    get names(): string[] {
        if (!this._names) {
            const map = new Map<string, string>();
            for (const loc of [this.local, this.remote, this.base]) {
                for (const child of loc.children) {
                    const childPath = child.path!;
                    if (!map.has(childPath)) {
                        const name = path.basename(childPath);
                        map.set(childPath, name);
                    }
                }
            }
            this._names = uniq(Array.from(map.values()));
        }
        return this._names;
    }

    private getInternal(subPath: string, func: (loc: ISubSyncLocation) => ISubSyncLocation) {
        const localSub = func(this.local);
        const remoteSub = func(this.remote);
        const baseSub = func(this.base);
        return new SubSyncInfo(subPath, localSub, remoteSub, baseSub);
    }

    getByName(name: string): ISubSyncInfo {
        const subPath = this._path ? path.join(this._path, name) : name;
        return this.getInternal(subPath, loc => loc.getByName(name));
    }

    getByPath(path: string): ISubSyncInfo {
        return this.getInternal(path, loc => loc.getByPath(path));
    }
}

class RootSyncInfo extends SyncInfoBase {
    constructor(
        local: IRootSyncLocation,
        remote: IRootSyncLocation,
        base: IRootSyncLocation,
    ) {
        super({ path: null, local, remote, base })
    }
}

class SubSyncInfo extends SyncInfoBase {
    constructor(
        public readonly path: string,
        public readonly local: ISubSyncLocation,
        public readonly remote: ISubSyncLocation,
        public readonly base: ISubSyncLocation
    ) {
        super({ path, local, remote, base })
    }
}

const prompt = inquirer.createPromptModule();

@injectable()
export class SyncCommand extends Command {

    private get syncDir(): string {
        try {
            const value = this.config.syncDir;
            if (!path.isAbsolute(value)) {
                return path.resolve(path.dirname(getConfigPath()), value)
            }
            return value;
        } catch{
            throw new RunError(`Cannot resolve sync directory '${this.config.syncDir}' to a valid path.`);
        }
    }

    private get exclude() {
        return this.config.exclude;
    }

    constructor(
        @inject(LOWTYPES.Options) private options: SyncOptions,
        @inject(TYPES.WebdavService) private webdavService: WebdavService,
        @inject(TYPES.HttpService) private httpService: HttpService,
        @inject(TYPES.HostPrefixHandler) private hostPrefixHandler: HostPrefixHandler
    ) {
        super('sync', {
            requestConfig: ['syncDir', 'transpile', 'exclude']
        });
    }

    private get syncFilePath(): string {
        return path.join(process.cwd(), 'lowrmt.sync.config.json')
    }

    private transpileJavaScript(source: string): { compiled: string; map: string; } {
        const result = babel.transform(source, {
            presets: [
                "es2015",
                "stage-2"
            ],
            sourceMaps: 'both'
        });
        const compiled = result.code;
        const map = JSON.stringify(result.map)
        if (!compiled)
            throw new Error('no code');
        if (!map) {
            throw new Error('no map');
        }
        return {
            compiled,
            map
        }
    }
    private filesToSig(files: PathInfo[]): Sig.Dir {
        const sig = new Sig.Dir({});
        for (const file of files) {
            if (typeof file === 'string')
                sig.setData(file, {}, false)
            else {
                const { path, size, md5 } = file;
                sig.setData(path, { size, md5 }, false);
            }
        }
        return sig;
    }

    private async getFiles(dir: string): Promise<string[]> {
        const files = await fs.readdir(dir);
        const result: string[] = [];
        for (const relfile of files) {
            const file = path.join(dir, relfile);
            const stat = await fs.stat(file);
            if (stat.isDirectory()) {
                const subFiles = await this.getFiles(file);
                result.push(...subFiles);
                if (!subFiles.length)
                    result.push(file);
            } else {
                result.push(file)
            }
        }
        return result;
    }

    private async getLocalFiles(): Promise<PathInfo[]> {
        const infos: PathInfo[] = [];
        if (await fs.pathExists(this.syncDir)) {
            const files = await this.getFiles(this.syncDir);
            for (const file of files) {
                const stat = await fs.stat(file);
                const pathRel = path.relative(this.syncDir, file);
                if (!stat.isDirectory()) {
                    const size = stat.size;
                    const md5 = await md5File(file);
                    infos.push({
                        path: pathRel,
                        size,
                        md5
                    })
                } else {
                    infos.push(pathRel)
                }
            }
        }
        return infos;
    }

    private async getRemoteFiles(): Promise<PathInfo[]> {
        const { requestPromise } = this.httpService.send({
            method: 'PROPFIND',
            url: `${this.hostPrefixHandler.hostPrefix}/fs`,
            headers: {
                "Content-Type": "application/xml;charset=UTF-8",
                "lowrmt-md5": "1"
            }
        });
        const { responseText } = await requestPromise;
        const result = await new Promise<PropfindData>((resolve, reject) => {
            parseString(responseText, { explicitArray: false }, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            });
        });

        const infos: PathInfo[] = [];
        // console.log('Xml', JSON.stringify(result.multistatus.response, null, 4))
        for (const resp of result.multistatus.response) {
            let file = resp.href.slice('/fs'.length);
            if (file === '/')
                continue;
            if (file.endsWith('/'))
                file = file.slice(0, -1);
            file = file.slice(1);
            file = decodeURIComponent(file); // there were %20 in the string
            file = path.normalize(file); // will now use path.sep
            const obj = resp.propstat.prop;
            if ('getcontentlength' in obj) {
                const size = parseInt(obj.getcontentlength);
                const md5 = obj.md5sum;
                infos.push({
                    path: file,
                    size,
                    md5
                })
            } else {
                infos.push(file)
            }
        }
        //console.log('Remote files', JSON.stringify(infos, null, 4));
        return infos;
    }

    private async getBaseData(): Promise<Sig.Data.Dir> {
        const data = await loadJsonFile<Sig.Data.Dir>(this.syncFilePath, {});
        return data;
    }

    private dataToFiles(data: Sig.Data.Dir, prevpath?: string): PathInfo[] {
        const keys = Object.keys(data);
        const result: PathInfo[] = [];
        for (const key of keys) {
            const subData = data[key];
            const subPath = prevpath ? path.join(prevpath, key) : key;
            if (Sig.Data.isDir(subData)) {
                let subInfos = this.dataToFiles(subData, subPath);
                subInfos = subInfos.length ? subInfos : [subPath];
                result.push(...subInfos);
            } else {
                const { size, md5 } = subData;
                result.push({
                    path: subPath,
                    size,
                    md5
                })
            }
        }
        return result;
    }

    private excludeFiles(name: string, files: PathInfo[]): PathInfo[] {
        const exclude = this.exclude;
        if (exclude && exclude.length) {
            const dict: Dict<PathInfo> = {};
            for (const file of files) {
                const thepath = typeof file === 'string' ? file : file.path;
                let curfile = thepath;
                dict[curfile] = file;
                curfile = path.dirname(curfile)
                while (curfile && curfile !== '.') {
                    if (curfile in dict) {
                        break;
                    }
                    dict[curfile] = curfile;
                    curfile = path.dirname(curfile)
                }
            }
            files = values(dict);
            const excludeFiles = files.filter(f => {
                let path = typeof f === 'string' ? f : f.path;
                return exclude.some(glob => {
                    const result = minimatch(path.replace(/\\/g, '/'), glob);
                    // console.log('FILTER', name,result, path.replace(/\\/g, '/'), glob);
                    return result;
                })
            });
            if (excludeFiles.length) {
                //console.log(`Exclude files (${name}):\n${JSON.stringify(excludeFiles, null, 4)}`);
                files = differenceBy(files, excludeFiles, f => typeof f === 'string' ? f : f.path);
            }
        }
        return files;
    }

    private async saveBaseData(data: Sig.Data.Dir): Promise<void> {
        await saveJsonFile(this.syncFilePath, data);
    }

    private getFsPath(file: string): string {
        return path.join(this.syncDir, file);
    }

    private printFiles(paths: string[], info: RootSyncInfo, actions: Dict<UserSyncChoice>) {
        function getState(state: ISubSyncLocation) {
            switch (state.type) {
                case 'file':
                    return 'FILE';
                case 'dir':
                    return 'FOLDER';
                default:
                    return '-';
            }
        }

        function getAction(action?: UserSyncChoice) {
            if (!action)
                return '';
            switch (action.type) {
                case 'syncToRemote':
                    return 'LOCAL';
                case 'syncToLocal':
                    return 'REMOTE';
                default:
                    return 'LAST';
            }
        }

        const pathOutput = paths.map((path, i) => {
            const num = pad(`${i + 1}.`, 5);
            const { local, remote, base } = info.getByPath(path);
            const localState = pad(getState(local), 8);
            const remoteState = pad(getState(remote), 8);
            const syncedState = pad(getState(base), 8);
            const action = pad(getAction(actions[path]), 8);
            return [num, syncedState, localState, remoteState, action, path].join(' ');
        }).join('\n');

        console.log('The following files/folders cannot be synchronized automatically.');
        console.log(`${pad('', 5)} ${pad('Last', 8)} ${pad('Local', 8)} ${pad('Remote', 8)} ${pad('Action', 8)}`);
        console.log(pathOutput);
    }

    private async userModifyActions(paths: string[], info: RootSyncInfo, actions: Dict<UserSyncChoice>): Promise<Dict<UserSyncChoice>> {
        if (!paths.length)
            return {};
        this.printFiles(paths, info, actions);

        let choices = [
            {
                name: 'Apply local state for unhandled files.',
                value: 'local'
            },
            {
                name: 'Apply device state for unhandled files.',
                value: 'remote'
            }
        ]

        const numActions = size(actions);
        if (numActions > 1) {
            choices = [{
                name: 'Select an action for each file individually.',
                value: 'each'
            }, ...choices]
        }
        if (numActions) {
            choices = choices.concat([{
                name: 'Revert changes (set all files back to unhandled state).',
                value: 'revert'
            }])
        }
        if (numActions === paths.length) {
            choices = choices.concat([{
                name: 'START SYNCING!',
                value: 'sync'
            }])
        }

        const { action } = await prompt({
            name: 'action',
            type: 'list',
            message: 'An action must be chosen for each file. What do you want to do?',
            choices
        }) as any;

        switch (action) {
            case 'each':
                const newActions = await this.userModifyEachAction(paths, info, actions);
                return await this.userModifyActions(paths, info, newActions);
            case 'local':
                return await this.userModifyActions(paths, info, mapValues(keyBy(paths), () => {
                    return { type: 'syncToRemote' } as Action.UserSyncChoice
                }));
            case 'remote':
                return await this.userModifyActions(paths, info, mapValues(keyBy(paths), () => {
                    return { type: 'syncToLocal' } as Action.UserSyncChoice
                }));
            case 'revert':
                return await this.userModifyActions(paths, info, {});
            case 'sync':
                return actions;
            default:
                throw new Error('Unknown action: ' + action);
        }
    }

    private async userModifyEachAction(paths: string[], info: RootSyncInfo, actions: Dict<UserSyncChoice>): Promise<Dict<UserSyncChoice>> {
        this.printFiles(paths, info, actions);

        const { input } = await prompt({
            name: 'input',
            type: 'input',
            message: 'Please enter the number of the file you want to modify the action for, or enter "back" to stop selecting actions for individual files or if actions for all files have been selected.',
            validate: (value: string) => {
                if (value.toLowerCase() === 'back')
                    return true;
                if (!/\d+/.test(value))
                    return 'Input is not a valid number!';
                const num = parseInt(value);
                if (num < 1 || num > paths.length) {
                    return 'Input is not a valid number!';
                }
                return true;
            }
        }) as any;

        if (input !== 'back') {
            const num = parseInt(input);
            const path = paths[num - 1];
            const { action } = await prompt({
                name: 'action',
                type: 'list',
                message: 'Select an action for the file.',
                choices: [
                    {
                        name: 'Apply local state.',
                        value: 'local'
                    },
                    {
                        name: 'Apply device state.',
                        value: 'remote'
                    }
                ]
            }) as any;

            return await this.userModifyEachAction(paths, info, { ...actions, [path]: { type: action } })

        } else {
            return actions;
        }
    }

    private getSyncActions(
        info: IRootSyncInfo
    ) {
        const actions: Dict<Action> = {};
        for (const name of info.names) {
            for (const { path, type } of this.getSyncAction(info.getByName(name))) {
                actions[path] = { type } as Action;
            }
        }
        return actions;
    }

    private getSyncAction(
        info: ISubSyncInfo
    ): SubAction[] {
        const { path, local, remote, base } = info;

        if (local.deepEquals(remote)) {
            // both paths are up to date, no syncing needed
            // only update sync-file if needed
            if (!local.deepEquals(base)) {
                //console.log('Local === remote !== base, +updateBase action', remote.path);
                return [{ path, type: 'updateBase' }]
            }
            return [];
        }

        const getDirSyncActionsRecursive = () => {
            let actions: SubAction[] = [];
            for (const name of info.names) {
                const subActions = this.getSyncAction(info.getByName(name));
                actions = [...actions, ...subActions];
            }
            return actions;
        }

        function getSyncActionsRecursive(type: Action.Action['type']) {
            if (local.type !== remote.type || local.type !== 'dir') {
                return [{ path, type }] as SubAction[];
            } else {
                return getDirSyncActionsRecursive();
            }
        }

        if (local.deepEquals(base)) {
            if (!local.deepEquals(remote)) {
                //console.log(`Local === base && local !== remote, +syncToLocal action`, remote.path);
                return getSyncActionsRecursive('syncToLocal');
            }// else nothing whatsoever has changed
        } else {
            if (remote.deepEquals(base)) {
                //console.log(`Local !== base && remote === base, +syncToRemote action`, base.path);
                return getSyncActionsRecursive('syncToRemote');
            } else {
                // if we are here, every of the 3 states differs!

                if (local.isDirectory() && remote.isDirectory()) {
                    return getDirSyncActionsRecursive();
                }
                // we don't know what to do so ask user
                return [{ path, type: 'confirm' }]
            }
        }
        return [];
    }

    private async synchronize(actions: Dict<NonConfirmAction>, local: IRootSyncLocation, remote: IRootSyncLocation) {
        const paths = Object.keys(actions);
        for (const path of paths) {
            const localLoc = local.getByPath(path);
            const remoteLoc = remote.getByPath(path)
            switch (actions[path].type) {
                case 'syncToRemote':
                    console.log('Syncing to remote', localLoc.path);
                    await this.synchronizeToRemote(localLoc, remoteLoc);
                    break;
                case 'syncToLocal':
                    console.log('Syncing to local', remoteLoc.path);
                    await this.synchronizeToLocal(localLoc, remoteLoc);
                    break;
            }
        }
        if (!paths.length) {
            console.log('Nothing to synchonize.');
        }
    }

    private updateBase(actions: Dict<NonConfirmAction>, local: IRootSyncLocation, remote: IRootSyncLocation, sig: Sig.Dir) {
        const paths = Object.keys(actions);
        for (const path of paths) {
            const localLoc = local.getByPath(path);
            const remoteLoc = remote.getByPath(path);
            let data: Sig.Data | null;
            switch (actions[path].type) {
                case 'syncToRemote':
                    data = localLoc.getData();
                    break;
                case 'syncToLocal':
                    data = remoteLoc.getData();
                    break;
                case 'updateBase':
                    data = localLoc.getData();
                    break;
                default:
                    throw new Error('Unknown action type: ' + actions[path].type);
            }
            sig.setData(path, data, true);
        }
    }

    private async synchronizeToLocal(local: ISubSyncLocation, remote: ISubSyncLocation): Promise<void> {
        if (local.type !== 'none') {
            try {
                await new Promise((r, rj) => {
                    const fsPath = this.getFsPath(local.path);
                    rimraf(fsPath, (err) => err ? rj(err) : r());
                });
            } catch{
                throw new RunError(`The file/directory '${path}' cannot be synchronized to the local directory. The old file/directory could not be removed.`);
            }
        }

        await this.synchronizeToLocalRecursive(remote);
    }

    private getSlashPath(path: string) {
        const slashPath = '/' + path.replace(/\\/g, '/');
        return slashPath;
    }

    private async synchronizeToLocalRecursive(remote: ISubSyncLocation): Promise<void> {
        const slashPath = this.getSlashPath(remote.path);
        const fsPath = this.getFsPath(remote.path);
        if (remote.isFile()) {
            const result = await this.webdavService.findBinaryFile(slashPath);
            if (result instanceof GetRequestError) {
                throw new RunError(`The file '${slashPath}' cannot be synchronized to the local directory. An unexpected error occured.`);
            }
            const { status, data } = result;
            if (!status.toString().startsWith('2')) {
                const statusText = getStatusTextNoError(status);
                throw new RunError(`The file '${slashPath}' cannot be synchronized to the local directory. The remote returned the status code ${status}${statusText ? ` (${statusText})` : ''}.`);
            }
            if (!data) {
                throw new RunError(`The file '${slashPath}' cannot be synchronized to the local directory. The remote did not return any data.`);
            }
            try {
                console.log('+File', `"${slashPath}" -> "${fsPath}"`);
                await fs.writeFile(fsPath, data);
            } catch {
                throw new RunError(`The file '${slashPath}' cannot be synchronized to the local directory. The file could not be written.`);
            }
        } else if (remote.isDirectory()) {
            try {
                console.log('+Dir', fsPath);
                await fs.mkdirp(fsPath);
            } catch{
                throw new RunError(`The directory '${slashPath}' cannot be synchronized to the local directory. The directory could not be created.`);
            }
            for (const child of remote.children) {
                await this.synchronizeToLocalRecursive(child);
            }
        } else {
            console.log('-File/Dir', fsPath);
        }
    }

    private async synchronizeToRemote(local: ISubSyncLocation, remote: ISubSyncLocation): Promise<void> {
        if (remote.type !== 'none') {
            const slashPath = this.getSlashPath(local.path);
            await this.webdavService.deleteFile(slashPath);
        }
        await this.synchronizeToRemoteRecursive(local);
    }

    private async synchronizeToRemoteRecursive(local: ISubSyncLocation): Promise<void> {
        const slashPath = this.getSlashPath(local.path);
        const fsPath = this.getFsPath(local.path);
        if (local.isFile()) {
            const data = await fs.readFile(fsPath);
            let noTranspile = false;
            if (typeof this.options.noTranspile !== 'undefined') {
                noTranspile = this.options.noTranspile;
            } else if (typeof this.config.transpile !== 'undefined') {
                noTranspile = !this.config.transpile;
            }
            const putBinaryFile = async (data: Uint8Array, options: WebdavNoProgressOptions = {}) => {
                await this.webdavService.putBinaryFile(slashPath, data, { ...options });
            }
            if (isJavascriptFile(path.basename(fsPath)) && !noTranspile) {
                const source = data.toString();
                const { compiled, map } = this.transpileJavaScript(source);
                const createUint8Array = (s: string) => new Uint8Array(Buffer.from(s));

                const { buffer, headers } = await preparePostData(createUint8Array(source), createUint8Array(compiled), createUint8Array(map));
                console.log('+File', `"${fsPath}" -> "${slashPath}" + compiled files`);
                await putBinaryFile(buffer, { headers });
            } else {
                console.log('+File', `"${fsPath}" -> "${slashPath}"`);
                if (data.byteLength === 0) {
                    await putBinaryFile(null as any); // todo
                } else {
                    await putBinaryFile(data);
                }
            }
        } else if (local.isDirectory()) {
            console.log('+Dir', slashPath);
            await this.webdavService.createDirectory(slashPath);
            for (const child of local.children) {
                await this.synchronizeToRemoteRecursive(child);
            }
        } else {
            console.log('-File/Dir', slashPath)
        }
    }

    private getPath(info: PathInfo) {
        return typeof info === 'string' ? info : info.path;
    }

    async run() {

        if (!await fs.pathExists(this.syncDir)) {
            await fs.mkdirp(this.syncDir);
            console.log(`Created directory '${this.syncDir}' because it does not exist yet.`);
        } else {
            const stat = await fs.stat(this.syncDir);
            if (!stat.isDirectory()) {
                throw new RunError(`Cannot synchonize with directory '${this.syncDir}' because a file exists in the same location.`);
            }
        }
        const localFiles = this.excludeFiles('local', await this.getLocalFiles());
        if (localFiles.find(f => {
            const p = this.getPath(f);
            const i = p.indexOf(path.sep);
            return p.substr(0, i === -1 ? undefined : i) === '.build';
        })) {
            throw new RunError(`Cannot sync path '/.build' (reserved). Please exclude the path in the configuration, or remove the file/directory from the root level of the sync directory.`);
        }
        const localSig = this.filesToSig(localFiles);

        const remoteFiles = this.excludeFiles('remote', await this.getRemoteFiles());
        const remoteSig = this.filesToSig(remoteFiles);

        const baseData = await this.getBaseData();
        const baseFiles = this.dataToFiles(baseData);
        const filteredBaseSig = this.filesToSig(this.excludeFiles('base', baseFiles));
        const baseSig = this.filesToSig(baseFiles);

        // console.log('Sigs', JSON.stringify({ local: localSig.data, remote: remoteSig.data, base: filteredBaseSig.data }, null, 4));

        const syncInfo = new RootSyncInfo(
            new RootSyncLocation(localSig),
            new RootSyncLocation(remoteSig),
            new RootSyncLocation(filteredBaseSig)
        );

        const actions = this.getSyncActions(syncInfo);

        const confirmPaths = Object.keys(actions).filter(path => actions[path].type === 'confirm');

        const newActions = await this.userModifyActions(confirmPaths, syncInfo, {});
        //console.log('New Actions', JSON.stringify(newActions, null, 4))
        const finalActions = { ...actions, ...newActions } as Dict<NonConfirmAction>;
        //console.log('Final Actions', JSON.stringify(finalActions, null, 4))
        const { local, remote } = syncInfo;
        await this.synchronize(finalActions, local, remote);
        this.updateBase(finalActions, local, remote, baseSig);
        await this.saveBaseData(baseSig.data);
    }
}

