import * as path from 'path';
import * as fs from 'fs-extra';
import { isPlainObject } from 'lodash';
import { RunError } from '../../runError';

export class Config<TConfig> {
  private _config: any;

  get file() {
    return this._file;
  }

  get filename() {
    return path.basename(this.file);
  }

  constructor(
    private _file: string,
    public readonly allConfigKeys: Set<keyof TConfig>
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
