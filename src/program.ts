import chalk from 'chalk';
import { Options } from './args';
import { RunError } from './runError';
import { configFile } from './config/configFile';
import { CommandConfig } from './config/config2';
import { authConfigFile } from './config/authConfigFile';
import { commandConfigOpts } from './config/commandConfigOpts';
import { authOpts } from './config/authOpts';
import { remoteAccessOpts } from './config/remoteAccessOpts';

export class Program {
  constructor(private options: Options) {}

  async run() {
    
    const type = this.options.type;
    const Command = (await import(`./commands/commands/${type}`)).default;
    const command = new Command(this.options);
    const errors = [];
    const doLogin = !command.usingNoRemoteApis;
    const configKeys = Object.keys(
      command.requestConfig
    ) as (keyof CommandConfig)[];
    if ((configKeys.length || doLogin) && !(await configFile.exists())) {
      throw new RunError(
        'A configuration file does not exist yet. Please run lowsync init to create one first.'
      );
    }
    const unknownErrs = [];
    unknownErrs.push(...(await configFile.unknownConfigKeyErrors()));
    unknownErrs.push(...(await authConfigFile.unknownConfigKeyErrors()));
    for (const err of unknownErrs) {
      console.warn(chalk.hex('#ffa500').bold(err));
    }
    if (doLogin) {
      errors.push(...(await remoteAccessOpts.getErrors()));
      errors.push(...(await authOpts.getErrors()));
    }
    errors.push(...(await commandConfigOpts.getErrors(configKeys)));
    if (doLogin){
      await remoteAccessOpts.askUser();
      await authOpts.askUser();
    }
    if (errors.length) {
      const msg = errors.map(e => chalk.white.bgRed.bold(e)).join('\n');
      throw new RunError(msg);
    }

    await commandConfigOpts.askUser(configKeys);

    command.config = await commandConfigOpts.getConfig(configKeys);

    if (doLogin) {
      const { password } = await authOpts.getConfig();
      const {
        tryLogin,
        logout
      } = await import('../common/src/services/authentication/authentication');
      await tryLogin(password);
      try {
        await command.run();
      } finally {
        if (command.command !== 'update' && command.command !== 'monitor')
          // todo because update also logs out (UpdateAndLogout api method)
          await logout();
      }
    } else {
      await command.run();
    }
  }
}
