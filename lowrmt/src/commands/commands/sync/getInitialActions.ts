import { isEqual as deepEqual } from 'lodash';
import * as path from 'path';
import FsStructure, {
  FsFileStructure,
  FsDirStructure,
  getKeys,
  getSubStructure,
  getStatFromStructure
} from './fsStructure';
import InitialAction from './initialAction';
import { SyncActionType } from './synchronize/finalAction';

type AnyStructure = FsFileStructure | FsDirStructure | { type: 'non-existing' };

function getInitialActionsRecursive(
  local: AnyStructure,
  remote: AnyStructure,
  base: AnyStructure,
  relativePath: string
): InitialAction[] {
  const actions: InitialAction[] = [];

  function getDirSyncActionsRecursive(): InitialAction[] {
    let actions: InitialAction[] = [];

    const names = getKeys(local, remote, base);

    for (const name of names) {
      const newRelativePath = relativePath
        ? path.join(relativePath, name)
        : name;
      const subActions = getInitialActionsRecursive(
        getSubStructure(local, name),
        getSubStructure(remote, name),
        getSubStructure(base, name),
        newRelativePath
      );
      actions.push(...subActions);
    }

    return actions;
  }

  function getSyncActions(type: SyncActionType): InitialAction[] {
    let actions: InitialAction[] = [];

    if (local.type === 'dir' && remote.type === 'dir') {
      const subActions=getDirSyncActionsRecursive();
      actions.push(...subActions);
    }else{
      actions.push({
        type,
        relativePath
      } as InitialAction);
    }

    return actions;
  }

  if (deepEqual(local, remote)) {
    if (!deepEqual(local, base)) {
      return [{ type: 'updateBase', relativePath }];
    }
  } else if (deepEqual(local, base)) {
    if (!deepEqual(local, remote)) {
      return getSyncActions('syncToLocal');
    }
  } else {
    if (deepEqual(remote, base)) {
      return getSyncActions('syncToRemote');
    } else {
      if (local.type === 'dir' && remote.type === 'dir') {
        return getDirSyncActionsRecursive();
      }
      return [
        {
          type: 'askUser',
          relativePath,
          local: getStatFromStructure(relativePath, local),
          remote: getStatFromStructure(relativePath, remote)
        }
      ];
    }
  }

  return actions;
}

export interface GetInitialActionsOptions {
  local: FsStructure;
  remote: FsStructure;
  base: FsStructure;
}

export default function getInitialActions({
  local,
  remote,
  base
}: GetInitialActionsOptions) {
  const names = getKeys(local, remote, base);

  return names.reduce(
    (acc, name) => {
      return acc.concat(
        getInitialActionsRecursive(
          getSubStructure(local, name),
          getSubStructure(remote, name),
          getSubStructure(base, name),
          name
        )
      );
    },
    [] as InitialAction[]
  );
}
