import { extname } from 'path';
import { Command } from '../command';
import * as inquirer from 'inquirer';
const replaceExt = require('replace-ext');
import { configFile, createNewConfig } from '../../config/configFile';
import { Config } from '../../config/base/config';
import { remoteAccessOpts } from '../../config/remoteAccessOpts';
import { commandConfigOpts } from '../../config/commandConfigOpts';

export default class InitCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = true;

  constructor() {
    super('init');
  }

  async run() {
    let useConfigFile: Config<any> | undefined;

    if (await configFile.exists()) {
      const prompt = inquirer.createPromptModule();
      const { action } = (await prompt({
        name: 'action',
        type: 'list',
        message: 'A config file already exists in the current directory.',
        choices: [
          {
            name:
              'Backup (rename) old file and create a new file in its place.',
            value: 'replace'
          },
          {
            name:
              'Load old file and use its values as defaults (modifies the old file).',
            value: 'load'
          }
        ]
      })) as any;

      if (action === 'replace') {
        await configFile.moveTo(
          replaceExt(
            configFile.file,
            `.old.${Date.now()}${extname(configFile.file)}`
          )
        );
        useConfigFile = createNewConfig();
      }
    } else {
      useConfigFile = createNewConfig();
    }
    await remoteAccessOpts.init(useConfigFile);
    await commandConfigOpts.init(useConfigFile);
  }
}
