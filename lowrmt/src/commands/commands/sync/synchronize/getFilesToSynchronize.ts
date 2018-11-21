import FsStructure, { getSubStructure } from '../fsStructure';
import FinalAction from './finalAction';
import { SyncFile, SyncFileFakeRemove } from './syncFile';
import { getToRemoteFiles } from './getToRemoteFiles';
import { getToLocalFiles } from './getToLocalFiles';

export interface SynchronizeOptions {
  local: FsStructure;
  remote: FsStructure;
  actions: FinalAction[];
  syncLog: SyncFile[];
  fakeSyncLog: SyncFileFakeRemove[];
}

export function getFilesToSynchronize({
  local: localRoot,
  remote: remoteRoot,
  actions,
  syncLog,
  fakeSyncLog
}: SynchronizeOptions) {
  for (const action of actions) {
    const remote = getSubStructure(remoteRoot, action.relativePath);
    switch (action.type) {
      case 'syncToRemote': {
        getToRemoteFiles({
          relPath: action.relativePath,
          local: getSubStructure(localRoot, action.relativePath),
          remote,
          syncLog,
          fakeSyncLog
        });
        break;
      }
      case 'syncToLocal': {
        getToLocalFiles({
          relPath: action.relativePath,
          remote,
          syncLog,
          fakeSyncLog
        });
        break;
      }
    }
  }
}
