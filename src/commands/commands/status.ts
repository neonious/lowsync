import { HttpApiService } from '@common/src/services/http/api';
import { TYPES } from '@common/src/types';
import { inject, injectable } from 'inversify';
import { Command } from '../command';

@injectable()
export class StatusCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor(
    @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
  ) {
    super('status');
  }

  async run() {
    const {
      code: { status }
    } = await this.httpApiService.Status({ code: true });

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
