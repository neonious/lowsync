import fs = require('fs-extra');
import { RawConfig } from '../../config';
import inquirer = require('inquirer');
import { InitOptions, StatusOptions, StartOptions, UpdateOptions } from '../../args';
import { isUndefined } from 'util';
import { extname } from 'path';
import replaceExt = require('replace-ext');
import { ArgumentOutOfRangeError } from 'rxjs';
import { RunError } from '../../runError';
import { Command } from '../command';
import { injectable, inject } from 'inversify';
import * as prettyjson from 'prettyjson';
import { LOWTYPES } from '../../ioc/types';
import { TYPES } from '@common/src/types';
import { HttpApiService } from '@common/src/services/http/api';
import { Status } from '@common/src/clientServerApi/webSocket/types/status';

const prompt = inquirer.createPromptModule();

@injectable()
export class UpdateCommand extends Command {

    constructor(
        @inject(LOWTYPES.Options) private options: UpdateOptions,
        @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
    ) { 
        super('update');
    }

    private async showUpdate(info?: Status.Update.Update) {
        if (info) {
            console.log('A new update is available:');
            console.log(prettyjson.render({changelog:info.changelog}));
        } else {
            console.log('There is no update currently available.');
        }
    }

    private async confirmUpdate() {
        const { doUpdate } = await prompt({
            name: 'doUpdate',
            type: 'confirm',
            message: 'Do you want to install this update?',
            default: true
        }) as any;
        return doUpdate;
    }

    private async installUpdate(version: string) {
        
        const { willUpdate } = await this.httpApiService.UpdateAndLogout();
        if (willUpdate) {
            console.log('The device is updating! The update process will be finished when the red light stops blinking!');
        } else {
            throw new RunError('An error has occured. The device cannot start the updating process!');
        }
    }

    async run() {
        const { action } = this.options;
        const update = (await this.httpApiService.GetUpdateInfo()).update || undefined;

        switch (action) {
            case 'show': {
                await this.showUpdate(update);
                break;
            }
            case 'install': {
                await this.showUpdate(update);
                if (update) {
                    if (await this.confirmUpdate()) {
                        const { version } = update;
                        await this.installUpdate(version);
                    }
                } else {
                    throw new RunError('Cannot install.');
                }
                break;
            }
            default:
                throw new Error('Unknown action: ' + action);
        }
    }
}

