import { ConfigFile } from './base/configFile';
import { getExistingOrNewConfigPath } from '../util';

export interface AuthOptions {
  password?: string;
}

const path = getExistingOrNewConfigPath('lowsync.auth.config.json');
export const authConfigFile = new ConfigFile<AuthOptions>(path, {
  password: {
    optional: true,
    defaultValue: '',
    type: 'string',
    prompt: {
      message: 'Please enter the password for the microcontroller.',
      isPassword: true
    },
    saveConfigTransform: pw => (pw === '' ? undefined : pw),
    noInit: true
  }
});
