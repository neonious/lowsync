import FsStructure, { setInStructure } from '../fsStructure';

export interface FsFileStat {
  type: 'file';
  relativePath: string;
  size: number;
  md5: string;
}

export interface FsDirStat {
  type: 'dir';
  relativePath: string;
}

export type FsAnyStat = FsStat | { type: 'non-existing' };

export type FsStat = FsFileStat | FsDirStat;
