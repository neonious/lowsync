import FsStructure, {
  FsDirStructureContent,
  FsStatStructure
} from './fsStructure';
import {
  loadJsonFile,
  saveJsonFile
} from '../../../../../common/src/common/jsonUtil';

namespace OldVersion {
  interface SizeMd5 {
    size: number;
    md5: string;
  }

  export interface File extends SizeMd5 {}

  export interface Dir {
    [name: string]: Dir | File;
  }
}

function isNewDataFormat(
  config: FsDirStructureContent | OldVersion.Dir
): config is FsDirStructureContent {
  return Object.keys(config).every(key => {
    const value = config[key] as FsStatStructure;
    return value.type === 'file' || value.type === 'dir';
  });
}

function convertToNewStat(
  dirOrFile: OldVersion.Dir | OldVersion.File
): FsStatStructure {
  const { size, md5 } = dirOrFile as Partial<OldVersion.File>;
  if (typeof size === 'number' && md5) {
    return { type: 'file', size, md5 };
  }
  return convertToNewDataFormat(dirOrFile as OldVersion.Dir);
}

function convertToNewDataFormat(dir: OldVersion.Dir): FsStructure {
  const stats: FsDirStructureContent = {};
  for (const key of Object.keys(dir)) {
    stats[key] = convertToNewStat(dir[key]);
  }
  return { type: 'dir', content: stats };
}

export async function loadSyncDataFile(path: string): Promise<FsStructure> {
  const data = await loadJsonFile<FsDirStructureContent | OldVersion.Dir>(
    path,
    {}
  );
  if (isNewDataFormat(data)) {
    return {
      type: 'dir',
      content: data
    };
  } else {
    return convertToNewDataFormat(data);
  }
}

export async function saveSyncDataFile(path: string, data: FsStructure) {
  await saveJsonFile(path, data.content);
}
