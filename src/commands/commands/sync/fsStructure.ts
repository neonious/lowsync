import { FsAnyStat, FsStat } from './fsStat';
import * as assert from 'assert';

export interface FsFileStructure {
  type: 'file';
  size: number;
  md5: string;
}

export interface FsDirStructure {
  type: 'dir';
  content: FsDirStructureContent;
}

export interface FsDirStructureContent {
  [filename: string]: FsStatStructure;
}

type FsStructure = FsDirStructure;

const NON_STRUCT = { type: 'non-existing' } as FsAnyStructure;

function getSubStructureFilename(struct: FsAnyStructure, name: string) {
  if (struct.type === 'dir') return struct.content[name]||NON_STRUCT;
  return NON_STRUCT;
}

export function getSubStructure(struct: FsAnyStructure, relPath: string) {
  const parts = relPath.split(/[\\/]/g);

  return parts.reduce((acc, cur) => {
    return getSubStructureFilename(acc, cur);
  }, struct);
}

export function getKeys(...structs: FsAnyStructure[]) {
  const dict = {};
  for (const struct of structs) {
    if (struct.type === 'dir') Object.assign(dict, struct.content);
  }
  return Object.keys(dict);
}

export function getStatFromStructure(
  relativePath: string,
  struct: FsAnyStructure
): FsAnyStat {
  switch (struct.type) {
    case 'file':
      const { size, md5 } = struct;
      return { type: 'file', relativePath, size, md5 };
    case 'dir':
      return { type: 'dir', relativePath };
    default:
      return { type: 'non-existing' };
  }
}

export function setInStructure(
  struct: FsStructure,
  relativePath: string,
  statStruct: FsAnyStructure
) {
  const parts = relativePath.split(/[\\/]/g);
  let cur = struct;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let next = cur.content[part];
    if (statStruct.type!=='non-existing'){
      if (i < parts.length - 1) {
        assert(!next||next.type === 'dir', 'Set in structure: Must be directory.');
        next = next||<FsDirStructure>{ type: 'dir', content: {} };
      } else {
        if (!next||next.type!=='dir'||statStruct.type!=='dir') // else will override children from existing dir, if we replace dir with new dir
        {
          next = statStruct;
        }
      }
      cur.content[part] = next;
    }else{
      if (i<parts.length-1){
        if (!next||next.type==='file')
          break;
      }else{
        if (!next) break;
        delete cur.content[part];
      }
    }
    
    if (i<parts.length-1)
      cur = next as FsDirStructure;
  }
}

export function toStructure(stats: FsStat[]): FsStructure {
  const result: FsStructure = { type: 'dir', content: {} };
  for (const stat of stats) {
    switch (stat.type) {
      case 'file':
        const { size, md5 } = stat;
        setInStructure(result, stat.relativePath, { type: 'file', size, md5 });
        break;
      case 'dir':
        setInStructure(result, stat.relativePath, { type: 'dir', content: {} });
        break;
    }
  }
  return result;
}

export type FsStatStructure = FsFileStructure | FsDirStructure;

export type FsAnyStructure = FsStatStructure | { type: 'non-existing' };

export default FsStructure;
