import { HostPrefixHandler } from '@common/src/hooks/hostPrefix';
import { HttpService } from '@common/src/services/http/http';
import { WebdavService } from '@common/src/services/http/webdav';
import { TYPES } from '@common/src/types';
import { inject, injectable } from 'inversify';
import { cloneDeep } from 'lodash';
import * as path from 'path';
import { SyncOptions } from '../../args';
import { getConfigPath } from '../../config';
import { LOWTYPES } from '../../ioc/types';
import { RunError } from '../../runError';
import { Command } from '../command';
import askUser from './sync/askUser';
import getLocalFiles from './sync/fsStat/files/local';
import getRemoteFiles from './sync/fsStat/files/remote';
import FsStructure, {
  setInStructure,
  getSubStructure,
  toStructure,
  FsStatStructure
} from './sync/fsStructure';
import getInitialActions from './sync/getInitialActions';
import { isAskUserAction, isFinalAction } from './sync/initialAction';
import { loadSyncDataFile, saveSyncDataFile } from './sync/syncDataFile';
import synchronize from './sync/synchronize';
import FinalAction from './sync/synchronize/finalAction';
import SyncLog from './sync/synchronize/syncLog';
import fs = require('fs-extra');
import * as assert from 'assert';
import { HttpApiService } from '../../../../common/src/services/http/api';
import inquirer = require('inquirer');
import { toFlatStructure } from '../../../../common/src/settings/util';

const prompt = inquirer.createPromptModule();

@injectable()
export class SyncCommand extends Command {
  private get syncDir(): string {
    try {
      const value = this.config.syncDir;
      if (!path.isAbsolute(value)) {
        return path.resolve(path.dirname(getConfigPath()), value);
      }
      return value;
    } catch (e){
      throw new RunError(
        `Cannot resolve sync directory '${
          this.config.syncDir
        }' to a valid path.`,
        e
      );
    }
  }

  private get exclude() {
    return [
      ...(this.config.exclude || []),
      '**/lowrmt.auth.config.json',
      '**/lowrmt.sync.config.json',
      '**/lowrmt.config.json'
    ];
  }

  constructor(
    @inject(LOWTYPES.Options) private options: SyncOptions,
    @inject(TYPES.HttpApiService) private httpApiService: HttpApiService,
    @inject(TYPES.WebdavService) private webdavService: WebdavService,
    @inject(TYPES.HttpService) private httpService: HttpService,
    @inject(TYPES.HostPrefixHandler)
    private hostPrefixHandler: HostPrefixHandler
  ) {
    super('sync', {
      requestConfig: ['syncDir', 'transpile', 'exclude']
    });
  }

  private get syncFilePath(): string {
    return path.join(process.cwd(), 'lowrmt.sync.config.json');
  }

  private async updateBase(
    actions: FinalAction[],
    local: FsStructure,
    remote: FsStructure,
    base: FsStructure
  ) {
    base = cloneDeep(base);
    for (const action of actions) {
      switch (action.type) {
        case 'syncToRemote':
        case 'updateBase': {
          const subStruct = getSubStructure(local, action.relativePath);
          setInStructure(
            base,
            action.relativePath,
            subStruct as FsStatStructure
          );
          break;
        }
        case 'syncToLocal': {
          const subStruct = getSubStructure(remote, action.relativePath);
          setInStructure(
            base,
            action.relativePath,
            subStruct as FsStatStructure
          );
          break;
        }
      }
    }
    await saveSyncDataFile(this.syncFilePath, base);
  }

  private async prepareSyncFolder() {
    if (!(await fs.pathExists(this.syncDir))) {
      await fs.mkdirp(this.syncDir);
      console.log(
        `Created directory '${this.syncDir}' because it does not exist yet.`
      );
    } else {
      const stat = await fs.stat(this.syncDir);
      if (!stat.isDirectory()) {
        throw new RunError(
          `Cannot synchonize with directory '${
            this.syncDir
          }' because a file exists in the same location.`
        );
      }
    }
  }

  private get doTranspile() {
    let noTranspile = false;
    if (typeof this.options.noTranspile !== 'undefined') {
      noTranspile = this.options.noTranspile;
    } else if (typeof this.config.transpile !== 'undefined') {
      noTranspile = !this.config.transpile;
    }
    return !noTranspile;
  }

  async run() {
    // const { code: { status } } = await this.httpApiService.Status({ code: true });

    // let startAfterSync=false;
    // if (status!=='stopped'){
    //   const { restart } = await prompt<{restart:boolean}>({
    //     name: 'restart',
    //     type: 'confirm',
    //     message: 'The user application is currently running (or paused). Stop before and restart after sync?',
    //     default: true,
    //   });
    //   if (restart){
    //     startAfterSync=true;
    //     console.log('Stopping program...')
    //     await this.httpApiService.Stop();
    //     console.log('Syncing...')
    //   }
    // }

    await this.prepareSyncFolder();

    const localFiles = await getLocalFiles({
      rootDir: this.syncDir,
      excludeGlobs: this.exclude
    });
    const localFileStruct = toStructure(localFiles);

    const remoteFiles = await getRemoteFiles({
      excludeGlobs: this.exclude,
      httpService: this.httpService,
      hostPrefixHandler: this.hostPrefixHandler
    });
    const remoteFilesStruct = toStructure(remoteFiles);

    const baseFilesStruct = await loadSyncDataFile(this.syncFilePath);

    const actions = getInitialActions({
      local: localFileStruct,
      remote: remoteFilesStruct,
      base: baseFilesStruct
    });

    const userFinalActions = await askUser({
      actions: actions.filter(isAskUserAction)
    });

    const finalActions = actions.filter(isFinalAction).concat(userFinalActions);

    const syncLog: SyncLog[] = [];

    await synchronize({
      rootDir: this.syncDir,
      local: localFileStruct,
      remote: remoteFilesStruct,
      actions: finalActions,
      noTranspile: !this.doTranspile,
      syncLog,
      webdavService: this.webdavService
    });

    if (
      !finalActions.filter(
        a => a.type === 'syncToLocal' || a.type === 'syncToRemote'
      ).length
    ) {
      console.log('Nothing to synchonize.');
    }

    await this.updateBase(
      finalActions,
      localFileStruct,
      remoteFilesStruct,
      baseFilesStruct
    );

    for (const { op, statType, path } of syncLog) {
      const sym = op === 'add' ? '+' : '-';
      const fd =
        statType === 'dir'
          ? 'Folder'
          : statType === 'file'
          ? 'File'
          : 'File/Folder';
      console.log(`${sym}${fd} ${path}`);
    }

    // if (startAfterSync){
    //   console.log('Starting program again...')
    //   const settings = await this.httpApiService.GetSettings();
    //   let flatSettings = toFlatStructure<any>(settings);
    //   let result = await this.httpApiService.Start({ action: 'start', file:flatSettings.code__main });
    //   if (result==='FILE_NOT_FOUND'){
    //     throw new RunError(`The file to start (${flatSettings.code__main}) does not exist.`);
    //   }else if (result){
    //     throw new RunError('Could not start program: ' + result);
    //   }
    // }
  }
}
