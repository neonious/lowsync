//import { ConsoleMessage } from '@common/services/consoleMessage/message';
import chalk from 'chalk';
//import { padStart } from 'lodash';
//import { getTimestampPrefix } from '../common/src/services/consoleMessage/formatter';
import { httpApi } from '../common/src/http/httpApiService';
import { prepareHttp } from './httpHooks';
import { onBeforeWebsocket, websocketApi } from '../common/src/webSocket/socketPool';
//import { getConsoleMessages } from '../common/src/services/consoleMessage/messages';

interface MonitorOptions {}

export async function monitor(options: MonitorOptions = {}) {
    function writeConsole({ s: timestamp, l: level, t: line }: any) {
    // TR2019.12.01 Timestamp does not work well with things such as repl
//    const prefix = getTimestampPrefix(timestamp);
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
      process.stdout.write(trline);
  }

  await prepareWebsocket();
  let rawMode = false;

  console.log(chalk.bold("--- User program's output: ---"));
  websocketApi.Status.onMessage.subscribe(val => {
    if((val as any).code && (val as any).code.status == 'stopped') {
        setTimeout(() => {
            console.log(chalk.bold("--- Program exited. ---"));
            process.exit(0);
        }, 2000);
    }
    if((val as any).console && (val as any).console.raw !== undefined) {
        rawMode = (val as any).console.raw as boolean;
        (process.stdin as any).setRawMode(rawMode);
    }
    else if((val as any).console && (val as any).console.l !== undefined)
        writeConsole((val as any).console);
  });

  function sendRowsCols() {
    let [cols, rows] = (process.stdout as any).getWindowSize();
    try {
        websocketApi.Status.send({stdin: {cols, rows}})
    } catch(e) {
        console.error(e);
    }
  }
  process.on('SIGWINCH', sendRowsCols);
  websocketApi.Status.onOpen.subscribe(sendRowsCols);

  process.stdin.on('keypress', (str, key) => {
    // "Raw" mode so we must do our own kill switch
    if(rawMode && key.sequence === '\u0003')
        process.exit(0);
  });
  process.stdin.on('data', (data) => {
    try {
        websocketApi.Status.send({stdin: {data: data.toString()}})
    } catch(e) {
    }
  });
  process.stdin.resume();
}

let prepped = false;

export async function prepareWebsocket() {
  if (!prepped) {
    prepped = true;
    await httpApi.IsLoggedIn(); // todo so that websocket works
    const opts = await prepareHttp(false);
    onBeforeWebsocket(options => {
      return { ...options, ...opts };
    });
  }
}
