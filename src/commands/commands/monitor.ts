import { ConsoleMessage } from '@common/services/consoleMessage/message';
import chalk from 'chalk';
import { Command } from '../command';
import {
  format,
  getTimestampPrefix
} from '../../../common/src/services/consoleMessage/formatter';
import { getConsoleMessages } from '../../../common/src/services/consoleMessage/messages';
import { padStart } from 'lodash';

export default class MonitorCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor() {
    super('monitor');
  }

  private writeConsole({ timestamp, level, lines }: ConsoleMessage) {
    const prefix = getTimestampPrefix(timestamp);
    lines = Array.isArray(lines) ? lines : [lines];
    lines = lines.map((line, i) => {
      let trline;

      switch (level) {
        case 'd':
          trline = chalk.gray(line);
          break;
        case 'l':
          trline = line;
          break;
        case 'w':
          trline = chalk.keyword('orange')(line);
          break;
        case 'e':
          trline = chalk.red(line);
          break;
        default:
          throw new Error('Unknown log level: ' + level);
      }

      if (i === 0) {
        return `${prefix}${trline}`;
      }
      return padStart(trline, prefix.length + trline.length);
    });

    for (const line of lines) {
      console.log(line);
    }
  }

  async run() {
    console.log(chalk.bold('Retrieving microcontroller output...'));
    getConsoleMessages().subscribe(msg => {
      this.writeConsole(msg);
    });
  }
}
