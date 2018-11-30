import fs = require('fs-extra');
import inquirer = require('inquirer');
import { HttpApiService } from '@common/src/services/http/api';
import { TYPES } from '@common/src/types';
import { inject, injectable } from 'inversify';
import { Command } from '../command';
import replaceExt = require('replace-ext');

@injectable()
export class StopCommand extends Command {
    readonly requestConfig = {};
    readonly usingNoRemoteApis = false;

    constructor(
        @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
    ) {
        super('stop')
    }

    async run() {
        await this.httpApiService.Stop();
    }
}

