import { maxBy } from 'lodash';
import { rpad } from 'underscore.string';
import { AskUserAction } from './initialAction';
import * as inquirer from 'inquirer';
import FinalAction, { SyncActionType } from './synchronize/finalAction';
import { FsAnyStat } from './fsStat';
import { osRelPathToRootedPosix } from './util';



class ConsoleColumns {
  private numCols?: number;
  private rows: string[][] = [];

  appendRow(cols: string[]) {
    if (typeof this.numCols !== 'undefined' && cols.length !== this.numCols)
      throw new Error(
        'Columns numbers do not match previously recorded column numbers: ' +
          this.numCols
      );
    this.numCols = cols.length;
    this.rows.push(cols);
  }

  writeAll(writeFunction: (str?: string) => void) {
    if (typeof this.numCols === 'undefined')
      throw new Error('No columns were added.');

    const maxColumnsLengths = [];
    for (let col = 0; col < this.numCols; col++) {
      const rowWithMaxCol = maxBy(this.rows, r => r[col].length) || [];
      maxColumnsLengths.push(rowWithMaxCol[col].length);
    }

    let had=false;
    for (const row of this.rows) {
    
      let printRowStr = '';
      for (let col = 0; col < row.length; col++) {
        const maxWidth = maxColumnsLengths[col];
        printRowStr += rpad(row[col], maxWidth + 2); // 2 for space between columns
      }
      writeFunction(printRowStr);
      if (!had){
        writeFunction(); // space between header and first real row
        had=true;
      }
    }
  }
}

function normalizePath(path: string | null) {
  return (path || '/').replace(/\\/g, '/');
}

function getStatDescription(stat: FsAnyStat) {
  if (stat.type === 'non-existing') return 'Non-existent.';
  if (stat.type === 'file') {
    return `File, ${stat.size} bytes.`;
  }
  return 'Folder.';
}

function getProblem(local: FsAnyStat, remote: FsAnyStat) {
  if (local.type === 'non-existing') {
    return 'Exists only on remote side.';
  }
  if (remote.type === 'non-existing') {
    return 'Exists only on local side.';
  }
  if (local.type === 'file' && remote.type === 'file') {
    return 'File content differs.';
  }
  return 'File or folder?';
}

function getWarnings(from: FsAnyStat, to: FsAnyStat) {
  if (from.type === 'non-existing') return ['DELETES file/folder'];
  if (to.type === 'dir') return ['REPLACES/DELETES folder'];
  return [];
}

export interface AskUserOptions {
  actions: AskUserAction[];
}

export default async function askUser({ actions }: AskUserOptions) {
  const result: FinalAction[] = [];

  if (!actions.length) return result;

  const problemIntro = `Some files or folders cannot be synced automatically. Your input is required in order to resolve these problems.`;

  const cols = new ConsoleColumns();

  cols.appendRow(['', 'Path', 'Problem', 'Local state', 'Remote state']);

  actions.map(({ relativePath, local, remote }, i) => {
    const no = i + 1;

    cols.appendRow([
      `${no}.`,
      osRelPathToRootedPosix(relativePath),
      getProblem(local, remote),
      getStatDescription(local),
      getStatDescription(remote)
    ]);
  });

  console.log(problemIntro);
  console.log(); // new line
  cols.writeAll(console.log);
  console.log(); // new line

  for (let i = 0; i < actions.length; i++) {
    const no = i + 1;
    const { relativePath, local, remote } = actions[i];

    type Value = SyncActionType | 'skip';

    const choices: { name: string; value: Value }[] = [
      {
        name: `Overwrite microcontroller version with PC version (${[
          'discards microcontroller changes',
          ...getWarnings(local, remote)
        ].join(', ')})`,
        value: 'syncToRemote'
      },
      {
        name: `Overwrite PC version with microcontroller version (${[
          'discards PC changes',
          ...getWarnings(remote, local)
        ].join(', ')})`,
        value: 'syncToLocal'
      },
      {
        name: `Skip sync of this file/folder`,
        value: 'skip'
      }
    ];
    const prompt = inquirer.createPromptModule();
    const { action } = await prompt<{ action: Value }>({
      name: 'action',
      type: 'list',
      message: `How would you like to handle ${no}. ${normalizePath(
        relativePath
      )} ? (Use arrow keys)`,
      choices
    });

    if (action !== 'skip') {
      result.push({
        type: action,
        relativePath
      } as FinalAction);
    }
  }

  return result;
}
