import "reflect-metadata";
import chalk from 'chalk';
import { setupContainer } from './indexUtil';
import { LOWTYPES } from "./ioc/types";
import { Program } from './program';
import { RunError } from "./runError";

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

process.on('unhandledRejection', (reason, p) => {
    console.error(chalk.white.bgRed('Unhandled Rejection at: Promise' + p, 'reason:', reason)); 
});

(async function () {
    try {
        const container = await setupContainer();

        await container.get<Program>(LOWTYPES.Program).run();

    } catch (ex) {
        if (ex instanceof RunError) {
            console.error(chalk.white.bgRed('An error has occured: ' + ex.message));
            
        } else {
            console.error(chalk.white.bgRed(`An unexpected error has occured. ` + ex.message + " " + ex.stack));
        }
        process.exit(1);
    }
}())
