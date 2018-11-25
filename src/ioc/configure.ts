import { Container, interfaces } from "inversify";
import { Command } from "../commands/command";
import { LOWTYPES } from "./types";
import { InitCommand } from "../commands/commands/init";
import { MonitorCommand } from "../commands/commands/monitor";
import { SettingsCommand } from "../commands/commands/settings";
import { StartCommand } from "../commands/commands/start";
import { StatusCommand } from "../commands/commands/status";
import { StopCommand } from "../commands/commands/stop";
import { SyncCommand } from "../commands/commands/sync";
import { UpdateCommand } from "../commands/commands/update";
import { Program } from "../program";
import { parseArguments, Options } from "../args";
import { getRawConfig, Config, RawConfig } from "../config";
import { FlashCommand } from "../commands/commands/flash";

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

    container.bind<RawConfig>(LOWTYPES.RawConfig).toConstantValue(await getRawConfig());
}