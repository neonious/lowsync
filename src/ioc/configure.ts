import { Container, interfaces } from 'inversify';
import { Command } from '../commands/command';
import { LOWTYPES } from './types';
import { InitCommand } from '../commands/commands/init';
import { MonitorCommand } from '../commands/commands/monitor';
import { SettingsCommand } from '../commands/commands/settings';
import { StartCommand } from '../commands/commands/start';
import { StatusCommand } from '../commands/commands/status';
import { StopCommand } from '../commands/commands/stop';
import { SyncCommand } from '../commands/commands/sync';
import { UpdateCommand } from '../commands/commands/update';
import { Program } from '../program';
import { parseArguments, Options } from '../args';
import { FlashCommand } from '../commands/commands/flash';
import {
  CommandConfigOpts,
  AuthOpts,
  RemoteAccessOpts,
  ConfigFile,
  AuthConfigFile
} from '../config';

export async function configureContainerLowSync(container: Container) {
  container.bind<Command>(LOWTYPES.Commands).to(InitCommand);
  container.bind<Command>(LOWTYPES.Commands).to(MonitorCommand);
  container.bind<Command>(LOWTYPES.Commands).to(SettingsCommand);
  container.bind<Command>(LOWTYPES.Commands).to(StartCommand);
  container.bind<Command>(LOWTYPES.Commands).to(StatusCommand);
  container.bind<Command>(LOWTYPES.Commands).to(StopCommand);
  container.bind<Command>(LOWTYPES.Commands).to(SyncCommand);
  container.bind<Command>(LOWTYPES.Commands).to(FlashCommand);
  container.bind<Command>(LOWTYPES.Commands).to(UpdateCommand);

  container.bind<Program>(LOWTYPES.Program).to(Program);

  container.bind<Options>(LOWTYPES.Options).toConstantValue(parseArguments());

  container
    .bind<CommandConfigOpts>(LOWTYPES.CommandConfig)
    .to(CommandConfigOpts);
  container.bind<AuthOpts>(LOWTYPES.AuthConfig).to(AuthOpts);
  container
    .bind<RemoteAccessOpts>(LOWTYPES.RemoteAccessConfig)
    .to(RemoteAccessOpts);

  container.bind<ConfigFile>(LOWTYPES.ConfigFile).to(ConfigFile);
  container.bind<AuthConfigFile>(LOWTYPES.AuthConfigFile).to(AuthConfigFile);
}
