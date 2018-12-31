import { parseArguments } from './args';
import chalk from 'chalk';
import { RunError } from './runError';
import { Program } from './program';

process.on('unhandledRejection', (reason, p) => {
  console.error(
    chalk.white.bgRed('Unhandled Rejection at: Promise' + p, 'reason:', reason)
  );
});

(async function() {
  try {
    const args = parseArguments();

    const program = new Program(args);
    await program.run();
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
})();
