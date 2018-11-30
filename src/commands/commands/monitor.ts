import fs = require('fs-extra');
import inquirer = require('inquirer');
import { InitOptions, StatusOptions, StartOptions, UpdateOptions, StopOptions, SettingsOptions, MonitorOptions } from '../../args';
import { isUndefined } from 'util';
import { extname } from 'path';
import replaceExt = require('replace-ext');
import { ArgumentOutOfRangeError } from 'rxjs';
import { RunError } from '../../runError';
import { Command } from '../command';
import { injectable, inject } from 'inversify';
import * as prettyjson from 'prettyjson';
import chalk from 'chalk';
import { TYPES } from '@common/src/types';
import { ConsoleMessages } from '@common/src/services/consoleMessage/messages';
import { ConsoleMessageFormatter } from '@common/src/services/consoleMessage/formatter';
import { ConsoleMessage } from '@common/src/services/consoleMessage/message';

@injectable()
export class MonitorCommand extends Command {
    readonly requestConfig = {};
    readonly usingNoRemoteApis = false;

    constructor(
        @inject(TYPES.ConsoleMessages) private consoleMessages: ConsoleMessages,
        @inject(TYPES.ConsoleMessageFormatter) private consoleMessageFormatter: ConsoleMessageFormatter,
    ) {
        super('monitor');
     }

    private writeConsole({ timestamp, level, lines }: ConsoleMessage) {
        const line = this.consoleMessageFormatter.format(timestamp, lines);
        switch (level) {
            case 'd':
                console.log(chalk.gray(line));
                break;
            case 'l':
                console.log(line);
                break;
            case 'w':
                console.log(chalk.keyword('orange')(line));
                break;
            case 'e':
                console.log(chalk.red(line));
                break;
            default:
                throw new Error('Unknown log level: ' + level);
        }
    }

    async run() {
        this.consoleMessages.get().subscribe(msg => {
            this.writeConsole(msg);
        })
    }
}

