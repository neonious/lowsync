import { httpApi } from '../../../common/src/http/httpApiService';
import { SyncOptions } from '../../args';
import { RunError } from '../../runError';
import { getExistingOrNewConfigPath } from '../../util';
import askUser from './sync/askUser';
import getLocalFiles from './sync/fsStat/files/local';
import getRemoteFiles from './sync/fsStat/files/remote';
import FsStructure, {
  FsStatStructure,
  getSubStructure,
  setInStructure,
  toStructure
} from './sync/fsStructure';
import getInitialActions from './sync/getInitialActions';
import { isAskUserAction, isFinalAction } from './sync/initialAction';
import { loadSyncDataFile, saveSyncDataFile } from './sync/syncDataFile';
import FinalAction from './sync/synchronize/finalAction';
import { getFilesToSynchronize } from './sync/synchronize/getFilesToSynchronize';
import {
  getFileSynchronizer,
  SyncFile,
  SyncFileAdd,
  SyncFileFakeRemove
} from './sync/synchronize/syncFile';
import * as fs from 'fs-extra';
import * as inquirer from 'inquirer';
import { checkAndAskToRestart } from './sync/askToRestart';
import { startMonitorPrompt } from './sync/startMonitorPrompt';
import { configFile } from '../../config/configFile';

export default async function(options: SyncOptions) {
  const config = {
    syncDir: (await configFile.getKey('syncDir'))!,
    exclude: await configFile.getKey('exclude'),
    transpile: await configFile.getKey('transpile')
  };

  function exclude() {
    return [
      ...(config.exclude || []),
      '**/lowsync.auth.config.json',
      '**/lowsync.sync.config.json',
      '**/lowsync.config.json'
    ];
  }

  function syncFilePath(): string {
    return getExistingOrNewConfigPath('lowsync.sync.config.json');
  }

  async function updateBase(
    actions: FinalAction[],
    local: FsStructure,
    base: FsStructure
  ) {
    for (const action of actions) {
      if (action.type === 'updateBase') {
        const subStruct = getSubStructure(local, action.relativePath);
        setInStructure(base, action.relativePath, subStruct as FsStatStructure);
      }
    }
    await saveSyncDataFile(syncFilePath(), base);
  }

  async function prepareSyncFolder() {
    if (!(await fs.pathExists(config.syncDir))) {
      await fs.mkdirp(config.syncDir);
      console.log(
        `Created directory '${config.syncDir}' because it does not exist yet.`
      );
    } else {
      const stat = await fs.stat(config.syncDir);
      if (!stat.isDirectory()) {
        throw new RunError(
          `Cannot synchonize with directory '${
            config.syncDir
          }' because a file exists in the same location.`
        );
      }
    }
  }

  async function doTranspile() {
    let noTranspile = false;
    if (typeof options.noTranspile !== 'undefined') {
      noTranspile = options.noTranspile;
    } else if (typeof config.transpile !== 'undefined') {
      noTranspile = !config.transpile;
    }
    return !noTranspile;
  }

  await prepareSyncFolder();

  console.log('Fetching file system listings...');

  const localFiles = await getLocalFiles({
    rootDir: config.syncDir,
    excludeGlobs: exclude()
  });
  const localFileStruct = toStructure(localFiles);

  const { stats: remoteFiles, hadPut } = await getRemoteFiles({
    excludeGlobs: exclude()
  });
  if (!hadPut) {
    const syncFileExists = await fs.pathExists(syncFilePath());
    if (localFiles.length && syncFileExists) {
      const prompt = inquirer.createPromptModule();
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
      await fs.unlink(syncFilePath());
    }

    await httpApi.SetLowSyncHadPut();
  }
  const remoteFilesStruct = toStructure(remoteFiles);

  const baseFilesStruct = await loadSyncDataFile(syncFilePath());

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

  await updateBase(finalActions, localFileStruct, baseFilesStruct);

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
      config.syncDir,
      !doTranspile,
      baseFilesStruct,
      remoteFilesStruct,
      localFileStruct,
      syncFilePath()
    );

    await synchronizer(syncLog);
  }

  let mcChanged = false;
  for (const { destside, relPath, statType } of syncLog.filter(
    s => s.type === 'add'
  ) as SyncFileAdd[]) {
    const direction = destside === 'pc' ? 'MC => PC' : 'PC => MC';
    const fd = statType === 'dir' ? 'Folder' : 'File';
    console.log(`${direction}: +${fd} ${relPath}`);
    if (destside === 'mc') mcChanged = true;
  }
  for (const { destside, relPath } of fakeSyncLog) {
    const direction = destside === 'pc' ? 'MC => PC' : 'PC => MC';
    console.log(`${direction}: -File/Folder ${relPath}`);
    if (destside === 'mc') mcChanged = true;
  }

  await checkAndAskToRestart({
    mcChanged,
    autoRestart: options.restart
  });

  await startMonitorPrompt({
    monitor: options.monitor
  });
}
