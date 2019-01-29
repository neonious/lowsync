import * as cliProgress from 'cli-progress';
import { v4 } from 'uuid';
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
          console.log(
            `Success! The following packages are installed on the microcontroller: ${JSON.stringify(
              finalPkgs,
              null,
              4
            )}`
          );
          progressBar.stop();
          subscription.unsubscribe();
          break;
        }
        case 'fail': {
          const { inconsistent, insufficientSpace, serverRawBody } = obj;
          const errs = [];
          errs.push('An error has occurred.');
          if (insufficientSpace) {
            errs.push('The microcontroller has no sufficient space left.');
          }
          if (serverRawBody) {
            const { stage, message } = JSON.parse(serverRawBody);
            errs.push(
              `Error in '${stage}' stage.`,
              'Diagnostic output:',
              message
            );
          }
          if (inconsistent) {
            errs.push(
              'The microcontroller is now also in an inconsistent state. Please do another install or uninstall operation to resolve this issue.'
            );
          }
          progressBar.stop();
          subscription.unsubscribe();

          throw new RunError(errs.join('\n'));
        }
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
