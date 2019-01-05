import { httpApi } from '../common/src/http/httpApiService';
import { RunError } from './runError';
import { promptBool } from './prompts';
import { Omit } from 'lodash';

interface RestartOptions extends Omit<StartOptions, 'force'> {}

interface StartOptions {
  file?: string;
  force?: boolean;
}

export async function getProgramStatus() {
  const {
    code: { status }
  } = await httpApi.Status({ code: true });
  return status;
}

export function stopProgram() {
  return httpApi.Stop();
}

export async function restartProgram(options: RestartOptions={}) {
  await stopProgram();
  await startProgram(options);
}

export async function startProgram(options: StartOptions={}) {
  const { file, force } = options;
  const result = await httpApi.Start({
    action: 'start',
    file
  });
  switch (result) {
    case 'UPDATING_SYS':
      throw new RunError(
        'Cannot start the program, because the microcontroller is currently performing a system update.'
      );
    case 'FILE_NOT_FOUND':
      throw new RunError('The file to start does not exist.');
    case 'ALREADY_RUNNING':
      const restart = force
        ? true
        : await promptBool({
            message: 'The user application is already running. Restart?',
            default: true
          });
      restart && (await restartProgram(options));
      break;
  }
}
