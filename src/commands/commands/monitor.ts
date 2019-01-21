import { setGlobalConsole } from '../../../common/src/hooks/forbidden';
import { MonitorOptions } from '../../args';
import { getProgramStatus, restartProgram, startProgram } from '../../http';
import { promptBool } from '../../prompts';
import { monitor } from '../../websocket';

export default async function({ restart, global }: MonitorOptions) {
  restart =
    restart ||
    (restart === undefined
      ? global
        ? false
        : await promptBool({
            message:
              'Restart the program before running monitor? (Use the --restart command line option to remove this prompt and enable/disable restarting before monitor.)',
            default: true
          })
      : false);

  if (restart) {
    const status = await getProgramStatus();
    if (status === 'stopped') {
      await startProgram();
    } else if (status !== 'updating_sys') {
      console.log('(Re)starting program...');
      await restartProgram();
    }
  }

  setGlobalConsole(global);
  await monitor();
}
