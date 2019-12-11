import * as fs from 'fs-extra';
import { httpApi } from '../../../common/src/http/httpApiService';
import { SyncOptions } from '../../args';
import { configFile } from '../../config/mainConfigFile';
import { getProgramStatus, restartProgram } from '../../http';
import { confirmOrDefault, promptList, promptBool } from '../../prompts';
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

export default async function(options: SyncOptions) {
  if(!options.toMc && !options.toPc)
    throw new RunError("Either --to-mc or --to-pc must be true");
  const config = {
    syncDir: (await configFile.getKey('syncDir'))!,
    exclude: await configFile.getKey('exclude'),
    transpile: await configFile.getKey('transpile')
  };

  function exclude() {
    return [
      ...(config.exclude || []),
      '**/.*',
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
          `Cannot syncronize with directory '${
            config.syncDir
          }' because a file exists in the same location.`
        );
      }
    }
  }

  function doTranspile() {
    let transpile = false;
    if (typeof options.transpile !== 'undefined') {
        transpile = options.transpile;
    } else if (typeof config.transpile !== 'undefined') {
        transpile = config.transpile;
    }
    return transpile;
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
    type T = 'abort' | 'initial_sync';
    const syncFileExists = await fs.pathExists(syncFilePath());
    if (localFiles.length && syncFileExists) {
      const action = await promptList<T>({
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

  let actions = getInitialActions({
    local: localFileStruct,
    remote: remoteFilesStruct,
    base: baseFilesStruct
  });

  if(!options.toMc)
    actions = actions.filter((action) => { return action.type != 'syncToRemote'; });
  if(!options.toPc)
    actions = actions.filter((action) => { return action.type != 'syncToLocal'; });
  const userFinalActions = await askUser({
    actions: actions.filter(isAskUserAction)
    },
    options.toMc,
    options.toPc
  );

  const finalActions = actions.filter(isFinalAction).concat(userFinalActions);

  const syncLog: SyncFile[] = [];
  const fakeSyncLog: SyncFileFakeRemove[] = [];

  await updateBase(finalActions, localFileStruct, baseFilesStruct);

  if (
    !finalActions.filter(
      a => a.type === 'syncToLocal' || a.type === 'syncToRemote'
    ).length
  ) {
    console.log('Nothing to syncronize.');
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
      !doTranspile(),
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

  const { restart: _rs, monitor: _mon } = options;

  if (!mcChanged && !_mon) return;

  const monitor = await confirmOrDefault({
    answer: _mon,
    message:
      'Would you like to show the output of the microcontroller? (Use the --monitor command line option to remove this prompt and enable/disable showing of the output after sync.)',
    defaultAnswer: true
  });

  let restart = false;
  if (_rs !== false) {
    if (_rs === true || monitor) {
      restart = true;
    } else {
      if (mcChanged) {
        const status = await getProgramStatus();
        if (status !== 'updating_sys') {
          const msg =
            status === 'stopped'
              ? 'Start the program now?'
              : 'Restart the currently running program for any changes to take effect?';
          restart = await promptBool({
            message:
              'The filesystem of the microcontroller has changed. ' +
              msg +
              ' (Use the --restart command line option to remove this prompt and enable/disable restart after sync.)',
            default: true
          });
        }
      }
    }
  }

  if (restart && mcChanged) {
    console.log('Restarting program...');
    await restartProgram();
  }

  if (monitor) {
    console.log('Starting monitor...');
    const websocket = await import('../../websocket');
    await websocket.monitor();
  }
}
