import { keys } from '@common/node_modules/ts-transformer-keys';
import { RunError } from './runError';
import { join } from 'path';
import fs = require('fs-extra');
import { ipAddress } from '@common/src/common/regexConst';
import { isPlainObject, mapValues } from 'lodash';
import * as path from 'path';
import inquirer = require('inquirer');
import { Questions, Question } from 'inquirer';
import { httpsPool, httpPool } from '../common/src/services/http/handler/node';
import * as request from 'request-promise-native';
import { AuthenticationService } from '../common/src/services/authentication/authentication';
import { TYPES } from '../common/src/types';
import { inject, injectable, multiInject, unmanaged } from 'inversify';
import { setHostPrefix } from './indexUtil';
import { LOWTYPES } from './ioc/types';
import { getExistingOrNewConfigPath } from './util';

export interface AuthConfig {
  password: string;
}

export interface RemoteAccessConfig {
  ip: string;
  port?: number;
  useHttp?: boolean;
}
export interface CommandConfig {
  syncDir: string;
  transpile?: boolean;
  exclude?: string[];
}

type PromptType = 'input' | 'confirm' | 'password';

interface PropMeta {
  required?: boolean;
  validate: (value: unknown) => string | undefined;
  default?: unknown;
  noInit?: boolean;
  prompt?: {
    type: PromptType;
    provideValueForQuestion: string;
    default?: unknown;
  };
  saveConfigTransform?: (value: unknown) => unknown;
  transformForUse?: (value: unknown) => unknown;
}

type PropMetas<TConfig> = { [K in keyof TConfig]-?: PropMeta };

export type AllConfig = RemoteAccessConfig & CommandConfig;

interface OptsOptions<TConfig, TConfigFile extends TConfig> {
  config: Config<TConfigFile>;
  metas: PropMetas<TConfig>;
  askOrder: (keyof TConfig)[];
  ask?: (config: TConfig) => Promise<void>;
}

const prompt = inquirer.createPromptModule();
@injectable()
class Config<TConfig> {
  private _config: any;

  get file() {
    return this._file;
  }

  get filename() {
    return path.basename(this.file);
  }

  constructor(
    @unmanaged() private _file: string,
    @unmanaged() public readonly allConfigKeys: Set<keyof TConfig>
  ) {}

  async unknownConfigKeyErrors() {
    const errors = [];
    for (const key of await this.getExistingKeys()) {
      if (!this.allConfigKeys.has(key)) {
        errors.push(
          `An unknown setting "${key}" was found in ${
            this.filename
          }. Please remove or correct that setting.`
        );
      }
    }
    return errors;
  }

  async moveTo(newFile: string) {
    await fs.mkdirp(path.dirname(newFile));
    await fs.move(this.file, newFile);
    this._file = newFile;
  }

  async exists() {
    return await fs.pathExists(this.file);
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

  async getExistingKeys(): Promise<(keyof TConfig)[]> {
    const config = await this.getConfig(true);
    return Object.keys(config) as (keyof TConfig)[];
  }

  private async saveConfig() {
    const json = JSON.stringify(this._config, null, 4);
    await fs.mkdirp(path.dirname(this.file));
    await fs.writeFile(this.file, json);
  }

  async getConfig(emptyObjectOnError?: boolean) {
    if (this._config) return this._config;
    if (!(await fs.pathExists(this.file))) {
      this._config = {};
      return this._config;
    }
    const content = (await fs.readFile(this.file)).toString();
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      if (e instanceof SyntaxError) {
        if (emptyObjectOnError) return {};
        throw new RunError(
          `Unable to parse configuration file ${
            this.file
          }. Maybe it is corrupted. Check if it is in a valid JSON format or delete it and run lowsync --init to create a new one.`
        );
      }
      throw e;
    }
    if (!isPlainObject(parsed)) {
      if (emptyObjectOnError) return {};
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
@injectable()
class Opts<TConfig, TConfigFile extends TConfig> {
  private config: Config<TConfigFile>;
  readonly metas: PropMetas<TConfig>;
  readonly askOrder: (keyof TConfig)[];
  readonly ask?: (config: TConfig) => Promise<void>;

  constructor(@unmanaged()
  {
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

  async getErrors(keys?: (keyof TConfig)[]) {
    const errors = [];
    const requestKeys = new Set(keys || this.askOrder);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const {
          required,
          prompt: promptOpts,
          validate,
          default: _default
        } = this.metas[key];
        if (promptOpts) continue;
        let currentValue = await this.config.getKey(key);
        if (currentValue !== undefined || _default === undefined) {
          if (currentValue === undefined && required) {
            errors.push(
              `No value was found in ${this.config.filename} for "${key}".`
            );
          } else {
            const errMsg = validate(currentValue);
            if (errMsg) {
              errors.push(
                `An invalid value was found in ${
                  this.config.filename
                } for "${key}". ${errMsg}`
              );
            }
          }
        }
      }
    }
    return errors;
  }

  async init(pconfig?: Config<TConfigFile>) {
    const config = pconfig || this.config;
    for (const key of this.askOrder) {
      const {
        prompt: promptOpts,
        validate,
        default: _default,
        noInit,
        saveConfigTransform
      } = this.metas[key];
      if (noInit || !promptOpts) {
        // if pconfig here means that pconfig is a new config object since only new config objects are passed into this method
        if (pconfig && _default !== undefined) {
          config.setKey(key, _default as any);
        }
        continue;
      }
      const {
        type,
        provideValueForQuestion,
        default: promptDefault
      } = promptOpts;
      let defValue = await config.getKey(key);
      const errMsg = validate(defValue);
      if (errMsg) {
        defValue = undefined;
      }

      let { newValue } = await prompt<{ newValue: unknown }>({
        name: 'newValue',
        type,
        message: provideValueForQuestion,
        default: this.s(type, defValue, promptDefault, _default),
        validate: value => validate(value) || true
      });
      if (saveConfigTransform) {
        newValue = saveConfigTransform(newValue);
      }

      await config.setKey(key, newValue as any);
    }

    this.ask && (await this.ask(await config.getConfig()));
  }

  private s(type: PromptType, ...vals: any[]) {
    switch (type) {
      case 'confirm': {
        for (const val of vals) {
          if (val) {
            return true;
          }
        }
        return false;
      }
      default: {
        for (const val of vals) {
          if (val !== undefined && val !== null) return val.toString();
        }
        return undefined;
      }
    }
  }

  async askUser(keys?: (keyof TConfig)[]) {
    const requestKeys = new Set(keys || this.askOrder);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const {
          required,
          prompt: promptOpts,
          validate,
          default: _default,
          saveConfigTransform
        } = this.metas[key];
        const currentValue = await this.config.getKey(key);
        if (currentValue === undefined && _default !== undefined) continue;
        if (!promptOpts) {
          // was already handled in getErrors
          continue;
        }

        const req = currentValue === undefined && required;
        const errMsg = validate(currentValue);
        if (req || errMsg) {
          const {
            type,
            provideValueForQuestion,
            default: promptDefault
          } = promptOpts;
          const message = req
            ? `No value was found in ${
                this.config.filename
              } for "${key}". ${provideValueForQuestion}`
            : `An invalid value was found in ${
                this.config.filename
              } for "${key}". ${errMsg} ${provideValueForQuestion}`;
          let { newValue } = await prompt<{ newValue: unknown }>({
            name: 'newValue',
            type,
            message,
            default: this.s(type, promptDefault, _default),
            validate: value => {
              if (value === undefined && required) {
                return 'An input is required.';
              }
              return validate(value) || true;
            }
          });
          if (saveConfigTransform) {
            newValue = saveConfigTransform(newValue);
          }

          await this.config.setKey(key, newValue as any);
        }
      }
    }

    this.ask && (await this.ask(await this.getConfig(keys)));
  }

  async getConfig(keys?: (keyof TConfig)[]) {
    const result = {} as TConfig;
    const requestKeys = keys || this.askOrder;
    for (const key of requestKeys) {
      let value = await this.config.getKey(key);
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

type TheConfig = CommandConfig & RemoteAccessConfig;
@injectable()
export class ConfigFile extends Config<TheConfig> {
  constructor() {
    super(
      getExistingOrNewConfigPath('lowsync.config.json'),
      new Set(keys<TheConfig>())
    );
  }
}

@injectable()
export class AuthConfigFile extends Config<AuthConfig> {
  constructor() {
    super(
      getExistingOrNewConfigPath('lowsync.auth.config.json'),
      new Set(keys<AuthConfig>())
    );
  }
}
@injectable()
export class CommandConfigOpts extends Opts<CommandConfig, TheConfig> {
  constructor(@inject(LOWTYPES.ConfigFile) config: ConfigFile) {
    super({
      config,
      metas: {
        syncDir: {
          validate: value => {
            if (value !== undefined) {
              if (typeof value !== 'string')
                return 'Invalid datatype. Expected a string.';
              try {
                // check if path valid
                path.resolve(value);
              } catch {
                return 'Invalid path format: Must be a valid relative or absolute path.';
              }
            }
          },
          default: path.dirname(config.file),
          prompt: {
            type: 'input',
            provideValueForQuestion:
              'What is the local directory that you want to sync with?',
            default: process.cwd()
          },
          saveConfigTransform: value =>
            path.relative(path.dirname(config.file), value as string) ||
            undefined,
          transformForUse: value =>
            value
              ? path.resolve(path.dirname(config.file), value as string)
              : path.dirname(config.file)
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
      },
      askOrder: ['syncDir', 'transpile', 'exclude']
    });
  }
}

@injectable()
export class AuthOpts extends Opts<AuthConfig, AuthConfig> {
  constructor(
    @inject(TYPES.AuthenticationService)
    private authenticationService: AuthenticationService,
    @inject(LOWTYPES.AuthConfigFile) config: AuthConfigFile
  ) {
    super({
      config,
      metas: {
        password: {
          required: true,
          validate: value => {
            if (typeof value !== 'string')
              return 'Invalid datatype. Expected a string.';
          },
          prompt: {
            type: 'password',
            provideValueForQuestion:
              'What is the password for the microcontroller?'
          }
        }
      },
      askOrder: ['password'],
      ask: async ({ password }) => {
        const ok = await this.authenticationService.tryLogin(password);
        if (ok) {
          await this.authenticationService.logout();
        } else {
          throw new RunError(
            'The password seems to be invalid. Please correct the problem in your configuration or delete it and run lowsync --init'
          );
        }
      }
    });
  }
}
@injectable()
export class RemoteAccessOpts extends Opts<RemoteAccessConfig, TheConfig> {
  constructor(@inject(LOWTYPES.ConfigFile) config: ConfigFile) {
    super({
      config,
      metas: {
        ip: {
          required: true,
          validate: value => {
            if (typeof value !== 'string') {
              return 'Invalid datatype. Expected a string.';
            }
            if (!ipAddress.test(value)) {
              return 'Not a valid IP address!';
            }
          },
          prompt: {
            type: 'input',
            provideValueForQuestion:
              'What is the IP address of the microcontroller on your network?',
            default: '192.168.0.1'
          }
        },
        port: {
          validate: value => {
            if (value !== undefined) {
              if (isNaN(value as any)) {
                return 'Invalid datatype. Expected a number.';
              }
              const num = Number(value);
              if (!Number.isInteger(num)) {
                return 'Invalid datatype. Expected an integer.';
              }
              if (num < 0 || num > 65535) {
                return 'Not a valid port number (0-65535). Specify -1 to use the default port.';
              }
            }
          },
          noInit: true,
          prompt: {
            type: 'input',
            provideValueForQuestion:
              'What is the port of the microcontroller on your network?'
          },
          saveConfigTransform: value =>
            value !== undefined ? Number(value) : undefined
        },
        useHttp: {
          validate: value => {
            if (value !== undefined && typeof value !== 'boolean')
              return 'Invalid datatype. Expected a boolean.';
          },
          noInit: true
        }
      },
      askOrder: ['ip', 'port', 'useHttp'],
      ask: async ({ port: _port, ip, useHttp }) => {
        const protocol = useHttp ? 'http' : 'https';
        const port = _port === undefined ? (useHttp ? 8000 : 8443) : _port;
        try {
          await request({
            method: 'POST',
            agent: useHttp ? httpPool : httpsPool,
            uri: `${protocol}://${ip}:${port}/api/Login`,
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            timeout: 30_000,
            body: JSON.stringify({ password: Date.now().toString() })
          });
          setHostPrefix(`${protocol}://${ip}:${port}`);
        } catch {
          throw new RunError(
            `The device cannot be reached with the provided protocol, IP and port (${protocol}://${ip}:${port}). (maybe a network problem). Please correct the problem in your configuration or delete it and run lowsync --init`
          );
        }
      }
    });
  }
}
