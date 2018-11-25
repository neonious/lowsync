import * as yargs from 'yargs';
import { Argv } from 'yargs';
import { maxBy } from 'lodash';
import { pad } from 'underscore.string';
import chalk from 'chalk';
import { RunError } from './runError';
import { getDotKeyMapping, validateAll } from '@common/src/settings/util';
import { SettingsKey } from '@common/src/settings/definitions';
import { EnglishTranslations } from '@common/src/translations/en';

export interface InitOptions {
    type: 'init'
}

export interface SettingsOptions {
    type: 'settings',
    showSettings?: string[];
    setSettings?: string[];
}

export interface StatusOptions {
    type: 'status'
}

export interface StartOptions {
    type: 'start',
    file?: string;
    force: boolean;
}

export interface StopOptions {
    type: 'stop'
}

export interface SyncOptions {
    type: 'sync',
    noTranspile: boolean | undefined;
}

export interface MonitorOptions {
    type: 'monitor'
}

export interface UpdateOptions {
    type: 'update',
    action: 'show' | 'install';
}

export type Options = InitOptions | SettingsOptions | StatusOptions | StartOptions | StopOptions | SyncOptions | MonitorOptions | UpdateOptions;

function throwErrrorsIfExist(results: { setting: string; msg: string; }[]) {
    if (results.length) {
        const padBy = maxBy(results, e => e.setting.length)!.setting.length;
        const errList = results.map(({ setting, msg }) => `${pad(setting, padBy)}: ${msg}`).join('\n');
        throw new Error(`${errList}`)
    }
}

export function jsonParse(str: string) {
    try {
        return JSON.parse(str);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return JSON.parse(`"${str}"`); // todo escape string (for quotes)
        } else
            throw e;
    }
}

const argv = yargs
    .strict()
    .locale('en') // so that yargs generated text is in english, just like the other text
    .command('init', 'Create an initial configuration file for lowsync with sensible defaults.', yargs => yargs.demandCommand(0, 0))
    .command('settings', 'Display or modify settings of the neonious one.', yargs => {
        return yargs
            .command('show [showSettings..]', 'Display the values of settings.', yargs => {
                return yargs.positional('showSettings', {
                    describe: 'The settings you want to display the values for. Leave out to show all values.'
                }).check(argv => {
                    const settings = argv.showSettings;
                    const results = [];
                    const dotKeysToKey = getDotKeyMapping();
                    for (const setting of settings) {
                        if (!dotKeysToKey[setting]) {
                            results.push({ setting, msg: `Unknown setting. Use 'show' without arguments to show what settings exist.` });
                            continue;
                        }
                    }
                    throwErrrorsIfExist(results);
                    return true;
                })
            })
            .command('set [setSettings..]', 'Change a setting. To list possible settings, run "settings show"', yargs => {
                return yargs
                    .positional('setSettings', {
                        describe: 'The settings you want to change. In the form of <setting>=<value>. Enclose string values with quotes ("").',
                    })
                    .check(argv => {
                        const settings = argv.setSettings;
                        if (!settings.length) {
                            throw new Error('Must provide settings to set');
                        }
                        const results = [];
                        const dotKeysToKey = getDotKeyMapping();
                        for (const setting of settings) {
                            const eqIndex = setting.indexOf('=');
                            if (eqIndex === -1) {
                                results.push({ setting, msg: `Invalid set setting syntax. Use <setting>=<value>. Enclose string values with quotes ("").` });
                                continue;
                            }
                            const dotKey = setting.substr(0, eqIndex);
                            if (!dotKeysToKey[dotKey]) {
                                results.push({ setting, msg: `Unknown setting ${dotKey}. Use 'show' without arguments to show what settings exist.` });
                                continue;
                            }
                            const valueStr = setting.substr(eqIndex + 1);
                            try {
                                const value = jsonParse(valueStr);
                                const msg = validateAll(dotKeysToKey[dotKey] as SettingsKey, value, new EnglishTranslations()); // todo nach new EnglishTranslations() suchen
                                if (typeof msg === 'string') {
                                    results.push({ setting, msg: `Value (${valueStr}) is not valid for this setting. ${msg}` });
                                    continue;
                                }
                            } catch (e) {
                                if (e instanceof SyntaxError) {
                                    results.push({ setting, msg: `Could not parse value (${valueStr}).` });
                                    continue;
                                } else
                                    throw e;
                            }
                        }
                        throwErrrorsIfExist(results);

                        return true;
                    })
            })
            .demandCommand(1, 1)
            .example('$0 settings show', 'Shows all settings and their corresponding values.')
            .example('$0 settings set example.setting="an example"', 'Sets the setting "example.setting" to "an example".')
    })
    .command('status', 'Print the status of the program on the neonious one.', yargs => yargs.demandCommand(0, 0))
    .command('start [file]', 'Start the program on the neonious one.', yargs => {
        return yargs
            .positional('file', {
                type: 'string',
                describe: 'The path of the file on the neonious one that will serve as the entry point.'
            })
            .option('force', {
                type: 'boolean',
                default: false,
                describe: 'Also restarts the program if it is running or paused.'
            })
            .example('$0 start /src/index.js', 'Starts /src/index.js on the neonious one.')
            .example('$0 start "/src/an example.js" --force', '(Re)Starts "/src/an example.js" on the neonious one, even if a program is currently running.').demandCommand(0, 0)
    })
    .command('stop', 'Stop the program on the neonious one.', yargs => yargs.demandCommand(0, 0))
    .command(['sync', '$0'], 'Sync and, by default, transpile the files from this computer to the neonious one.', yargs => {
        return yargs
            .option('no-transpile', {
                type: 'boolean',
                default: undefined,
                describe: 'Disable the transpilation of source files (only >=ES6 JavaScript files, NO TypeScript, etc.) to ES5. Be sure that you know what you are doing before using this option!'
            }).demandCommand(0, 0)
    })
    .command('monitor', 'Show the output of the running program (process.stdout) and enable interaction with standard input (process.stdin).', yargs => yargs.demandCommand(0, 0))
    .command('update', 'Display available updates for the neonious one and/or install them.', yargs => {
        return yargs
            .command('show', 'Display available updates, if any.')
            .command('install', 'Update the neonious one.')
            .demandCommand(1, 1);
    })
    .demandCommand(1, 1)
    .fail(((msg: string, err: Error, yargs: any) => {
        const help = yargs.help();
        console.log(chalk.green(help));
        console.error(chalk.white.bgRed(msg));
        process.exit(1);
    }) as any)
    .argv;

export function parseArguments(): Options {

    const command = argv._[0];
    if (!command){
        const { noTranspile } = argv;
        return { type: 'sync', noTranspile }
    }
    switch (command) {
        case 'init':
            return { type: 'init' }
        case 'settings':
            const { showSettings, setSettings } = argv;
            return { type: 'settings', showSettings, setSettings };
        case 'status':
            return { type: 'status' }
        case 'start':
            const { file, force } = argv;
            return { type: 'start', file, force };
        case 'stop':
            return { type: 'stop' }
        case 'sync':
            const { noTranspile } = argv;
            return { type: 'sync', noTranspile }
        case 'monitor':
            return { type: 'monitor' }
        case 'update':
            const action = argv._[1] as any;
            return { type: 'update', action }
        default:
            throw new Error(`Unknown command "${command}"`);
    }
}