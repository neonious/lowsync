import { ConsoleMessage } from '@common/src/services/consoleMessage/message';
import chalk from 'chalk';
import { Command } from '../command';
import { format } from '../../../common/src/services/consoleMessage/formatter';
import { getConsoleMessages } from '../../../common/src/services/consoleMessage/messages';

export default class MonitorCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor() {
    super('monitor');
  }

  private writeConsole({ timestamp, level, lines }: ConsoleMessage) {
    const line = format(timestamp, lines);
    switch (level) {
      case 'd':
        console.log(chalk.gray(line));
        break;
      case 'l':
        console.log(line);
        break;
      case 'w':
        console.log(chalk.keyword('orange')(line));
        break;
      case 'e':
        console.log(chalk.red(line));
        break;
      default:
        throw new Error('Unknown log level: ' + level);
    }
  }

  async run() {
    getConsoleMessages().subscribe(msg => {
      this.writeConsole(msg);
    });
  }
}
