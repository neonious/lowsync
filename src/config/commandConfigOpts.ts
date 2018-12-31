import * as path from 'path';
import { Opts } from './base/opts';
import { configFile, TheConfig } from './configFile';
import { CommandConfig } from './config2';

export const commandConfigOpts = new Opts<CommandConfig, TheConfig>({
  config: configFile,
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
      default: path.dirname(configFile.file),
      prompt: {
        type: 'input',
        provideValueForQuestion:
          'What is the local directory that you want to sync with?',
        default: process.cwd()
      },
      saveConfigTransform: value =>
        path.relative(path.dirname(configFile.file), value as string) ||
        undefined,
      transformForUse: value =>
        value
          ? path.resolve(path.dirname(configFile.file), value as string)
          : path.dirname(configFile.file)
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
