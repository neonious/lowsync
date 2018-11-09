import rimraf = require('rimraf');
import synchronizeToLocal from './toLocal';
import synchronizeToRemote from './toRemote';
import FsStructure, { getSubStructure } from '../fsStructure';
import FinalAction from './finalAction';
import { WebdavService } from '../../../../../../common/src/services/http/webdav';
import SyncLog from './syncLog';

export interface SynchronizeOptions {
  rootDir: string;
  local: FsStructure;
  remote: FsStructure;
  actions: FinalAction[];
  noTranspile: boolean;
  syncLog: SyncLog[];
  webdavService: WebdavService;
}

export default async function synchronize({
  rootDir,
  local: localRoot,
  remote: remoteRoot,
  actions,
  noTranspile,
  syncLog,
  webdavService
}: SynchronizeOptions) {
  for (const action of actions) {
    const remote = getSubStructure(remoteRoot, action.relativePath);
    switch (action.type) {
      case 'syncToRemote': {
        await synchronizeToRemote({
          rootDir,
          relPath: action.relativePath,
          local: getSubStructure(localRoot, action.relativePath),
          remote,
          noTranspile,
          syncLog,
          webdavService
        });
        break;
      }
      case 'syncToLocal': {
        await synchronizeToLocal({
          rootDir,
          relPath: action.relativePath,
          remote,
          syncLog,
          webdavService
        });
        break;
      }
    }
  }
}
