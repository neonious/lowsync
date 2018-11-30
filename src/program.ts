import { AuthenticationService } from '@common/src/services/authentication/authentication';
import { TYPES } from '@common/src/types';
import { inject, injectable, multiInject } from 'inversify';
import { Options } from './args';
import { Command } from './commands/command';
import {
  CommandConfig,
  CommandConfigOpts,
  RemoteAccessOpts,
  AuthOpts
} from './config';
import { LOWTYPES } from './ioc/types';
import chalk from 'chalk';

@injectable()
export class Program {
  constructor(
    @inject(LOWTYPES.Options) private options: Options,
    @multiInject(LOWTYPES.Commands) private commands: Command[],
    @inject(TYPES.AuthenticationService)
    private authenticationService: AuthenticationService,
    @inject(LOWTYPES.CommandConfig) private commandConfig: CommandConfigOpts,
    @inject(LOWTYPES.AuthConfig) private authConfig: AuthOpts,
    @inject(LOWTYPES.RemoteAccessConfig)
    private remoteAccessConfig: RemoteAccessOpts
  ) {}

  async run() {
    const command = this.commands.find(c => c.command === this.options.type)!;
    const errors = [];
    const doLogin = !command.usingNoRemoteApis;
    const unknownErrs = [];
    unknownErrs.push(...await this.commandConfig.unknownConfigKeyErrors());
    unknownErrs.push(...await this.remoteAccessConfig.unknownConfigKeyErrors());
    unknownErrs.push(...await this.authConfig.unknownConfigKeyErrors());
    for (const err of unknownErrs) {
      console.warn(chalk.hex('#ffa500').bold(err));
    }
    if (doLogin) {
      errors.push(...this.remoteAccessConfig.getErrors());
      errors.push(...this.authConfig.getErrors());
    }
    const configKeys = Object.keys(
      command.requestConfig || []
    ) as (keyof CommandConfig)[];
    errors.push(...this.commandConfig.getErrors(configKeys));

    if (doLogin) {
      await this.remoteAccessConfig.askUser();
      await this.authConfig.askUser();
    }
    // todo print errs

    await this.commandConfig.askUser(configKeys);

    command.config = this.commandConfig.getConfig(configKeys);

    if (doLogin) {
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
