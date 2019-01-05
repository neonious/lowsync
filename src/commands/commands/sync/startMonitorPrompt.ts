import * as inquirer from 'inquirer';
import MonitorCommand from '../monitor';

interface StartMonitorPromptOptions {
  monitor?: boolean;
}

export async function startMonitorPrompt({
  monitor
}: StartMonitorPromptOptions) {
  const prompt = inquirer.createPromptModule();
  const { doMonitor } =
    monitor === undefined
      ? await prompt<{ doMonitor: boolean }>({
          name: 'doMonitor',
          type: 'confirm',
          message:
            'Would you like to show the output of the microcontroller? (Use the --monitor command line option to enable or disable automatic showing of the output after sync.)',
          default: true
        })
      : { doMonitor: monitor };
  if (doMonitor) {
    console.log('Starting monitor...');
    await new MonitorCommand().run();
  }
}
