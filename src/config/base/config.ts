import * as path from 'path';
import * as fs from 'fs-extra';
import { isPlainObject } from 'lodash';
import { RunError } from '../../runError';
import { SettingDef } from '../settingDef';
import chalk from 'chalk';
import * as inquirer from 'inquirer';

export class ConfigFile<TConfig> {
  private _config: any;

  get file() {
    return this._file;
  }

  get filename() {
    return path.basename(this.file);
  }

  constructor(
    private _file: string,
    private defs: { [K in keyof TConfig]: SettingDef<TConfig[K]> },
    private emptyFileErr?: string
  ) {}

  private get allConfigKeys() {
    return Object.keys(this.defs) as (keyof TConfig)[];
  }

  async unknownConfigKeyErrors() {
    const errors = [];
    for (const key of await this.getExistingKeys()) {
      if (this.allConfigKeys.indexOf(key) === -1) {
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
    const def = this.defs[key] as SettingDef;
    if (def.optional) {
      if (def.defaultValue === newValue) {
        delete config[key];
        await this.saveConfig();
        return;
      }
    }
    if (config[key] !== newValue) {
      config[key] = newValue;
      await this.saveConfig();
    }
  }

  async init(ref?: ConfigFile<TConfig>) {
    for (const key of this.allConfigKeys) {
      const def = this.defs[key] as SettingDef;
      if (def.type !== 'any') {
        if (!def.noInit) {
          await this.promptSave(key, {
            defaultValue: ref ? await ref.getKey(key) : undefined
          });
        }
      }
    }
  }

  async prompt<K extends keyof TConfig>(
    key: K,
    options?: { err?: string; defaultValue?: TConfig[K] }
  ): Promise<TConfig[K]> {
    const { err, defaultValue } = options || {
      err: undefined,
      defaultValue: undefined
    };
    const def = this.defs[key] as SettingDef;
    let result: any;
    if (def.type !== 'any') {
      const {
        type,
        prompt: { message, defaultValue: promptDefaultValue },
        validate
      } = def;
      const prompt = inquirer.createPromptModule();
      err && console.error(chalk.red(this.errMsg(key, err)));
      switch (type) {
        case 'string':
        case 'integer': {
          const { value } = await prompt<{ value: string }>({
            name: 'value',
            type:
              def.type === 'string' && def.prompt.isPassword
                ? 'password'
                : 'input',
            message,
            default: defaultValue
              ? defaultValue.toString()
              : promptDefaultValue && (promptDefaultValue as any).toString(),
            validate: (value: string) => {
              if (
                type === 'integer' &&
                (isNaN(value as any) || !Number.isInteger(Number(value)))
              ) {
                return 'Must be an integer';
              }
              if (validate) {
                const val = type === 'integer' ? parseInt(value) : value;
                const err = validate(val);
                if (err) {
                  return err;
                }
              }
              return true;
            }
          });
          result = type === 'integer' ? parseInt(value) : value;
          
          break;
        }
        case 'boolean': {
          const { value } = await prompt<{ value: boolean }>({
            name: 'value',
            type: 'confirm',
            message,
            default:
              defaultValue !== undefined ? defaultValue : promptDefaultValue,
            validate: (value: string) => {
              return true; // todo
            }
          });
          result = value;
          break;
        }
        default: {
          throw new Error('Unknown datatype ' + type);
        }
      }
    } else {
      throw new Error('No prompt available for setting def');
    }
    if (def.saveConfigTransform) {
      result = def.saveConfigTransform(result);
    }
    return result;
  }

  private async promptSave<K extends keyof TConfig>(
    key: K,
    options?: { err?: string; defaultValue?: TConfig[K] }
  ) {
    const result = await this.prompt(key, options);
    await this.setKey(key, result);
    return result;
  }

  private errMsg<K extends keyof TConfig>(key: K, err: string) {
    return `Error in configuration file for "${key}": ${err}`;
  }

  async getKey<K extends keyof TConfig>(key: K): Promise<TConfig[K]> {
    if (this.emptyFileErr && !await this.exists()) {
      throw new RunError(this.emptyFileErr);
    }
    const config = await this.getConfig();
    const def = this.defs[key] as SettingDef;
    const { defaultValue, optional, transformForUse } = def;
    let rawValue = config[key];
    if (rawValue === undefined) {
      if (!optional) {
        if (def.type !== 'any') {
          rawValue = await this.promptSave(key, {
            err: 'Setting is required.'
          });
        } else {
          throw new RunError(this.errMsg(key, 'Setting is required.'));
        }
      }
    } else if (def.type !== 'any') {
      const type = typeof rawValue;
      switch (def.type) {
        case 'boolean':
        case 'string': {
          if (type !== def.type) {
            rawValue = await this.promptSave(key, { err: 'Invalid datatype.' });
          }
          break;
        }
        case 'integer': {
          if (!Number.isInteger(rawValue)) {
            rawValue = await this.promptSave(key, { err: 'Invalid datatype.' });
          }
          break;
        }
        default: {
          throw new Error('Unknown datatype ' + (def as any).type);
        }
      }
    }
    if (rawValue !== undefined) {
      if (def.type !== 'any' && def.validate) {
        const err = def.validate(rawValue);
        if (err) {
          rawValue = await this.promptSave(key, { err });
        }
      } else if (def.type === 'any' && def.validateAll) {
        const err = def.validateAll(rawValue);
        if (err) {
          throw new RunError(this.errMsg(key, err));
        }
      }
    }
    if (rawValue === undefined && defaultValue !== undefined) {
      rawValue = defaultValue;
    }
    if (transformForUse) {
      rawValue = transformForUse(rawValue);
    }
    return rawValue;
  }

  private async getExistingKeys(): Promise<(keyof TConfig)[]> {
    const config = await this.getConfig(true);
    return Object.keys(config) as (keyof TConfig)[];
  }

  private async saveConfig() {
    const json = JSON.stringify(this._config, null, 4);
    await fs.mkdirp(path.dirname(this.file));
    await fs.writeFile(this.file, json);
  }

  private async getConfig(emptyObjectOnError?: boolean) {
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
          }. Maybe it is corrupted. Check if it is in a valid JSON format or delete it and run lowsync init to create a new one.`
        );
      }
      throw e;
    }
    if (!isPlainObject(parsed)) {
      if (emptyObjectOnError) return {};
      throw new RunError(
        `Unable to parse configuration file ${
          this.file
        }. The file must contain a javascript object ({...}). You may want to delete it and run lowsync init to create a new one.`
      );
    }
    this._config = parsed;
    return parsed;
  }
}
