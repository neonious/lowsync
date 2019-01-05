import { dirname, relative, resolve } from 'path';
import { keys } from 'ts-transformer-keys';
import { ipAddress } from '../../common/src/common/regexConst';
import { getExistingOrNewConfigPath } from '../util';
import { ConfigFile } from './base/config';
import { ConfigOptions } from './options';

const confPath = getExistingOrNewConfigPath('lowsync.config.json');
export const configFile = createNewConfig();

export function createNewConfig(): ConfigFile<ConfigOptions> {
  return new ConfigFile<ConfigOptions>(
    confPath,
    {
      ip: {
        optional: false,
        type: 'string',
        prompt: {
          message:
            'What is the IP address of the microcontroller on your network?',
          defaultValue: '192.168.0.1'
        },
        validate: ip => {
          if (!ipAddress.test(ip)) {
            return 'Not a valid IP address!';
          }
        }
      },
      port: {
        optional: true,
        prompt: {
          message: 'What is the port of the microcontroller on your network?',
          defaultValue: 8443
        },
        type: 'integer',
        validate: port => {
          if (isNaN(port as any)) return 'Invalid datatype. Expected a number.';
          const num = Number(port);
          if (!Number.isInteger(num)) {
            return 'Invalid datatype. Expected an integer.';
          }
          if (num < 0 || num > 65535) {
            return 'Not a valid port number (0-65535).';
          }
        },
        noInit: true
      },
      useHttp: {
        optional: true,
        prompt: {
          message: 'Use HTTPS (encrypted)?'
        },
        type: 'boolean',
        noInit: true
      },
      syncDir: {
        optional: true,
        prompt: {
          message: 'What is the local directory that you want to sync with?',
          defaultValue: process.cwd()
        },
        type: 'string',
        validate: path => {
          try {
            // check if path valid
            resolve(path);
          } catch {
            return 'Invalid path format: Must be a valid relative or absolute path.';
          }
        },
        defaultValue: dirname(confPath),
        saveConfigTransform: value =>
          relative(dirname(confPath), value) || undefined,
        transformForUse: value =>
          value
            ? resolve(dirname(confPath), value)
            : dirname(confPath)
      },
      transpile: {
        type: 'boolean',
        optional: true,
        defaultValue: true,
        prompt: {
          message:
            'Enable ES 6 (and more) via automatic Babel transpilation? (if disabled, you will have to handle this yourself!)',
          defaultValue: true
        }
      },
      exclude: {
        type: 'any',
        optional: true,
        validateAll: value => {
          if (!Array.isArray(value)) {
            return 'Invalid datatype. Expected an array of strings.';
          }
          if (value.some(e => !e || typeof e !== 'string')) {
            return 'Array contains invalid data. Expected non-empty strings.';
          }
        },
        noInit: true
      }
    },
    `No configuration file was found. Please create a configuration file first via the lowsync init command.` 
  );
}
