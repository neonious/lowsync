import * as fs from 'fs-extra';
import * as path from 'path';
import { FsStat } from '..';
import matchesAnyGlob from './matchesAnyGlob';

async function getStatsForDir(
  rootDir: string,
  dir: string,
  excludeGlobs: string[]
) {
  const relPaths = await fs.readdir(dir);
  const stats: FsStat[] = [];
  for (const relPath of relPaths) {
    const filePath = path.join(dir, relPath);
    const relPathFromRoot = path.relative(rootDir, filePath);
    if (matchesAnyGlob(relPathFromRoot.replace(/\\/g, '/'), excludeGlobs))
      continue;
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const subStats = await getStatsForDir(rootDir, filePath, excludeGlobs);
      stats.push({
        type: 'dir',
        relativePath: relPathFromRoot
      });
      stats.push(...subStats);
    } else {
      const md5File = require('md5-file/promise');
      stats.push({
        type: 'file',
        relativePath: relPathFromRoot,
        size: stat.size,
        md5: await md5File(filePath)
      });
    }
  }
  return stats;
}

export interface GetLocalFilesOptions {
  rootDir: string;
  excludeGlobs: string[];
}

export default async function getLocalFiles({
  rootDir,
  excludeGlobs
}: GetLocalFilesOptions) {
  if (await fs.pathExists(rootDir)) {
    return getStatsForDir(rootDir, rootDir, excludeGlobs);
  }
  return [];
}
