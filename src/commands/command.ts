import { Options } from '../args';
import { inject, injectable } from 'inversify';
import { CommandConfig } from '../config';

@injectable()
export abstract class Command<TConfig extends keyof CommandConfig=never> {
  readonly usingNoRemoteApis?:boolean;
  abstract readonly requestConfig: { [K in TConfig]: boolean };
  config!: { [K in TConfig]: CommandConfig[K] };

  constructor(public readonly command: Options['type']) {}

  abstract run(): Promise<void>;
}
