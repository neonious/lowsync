import { HostPrefixHandler } from '@common/src/hooks/hostPrefix';
import { HttpService } from '@common/src/services/http/http';
import { WebdavService } from '@common/src/services/http/webdav';
import { TYPES } from '@common/src/types';
import { inject, injectable } from 'inversify';
import { cloneDeep } from 'lodash';
import * as path from 'path';
import { SyncOptions } from '../../args';
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
import FinalAction from './sync/synchronize/finalAction';
import fs = require('fs-extra');
import * as assert from 'assert';
import { HttpApiService } from '@common/src/services/http/api';
import inquirer = require('inquirer');
import {
  SyncFileFakeRemove,
  SyncFile,
  getFileSynchronizer,
  SyncFileAdd
} from './sync/synchronize/syncFile';
import { getFilesToSynchronize } from './sync/synchronize/getFilesToSynchronize';
import { relative, join } from 'path';

const prompt = inquirer.createPromptModule();

@injectable()
export class SyncCommand extends Command<'syncDir' | 'transpile' | 'exclude'> {
  readonly requestConfig = { syncDir: true, transpile: true, exclude: true };
  readonly usingNoRemoteApis = false;

  private get exclude() {
    return [
      ...(this.config.exclude || []),
      '**/lowsync.auth.config.json',
      '**/lowsync.sync.config.json',
      '**/lowsync.config.json'
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
    super('sync');
  }

  private get syncFilePath(): string {
    return path.join(process.cwd(), 'lowsync.sync.config.json');
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
    if (!(await fs.pathExists(this.config.syncDir))) {
      await fs.mkdirp(this.config.syncDir);
      console.log(
        `Created directory '${this.config.syncDir}' because it does not exist yet.`
      );
    } else {
      const stat = await fs.stat(this.config.syncDir);
      if (!stat.isDirectory()) {
        throw new RunError(
          `Cannot synchonize with directory '${
            this.config.syncDir
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
    const {
      code: { status }
    } = await this.httpApiService.Status({ code: true });

    let startAfterSync = false;
    if (status !== 'stopped') {
      const { restart } = await prompt<{ restart: boolean }>({
        name: 'restart',
        type: 'confirm',
        message:
          'The user application is currently running (or paused). Stop before and restart after sync?',
        default: true
      });
      if (restart) {
        startAfterSync = true;
        console.log('Stopping program...');
        await this.httpApiService.Stop();
        console.log('Syncing...');
      }
    }

    await this.prepareSyncFolder();

    console.log('Fetching file system listings...');

    const localFiles = await getLocalFiles({
      rootDir: this.config.syncDir,
      excludeGlobs: this.exclude
    });
    const localFileStruct = toStructure(localFiles);

    const { stats: remoteFiles, hadPut } = await getRemoteFiles({
      excludeGlobs: this.exclude,
      httpService: this.httpService,
      hostPrefixHandler: this.hostPrefixHandler
    });
    if (!hadPut) {
      const syncFileExists = await fs.pathExists(this.syncFilePath);
      if (localFiles.length && syncFileExists) {
        const { action } = await prompt<{ action: 'abort' | 'initial_sync' }>({
          name: 'action',
          type: 'list',
          message:
            'The filesystem of the microcontroller has not been synced before. What would you like to do?',
          default: 'abort',
          choices: [
            {
              name: 'Abort synchronization',
              value: 'abort'
            },
            {
              name:
                'Discard sync history and do an initial sync. This will ask you how to proceed where files exist both locally and remotely and differ. NO existing files or folders will be automatically overridden.',
              value: 'initial_sync'
            }
          ]
        });

        if (action === 'abort') {
          return;
        }
      }

      if (syncFileExists) {
        await fs.unlink(this.syncFilePath);
      }
    }
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

    const syncLog: SyncFile[] = [];
    const fakeSyncLog: SyncFileFakeRemove[] = [];

    if (
      !finalActions.filter(
        a => a.type === 'syncToLocal' || a.type === 'syncToRemote'
      ).length
    ) {
      console.log('Nothing to synchonize.');
    } else {
      getFilesToSynchronize({
        local: localFileStruct,
        remote: remoteFilesStruct,
        actions: finalActions,
        syncLog,
        fakeSyncLog
      });

      const synchronizer = getFileSynchronizer(
        this.config.syncDir,
        this.webdavService,
        !this.doTranspile
      );

      await synchronizer(syncLog);
    }

    await this.updateBase(
      finalActions,
      localFileStruct,
      remoteFilesStruct,
      baseFilesStruct
    );

    for (const { destside, relPath, statType } of syncLog.filter(
      s => s.type === 'add'
    ) as SyncFileAdd[]) {
      const direction = destside === 'pc' ? 'MC => PC' : 'PC => MC';
      const fd = statType === 'dir' ? 'Folder' : 'File';
      console.log(`${direction}: +${fd} ${relPath}`);
    }
    for (const { destside, relPath } of fakeSyncLog) {
      const direction = destside === 'pc' ? 'MC => PC' : 'PC => MC';
      console.log(`${direction}: -File/Folder ${relPath}`);
    }

    if (startAfterSync) {
      console.log('Restarting program...');
      let result = await this.httpApiService.Start({ action: 'start' });
      if (result === 'FILE_NOT_FOUND') {
        throw new RunError(`The file to start does not exist.`);
      } else if (result) {
        throw new RunError('Could not start program: ' + result);
      }
    }
  }
}
