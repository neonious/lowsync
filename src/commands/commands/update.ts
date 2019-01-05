import * as inquirer from 'inquirer';
import * as prettyjson from 'prettyjson';
import { httpApi } from '../../../common/src/http/httpApiService';
import { Status } from '../../../common/src/webSocket/types/status';
import { RunError } from '../../runError';
import { UpdateOptions } from '../../args';

async function showUpdate(info?: Status.Update.Update) {
  if (info) {
    console.log('A new update is available:');
    console.log(prettyjson.render({ changelog: info.changelog }));
  } else {
    console.log('There is no update currently available.');
  }
}

async function confirmUpdate() {
  const prompt = inquirer.createPromptModule();
  const { doUpdate } = (await prompt({
    name: 'doUpdate',
    type: 'confirm',
    message: 'Do you want to install this update?',
    default: true
  })) as any;
  return doUpdate;
}

async function installUpdate(version: string) {
  const { willUpdate } = await httpApi.UpdateAndLogout();
  if (willUpdate) {
    console.log(
      'The device is updating! The update process will be finished when the red light stops blinking!'
    );
  } else {
    throw new RunError(
      'An error has occured. The device cannot start the updating process!'
    );
  }
}

export default async function({ action }: UpdateOptions) {
  const update = (await httpApi.GetUpdateInfo()).update || undefined;

  switch (action) {
    case 'show': {
      await showUpdate(update);
      break;
    }
    case 'install': {
      await showUpdate(update);
      if (update) {
        if (await confirmUpdate()) {
          const { version } = update;
          await installUpdate(version);
        }
      } else {
        throw new RunError('No update available to install.');
      }
      break;
    }
    default:
      throw new Error('Unknown action: ' + action);
  }
}
