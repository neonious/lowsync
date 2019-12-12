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
  transpile?: boolean;
  restart?: boolean;
  monitor?: boolean;
  toPc: boolean;
  toMc: boolean;
}

export interface MonitorOptions {
  type: 'monitor';
  restart?: boolean;
  global: boolean;
}

export interface BuildOptions {
  type: 'build';
  firmwareFile?: string;
  firmwareConfig?: string;
}

export interface FlashOptions {
  type: 'flash';
  port: string;
  init: boolean;
  resetNetwork: boolean;
  pro?: boolean;
  proKey?: string;
  firmwareFile?: string;
  firmwareConfig?: string;
  params: string[];
}

export interface UpdateOptions {
  type: 'update';
  action: 'show' | 'install';
}

export interface InstallOptions {
  type: 'install';
  packages: string[];
}

export interface UninstallOptions {
  type: 'uninstall';
  packages: string[];
}

export type Options =
  | InitOptions
  | SettingsOptions
  | StatusOptions
  | StartOptions
  | StopOptions
  | SyncOptions
  | MonitorOptions
  | BuildOptions
  | FlashOptions
  | UpdateOptions
  | InstallOptions
  | UninstallOptions;

const argv1 = yargs
  .strict()
  .scriptName('lowsync')
  .locale('en') // so that yargs generated text is in english, just like the other text
  .command(
    ['[sync]', '$0'],
    'Sync and, by default, transpile the files being transfered from this computer to the microcontroller.',
    yargs => {
      return yargs
        .option('transpile', {
          type: 'boolean',
          default: undefined,
          describe:
            'Transpile source files (only JavaScript files, NO TypeScript, etc.) to ES5, allowing to use features >= ES6. To disable, append =false to this option. '
        })
        .option('to-mc', {
          type: 'boolean',
          default: true,
          describe:
            'Sync in direction PC to microcontroller. To disable, append =false to this option.'
        })
        .option('to-pc', {
          type: 'boolean',
          default: true,
          describe:
          'Sync in direction microcontroller to PC. To disable, append =false to this option.'
        })
        .option('restart', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable/disable (re)starting of the program if the filesystem on the microcontroller has changed. Optionally you may append =<true|false> to this option.'
        })
        .option('monitor', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable/disable monitoring the program after sync. Implies --restart. Optionally you may append =<true|false> to this option.'
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
    'Relay console input and output (shows the output of the running program and allows you to enter input).',
    yargs =>
      yargs
        .option('restart', {
          type: 'boolean',
          default: undefined,
          describe:
            'Enable/disable restarting the running program before monitor. Optionally you may append =<true|false> to this option.'
        })
        .option('global', {
          type: 'boolean',
          default: false,
          describe:
            'Show all output, not just from the currently running program.'
        })
        .demandCommand(0, 0)
  )
  .command('install <packages..>', 'Trigger installion of npm packages over-the-air.', yargs => {
    return yargs
      .positional('packages', {
        describe:
          'The npm packages to install. See the npm documentation for more details.'
      })
      .check(argv => {
        const { packages } = argv;
        if (!packages.length) {
          throw 'Must specify packages to install.';
        }
        return true;
      })
      .demandCommand(0, 0);
  })
  .command('uninstall <packages..>', 'Uninstall npm packages (also requires Internet).', yargs => {
    return yargs
      .positional('packages', {
        describe:
          'The npm packages to uninstall. See the npm documentation for more details.'
      })
      .check(argv => {
        const { packages } = argv;
        if (!packages.length) {
          throw 'Must specify packages to uninstall.';
        }
        return true;
      })
      .demandCommand(0, 0);
  })
  .command(
    'update',
    'Display available updates for low.js Professional/neonious one and/or trigger the installion of them over-the-air.',
    yargs => {
      return yargs
        .command('show', 'Display available updates, if any.')
        .command('install', 'Update the neonious one.')
        .demandCommand(1, 1);
    }
  )
  .command(
    'flash [params..]',
    'Flash low.js to generic ESP32-WROVER microcontroller board. For experts, also parameters of esptool are supported (see https://github.com/espressif/esptool for more information).',
    yargs => {
      return yargs
        .option('port', {
          type: 'string',
          default: undefined,
          describe:
            'The serial port which the USB/serial chip of the ESP32 board creates. Under Windows this usually starts with "COM" (find out the correct one with the Device Manager), on other systems with "/dev/tty" (check file system to find the correct one).'
        })
        .option('init', {
          type: 'boolean',
          default: false,
          describe:
            'Resets to factory settings by erasing flash. Use this on first flashing.'
        })
        .option('pro', {
          type: 'boolean',
          default: undefined,
          describe:
            'Flashes low.js Professional. Requires a registered license bought in the shop at https://www.neonious.com/Store'
        })
        .option('pro-key', {
          type: 'string',
          default: undefined,
          describe:
            'Flashing low.js Professional requires either a license connected to the specific board or to a key, which you can enter here.'
        })
        .option('firmware-file', {
          type: 'string',
          default: undefined,
          describe:
            'If a custom pre-built firmware shall be flashed, specify the path to the firmware file here.'
        })
        .option('firmware-config', {
          type: 'string',
          default: undefined,
          describe:
            'If a custom firmware shall be built and flashed, specify the configuration file for the firmware here.'
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
    'build <firmware-file> [params..]',
    'Build a custom firmware which can be flashed via lowsync or over the air with lowsys.createFirmwareStream.',
    yargs => {
      return yargs
        .option('firmware-config', {
          type: 'string',
          default: undefined,
          describe:
            'Specify the configuration file for the firmware here.'
        })
        .demandCommand(0, 0);
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
  // We are flashing
  const flashParams = {
    '--help': 1,
    '--version': 1,
    '--port': 1,
    '--init': 1,
    '--reset-network': 1,
      '--pro': 1,
      '--pro-key': 1,
      '--firmware-file': 1,
      '--firmware-config': 1
  } as any;
  let args = [];
  for(let i = 2; i < process.argv.length; i++) {
      let arg = process.argv[i];
      let pos = arg.indexOf('=');
      if(pos >= 0)
        arg = arg.substr(0, pos);
    if(i != flashidx && !flashParams[arg])
      other.push(process.argv[i]);
    else
      args.push(process.argv[i])
  }
  argv = argv1.parse(args);
} else {
  argv = argv1.argv;
}

unhook();

function parseSyncOptions(argv: any): SyncOptions {
  const { transpile, restart, monitor, toPc, toMc } = argv;
  return { type: 'sync', transpile, restart, monitor, toPc, toMc };
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
      const { restart, global } = argv;
      return { type: 'monitor', restart, global };
    case 'build':
      const { firmwareFile, firmwareConfig } = argv;
      return { type: 'build', firmwareFile, firmwareConfig };
    case 'flash':
      const { port, init, resetNetwork, pro, proKey, firmwareFile: firmwareFile2, firmwareConfig: firmwareConfig2 } = argv;
      return { type: 'flash', port, init, resetNetwork, pro, proKey, firmwareFile: firmwareFile2, firmwareConfig: firmwareConfig2, params: other };
    case 'update':
      const action = argv._[1] as any;
      return { type: 'update', action };
    case 'install': {
      const { packages } = argv;
      return { type: 'install', packages };
    }
    case 'uninstall': {
      const { packages } = argv;
      return { type: 'uninstall', packages };
    }
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}
