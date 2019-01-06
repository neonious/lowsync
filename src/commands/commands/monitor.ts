import { MonitorOptions } from '../../args';
import { restartProgram, getProgramStatus, startProgram } from '../../http';
import { confirmOrDefault } from '../../prompts';
import { monitor } from '../../websocket';

export default async function({ restart: _rs }: MonitorOptions) {
  const status = await getProgramStatus();
  if (status === 'stopped') {
    await startProgram();
    _rs = false;
  } else if (status !== 'updating_sys') {
    _rs = await confirmOrDefault({
      answer: _rs,
      message:
        'Restart the program before running monitor? (Use the --restart command line option to remove this prompt and enable/disable restarting before monitor.)',
      defaultAnswer: true
    });
  }

  if (_rs) {
    console.log('(Re)starting program...');
    await restartProgram();
  }

  await monitor();
}
