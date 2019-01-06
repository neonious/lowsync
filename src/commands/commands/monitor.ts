import { MonitorOptions } from '../../args';
import { restartProgram } from '../../http';
import { confirmOrDefault } from '../../prompts';
import { monitor } from '../../websocket';

export default async function(options: MonitorOptions) {
  const restart = await confirmOrDefault({
    answer: options.restart,
    message:
      '(Re)start the program before running monitor? (Use the --restart command line option to enable or disable automatic restart.)',
    defaultAnswer: true
  });

  if (restart) {
    console.log('(Re)starting program...');
    await restartProgram();
  }

  await monitor();
}
