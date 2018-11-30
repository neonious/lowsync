import { injectable, inject } from 'inversify';
import { Command } from '../command';
import { FlashOptions } from '../../args';
import { LOWTYPES } from '../../ioc/types';
import { flash } from '../../flash';

@injectable()
export class FlashCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = true;
  
  constructor(@inject(LOWTYPES.Options) private options: FlashOptions) {
    super('flash');
  }

  async run() {
    const { port, params } = this.options;
    await flash(port, params);
  }
}
