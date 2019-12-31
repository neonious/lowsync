import { preparePostData } from '@common/common/miscUtil';
import { isJavascriptFile } from '@common/common/pathUtil';
import * as assert from 'assert';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  createDirectory,
  deleteFile,
  getFile,
  putFile
} from '../../../../../common/src/http/webdav';
import { RunError } from '../../../../runError';
import { FsFileStat } from '../fsStat';
import FsStructure, {
  FsAnyStructure,
  getStatFromStructure,
  getSubStructure,
  setInStructure
} from '../fsStructure';
import { saveSyncDataFile } from '../syncDataFile';
import { osRelPathToRootedPosix } from '../util';
import { SyncFile } from './syncFile';
import { McHttpError } from '../../../../../common/src/http/mcHttpError';

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
  const babel = require('@babel/core');
  const result = babel.transform(source, {
    presets: [require("@babel/preset-env")],
    configFile: false,
    sourceMaps: true,
    parserOpts: {
            allowReturnOutsideFunction: true
          }
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
  noTranspile: boolean,
  base: FsStructure,
  remote: FsStructure,
  local: FsStructure,
  syncFilePath: string
) {
  async function dirToPc(relPath: string) {
    const { fullPath } = getPaths(relPath);
    try {
      await fs.mkdirp(fullPath);
    } catch (e) {
      throw new SyncToLocalError(
        fullPath,
        `The directory could not be created on the PC.`,
        e
      );
    }
    await setInStructureFromRelPath(relPath, { type: 'dir', content: {} });
  }

  async function fileToPc(relPath: string) {
    const { posixPath, fullPath } = getPaths(relPath);
    const data = await getFile(posixPath);
    try {
      await fs.writeFile(fullPath, data.arrayBuffer);
    } catch (e) {
      throw new SyncToLocalError(
        fullPath,
        `The file could not be written on the PC.`,
        e
      );
    }
    const sub = getSubStructure(remote, relPath);
    const { md5, size } = getStatFromStructure(relPath, sub) as FsFileStat;
    await setInStructureFromRelPath(relPath, { type: 'file', md5, size });
  }

  function getPaths(relPath: string) {
    const posixPath = osRelPathToRootedPosix(relPath);
    const fullPath = path.join(rootDir, relPath);
    return { posixPath, fullPath };
  }

  async function dirToMc(relPath: string) {
    const { posixPath } = getPaths(relPath);
    await createDirectory(posixPath);
    await setInStructureFromRelPath(relPath, { type: 'dir', content: {} });
  }

  async function fileToMc(relPath: string) {
    const { posixPath, fullPath } = getPaths(relPath);
    let data;
    try {
      data = await fs.readFile(fullPath);
    } catch (e) {
      throw new SyncToRemoteError(fullPath, 'Failed to read file on PC.', e);
    }
    if (isJavascriptFile(path.basename(fullPath)) && !noTranspile) {
      const source = data.toString();
      const { compiled, map } = transpileJavaScript(source);
      const createUint8Array = (s: string) => new Uint8Array(Buffer.from(s));

      const { buffer, headers } = await preparePostData(
        createUint8Array(source),
        createUint8Array(compiled),
        createUint8Array(map)
      );
      await putFile(posixPath, buffer, { headers });
    } else {
      if (data.byteLength === 0) {
        await putFile(posixPath, null as any);
      } else {
        await putFile(posixPath, data);
      }
    }
    const sub = getSubStructure(local, relPath);
    const { md5, size } = getStatFromStructure(relPath, sub) as FsFileStat;
    await setInStructureFromRelPath(relPath, { type: 'file', md5, size });
  }

  async function setInStructureFromRelPath(
    relPath: string,
    statStruct: FsAnyStructure
  ) {
    setInStructure(base, relPath, statStruct);
    await saveSyncDataFile(syncFilePath, base);
  }

  return async function(files: SyncFile[]) {
    const bar = new cliProgress.Bar(
      {
        format: '{pre} |{bar}| {percentage}%{file}',
        stream: process.stdout,
        barsize: 30
      },
      cliProgress.Presets.shades_classic
    );
    bar.start(files.length, 0, { pre: 'Preparing synchronization...' });

    let val = 0;
    for (const file of files) {
      bar.update(val, { pre: `Synchronizing...`, file: ` | ${file.relPath}` });
      const { posixPath, fullPath } = getPaths(file.relPath);
      switch (file.destside) {
        case 'pc': {
          try {
            switch (file.type) {
              case 'add': {
                switch (file.statType) {
                  case 'file': {
                    await fileToPc(file.relPath);
                    break;
                  }
                  case 'dir': {
                    await dirToPc(file.relPath);
                    break;
                  }
                }
                break;
              }
              case 'remove': {
                if (await fs.pathExists(fullPath)) {
                  try {
                    const rimraf = require('rimraf');
                    await new Promise((resolve, reject) =>
                      rimraf(fullPath, (err: any) =>
                        err ? reject(err) : resolve()
                      )
                    );
                    await setInStructureFromRelPath(file.relPath, {
                      type: 'non-existing'
                    });
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
            } else if (e instanceof McHttpError) {
              throw new RunError(
                `Error syncing file/folder to the PC. ${e.message}`,
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
                    await fileToMc(file.relPath);
                    break;
                  }
                  case 'dir': {
                    await dirToMc(file.relPath);
                    break;
                  }
                }
                break;
              }
              case 'remove': {
                try {
                  await deleteFile(posixPath);
                  await setInStructureFromRelPath(file.relPath, {
                    type: 'non-existing'
                  });
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
            } else if (e instanceof McHttpError) {
              throw new RunError(
                `Error syncing file/folder to the microcontroller. ${
                  e.message
                }`,
                e
              );
            }
            throw e;
          }
          break;
        }
      }
      val++;
    }
    bar.update(val, { pre: `Synchronization complete`, file: '' });
    bar.stop();
  };
}
