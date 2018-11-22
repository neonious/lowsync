export interface SyncToLocalAction {
  type: 'syncToLocal';
  relativePath: string;
}

export interface SyncToRemoteAction {
  type: 'syncToRemote';
  relativePath: string;
}

export interface UpdateBaseAction {
  type: 'updateBase';
  relativePath: string;
}

type FinalAction = SyncToLocalAction | SyncToRemoteAction | UpdateBaseAction;

export type SyncAction = SyncToLocalAction | SyncToRemoteAction;

export type SyncActionType = SyncAction['type'];

export default FinalAction;
