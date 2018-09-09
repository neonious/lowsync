require('source-map-support').install();
import "reflect-metadata";
import { parseArguments, Options } from "./args";
import { join, basename } from "path";
import fs = require('fs-extra');
import { RunError } from "./runError";
import { Command } from "./commands/command";
import { inject, injectable, Container } from "inversify";
import { readConfigFile } from "typescript";
import inquirer = require('inquirer');
import { getRawConfig, saveConfig } from "./config";
import { getRawAuthConfig, saveAuthConfig } from "./auth.config";
import { LOWTYPES } from "./ioc/types";
import { configureContainerLowRmt } from "./ioc/configure";
import { Program } from './program';
import chalk from 'chalk';
import { getStatusText } from 'http-status-codes';
import { configureContainerForNode } from "@common/src/configureContainerNode";
import { HttpHandler } from "@common/src/services/http/handler/handler";

process.on('unhandledRejection', (reason, p) => {
    console.error(chalk.white.bgRed('Unhandled Rejection at: Promise' + p, 'reason:', reason));
});

let hostPrefix = '';
export function setHostPrefix(prefix: string) {
    hostPrefix = prefix;
}

(async function () {
    try {
        const container = new Container({ defaultScope: 'Singleton' });

        await configureContainerLowRmt(container);

        function getStatusTextNoError(status: number) {
            try {
                getStatusText(status);
            } catch{
                return null;
            }
        }

        configureContainerForNode(container as any, {
            get hostPrefix() {
                return hostPrefix;
            },
            setToBroken(response: HttpHandler.Response | null, error: any): void {
                if (response) {
                    const { status } = response;
                    const statusText = getStatusTextNoError(status);
                    throw new RunError(`An error occured while communicating with the remote. The remote returned the HTTP status code ${status}${statusText ? ` (${statusText})` : ''}.`);
                } else {
                    throw new RunError(`An unexpected error occured while communicating with the remote. ${error}`);
                }
            },
            setLoadingState(loading: boolean): void {
                /* nothing */
            },
            setTimeout(timeout: boolean): void {
                /* nothing */
            },
            setProgressStatus(progress: HttpHandler.Progress): void {
                /* nothing */
            },
            setProgressStatusVisible(visible: boolean): void {
                /* nothing */
            }
        });

        await container.get<Program>(LOWTYPES.Program).run();

    } catch (ex) {
        if (ex instanceof RunError) {
            console.error(chalk.white.bgRed('An error has occured: ' + ex.message));
        } else {
            console.error(chalk.white.bgRed(`An unexpected error has occured. ` + ex.message + " " + ex.stack));
        }
        process.exit(1);
    }
}())
