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
import { GetRequestError } from '@common/src/services/http/webdav';
import { RunError } from '../../../../runError';
import { osRelPathToRootedPosix } from '../util';
import { SyncFile } from './syncFile';
const babel = require('babel-core');
import rimraf = require('rimraf');
import * as cliProgress from 'cli-progress';
import FsStructure, { setInStructure, FsAnyStructure, getStatFromStructure, getSubStructure } from '../fsStructure';
import { saveSyncDataFile } from '../syncDataFile';
import { FsFileStat } from '../fsStat';

const baseHeaders = {'is-lowrmt':'1'};

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
  noTranspile: boolean,
  base:FsStructure,
  remote:FsStructure,
  local:FsStructure,
  syncFilePath:string
) {
  async function dirToPc(relPath:string) {
    const {fullPath}=getPaths(relPath);
    try {
      await fs.mkdirp(fullPath);
    } catch (e) {
      throw new SyncToLocalError(
        fullPath,
        `The directory could not be created on the PC.`,
        e
      );
    }
    await setInStructureFromRelPath(relPath,{type:"dir",content:{}});
  }

  async function fileToPc(relPath:string) {
    const {posixPath,fullPath}=getPaths(relPath);
    const result = await webdavService.findBinaryFile(posixPath,{headers:baseHeaders});
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
    const sub = getSubStructure(remote,relPath);
    const {md5,size} = getStatFromStructure(relPath,sub) as FsFileStat;
    await setInStructureFromRelPath(relPath,{type:'file',md5,size});
  }

  function getPaths(relPath:string){
    const posixPath = osRelPathToRootedPosix(relPath);
      const fullPath = path.join(rootDir, relPath);
      return {posixPath,fullPath};
  }

  async function dirToMc(relPath:string) {
      const {posixPath}=getPaths(relPath);
    try {
      await webdavService.createDirectory(posixPath,{headers:baseHeaders});
    } catch (e) {
      throw new SyncToRemoteError(
        posixPath,
        'Failed to create folder on remote.',
        e
      );
    }
    await setInStructureFromRelPath(relPath,{type:"dir",content:{}});
  }

  async function fileToMc(relPath:string) {
      const {posixPath,fullPath}=getPaths(relPath);
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
      await putBinaryFile(buffer, { headers:{...headers,...baseHeaders} });
    } else {
      if (data.byteLength === 0) {
        await putBinaryFile(null as any,{headers:baseHeaders}); // todo
      } else {
        await putBinaryFile(data,{headers:baseHeaders});
      }
    }
    const sub = getSubStructure(local,relPath);
    const {md5,size} = getStatFromStructure(relPath,sub) as FsFileStat;
    await setInStructureFromRelPath(relPath,{type:'file',md5,size});
  }

  async function setInStructureFromRelPath(relPath:string,
    statStruct: FsAnyStructure){
      setInStructure(base,relPath,statStruct);
      await saveSyncDataFile(syncFilePath, base);
    }

  return async function(files: SyncFile[]) {
    const bar = new cliProgress.Bar({
        format: '{file} |{bar}| {percentage}%',
        stream: process.stdout,
        barsize: 30
    }, cliProgress.Presets.shades_classic);
    bar.start(files.length, 0, {file:'Preparing synchronization...'});

    let val=0;
    for (const file of files) {
      bar.update(val,{file:`Synchronizing: ${file.relPath}`});
      const {posixPath,fullPath}=getPaths(file.relPath);
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
                    await new Promise((resolve, reject) =>
                      rimraf(fullPath, err => (err ? reject(err) : resolve()))
                    );
                    await setInStructureFromRelPath(file.relPath,{type:"non-existing"}); 
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
                  await webdavService.deleteFile(posixPath,{headers:baseHeaders});
                  await setInStructureFromRelPath(file.relPath,{type:"non-existing"}); 
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
    }
    bar.update(val,{file:`Synchronization complete`});
    bar.stop();
  };
}
