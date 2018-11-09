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
  constructor(public readonly path: string, message: string) {
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
    } catch {
      throw new SyncToLocalError(
        fullPath,
        `The file could not be written on the PC.`
      );
    }
    syncLog.push({
      op: 'add',
      statType: 'file',
      path: fullPath
    });
  } else if (remote && remote.type === 'dir') {
    try {
      await fs.mkdirp(fullPath);
    } catch {
      throw new SyncToLocalError(
        fullPath,
        `The directory could not be created on the PC.`
      );
    }
    syncLog.push({
      op: 'add',
      statType: 'dir',
      path: fullPath
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
      op: 'remove',
      path: fullPath
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
      } catch {
        throw new SyncToLocalError(
          fullPath,
          `The file/folder could not be removed on the PC.`
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
        `Error syncing file/folder to the PC. ${e.message} Path: ${e.path}`
      );
    }
    throw e;
  }
}
