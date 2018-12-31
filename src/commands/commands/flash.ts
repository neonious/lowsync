import { Command } from '../command';
import { FlashOptions } from '../../args';
import { flash } from '../../flash';

export default class FlashCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = true;

  constructor(private options: FlashOptions) {
    super('flash');
  }

  async run() {
    const { port, params } = this.options;
    await flash(port, params);
  }
}
