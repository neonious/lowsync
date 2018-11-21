import { join } from 'path';
import { FsAnyStructure, getSubStructure } from '../fsStructure';
import { SyncFile, SyncFileFakeRemove } from './syncFile';

function getToLocalFilesRecursive(
  relPath: string,
  remote: FsAnyStructure,
  syncLog: SyncFile[],
  fakeSyncLog: SyncFileFakeRemove[]
) {
  if (remote && remote.type === 'file') {
    syncLog.push({
      destside: 'pc',
      type: 'add',
      statType: 'file',
      relPath
    });
  } else if (remote && remote.type === 'dir') {
    syncLog.push({
      destside: 'pc',
      type: 'add',
      statType: 'dir',
      relPath
    });
    for (const filename of Object.keys(remote.content)) {
      getToLocalFilesRecursive(
        join(relPath, filename),
        getSubStructure(remote, filename),
        syncLog,
        fakeSyncLog
      );
    }
  } else {
    fakeSyncLog.push({
      destside: 'pc',
      relPath
    });
  }
}

export interface SynchronizeToLocalOptions {
  relPath: string;
  remote: FsAnyStructure;
  syncLog: SyncFile[];
  fakeSyncLog: SyncFileFakeRemove[];
}

export function getToLocalFiles({
  relPath,
  remote,
  syncLog,
  fakeSyncLog
}: SynchronizeToLocalOptions) {
  syncLog.push({
    destside: 'pc',
    type: 'remove',
    relPath
  });

  getToLocalFilesRecursive(relPath, remote, syncLog, fakeSyncLog);
}
