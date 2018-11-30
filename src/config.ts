import { keys } from '@common/node_modules/ts-transformer-keys';
import { RunError } from './runError';
import * as findUp from 'find-up';
import {
  loadJsonFindFile,
  saveJsonFindFile
} from '@common/src/common/jsonUtil';
import { join } from 'path';
import fs = require('fs-extra');
import { ipAddress } from '@common/src/common/regexConst';
import { isPlainObject, mapValues } from 'lodash';
import * as path from 'path';
import inquirer = require('inquirer');
import { Questions, Question } from 'inquirer';

export interface AuthConfig {
  password: string;
}

export const authConfigFileName = 'lowsync.auth.config.json';

export interface RemoteAccessConfig {
  ip: string;
  port?: number;
}
export interface CommandConfig {
  syncDir: string;
  transpile?: boolean;
  exclude?: string[];
}

type PromptType = 'string' | 'confirm' | 'password'; // todo richtig? (nicht input statt string?) und auch prompt options alle richtig?

interface PropMeta {
  validate: (value: unknown) => string | undefined;
  default?: unknown;
  noInit?: boolean;
  prompt?: {
    type: PromptType;
    provideValueForQuestion: string;
    default?: unknown;
    saveConfigTransform?: (value: unknown) => unknown;
  };
  transformForUse?: (value: unknown) => unknown;
}

type PropMetas<TConfig> = { [K in keyof TConfig]-?: PropMeta };

const authMeta: PropMetas<AuthConfig> = {
  password: {
    validate: value => {
      if (typeof value !== 'string')
        return 'Invalid datatype. Expected a string.';
    },
    prompt: {
      type: 'string',
      provideValueForQuestion: 'What is the password for the microcontroller?'
    }
  }
};
// todo if nothing needed from config file for command then also dont require config file to exist or be valid
const commandMeta: PropMetas<CommandConfig> = {
  syncDir: {
    validate: value => {
      if (!value) {
        return 'A value was not provided.';
      }
      if (typeof value !== 'string')
        return 'Invalid datatype. Expected a string.';
      try {
        // check if path valid
        path.resolve(value);
      } catch {
        return 'Invalid path format: Must be a valid relative or absolute path.';
      }
    },
    prompt: {
      type: 'password',
      provideValueForQuestion:
        'What is the local directory that you want to sync with?',
      default: process.cwd(),
      saveConfigTransform: value =>
        path.relative(process.cwd(), value as string) || '.'
    },
    transformForUse: value => path.resolve(process.cwd(), value as string) // todo dont use findup for config file finding
  },
  transpile: {
    validate: value => {
      if (value !== undefined && typeof value !== 'boolean')
        return 'Invalid datatype. Expected a boolean.';
    },
    default: true,
    prompt: {
      type: 'confirm',
      provideValueForQuestion:
        'Enable ES 6 (and more) via automatic Babel transpilation? (if disabled, you will have to handle this yourself!)'
    }
  },
  exclude: {
    validate: value => {
      if (value !== undefined) {
        if (!Array.isArray(value)) {
          return 'Invalid datatype. Expected an array of strings.';
        }
        if (value.some(e => !e || typeof e !== 'string')) {
          return 'Array contains invalid data. Expected non-empty strings.';
        }
      }
    }
  }
};
const remoteAccessMeta: PropMetas<RemoteAccessConfig> = {
  ip: {
    validate: value => {
      if (typeof value !== 'string') {
        return 'Invalid datatype. Expected a string.';
      }
      if (!ipAddress.test(value)) {
        return 'Not a valid IP address!';
      }
    },
    prompt: {
      type: 'string',
      provideValueForQuestion:
        'What is the IP address of the microcontroller on your network?',
      default: '192.168.0.1'
    }
  },
  port: {
    validate: value => {
      if (!value || isNaN(value as any)) {
        return 'Invalid datatype. Expected a number.';
      }
      const num = Number(value);
      if (!Number.isInteger(num)) {
        return 'Invalid datatype. Expected an integer.';
      }
      if (num < 0 || num > 65535) {
        return 'Not a valid port number (0-65535).';
      }
    },
    default: 8443,
    noInit: true,
    prompt: {
      type: 'string',
      provideValueForQuestion:
        'What is the port of the microcontroller on your network?',
      saveConfigTransform: value => Number(value)
    }
  }
};

export type AllConfig = RemoteAccessConfig & CommandConfig;

export const configFileName = 'lowsync.config.json';

export function readAuthConfig(): AuthConfig2 {
  // todo
  throw new Error();
}

export function readConfig(): {
  remoteAccessConfig: RemoteAccessConfig2;
  commandConfig: CommandConfig2;
} {
  throw new Error(); // todo
}

// todo gucken ob wirklich syncdir richtig abgefragt wird wenn sync

interface OptsOptions<TConfig, TConfigFile extends TConfig> {
  config: Config<TConfigFile>;
  metas: PropMetas<TConfig>;
  askOrder: (keyof TConfig)[];
  ask?: (config: TConfig) => Promise<void>;
}

const prompt = inquirer.createPromptModule();

class Config<TConfig> {
  readonly filename: string;
  private _config: any;

  constructor(
    public readonly file: string,
    public readonly allConfigKeys: Set<keyof TConfig>
  ) {
    this.filename = path.basename(file);
  }

  async setKey<K extends keyof TConfig>(key: K, newValue: TConfig[K]) {
    const config = await this.getConfig();
    config[key] = newValue;

    await this.saveConfig();
  }

  async getKey(key: keyof TConfig): Promise<unknown> {
    const config = await this.getConfig();
    return config[key];
  }

  private async saveConfig() {
    const json = JSON.stringify(this._config, null, 4);
    await fs.mkdirp(path.dirname(this.file));
    await fs.writeFile(this.file, json);
  }

  private async getConfig() {
    if (this._config) return this._config;
    if (!(await fs.pathExists(this.file))) {
      return {};
    }
    const content = (await fs.readFile(this.file)).toString();
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new RunError(
          `Unable to parse configuration file ${
            this.file
          }. Maybe it is corrupted. Check if it is in a valid JSON format or delete it and run lowsync --init to create a new one.`
        );
      }
      throw e;
    }
    if (!isPlainObject(parsed)) {
      throw new RunError(
        `Unable to parse configuration file ${
          this.file
        }. The file must contain a javascript object ({...}). You may want to delete it and run lowsync --init to create a new one.`
      );
    }
    this._config = parsed;
    return parsed;
  }
}

class Opts<TConfig, TConfigFile extends TConfig> {
  private config: Config<TConfig>;
  private metas: PropMetas<TConfig>;
  private askOrder: (keyof TConfig)[];
  private ask?: (config: TConfig) => Promise<void>; // todo run this

  constructor({
    config,
    metas,
    askOrder,
    ask
  }: OptsOptions<TConfig, TConfigFile>) {
    this.config = config;
    this.metas = metas;
    this.askOrder = askOrder;
    this.ask = ask;
  }

  getErrors(keys?: (keyof TConfig)[]): string[] {
    const errors = [];
    const requestKeys = new Set(keys || []);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const { prompt: promptOpts, validate, default: _default } = this.metas[
          key
        ];
        if (promptOpts) continue;
        let currentValue = this.config.getKey(key);
        if (currentValue !== undefined || _default === undefined) {
          const errMsg = validate(currentValue);
          if (errMsg) {
            errors.push(errMsg);
          }
        }
      }
    }
    return errors;
  }
  // todo make sure that plainobject in json files
  // todo hint about lowsync init here
  async askUser(keys?: (keyof TConfig)[]) {
    const requestKeys = new Set(keys || []);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const { prompt: promptOpts, validate, default: _default } = this.metas[
          key
        ];
        const currentValue = this.config.getKey(key);
        if (currentValue === undefined && _default !== undefined) continue;
        if (!promptOpts) {
          // was already handled in getErrors
          continue;
        }
        const errMsg = validate(currentValue);
        if (errMsg) {
          const {
            type,
            provideValueForQuestion,
            default: promptDefault,
            saveConfigTransform
          } = promptOpts;
          let { newValue } = await prompt<{ newValue: unknown }>({
            name: 'newValue',
            type,
            message: `An invalid value was found in ${
              this.config.filename
            } for "${key}". ${errMsg}. ${provideValueForQuestion}`,
            default: promptDefault || _default, // todo _default tostring if input or password
            validate: value => validate(value) || true
          });
          if (saveConfigTransform) {
            newValue = saveConfigTransform(newValue);
          }

          this.config.setKey(key, newValue as any);
        }
      }
    }
  }

  getConfig(keys?: (keyof TConfig)[]): TConfig {
    const result = {} as TConfig;
    const requestKeys = keys || [];
    for (const key of requestKeys) {
      let value = this.config.getKey(key);
      const { transformForUse, default: _default } = this.metas[key];
      if (value === undefined && _default !== undefined) {
        value = _default as any;
      }
      if (transformForUse) {
        value = transformForUse(value) as any;
      }
      if (value !== undefined) result[key] = value as any;
    }
    return result;
  }
}

class CommandConfigOpts extends Opts<CommandConfig, TheConfig> {
  constructor(config: ConfigFile) {
    super({
      config,
      metas: commandMeta, // later make sure all of askorder is in config keys
      askOrder: ['syncDir', 'transpile']
    });
  }
}

type TheConfig = CommandConfig & RemoteAccessConfig;

class ConfigFile extends Config<TheConfig> {}

class AuthConfigFile extends Config<AuthConfig> {}

class AuthOpts extends Opts<AuthConfig, AuthConfig> {
  constructor(config: AuthConfigFile) {
    super({
      config,
      metas: authMeta,
      askOrder: ['password'],
      ask: async ({ password }) => {
        const ok = await this.authenticationService.tryLogin(password);
        if (ok) {
          await this.authenticationService.logout();
        } else {
          throw new RunError(''); // todo msg
        }
      }
    });
  }
}

class RemoteAccessOpts extends Opts<RemoteAccessConfig, TheConfig> {
  constructor(config: ConfigFile) {
    super({
      config,
      metas: remoteAccessMeta,
      askOrder: ['ip', 'port'],
      ask: async ({ port, ip }) => {
        const connectionOk = await request({
          method: 'POST',
          agent: httpsPool,
          uri: `https://${ip}:${port}/api/Login`,
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          timeout: 30_000,
          body: JSON.stringify({ password: Date.now().toString() })
        })
          .then(() => {
            return true;
          })
          .catch(() => {
            return false;
          });
        if (!connectionOk) {
          throw new RunError(
            `The device cannot be reached under the provided IP and port (${ip}:${port}). (network problem, or wrong IP). Please correct the problem in your configuration or delete it and run lowsync --init`
          );
        }

        // todo setHostPrefix(`https://${ip}:${port}`);
      }
    });
  }
}

//
// // todo ask for password and port in lowsync init

// unknownConfigKeyErrors(): string[] {
//   const errors = [];
//   for (const key of Object.keys(this.config) as (keyof TConfig)[]) {
//     if (!this.opts.configKeys.has(key)) {
//       errors.push(
//         `An unknown setting "${key}" was found in ${
//           this.filename
//         }. Please remove or correct that setting.`
//       );
//     }
//   }
//   return errors;
// }
