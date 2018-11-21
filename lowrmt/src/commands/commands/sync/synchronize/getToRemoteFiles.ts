import { join } from 'path';
import { FsAnyStructure, getSubStructure } from '../fsStructure';
import { SyncFile, SyncFileFakeRemove } from './syncFile';

function getToRemoteFilesRecursive(
  relPath: string,
  local: FsAnyStructure,
  syncLog: SyncFile[],
  fakeSyncLog: SyncFileFakeRemove[]
): void {
  if (local.type === 'file') {
    syncLog.push({
      destside: 'mc',
      type: 'add',
      statType: 'file',
      relPath
    });
  } else if (local.type === 'dir') {
    syncLog.push({
      destside: 'mc',
      type: 'add',
      statType: 'dir',
      relPath
    });
    for (const filename of Object.keys(local.content)) {
      getToRemoteFilesRecursive(
        join(relPath, filename),
        getSubStructure(local, filename),
        syncLog,
        fakeSyncLog
      );
    }
  } else {
    fakeSyncLog.push({
      destside: 'mc',
      relPath
    });
  }
}

export interface SynchronizeToRemoteOptions {
  relPath: string;
  local: FsAnyStructure;
  remote: FsAnyStructure;
  syncLog: SyncFile[];
  fakeSyncLog: SyncFileFakeRemove[];
}

export function getToRemoteFiles({
  relPath,
  local,
  remote,
  syncLog,
  fakeSyncLog
}: SynchronizeToRemoteOptions) {
  if (remote.type !== 'non-existing') {
    syncLog.push({
      type: 'remove',
      destside: 'mc',
      relPath
    });
  }

  getToRemoteFilesRecursive(relPath, local, syncLog, fakeSyncLog);
}
