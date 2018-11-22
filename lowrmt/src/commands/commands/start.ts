import fs = require('fs-extra');
import { RawConfig } from '../../config';
import inquirer = require('inquirer');
import {
  InitOptions,
  StatusOptions,
  StartOptions,
  UpdateOptions,
  StopOptions
} from '../../args';
import { isUndefined } from 'util';
import { extname } from 'path';
import replaceExt = require('replace-ext');
import { ArgumentOutOfRangeError } from 'rxjs';
import { RunError } from '../../runError';
import { Command } from '../command';
import { injectable, inject, multiInject, Container } from 'inversify';
import * as prettyjson from 'prettyjson';
import { StopCommand } from './stop';
import { LOWTYPES } from '../../ioc/types';
import { TYPES } from '@common/src/types';
import { HttpApiService } from '@common/src/services/http/api';
import { toFlatStructure } from '../../../../common/src/settings/util';

const prompt = inquirer.createPromptModule();

@injectable()
export class StartCommand extends Command {
  constructor(
    @inject(LOWTYPES.Options) private options: StartOptions,
    @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
  ) {
    super('start');
  }

  async run() {
    const { file, force } = this.options;
    let result = await this.httpApiService.Start({ action: 'start', file });
    switch (result) {
      case 'UPDATING_SYS':
        throw new RunError(
          'Cannot start the program, because the microcontroller is currently performing a system update.'
        );
      case 'FILE_NOT_FOUND':
        throw new RunError('The file to start does not exist.');
      case 'ALREADY_RUNNING':
        let doRestart = false;
        if (force) {
          doRestart = true;
        } else {
          const { restart } = await prompt<{ restart: boolean }>({
            name: 'restart',
            type: 'confirm',
            message:
              'The user application is already running. Restart? (Use the --force option in the future to skip this prompt and force a restart.)',
            default: true
          });
          doRestart = restart;
        }
        if (doRestart) {
          await this.httpApiService.Stop();
          const result = await this.httpApiService.Start({
            action: 'start',
            file
          });
          switch (result) {
            case 'FILE_NOT_FOUND':
              throw new RunError('The file to start does not exist.');
            case 'ALREADY_RUNNING':
              throw new Error('Could not restart program.');
          }
        }
        break;
    }
  }
}
