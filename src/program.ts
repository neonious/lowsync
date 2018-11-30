import { AuthenticationService } from '@common/src/services/authentication/authentication';
import { TYPES } from '@common/src/types';
import { inject, injectable, multiInject } from 'inversify';
import { Options } from './args';
import { Command } from './commands/command';
import { CommandConfig, readAuthConfig, readConfig } from './config';
import { LOWTYPES } from './ioc/types';

@injectable()
export class Program {
  constructor(
    @inject(LOWTYPES.Options) private options: Options,
    @multiInject(LOWTYPES.Commands) private commands: Command[],
    @inject(TYPES.AuthenticationService)
    private authenticationService: AuthenticationService
  ) {}

  async run() {
    const command = this.commands.find(c => c.command === this.options.type)!;
    const { remoteAccessConfig, commandConfig } = readConfig();
    const authConfig = readAuthConfig();
    const allOpts = [authConfig, remoteAccessConfig, commandConfig];
    const errors = [];
    for (const opts of allOpts) {
      errors.push(...opts.unknownConfigKeyErrors());
    }
    const doLogin = !command.usingNoRemoteApis;
    if (doLogin) {
      errors.push(...remoteAccessConfig.getErrors());
      errors.push(...authConfig.getErrors());
    }
    const configKeys = Object.keys(
      command.requestConfig || []
    ) as (keyof CommandConfig)[];
    errors.push(...commandConfig.getErrors(configKeys));

    if (doLogin){
        await remoteAccessConfig.askUser();
        await authConfig.askUser();
    }
   
    await commandConfig.askUser(configKeys);

    command.config = commandConfig.opts();

    if (doLogin) {
      const { ip, port } = remoteAccessConfig.opts();
      const { password } = authConfig.opts();
      await this.authenticationService.tryLogin(password);
      try {
        await command.run();
      } finally {
        if (command.command !== 'update')
          // todo because update also logs out (UpdateAndLogout api method)
          await this.authenticationService.logout();
      }
    } else {
      await command.run();
    }
  }
}
