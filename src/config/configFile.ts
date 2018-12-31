import { getExistingOrNewConfigPath } from '../util';
import { CommandConfig, RemoteAccessConfig } from './config2';
import { Config } from './base/config';
import { keys } from 'ts-transformer-keys';

export type TheConfig = CommandConfig & RemoteAccessConfig;

const path = getExistingOrNewConfigPath('lowsync.config.json');
export const configFile = createNewConfig();

export function createNewConfig() {
  return new Config<TheConfig>(path, new Set(keys<TheConfig>()));
}
