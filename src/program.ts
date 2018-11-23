

import { parseArguments, Options } from "./args";
import { join, basename } from "path";
import fs = require('fs-extra');
import { RunError } from "./runError";
import { Command } from "./commands/command";
import { inject, injectable, multiInject, Container } from "inversify";
import { readConfigFile } from "typescript";
import inquirer = require('inquirer');
import { getRawConfig, saveConfig, validateConfig, Config, RawConfig, throwOnInvalidResult } from "./config";
import { getRawAuthConfig, saveAuthConfig } from "./auth.config";
import { LOWTYPES } from "./ioc/types";
import * as request from 'request-promise-native';
import chalk from "chalk";
import { TYPES } from "@common/src/types";
import { AuthenticationService } from "@common/src/services/authentication/authentication";
import { ipAddress } from "@common/src/common/regexConst";
import { setHostPrefix } from './indexUtil';
import { httpsPool } from '../common/src/services/http/handler/node';

const prompt = inquirer.createPromptModule();

interface Options2 {
    checkDataExists: (data: any) => boolean;
    notFoundMessage: string;
    incorrectMessage: (data: any) => string;
    saveMessage: string;
    askForFunction: (oldData?: any) => Promise<any>;
    checkValidFunction: (data: any) => Promise<boolean>;
    getData: () => Promise<{ config: any; data: any }>;
    setData: (config: any, data: any) => Promise<void>;
}

@injectable()
export class Program {

    constructor(
        @inject(LOWTYPES.Options) private options: Options,
        @multiInject(LOWTYPES.Commands) private commands: Command[],
        @inject(TYPES.AuthenticationService) private authenticationService: AuthenticationService,
        @inject(LOWTYPES.RawConfig) private rawConfig: RawConfig
    ) {
    }

    async run() {
        const command = this.commands.find(c => c.command === this.options.type)!;
        if (!command.skipConfigValidation) {
            const result = validateConfig(this.rawConfig);
            throwOnInvalidResult(result);
        }
        if (!command.noLogin) {
            const { password } = await this.getLoginData();
            await this.authenticationService.tryLogin(password);
            try {
                await command.run();
            } finally {
                if (command.command !== 'update') // todo because update also logs out (UpdateAndLogout api method)
                    await this.authenticationService.logout();
            }
        } else {
            await command.run();
        }
    }

    private async askForIp(oldIp?: string) {
        const { ip } = await prompt({
            name: 'ip',
            type: 'string',
            message: 'Please enter the IP address of the device.',
            default: typeof oldIp === 'string' ? oldIp : '192.168.0.1',
            validate: (value: string) => {
                if (!ipAddress.test(value)) {
                    return 'Not a valid IP address!';
                }
                return true;
            }
        }) as any;
        return ip as string;
    }

    private checkIpReachable(ip: string, port: number) {
        return request({
            method: 'POST',
            agent: httpsPool,
            uri: `https://${ip}:${port}/api/Login`,
            headers: { "Content-Type": "application/json;charset=UTF-8" },
            timeout: 30_000,
            body: JSON.stringify({ password: Date.now().toString() })
        }).then(() => {
            return true;
        }).catch(() => {
            return false;
        })
    }

    private async askForPassword() {
        const { password } = await prompt({
            name: 'password',
            type: 'password',
            message: 'Please enter the password of the device.',
        }) as any;
        return password as string;
    }

    private async checkPasswordIsCorrect(password: string, ip: string) {
        const ok = await this.authenticationService.tryLogin(password);
        if (ok) {
            await this.authenticationService.logout();
        }
        return ok;
    }

    private async getData({ checkDataExists, notFoundMessage, incorrectMessage, saveMessage, askForFunction, checkValidFunction, getData, setData }: Options2) {

        const { config, data: configData } = await getData();
        let usingData: string;
        if (!checkDataExists(configData)) {
            console.log(notFoundMessage);
            const requestedInput = await askForFunction();
            usingData = requestedInput;
        } else {
            usingData = configData!;
        }
        while (!await checkValidFunction(usingData)) {
            console.log(incorrectMessage(usingData));
            const requestedPassword = await askForFunction(usingData);
            usingData = requestedPassword;
        }
        if (configData !== usingData) {
            const { save } = await prompt({
                name: 'save',
                type: 'confirm',
                message: saveMessage,
                default: true
            }) as any;
            if (save) {
                await setData(config, usingData);
            }
        }
        return usingData;
    }

    private async getLoginData() {

        const rawConfig = await getRawConfig();
        const port = rawConfig.port || 8443;

        const ip = await this.getData({
            checkDataExists: data => !!data && typeof data === 'string',
            notFoundMessage: 'The IP address for your device was not found in the configuration.',
            incorrectMessage: ip => `The device cannot be reached under the provided IP (${ip}). (network problem, or wrong IP). Try again with a new or the previous IP address`,
            saveMessage: 'Save new IP address into configuration?',
            askForFunction: this.askForIp.bind(this),
            checkValidFunction: ip => this.checkIpReachable(ip, port!),
            getData: async () => {
                const config = await getRawConfig();
                return { config, data: config.ip };
            },
            setData: async (config, data) => {
                config.ip = data;
                await saveConfig(config);
            }
        }) as string;
        
        setHostPrefix(`https://${ip}:${port}`);

        const password = await this.getData({
            checkDataExists: data => typeof data === 'string',
            notFoundMessage: 'The password for your device was not found in the configuration.',
            incorrectMessage: () => `Invalid password!`,
            saveMessage: 'Save new password into configuration?',
            askForFunction: this.askForPassword.bind(this),
            checkValidFunction: (password) => {
                return this.checkPasswordIsCorrect(password, ip)
            },
            getData: async () => {
                const config = await getRawAuthConfig();
                return { config, data: config.password };
            },
            setData: async (config, data) => {
                config.password = data;
                await saveAuthConfig(config);
            }
        }) as string;

        return { ip, password };
    }
}
