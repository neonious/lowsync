import { Command } from '../command';
import { httpApi } from '../../../common/src/http/httpApiService';

export default class StatusCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor(
  ) {
    super('status');
  }

  async run() {
    const {
      code: { status }
    } = await httpApi.Status({ code: true });

    let statusStr: string;

    switch (status) {
      case 'paused':
        statusStr = 'paused / crashed';
        break;
      case 'updating_sys':
        statusStr = 'performing system update';
        break;
      default:
        statusStr = status;
        break;
    }
    console.log(`Current status: ${statusStr}`);
  }
}
