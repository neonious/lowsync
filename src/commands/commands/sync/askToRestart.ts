import * as inquirer from 'inquirer';
import { httpApi } from '../../../../common/src/http/httpApiService';
import { RunError } from '../../../runError';
import { httpApiNew } from '../../../config/remoteAccessOpts';

interface AskToRestartOptions {
  mcChanged: boolean;
  autoRestart?: boolean;
}

export async function checkAndAskToRestart({
  mcChanged,
  autoRestart
}: AskToRestartOptions) {
  if (!mcChanged) return;

  const {
    code: { status }
  } = await httpApiNew.Status({ code: true });

  if (status !== 'stopped') {
    const prompt = inquirer.createPromptModule();
    const { restart } =
      autoRestart === undefined
        ? await prompt<{ restart: boolean }>({
            name: 'restart',
            type: 'confirm',
            message:
              'The filesystem of the microcontroller has changed. Restart the currently running program for any changes to take effect? (Use the --restart command line option to enable or disable automatic restart after sync.)',
            default: true
          })
        : { restart: autoRestart };
    if (restart) {
      console.log('Restarting program...');
      await httpApiNew.Stop();
      let result = await httpApiNew.Start({ action: 'start' });
      if (result === 'FILE_NOT_FOUND') {
        throw new RunError(`The file to start does not exist.`);
      } else if (result) {
        throw new RunError('Could not start program: ' + result);
      }
    }
  }
}
