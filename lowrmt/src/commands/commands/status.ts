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
import { injectable, inject } from 'inversify';
import * as prettyjson from 'prettyjson';
import { TYPES } from '@common/src/types';
import { HttpApiService } from '@common/src/services/http/api';

@injectable()
export class StatusCommand extends Command {

    constructor(
        @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
    ) { 
        super('status');
    }

    async run() {
        const { code: { status } } = await this.httpApiService.Status({ code: true });
        console.log(status);
    }
}

