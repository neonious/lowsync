import fs = require('fs-extra');
import { ipAddress } from '@common/src/common/regexConst';
import { spawn } from 'child_process';
import { injectable, inject } from 'inversify';
import { extname, join, relative } from 'path';
import { isUndefined } from 'util';
import {
  CommandConfig,
  ConfigFile,
  CommandConfigOpts,
  RemoteAccessConfig,
  RemoteAccessOpts
} from '../../config';
import { RunError } from '../../runError';
import { Command } from '../command';
import inquirer = require('inquirer');
import replaceExt = require('replace-ext');
import { InitOptions } from '../../args';
import { LOWTYPES } from '../../ioc/types';

const prompt = inquirer.createPromptModule();

@injectable()
export class InitCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = true;

  constructor(
    @inject(LOWTYPES.ConfigFile) private configFile: ConfigFile,
    @inject(LOWTYPES.CommandConfig) private commandConfig: CommandConfigOpts,
    @inject(LOWTYPES.RemoteAccessConfig)
    private remoteAccessConfig: RemoteAccessOpts
  ) {
    super('init');
  }

  async run() {
    let useConfigFile: ConfigFile | undefined;

    if (await this.configFile.exists()) {
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
        await this.configFile.moveTo(
          replaceExt(
            this.configFile.file,
            `.old.${Date.now()}${extname(this.configFile.file)}`
          )
        );
        useConfigFile = new ConfigFile();
      }
    } else {
      useConfigFile = new ConfigFile();
    }
    await this.remoteAccessConfig.init(useConfigFile);
    await this.commandConfig.init(useConfigFile);

    const initIdx = process.argv.indexOf('init');
    if (initIdx !== -1) {
      const { sync } = await prompt<{ sync: boolean }>({
        name: 'sync',
        type: 'confirm',
        message: 'Do you want to do an initial sync right now?',
        default: true
      });

      if (sync) {
        const args = process.argv.slice(0, initIdx).concat(['sync']);
        spawn(args[0], args.slice(1), { stdio: 'inherit' });
      }
    }
  }
}
