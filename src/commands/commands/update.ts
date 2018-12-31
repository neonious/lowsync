import * as inquirer from 'inquirer';
import * as prettyjson from 'prettyjson';
import { httpApi } from '../../../common/src/http/httpApiService';
import { Status } from '../../../common/src/webSocket/types/status';
import { UpdateOptions } from '../../args';
import { RunError } from '../../runError';
import { Command } from '../command';

export default class UpdateCommand extends Command<never> {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor(private options: UpdateOptions) {
    super('update');
  }

  private async showUpdate(info?: Status.Update.Update) {
    if (info) {
      console.log('A new update is available:');
      console.log(prettyjson.render({ changelog: info.changelog }));
    } else {
      console.log('There is no update currently available.');
    }
  }

  private async confirmUpdate() {
    const prompt = inquirer.createPromptModule();
    const { doUpdate } = (await prompt({
      name: 'doUpdate',
      type: 'confirm',
      message: 'Do you want to install this update?',
      default: true
    })) as any;
    return doUpdate;
  }

  private async installUpdate(version: string) {
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

  async run() {
    const { action } = this.options;
    const update = (await httpApi.GetUpdateInfo()).update || undefined;

    switch (action) {
      case 'show': {
        await this.showUpdate(update);
        break;
      }
      case 'install': {
        await this.showUpdate(update);
        if (update) {
          if (await this.confirmUpdate()) {
            const { version } = update;
            await this.installUpdate(version);
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
}
