import { preparePostData } from '@common/src/common/miscUtil';
import { isJavascriptFile } from '@common/src/common/pathUtil';
import {
  WebdavNoProgressOptions,
  WebdavService
} from '@common/src/services/http/webdav';
import * as path from 'path';
import * as fs from 'fs-extra';
import SyncLog from './syncLog';
import { join } from 'path';
import {
  FsStatStructure,
  getSubStructure,
  FsDirStructure,
  FsAnyStructure
} from '../fsStructure';
import { osRelPathToRootedPosix } from '../util';
const babel = require('babel-core');
import * as assert from 'assert';
import { RunError } from '../../../../runError';

export class SyncToRemoteError extends Error {
  constructor(public readonly path: string, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function transpileJavaScript(
  source: string
): { compiled: string; map: string } {
  const result = babel.transform(source, {
    presets: [require('babel-preset-es2015'), require('babel-preset-stage-2')],
    sourceMaps: 'both'
  });
  const compiled = result.code;
  const map = JSON.stringify(result.map);
  assert(compiled, 'No code');
  assert(map, 'No map');
  return {
    compiled,
    map
  };
} // todo make sure all dot files are excluded and .build not synced

async function synchronizeToRemoteRecursive(
  rootDir: string,
  relPath: string,
  local: FsAnyStructure,
  noTranspile: boolean,
  syncLog: SyncLog[],
  webdavService: WebdavService
): Promise<void> {
  const posixPath = osRelPathToRootedPosix(relPath);
  const fullPath = path.join(rootDir, relPath);
  if (local.type === 'file') {
    let data;
    try {
      data = await fs.readFile(fullPath);
    } catch {
      throw new SyncToRemoteError(fullPath, 'Failed to read file on PC.');
    }
    const putBinaryFile = async (
      data: Uint8Array,
      options: WebdavNoProgressOptions = {}
    ) => {
      try {
        await webdavService.putBinaryFile(posixPath, data, { ...options });
      } catch {
        throw new SyncToRemoteError(
          posixPath,
          'Failed to transfer file to remote.'
        );
      }
    };
    if (isJavascriptFile(path.basename(fullPath)) && !noTranspile) {
      const source = data.toString();
      const { compiled, map } = transpileJavaScript(source);
      const createUint8Array = (s: string) => new Uint8Array(Buffer.from(s));

      const { buffer, headers } = await preparePostData(
        createUint8Array(source),
        createUint8Array(compiled),
        createUint8Array(map)
      );
      await putBinaryFile(buffer, { headers });
      syncLog.push({
        op: 'add',
        statType: 'file',
        path: posixPath
      });
    } else {
      if (data.byteLength === 0) {
        await putBinaryFile(null as any); // todo
      } else {
        await putBinaryFile(data);
      }
      syncLog.push({
        op: 'add',
        statType: 'file',
        path: posixPath
      });
    }
  } else if (local.type === 'dir') {
    try {
      await webdavService.createDirectory(posixPath);
    } catch {
      throw new SyncToRemoteError(
        posixPath,
        'Failed to create folder on remote.'
      );
    }
    syncLog.push({
      op: 'add',
      statType: 'dir',
      path: posixPath
    });
    for (const filename of Object.keys(local.content)) {
      await synchronizeToRemoteRecursive(
        rootDir,
        join(relPath, filename),
        getSubStructure(local, filename),
        noTranspile,
        syncLog,
        webdavService
      );
    }
  } else {
    syncLog.push({
      op: 'remove',
      path: posixPath
    });
  }
}

export interface SynchronizeToRemoteOptions {
  rootDir: string;
  relPath: string;
  local: FsAnyStructure;
  remote: FsAnyStructure;
  noTranspile: boolean;
  syncLog: SyncLog[];
  webdavService: WebdavService;
}

export default async function synchronizeToRemote({
  rootDir,
  relPath,
  local,
  remote,
  noTranspile,
  syncLog,
  webdavService
}: SynchronizeToRemoteOptions) {
  try {
    if (remote.type !== 'non-existing') {
      const slashPath = osRelPathToRootedPosix(relPath);
      try {
        await webdavService.deleteFile(slashPath);
      } catch {
        throw new SyncToRemoteError(
          slashPath,
          'Failed to delete file/folder on remote.'
        );
      }
    }

    await synchronizeToRemoteRecursive(
      rootDir,
      relPath,
      local,
      noTranspile,
      syncLog,
      webdavService
    );
  } catch (e) {
    if (e instanceof SyncToRemoteError) {
      throw new RunError(
        `Error syncing file/folder to the microcontroller. ${e.message} Path: ${e.path}`
      );
    }
    throw e;
  }
}
