import { keys } from '@common/node_modules/ts-transformer-keys';
import { RunError } from './runError';
import * as findUp from 'find-up';
import {
  loadJsonFindFile,
  saveJsonFindFile
} from '@common/src/common/jsonUtil';
import { join } from 'path';
import fs = require('fs-extra');
import inquirer = require('inquirer');
import { ipAddress } from '@common/src/common/regexConst';
import { isPlainObject } from 'lodash';

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

type PrimType = 'number' | 'string' | 'boolean';
type TypeComb = PrimType | [PrimType, 'array'];
interface PropMeta {
  type: TypeComb | TypeComb[];
  required: boolean;
  default: any;
  validate?: (value: unknown) => string | boolean;
  initText?: string;
  describe?: string;
  transformForUse?: (value: unknown) => any;
}

type PropMetas<TConfig> = { [K in keyof TConfig]-?: PropMeta };
function emptyInputValidate(value: string) {
  if (!value) {
    return 'Empty input!';
  }
  return true;
}
const authMeta: PropMetas<AuthConfig> = {};
// todo describes:
const commandMeta: PropMetas<CommandConfig> = {
  syncDir: {
    type: 'string',
    required: true,
    default: process.cwd(),
    validate: emptyInputValidate, // todo ensure is valid path
    initText: 'Local directory that you want to sync with?',
    describe: '', // todo
    transformForUse: null as any, // todo make make sure is an absolute path when read from commands,
    saveConfigTransform: value => relative(process.cwd(), newSyncDir) || '.'
  },
  transpile: {
    type: 'boolean',
    required: false,
    default: true,
    initText:
      'Enable ES 6 (and more) via automatic Babel transpilation? (if disabled, you will have to handle this yourself!)'
  },
  exclude: {
    type: ['string', 'array'],
    required: false
  }
};
const remoteAccessMeta: PropMetas<RemoteAccessConfig> = {
  ip: {
    type: 'string',
    required: true,
    default: '192.168.0.1',
    validate: (value: string) => {
      if (!ipAddress.test(value)) {
        return 'Not a valid IP address!';
      }
      return true;
    },
    initText: 'IP address of the microcontroller on your network?'
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

/*
check if any unknown options exist, if yes print in orange that options unknown
*/
// todo gucken ob wirklich syncdir richtig abgefragt wird wenn sync
type ooo = 'string' | 'undefined' | 'number';
type Format = ooo | ooo[] | RegExp;

interface OptsOptions<TConfig> {
  metas: PropMetas<TConfig>;
  ask?: (config: TConfig) => Promise<void>;
}

class Opts<TConfig> {
  private filename:string;

  constructor(
    private file: string,
    private config: Partial<TConfig>,
    private configKeys: { [K in keyof TConfig]: boolean },
    private opts2: OptsOptions<TConfig>
  ) {
    this.filename=path.basename(file);
  }

  unknownConfigKeyErrors(): string[] {
    const errors = [];
    for (const key of Object.keys(this.config)) {
      if (!(key in this.configKeys)) {
        errors.push(`Unknown setting in ${this.filename}: "${key}".`);
      }
    }
    return errors;
  }

  getErrors(keys?: (keyof TConfig)[]): string[] {
    throw new Error();
    // todo
  }

  private async askUser(
    text: string,
    {
      type,
      required,
      default: _default,
      validate,
      initText,
      describe,
      transformForUse
    }: PropMeta
  ) {
    if (typeof type === 'string') {
      let opts;
      switch (type) {
        case 'string':
        case 'number': {
          opts = {
            name: 'val',
            type: 'string',
            message:text,
            default: _default, // todo tostring
            validate: value => {
              const result = validate && validate(value);
              if (type === 'number') {
                if (required) {
                  // todo make sure parses to number
                } else {
                  // todo make sure that empty string or parses to number
                }
              }
              return result;
            }
          };
          break;
        }
        case 'boolean': {
          opts = {
            name: 'val',
            type: 'confirm',
            message: text,
            default: _default,
            validate: value => {
              const result = validate && validate(value);
              return result;
            }
          };
          break;
        }
      }
      const { val } = await prompt(opts);
      if (typeof val === 'string' && type === 'number') {
        if (val) {
          return parseInt(val);
        }
        return undefined;
      }
      return val;
    } else {
      throw new RunError(); // todo
    }
  }

// todo hint about lowsync init here
  async askUser(keys?: (keyof TConfig)[]) {
    const thekeys = keys || (Object.keys(this.config) as (keyof TConfig)[]);
    const newConfig: TConfig = {};
    for (const key of thekeys) {
      const meta = this.opts2.metas[key];
      const {
        type,
        required,
        default: _default,
        validate,
        initText,
        describe,
        transformForUse
      } = meta;
      if (Array.isArray(type)) continue; // todo handle this in geterrors
      const value = this.config[key];
      const hasValue = key in this.config;
      let newValue = value;
      const msg = (errIntroText:string)=>`Invalid setting for "${key}" in ${
        this.filename
      }. ${errIntroText}. Please enter a new value for the setting.`;
      if (hasValue) {
        if (!datatypeMatch(value, meta.type)) {
          newValue = await this.askUser(
            msg(`Expected a different datatype (${this.dataTypeStr(meta.type)}).`),
            meta
          );
        } else if (validate && !validate(value)) {
          const result = validate(value);
          if (typeof result === 'string') {
            newValue = await this.askUser(msg(result), meta);
          }
        }
      } else {
        if (required) {
          newValue = await this.askUser(
            msg(  'The setting is required, but was not specified.'),
            meta
          );
        }
      }
      if (newValue !== undefined) {
        newConfig[key] = newValue;
      }
    }
    const ask = this.opts2.ask;
    if (ask) {
      let ok = false;
      do {
        const result = await ask(newConfig);
        if (isPlainObject(result)) {
          const { fail, askAgain } = result;
          console.error(fail); // todo color text
          for (const ag of askAgain) {
            const newValue = await this.askUser(`Please enter a new value for the setting "${ag}".`,meta);
            newConfig[ag] = newValue;
          }
        } else if (result !== false) {
          ok = true;
        }
      } while (!ok);
      // todo save config here
    }

    await fs.writeFile(this.file,JSON.stringify())
  }

  opts(): TConfig {
    throw new Error();
    // todo
  }
}
class CommandConfig2 extends Opts<CommandConfig> {
  constructor(config: CommandConfig) {
    // todo null as any
    super(config, null as any, {});
  }
}

const prompt = inquirer.createPromptModule();
// todo ask for password and port in lowsync init
class AuthConfig2 extends Opts<AuthConfig> {
  constructor(config: AuthConfig) {
    // todo null as any
    super(config, null as any, {
      ask: async ({ password }) => {
        const ok = await this.authenticationService.tryLogin(password);
        if (ok) {
          await this.authenticationService.logout();
        } else {
          return {
            fail: '', // todo msg
            askAgain: ['password']
          };
        }
      }
    });
  }
}

class RemoteAccessConfig2 extends Opts<RemoteAccessConfig> {
  constructor(config: RemoteAccessConfig) {
    // todo null as any
    super(config, null as any, {
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
          return {
            fail: `The device cannot be reached under the provided IP and port (${ip}:${port}). (network problem, or wrong IP).`,
            askAgain: ['ip', 'port']
          };
        }

        // todo setHostPrefix(`https://${ip}:${port}`);
      }
    });
  }
}
