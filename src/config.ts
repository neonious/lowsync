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
import { isPlainObject } from 'lodash';
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

type PromptType = 'string' | 'confirm';

interface PropMeta {
  default?: unknown;
  validate: (value: unknown) => string | undefined;
  prompt?: {
    type: PromptType;
    provideValueForQuestion: string;
  };
  transformForUse?: (value: unknown) => unknown;
  saveConfigTransform?: (value: unknown) => unknown;
}

type PropMetas<TConfig> = { [K in keyof TConfig]-?: PropMeta };

const authMeta: PropMetas<AuthConfig> = {
  password: {}
};
// todo describes:
const commandMeta: PropMetas<CommandConfig> = {
  syncDir: {
    default: process.cwd(),
    validate: value => {
      if (!value) {
        // todo also check if path valid
        return 'A value was not provided.';
      }
      if (typeof value !== 'string')
        return 'Invalid datatype. Expected a string.';
    }, // todo ensure is valid path
    initText: 'Local directory that you want to sync with?',
    describe: '', // todo
    saveConfigTransform: value =>
      path.relative(process.cwd(), value as string) || '.',
    transformForUse: value => '' // todo make make sure is an absolute path when read from commands,
  },
  transpile: {
    default: true,
    initText:
      'Enable ES 6 (and more) via automatic Babel transpilation? (if disabled, you will have to handle this yourself!)',
    validate: value => {
      if (value !== undefined && typeof value !== 'boolean')
        return 'Invalid datatype. Expected a boolean.';
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
    default: '192.168.0.1',
    validate: (value: string) => {
      if (!ipAddress.test(value)) {
        return 'Not a valid IP address!';
      }
    },
    initText: 'IP address of the microcontroller on your network?'
  },
  port: {
    default: 8443,
    validate: (value: string) => {
      if (!ipAddress.test(value)) {
        return 'Not a valid IP address!';
      }
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

/*
check if any unknown options exist, if yes print in orange that options unknown
*/
// todo gucken ob wirklich syncdir richtig abgefragt wird wenn sync

interface OptsOptions<TConfig> {
  metas: PropMetas<TConfig>;
  askOrder: (keyof TConfig)[];
  ask?: (config: TConfig) => Promise<void>;
}
const prompt = inquirer.createPromptModule();
class Opts<TConfig> {
  private filename: string;

  constructor(
    private file: string,
    private config: Partial<TConfig>,
    private configKeys: { [K in keyof TConfig]: boolean },
    private opts2: OptsOptions<TConfig>
  ) {
    this.filename = path.basename(file);
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
    const result = [];
    const allKeys = new Set(keys || []);
    for (const key of this.opts2.askOrder) {
      if (allKeys.has(key)) {
        const {
          prompt: promptOpts,
          validate,
        } = this.opts2.metas[key];
        const currentValue = this.config[key];
        const errMsg = validate(currentValue);
        if (errMsg && !promptOpts) {
          result.push(errMsg);
        }
      }
    }
    return result;
  }

  // todo hint about lowsync init here
  async askUser(keys?: (keyof TConfig)[]) {
    const allKeys = new Set(keys || []);
    for (const key of this.opts2.askOrder) {
      if (allKeys.has(key)) {
        const {
          prompt: promptOpts,
          validate,
          default: _default,
          saveConfigTransform
        } = this.opts2.metas[key];
        const currentValue = this.config[key];
        if (!promptOpts) {
          // was already handled in getErrors
          continue;
        }
        const errMsg = validate(currentValue);
        if (errMsg) {
          const { type, provideValueForQuestion } = promptOpts;
          let { newValue } = await prompt<{ newValue: unknown }>({
            name: 'newValue',
            type,
            message: `An invalid value was found in ${
              this.filename
            } for "${key}". ${errMsg}. ${provideValueForQuestion}`,
            default: _default,
            validate: value => validate(value) || true
          });
          if (saveConfigTransform) {
            newValue = saveConfigTransform(newValue);
          }
          this.config[key] = newValue as any;
          // todo write to file
        }
      }
    }
  }

  opts(): TConfig {
    throw new Error();
    // todo
  }
}

// todo:

//
// // todo ask for password and port in lowsync init
// class AuthConfig2 extends Opts<AuthConfig> {
//   constructor(config: AuthConfig) {
//     // todo null as any
//     super(config, null as any, {
//       ask: async ({ password }) => {
//         const ok = await this.authenticationService.tryLogin(password);
//         if (ok) {
//           await this.authenticationService.logout();
//         } else {
//           return {
//             fail: '', // todo msg
//             askAgain: ['password']
//           };
//         }
//       }
//     });
//   }
// }

// class RemoteAccessConfig2 extends Opts<RemoteAccessConfig> {
//   constructor(config: RemoteAccessConfig) {
//     // todo null as any
//     super(config, null as any, {
//       ask: async ({ port, ip }) => {
//         const connectionOk = await request({
//           method: 'POST',
//           agent: httpsPool,
//           uri: `https://${ip}:${port}/api/Login`,
//           headers: { 'Content-Type': 'application/json;charset=UTF-8' },
//           timeout: 30_000,
//           body: JSON.stringify({ password: Date.now().toString() })
//         })
//           .then(() => {
//             return true;
//           })
//           .catch(() => {
//             return false;
//           });
//         if (!connectionOk) {
//           return {
//             fail: `The device cannot be reached under the provided IP and port (${ip}:${port}). (network problem, or wrong IP).`,
//             askAgain: ['ip', 'port']
//           };
//         }

//         // todo setHostPrefix(`https://${ip}:${port}`);
//       }
//     });
//   }

// }
