import chalk from 'chalk';
import * as yargs from 'yargs';
import { Arguments } from 'yargs';

// from https://gist.github.com/pguillory/729616
const old_write = process.stdout.write;

function hook_stdout(callback: Function) {
  process.stdout.write = (function(write) {
    return function(string: string, encoding: string, fd: any) {
      // write.apply(process.stdout, arguments)
      callback(string, encoding, fd);
    };
  })(process.stdout.write) as any;

  return function() {
    process.stdout.write = old_write;
  };
}

const showSettingsKey = '<category>.<key>';
const showSettings2 = 'a'.repeat(showSettingsKey.length);

const setSettingsKey = '<category>.<key>=<value>';
const setSettings2 = 'b'.repeat(setSettingsKey.length);

const unhook = hook_stdout(function(string: string, encoding: string, fd: any) {
  string = string
    .replace(`[${showSettings2}..]`, `[${showSettingsKey}..]`)
    .replace(`[${setSettings2}..]`, `[${setSettingsKey}..]`);
  old_write.call(process.stdout, string);
});

export interface InitOptions {
  type: 'init';
}

export interface SettingsOptions {
  type: 'settings';
  showSettings?: string[];
  setSettings?: string[];
}

export interface StatusOptions {
  type: 'status';
}

export interface StartOptions {
  type: 'start';
  file?: string;
  force: boolean;
}

export interface StopOptions {
  type: 'stop';
}

export interface SyncOptions {
  type: 'sync';
  noTranspile?: boolean;
  restart?: boolean;
  monitor?: boolean;
}

export interface MonitorOptions {
  type: 'monitor';
  restart?: boolean;
}

export interface FlashOptions {
  type: 'flash';
  port: string;
  params: string[];
}

export interface UpdateOptions {
  type: 'update';
  action: 'show' | 'install';
}

export type Options =
  | InitOptions
  | SettingsOptions
  | StatusOptions
  | StartOptions
  | StopOptions
  | SyncOptions
  | MonitorOptions
  | FlashOptions
  | UpdateOptions;

export function jsonParse(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    if (e instanceof SyntaxError) {
      return JSON.parse(`"${str}"`); // todo escape string (for quotes)
    } else throw e;
  }
}

const argv1 = yargs
  .strict()
  .scriptName('lowsync')
  .locale('en') // so that yargs generated text is in english, just like the other text
  .command(
    ['[sync]', '$0'],
    'Sync and, by default, transpile the files from this computer to the microcontroller.',
    yargs => {
      return yargs
        .option('no-transpile', {
          type: 'boolean',
          default: undefined,
          describe:
            'Disable the transpilation of source files (only >=ES6 JavaScript files, NO TypeScript, etc.) to ES5. Be sure that you know what you are doing before using this option!'
        })
        .option('restart', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable or disable restarting the program on the microcontroller if the sync operation has changed any files. If this option is not specified, the user will be asked.'
        })
        .option('monitor', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable or disable showing the output of the microcontroller after syncing. If this option is not specified, the user will be asked.'
        })
        .demandCommand(0, 0);
    }
  )
  .command(
    'init',
    'Create an initial configuration file for lowsync with sensible defaults.',
    yargs => yargs.demandCommand(0, 0)
  )
  .command(
    'settings',
    'Display or modify settings of the microcontroller.',
    yargs => {
      return yargs
        .command(
          'show [' + showSettings2 + '..]',
          'Display the values of one or multiple settings.',
          yargs => {
            return yargs.positional(showSettings2, {
              describe:
                'The settings you want to display the values for. Leave out to show all values.'
            });
          }
        )
        .command(
          'set [' + setSettings2 + '..]',
          'Change one or multiple settings. To list possible settings, run "settings show"',
          yargs => {
            return yargs.positional(setSettings2, {
              describe:
                'The settings you want to change. In the form of <setting>=<value>. Enclose string values with quotes ("").'
            });
          }
        )
        .demandCommand(1, 1)
        .example(
          '$0 settings show',
          'Shows all settings and their corresponding values.'
        )
        .example(
          '$0 settings set wifi.mode="station" wifi.ssid="MySSID"',
          'Sets the wifi\'s "mode" and "ssid" settings.'
        );
    }
  )
  .command(
    'start [file]',
    'Start the program on the microcontroller.',
    yargs => {
      return yargs
        .positional('file', {
          type: 'string',
          describe:
            'The path of the file on the microcontroller that will serve as the entry point.'
        })
        .option('force', {
          type: 'boolean',
          default: false,
          describe: 'Also restarts the program if it is running or paused.'
        })
        .example(
          '$0 start /src/index.js',
          'Starts /src/index.js on the microcontroller.'
        )
        .example(
          '$0 start "/src/an example.js" --force',
          '(Re)Starts "/src/an example.js" on the microcontroller, even if a program is currently running.'
        )
        .demandCommand(0, 0);
    }
  )
  .command('stop', 'Stop the program on the microcontroller.', yargs =>
    yargs.demandCommand(0, 0)
  )
  .command(
    'status',
    'Print the status of the program on the microcontroller.',
    yargs => yargs.demandCommand(0, 0)
  )
  .command(
    'monitor',
    'Show the output of the running program (process.stdout).',
    yargs =>
      yargs
        .option('restart', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable or disable restarting the program on the microcontroller before starting monitor. If this option is not specified, the user will be asked.'
        })
        .demandCommand(0, 0)
  )
  .command(
    'flash <port> [params..]',
    'Flash low.js to generic ESP32-WROVER microcontroller board. For experts, also parameters of esptool are supported (see https://github.com/espressif/esptool for more information).',
    yargs => {
      return yargs
        .positional('port', {
          type: 'string',
          describe:
            'The serial port which the USB/serial chip of the ESP32 board creates. Under Windows this usually starts with "COM", on other systems with "/dev/tty".'
        })
        .option('init', {
          type: 'boolean',
          default: false,
          describe:
            'Resets to factory settings by erasing flash. Use this on first flashing.'
        })
        .option('reset-network', {
          type: 'boolean',
          default: false,
          describe:
            'Resets network settings to Wifi access point and outputs the credentials to connect.'
        })
        .demandCommand(0, 0);
    }
  )
  .command(
    'update',
    'Display available updates for the neonious one and/or install them.',
    yargs => {
      return yargs
        .command('show', 'Display available updates, if any.')
        .command('install', 'Update the neonious one.')
        .demandCommand(1, 1);
    }
  )
  .demandCommand(1, 1)
  .fail(((msg: string, err: Error, yargs: any) => {
    const help = yargs.help();
    console.log(chalk.green(help));
    console.error(chalk.white.bgRed(msg));
    process.exit(1);
  }) as any);

const flashidx = process.argv.indexOf('flash');
const other: string[] = [];
let argv: Arguments<any>;
if (flashidx !== -1) {
  other.push(...process.argv.slice(flashidx + 2));
  const args = process.argv.slice(flashidx, flashidx + 2);
  argv = argv1.parse(args);
} else {
  argv = argv1.argv;
}

unhook();

function parseSyncOptions(argv: any): SyncOptions {
  const { noTranspile, restart, monitor } = argv;
  return { type: 'sync', noTranspile, restart, monitor };
}

export function parseArguments(): Options {
  const command = argv._[0];
  if (!command) {
    return parseSyncOptions(argv);
  }
  switch (command) {
    case 'init':
      return { type: 'init' };
    case 'settings':
      const showSettings = argv[showSettings2];
      const setSettings = argv[setSettings2];
      return { type: 'settings', showSettings, setSettings };
    case 'status':
      return { type: 'status' };
    case 'start':
      const { file, force } = argv;
      return { type: 'start', file, force };
    case 'stop':
      return { type: 'stop' };
    case 'sync':
      return parseSyncOptions(argv);
    case 'monitor':
      const { restart } = argv;
      return { type: 'monitor', restart };
    case 'flash':
      const { port } = argv;
      return { type: 'flash', port, params: other };
    case 'update':
      const action = argv._[1] as any;
      return { type: 'update', action };
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}
