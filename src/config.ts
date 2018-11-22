import { keys } from "@common/node_modules/ts-transformer-keys";
import { RunError } from "./runError";
import * as findUp from 'find-up';
import { loadJsonFindFile, saveJsonFindFile } from '@common/src/common/jsonUtil';

export interface RawConfig {
    syncDir?: string;
    ip?: string;
    port?:number;
    transpile?: boolean;
    exclude?: string[];
}
const configKeys = new Set(keys<RawConfig>());

export interface Config {
    syncDir: string;
    ip: string;
    port:number;
    transpile?: boolean;
    exclude?: string[];
}

export const configFileName = 'lowsync.config.json';

export type ValidateResult = true | { key: string, msg: string };

export function throwOnInvalidResult(result: ValidateResult) {
    if (result !== true) {
        throw new RunError(`Invalid configuration (key '${result.key}', ${result.msg}). To create a new configuration file, or edit an existing one, run 'lowsync init' in the directory of the new configuration file.`);
    }
}

export function validateConfigKey(key: keyof Config, value: any): ValidateResult {
    switch (key) {
        case 'syncDir':
            if (!value) {
                return { key, msg: 'Not defined' };
            }
            if (typeof value !== 'string') {
                return { key, msg: 'Invalid value (must be a string)' }
            }
            break;
        case 'transpile':
            const transpileType = typeof value;
            if (transpileType !== 'boolean' && transpileType !== 'undefined') {
                return { key, msg: 'Invalid value (must be true or false if defined)' }
            }
            break;
        case 'exclude': {
            if (typeof value !== 'undefined') {
                if (!Array.isArray(value)) {
                    return { key, msg: 'Invalid value (must be an array of strings if defined)' }
                }
                if (!value.every(el => typeof el === 'string')) {
                    return { key, msg: 'Invalid entries (all values must be strings)' }
                }
            }
            break;
        }
    }
    return true;
}

export function validateConfig(config: any): ValidateResult {

    const keys = Object.keys(config);
    for (const key of keys) {
        if (!configKeys.has(key as any)) {
            return { key, msg: 'Unknown configuration setting' }
        }
    }
    return true;
}

export async function loadConfigThrow<T>(name: string): Promise<T> {
    try {
        const obj = await loadJsonFindFile<T>([name], {} as any);
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new SyntaxError();
        }
        return obj;
    } catch (ex) {
        if (ex instanceof SyntaxError) {
            throw new RunError(`Cannot load configuration file '${name}'. Invalid JSON syntax in file!`,ex);
        }
        throw ex;
    }
}

export function getConfigPath() {
    const result = findUp.sync([configFileName]);
    if (!result) {
        throw new Error('Cannot find config');
    }
    return result;
}

export function getRawConfig() {
    return loadConfigThrow<RawConfig>(configFileName);
}

export function saveConfig(config: RawConfig) {
    return saveJsonFindFile([configFileName], config);
}