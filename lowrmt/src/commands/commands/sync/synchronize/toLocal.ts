import * as fs from 'fs-extra';
import { getStatusText } from 'http-status-codes';
import { join } from 'path';
import rimraf = require('rimraf');
import SyncLog from './syncLog';
import {
  FsAnyStructure,
  FsStatStructure,
  getSubStructure
} from '../fsStructure';
import {
  WebdavService,
  GetRequestError
} from '../../../../../../common/src/services/http/webdav';
import { osRelPathToRootedPosix } from '../util';
import { RunError } from '../../../../runError';

export class SyncToLocalError extends Error {
  constructor(public readonly path: string, message: string, public readonly inner?: any) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function getStatusTextNoError(status: number) {
  try {
    getStatusText(status);
  } catch {
    return null;
  }
}

async function synchronizeToLocalRecursive(
  rootDir: string,
  relPath: string,
  remote: FsAnyStructure,
  syncLog: SyncLog[],
  webdavService: WebdavService
) {
  const posixPath = osRelPathToRootedPosix(relPath);
  const fullPath = join(rootDir, relPath);
  if (remote && remote.type === 'file') {
    const result = await webdavService.findBinaryFile(posixPath);
    if (result instanceof GetRequestError) {
      throw new SyncToLocalError(posixPath, `Could not get file from remote.`);
    }
    const { status, data } = result;
    if (!status.toString().startsWith('2')) {
      const statusText = getStatusTextNoError(status);
      throw new SyncToLocalError(
        posixPath,
        `Could not get file from remote. The remote returned the status code ${status}${
          statusText ? ` (${statusText})` : ''
        }.`
      );
    }
    if (!data) {
      throw new SyncToLocalError(
        posixPath,
        `The remote did not return any data for the file.`
      );
    }
    try {
      await fs.writeFile(fullPath, data);
    } catch (e){
      throw new SyncToLocalError(
        fullPath,
        `The file could not be written on the PC.`,
        e
      );
    }
    syncLog.push({
      side:'pc',
      op: 'add',
      statType: 'file',
      path: relPath
    });
  } else if (remote && remote.type === 'dir') {
    try {
      await fs.mkdirp(fullPath);
    } catch (e){
      throw new SyncToLocalError(
        fullPath,
        `The directory could not be created on the PC.`,
        e
      );
    }
    syncLog.push({
      side:'pc',
      op: 'add',
      statType: 'dir',
      path: relPath
    });
    for (const filename of Object.keys(remote.content)) {
      await synchronizeToLocalRecursive(
        rootDir,
        join(relPath, filename),
        getSubStructure(remote, filename),
        syncLog,
        webdavService 
      );
    }
  } else {
    syncLog.push({
      side: 'pc',
      op: 'remove',
      path: relPath 
    });
  }
}

export interface SynchronizeToLocalOptions {
  rootDir: string;
  relPath: string;
  remote: FsAnyStructure;
  syncLog: SyncLog[];
  webdavService: WebdavService;
}

export default async function synchronizeToLocal({
  rootDir,
  relPath,
  remote,
  syncLog,
  webdavService
}: SynchronizeToLocalOptions) {
  try {
    const fullPath = join(rootDir, relPath);
    if (await fs.pathExists(fullPath)) {
      try {
        await new Promise((resolve, reject) =>
          rimraf(fullPath, err => (err ? reject(err) : resolve()))
        );
      } catch(e) {
        throw new SyncToLocalError(
          fullPath,
          `The file/folder could not be removed on the PC.`,
          e
        );
      }
    }

    await synchronizeToLocalRecursive(
      rootDir,
      relPath,
      remote,
      syncLog,
      webdavService
    );
  } catch (e) {
    if (e instanceof SyncToLocalError) {
      throw new RunError(
        `Error syncing file/folder to the PC. ${e.message} Path: ${e.path}`,e
      );
    }
    throw e;
  }
}
