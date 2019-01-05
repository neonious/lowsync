import chalk from 'chalk';
import { parseArguments } from './args';
import { authConfigFile } from './config/authConfigFile';
import { configFile } from './config/configFile';
import { RunError } from './runError';
import './config/remoteAccessOpts';

process.on('unhandledRejection', (reason, p) => {
  console.error(
    chalk.white.bgRed('Unhandled Rejection at: Promise' + p, 'reason:', reason)
  );
});

async function main() {
  try {
    const args = parseArguments();

    const type = args.type;
    const run = (await import(`./commands/commands/${type}`)).default;
    const unknownErrs = [];
    unknownErrs.push(...(await configFile.unknownConfigKeyErrors()));
    unknownErrs.push(...(await authConfigFile.unknownConfigKeyErrors()));
    for (const err of unknownErrs) {
      console.warn(chalk.hex('#ffa500').bold(err));
    }

    await run(args);

  } catch (ex) {
    if (ex instanceof RunError) {
      console.error(chalk.white.bgRed('An error has occured: ' + ex.message));
    } else {
      console.error(
        chalk.white.bgRed(
          `An unexpected error has occured. ` + ex.message + ' ' + ex.stack
        )
      );
    }
    process.exit(1);
  }
}

main();
