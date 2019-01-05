import * as inquirer from 'inquirer';
import { httpApi } from '../../../../common/src/http/httpApiService';
import { RunError } from '../../../runError';

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
  } = await httpApi.Status({ code: true });

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
      await httpApi.Stop();
      let result = await httpApi.Start({ action: 'start' });
      if (result === 'FILE_NOT_FOUND') {
        throw new RunError(`The file to start does not exist.`);
      } else if (result) {
        throw new RunError('Could not start program: ' + result);
      }
    }
  }
}
