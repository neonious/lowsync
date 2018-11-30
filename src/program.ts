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
    private authenticationService: AuthenticationService,
    private commandConfig:any, // todo
    private authConfig:any,
    private remoteAccessConfig:any
  ) {}
// todo only warning if unknown config settings exist
  async run() {
    const command = this.commands.find(c => c.command === this.options.type)!;
    const errors = [];
    const doLogin = !command.usingNoRemoteApis;
    if (doLogin) {
      errors.push(...this.remoteAccessConfig.getErrors());
      errors.push(...this.authConfig.getErrors());
    }
    const configKeys = Object.keys(
      command.requestConfig || []
    ) as (keyof CommandConfig)[];
    errors.push(...this.commandConfig.getErrors(configKeys));

    if (doLogin){
        await this.remoteAccessConfig.askUser();
        await this.authConfig.askUser();
    }
   
    await this.commandConfig.askUser(configKeys);

    command.config = this.commandConfig.getConfig(configKeys);

    if (doLogin) {
      const { ip, port } = this.remoteAccessConfig.getConfig();
      const { password } = this.authConfig.getConfig();
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
