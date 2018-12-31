import { Options } from '../args';
import { CommandConfig } from '../config/config2';

export abstract class Command<TConfig extends keyof CommandConfig=never> {
  abstract readonly usingNoRemoteApis:boolean;
  abstract readonly requestConfig: { [K in TConfig]: boolean };
  config!: { [K in TConfig]: CommandConfig[K] };

  constructor(public readonly command: Options['type']) {}

  abstract run(): Promise<void>;
}
