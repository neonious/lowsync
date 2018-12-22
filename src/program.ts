import { AuthenticationService } from '@common/src/services/authentication/authentication';
import { TYPES } from '@common/src/types';
import { inject, injectable, multiInject } from 'inversify';
import { Options } from './args';
import { Command } from './commands/command';
import {
  CommandConfig,
  CommandConfigOpts,
  RemoteAccessOpts,
  AuthOpts,
  AuthConfigFile,
  ConfigFile
} from './config';
import { LOWTYPES } from './ioc/types';
import chalk from 'chalk';
import { RunError } from './runError';

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
    private remoteAccessConfig: RemoteAccessOpts,
    @inject(LOWTYPES.ConfigFile) private configFile: ConfigFile,
    @inject(LOWTYPES.AuthConfigFile)
    private authConfigFile: AuthConfigFile
  ) {}

  async run() {
   
    const command = this.commands.find(c => c.command === this.options.type)!;
    const errors = [];
    const doLogin = !command.usingNoRemoteApis;
    const configKeys = Object.keys(command.requestConfig) as (keyof CommandConfig)[];
    if ((configKeys.length||doLogin) && !await this.configFile.exists()){
      throw new RunError('A configuration file does not exist yet. Please run lowsync init to create one first.');
    }
    const unknownErrs = [];
    unknownErrs.push(...(await this.configFile.unknownConfigKeyErrors()));
    unknownErrs.push(...(await this.authConfigFile.unknownConfigKeyErrors()));
    for (const err of unknownErrs) {
      console.warn(chalk.hex('#ffa500').bold(err));
    }
    if (doLogin) {
      errors.push(...(await this.remoteAccessConfig.getErrors()));
      errors.push(...(await this.authConfig.getErrors()));
    }
    errors.push(...(await this.commandConfig.getErrors(configKeys)));

    if (doLogin) {
      await this.remoteAccessConfig.askUser();
      await this.authConfig.askUser();
    }
    if (errors.length) {
      const msg = errors.map(e => chalk.white.bgRed.bold(e)).join('\n');
      throw new RunError(msg);
    }

    await this.commandConfig.askUser(configKeys);

    command.config = await this.commandConfig.getConfig(configKeys);

    if (doLogin) {
      const { password } = await this.authConfig.getConfig();
      await this.authenticationService.tryLogin(password);
      try {
        await command.run();
      } finally {
        if (command.command !== 'update' && command.command !== 'monitor')
          // todo because update also logs out (UpdateAndLogout api method)
          await this.authenticationService.logout();
      }
    } else {
      await command.run();
    }
  }
}
