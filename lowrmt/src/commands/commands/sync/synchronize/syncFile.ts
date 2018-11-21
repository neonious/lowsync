import { preparePostData } from '@common/src/common/miscUtil';
import { isJavascriptFile } from '@common/src/common/pathUtil';
import {
  WebdavNoProgressOptions,
  WebdavService
} from '@common/src/services/http/webdav';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import { getStatusText } from 'http-status-codes';
import * as path from 'path';
import { GetRequestError } from '../../../../../../common/src/services/http/webdav';
import { RunError } from '../../../../runError';
import { osRelPathToRootedPosix } from '../util';
import { SyncFile } from './syncFile';
const babel = require('babel-core');
import rimraf = require('rimraf');
import * as cliProgress from 'cli-progress';

function getStatusTextNoError(status: number) {
  try {
    getStatusText(status);
  } catch {
    return null;
  }
}
export class SyncToLocalError extends Error {
  constructor(
    public readonly path: string,
    message: string,
    public readonly inner?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class SyncToRemoteError extends Error {
  constructor(
    public readonly path: string,
    message: string,
    public readonly inner?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface SyncFileAdd {
  type: 'add';
  destside: 'mc' | 'pc';
  statType: 'file' | 'dir';
  relPath: string;
}

export interface SyncFileRemove {
  type: 'remove';
  destside: 'mc' | 'pc';
  relPath: string;
}

export interface SyncFileFakeRemove {
  destside: 'mc' | 'pc';
  relPath: string;
}

export type SyncFile = SyncFileAdd | SyncFileRemove;

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

export function getFileSynchronizer(
  rootDir: string,
  webdavService: WebdavService,
  noTranspile: boolean
) {
  async function dirToPc(fullPath: string, posixPath: string) {
    try {
      await fs.mkdirp(fullPath);
    } catch (e) {
      throw new SyncToLocalError(
        fullPath,
        `The directory could not be created on the PC.`,
        e
      );
    }
  }

  async function fileToPc(fullPath: string, posixPath: string) {
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
    } catch (e) {
      throw new SyncToLocalError(
        fullPath,
        `The file could not be written on the PC.`,
        e
      );
    }
  }

  async function dirToMc(fullPath: string, posixPath: string) {
    try {
      await webdavService.createDirectory(posixPath);
    } catch (e) {
      throw new SyncToRemoteError(
        posixPath,
        'Failed to create folder on remote.',
        e
      );
    }
  }

  async function fileToMc(fullPath: string, posixPath: string) {
    let data;
    try {
      data = await fs.readFile(fullPath);
    } catch (e) {
      throw new SyncToRemoteError(fullPath, 'Failed to read file on PC.', e);
    }
    const putBinaryFile = async (
      data: Uint8Array,
      options: WebdavNoProgressOptions = {}
    ) => {
      try {
        await webdavService.putBinaryFile(posixPath, data, { ...options });
      } catch (e) {
        throw new SyncToRemoteError(
          posixPath,
          'Failed to transfer file to remote.',
          e
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
    } else {
      if (data.byteLength === 0) {
        await putBinaryFile(null as any); // todo
      } else {
        await putBinaryFile(data);
      }
    }
  }

  return async function(files: SyncFile[]) {
    const bar = new cliProgress.Bar({
        format: 'Synchronizing: {file} |{bar}| {percentage}%',
        stream: process.stdout,
        barsize: 30
    }, cliProgress.Presets.shades_classic);
    bar.start(files.length, 0);

    let val=0;
    for (const file of files) {
      bar.update(val,{file:file.relPath});
      const posixPath = osRelPathToRootedPosix(file.relPath);
      const fullPath = path.join(rootDir, file.relPath);
      switch (file.destside) {
        case 'pc': {
          try {
            switch (file.type) {
              case 'add': {
                switch (file.statType) {
                  case 'file': {
                    await fileToPc(fullPath, posixPath);
                    break;
                  }
                  case 'dir': {
                    await dirToPc(fullPath, posixPath);
                    break;
                  }
                }
                break;
              }
              case 'remove': {
                if (await fs.pathExists(fullPath)) {
                  try {
                    await new Promise((resolve, reject) =>
                      rimraf(fullPath, err => (err ? reject(err) : resolve()))
                    );
                  } catch (e) {
                    throw new SyncToLocalError(
                      fullPath,
                      `The file/folder could not be removed on the PC.`,
                      e
                    );
                  }
                }
                break;
              }
            }
          } catch (e) {
            if (e instanceof SyncToLocalError) {
              throw new RunError(
                `Error syncing file/folder to the PC. ${e.message} Path: ${
                  e.path
                }`,
                e
              );
            }
            throw e;
          }
          break;
        }
        case 'mc': {
          try {
            switch (file.type) {
              case 'add': {
                switch (file.statType) {
                  case 'file': {
                    await fileToMc(fullPath, posixPath);
                    break;
                  }
                  case 'dir': {
                    await dirToMc(fullPath, posixPath);
                    break;
                  }
                }
                break;
              }
              case 'remove': {
                try {
                  await webdavService.deleteFile(posixPath);
                } catch (e) {
                  throw new SyncToRemoteError(
                    posixPath,
                    'Failed to delete file/folder on remote.',
                    e
                  );
                }
                break;
              }
            }
          } catch (e) {
            if (e instanceof SyncToRemoteError) {
              throw new RunError(
                `Error syncing file/folder to the microcontroller. ${
                  e.message
                } Path: ${e.path}`,
                e
              );
            }
            throw e;
          }
          break;
        }
      }
      val++;
      bar.update(val);
    }

    bar.stop();
  };
}
