import * as inquirer from 'inquirer';
import { httpApi } from '../../../common/src/http/httpApiService';
import { StartOptions } from '../../args';
import { RunError } from '../../runError';
import { httpApiNew } from '../../config/remoteAccessOpts';

export default async function({ file, force }: StartOptions) {
  let result = await httpApiNew.Start({ action: 'start', file });
  switch (result) {
    case 'UPDATING_SYS':
      throw new RunError(
        'Cannot start the program, because the microcontroller is currently performing a system update.'
      );
    case 'FILE_NOT_FOUND':
      throw new RunError('The file to start does not exist.');
    case 'ALREADY_RUNNING':
      let doRestart = false;
      if (force) {
        doRestart = true;
      } else {
        const prompt = inquirer.createPromptModule();
        const { restart } = await prompt<{ restart: boolean }>({
          name: 'restart',
          type: 'confirm',
          message:
            'The user application is already running. Restart? (Use the --force option in the future to skip this prompt and force a restart.)',
          default: true
        });
        doRestart = restart;
      }
      if (doRestart) {
        await httpApiNew.Stop();
        const result = await httpApiNew.Start({
          action: 'start',
          file
        });
        switch (result) {
          case 'FILE_NOT_FOUND':
            throw new RunError('The file to start does not exist.');
          case 'ALREADY_RUNNING':
            throw new Error('Could not restart program.');
        }
      }
      break;
  }
}
