import * as cliProgress from 'cli-progress';
import { v4 } from 'uuid';
import chalk from 'chalk';
import { httpApi } from '../../common/src/http/httpApiService';
import { websocketApi } from '../../common/src/webSocket/socketPool';
import { InstallOptions, UninstallOptions } from '../args';
import { RunError } from '../runError';
import { prepareWebsocket } from '../websocket';
import { McHttpError } from '../../common/src/http/mcHttpError';

export async function addRemove({
  type,
  packages
}: InstallOptions | UninstallOptions) {
  console.log(
    'Preparing packages for installation. This may take a while. Please stand by...'
  );

  const id = v4();

  await prepareWebsocket();

  const progressBar = new cliProgress.Bar(
    {
      format: 'Installing modules |{bar}|',
      stream: process.stdout,
      barsize: 30
    },
    cliProgress.Presets.shades_classic
  );

  let doneProgress = false;

  const subscription = websocketApi.Status.onMessage.subscribe(wsobj => {
    if ('pkgman' in wsobj) {
      const obj = wsobj.pkgman;
      if (obj.id !== id) return;
      switch (obj.type) {
        case 'progress': {
          if (doneProgress) {
            progressBar.update(obj.frac);
          } else {
            doneProgress = true;
            progressBar.start(1, 0);
          }
          break;
        }
        case 'done': {
          const { finalPkgs } = obj;
          progressBar.stop();
          subscription.unsubscribe();

          console.log(
            `Success! The following packages are installed on the microcontroller: ${JSON.stringify(
              finalPkgs,
              null,
              4
            )}`
          );
	  process.exit();	// TR2019.06.19 - program continues running even though we have the error. Make sure we are quitting
          break;
        }
        case 'fail': {
          const { inconsistent, insufficientSpace, serverRawBody } = obj;
          const errs = [];
          if (insufficientSpace)
            errs.push('Not enough space left on file system to install the module(s). Aborting.');
          else if(!serverRawBody)
            errs.push('An error has occurred. Please make sure the microcontroller has access to the Internet.\nPlease read https://www.lowjs.org/documentation/flash-space.html for information how to make low.js connect to your Router\'s Wifi.');
          else
            errs.push('An error has occurred.');
          if (serverRawBody) {
            try {
	            const { stage, message } = JSON.parse(serverRawBody);
	            errs.push(
        	      `Error in '${stage}' stage.`,
              		'Diagnostic output:',
		              message
            		);
		} catch(e) {
	            errs.push(
        	      `Error.`,
              		'Diagnostic output from server:',
		              serverRawBody
            		);
		}
          }
          if (inconsistent) {
            errs.push(
              'The microcontroller is now also in an inconsistent state. Please do another install or uninstall operation to resolve this issue.'
            );
          }
          progressBar.stop();
          subscription.unsubscribe();

      // TR 2019.06.17 - we do not want the whole stack information!
      // TR 2019.12.01 - throw new RunError is supposed to not give stack information. Want went wrong?
          console.log(chalk.white.bgRed(errs.join('\n')));
	  process.exit(1);	// TR2019.06.19 - program continues runningeven though we have the error. Make sure we are quitting
          break;
//          throw new RunError(errs.join('\n'));
        }
	case 'add': break;
	case 'remove': break;
        default:
          throw new Error(
            `Unknown pkgman websocket object type '${(obj as any).type}'.`
          );
      }
    }
  });

  try {
    await httpApi.PkgAddRemove({
      type: type === 'install' ? 'add' : 'remove',
      id,
      pkgs: packages
    });
  } catch (e) {
    subscription.unsubscribe();
    if (e instanceof McHttpError) {
      if (e.response && e.response.status === 503) {
        throw new RunError(
          'The microcontroller is currently performing another package update. Please try again later.'
        );
      }
    }
    throw e;
  }
}
