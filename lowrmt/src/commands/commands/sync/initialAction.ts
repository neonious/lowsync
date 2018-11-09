import { FsStat, FsAnyStat } from './fsStat';
import FinalAction from './synchronize/finalAction';

export interface AskUserAction {
  type: 'askUser';
  relativePath: string | null;
  local: FsAnyStat;
  remote: FsAnyStat;
}

type InitialAction = FinalAction | AskUserAction;

export function isAskUserAction(
  action: InitialAction
): action is AskUserAction {
  return action.type === 'askUser';
}

export function isFinalAction(action: InitialAction): action is FinalAction {
  return !isAskUserAction(action);
}

export default InitialAction;
