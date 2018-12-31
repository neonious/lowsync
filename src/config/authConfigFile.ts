import { getExistingOrNewConfigPath } from '../util';
import { Config } from './base/config';
import { AuthConfig } from './config2';
import { keys } from 'ts-transformer-keys';

const path = getExistingOrNewConfigPath('lowsync.auth.config.json');
export const authConfigFile = new Config<AuthConfig>(
  path,
  new Set(keys<AuthConfig>())
);
