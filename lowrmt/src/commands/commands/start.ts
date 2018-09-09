import fs = require('fs-extra');
import { RawConfig } from '../../config';
import inquirer = require('inquirer');
import { InitOptions, StatusOptions, StartOptions, UpdateOptions, StopOptions } from '../../args';
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
            case 'FILE_NOT_FOUND':
                throw new RunError('The file to start does not exist.');
            case 'ALREADY_RUNNING':
                if (force) {
                    await this.httpApiService.Stop();
                    const result = await this.httpApiService.Start({ action: 'start', file });
                    switch (result) {
                        case 'FILE_NOT_FOUND':
                            throw new RunError('The file to start does not exist.');
                        case 'ALREADY_RUNNING':
                            throw new Error('Could not restart program.');
                    }
                } else {
                    throw new RunError('The program is already running. Use the --force option do force a restart.');
                }
                break;
        }
    }
}
