import { spawn, SpawnOptions } from 'child_process';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs-extra';
import * as https from 'https';
import { noop } from 'lodash';
import * as os from 'os';
import * as path from 'path';
import { FlashOptions } from '../../args';
import { RunError } from '../../runError';
import chalk from 'chalk';

const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

function check_wrover(path: string) {
    return new Promise((resolve, reject) => {
        const port = new SerialPort(path, { baudRate: 921600 });
        const parser = new Readline();

        port.on('error', reject);
        parser.on('error', reject);
        port.pipe(parser);

        let failTimer = setTimeout(() => {
            port.close(() => {});
            reject(new Error('ESP32 not responding, timeout'));
        }, 10000);

        parser.on('data', (line: string) => {
            line = line.trim();
            if(line == "NOT_WROVER") {
                clearTimeout(failTimer);
                port.close(() => {
                    resolve(false);
                });
            } else if((line as any) | 0) {
                let size = (line as any) | 0;
                clearTimeout(failTimer);
                port.close(() => {
                    resolve(size);
                });
            }
        });

        // Trigger reset
        port.on('open', () => {
            port.set({'rts': true, 'dtr': false}, () => {
                port.set({'rts': false, 'dtr': false});
            });
        });
    });
}

export default async function({ port, params }: FlashOptions) {
  let doneErasing = false;
  let length: number | undefined;
  let downloaded = 0;
  let bar: cliProgress.Bar | undefined;
  let finished = false;

  function check() {
    if (!bar && length && doneErasing && !finished) {
      const bar = new cliProgress.Bar(
        {
          format: 'Getting signed data |{bar}| {percentage}%',
          stream: process.stdout,
          barsize: 30
        },
        cliProgress.Presets.shades_classic
      );
      bar.start(length, downloaded);
    }
    if (bar && finished && doneErasing) {
      bar.stop();
    }
  }

  function setDoneErasing() {
    doneErasing = true;
    check();
  }

  function setTotalLength(len: number) {
    length = len;
    check();
  }

  function addLength(len: number) {
    downloaded += len;
    bar && bar.update(downloaded);
  }

  function finish() {
    finished = true;
    check();
  }

  function get_signed_data(mac: string, ideVersion: boolean) {
    return new Promise<Buffer>((resolve, reject) => {
      https.get(
        {
          hostname: 'neonious.com',
          port: 8443,
          path: `/GetFlashData?mac=${mac}&ideVersion=` + (ideVersion ? 1 : 0),
          rejectUnauthorized: false,
          method: 'GET'
        },
        res => {
          var data: Buffer[] = [];
          setTotalLength(parseInt(res.headers['content-length']!));

          res
            .on('data', function(chunk) {
              const buffer = chunk as Buffer;
              data.push(buffer);
              addLength(buffer.byteLength);
            })
            .on('error', e => {
              finish();
              reject(e);
            })
            .on('end', function() {
              finish();
              const buffer = Buffer.concat(data);
              resolve(buffer);
            });
        }
      );
    });
  }

  function spawnAsync(
    writestd: boolean,
    prog: string,
    args: string[],
    opts: SpawnOptions
  ) {
	// Faster output than if we redirect to our stdout
	if(writestd) {
		if(!opts)
			opts = {};
		opts.stdio = ['inherit', 'inherit', 'inherit'];
	}

    const p = spawn(prog, args, opts);
    return new Promise<{ code: number; out: string }>((resolve, reject) => {
      p.on('error', reject);
      let out = '';
      if(p.stdout)
	      p.stdout.on('data', data => {
	        if (!writestd) out += data;
	        else process.stdout.write(data);	// old
	      });
      if(p.stderr)
	      p.stderr.on('data', data => {
	        if (!writestd) out += data;
	        else process.stderr.write(data);	// old
	      });
      p.on('close', code => {
        resolve({ code, out });
      });
    });
  }

  async function spawnMultiple(
    writestd: boolean,
    progs: string[],
    args: string[],
    opts: SpawnOptions
  ) {
    for (const prog of progs) {
      try {
        return await spawnAsync(writestd, prog, args, opts);
      } catch (e) {
        if (e.code !== 'ENOENT' && e.message.indexOf('ENOENT') === -1) {
          throw e;
        }
      }
    }
    throw new RunError(
      `Python does not seem to be installed. None of the following programs exist, but at least one of them must exist: ${progs.join(
        ', '
      )}`
    );
  }

  async function call(
    cmds: string | string[],
    sane_check?: boolean,
    get_mac?: boolean,
    silent?: boolean
  ) {
    cmds = Array.isArray(cmds) ? cmds : [cmds];
    const progs = [];
    const argsAfterCmd = [];
    if (os.platform() === 'win32') {
      progs.push('py', 'python', 'python3');
    } else {
      progs.push('/usr/bin/env');
      argsAfterCmd.push('python');
    }
    const { code, out } = await spawnMultiple(
      !(sane_check || get_mac) && !silent,
      progs,
      [...argsAfterCmd, 'esptool.py', ...params, ...cmds],
      {
        cwd: path.join(__dirname, 'esptool')
      }
    );

    if (sane_check && code) {
      console.log(out);
      return false;
    } else if (get_mac) {
      let pos = out.indexOf('MAC: ');
      let posEnd = out.indexOf(os.EOL, pos);
      let id = out
        .substring(pos + 5, posEnd)
        .replace(/:/g, '')
        .toUpperCase();

      if (pos == -1 || posEnd == -1 || id.length != 12) {
        console.log(out);
        throw new RunError('Cannot read MAC address of ESP32 chip. Please check connection!');
      }
      return id;
    } else {
      if (code)
        throw new RunError(
          'esptool exited with exit code ' + code + '. Exiting.'
        );
    }
  }
  async function erase_flash() {
    await call('erase_flash');
    setDoneErasing();
  }

  let ideVersion = false;
  let do_init = false,
    reset_network = false;
  let pos;

  if (!params) params = [];
  else {
    pos = params.indexOf('--ide-ota');
    if (pos >= 0) {
        ideVersion = true;
        params.splice(pos, 1);
    }
    pos = params.indexOf('--init');
    if (pos >= 0) {
      do_init = true;
      params.splice(pos, 1);
    }
    pos = params.indexOf('--reset-network');
    if (pos >= 0) {
      reset_network = true;
      params.splice(pos, 1);
    }
  }

  params.push('-p');
  params.push(port.toString());

  // Sane check
  if ((await call('version', true)) === false) {
    console.log('*** esptool cannot be used.');
    console.log('Please check if you have Python installed.');
    console.log(
      "If yes, please check if you have pyserial installed (if not try 'pip install pyserial' or 'py -m pip install pyserial' depending on the system)."
    );
    return;
  }

  // Get mac address
  console.log('*** Step 1/3: Probing ESP32 microcontroller');
  let mac = (await call('read_mac', false, true)) as string;
  let ideVersionSupported = false;

  if(do_init) {
    // Double check if device is an ESP32-WROVER as people just don't understand that this is important...
    console.log('    now checking if it is an ESP32-WROVER... (takes a while)');

    let wrover_check_path = path.join(__dirname, 'wrover_check_mc');

      await call('erase_flash', false, false, true);
      await call([
        'write_flash',
        '0xe000',
        wrover_check_path + '/ota_data_initial.bin',
        '0x1000',
        wrover_check_path + '/bootloader.bin',
        '0x8000',
        wrover_check_path + '/partitions.bin',
        '0x10000',
        wrover_check_path + '/wrover_check_mc.bin',
      ], false, false, true);

      let size = await check_wrover(port.toString());
      if(!size)
          throw new RunError('ESP32 is not an ESP32-WROVER or at least does not have required 4 MB PSRAM!\nPlease check: https://www.lowjs.org/supported-hardware.html');
      if(size >= 9 * 1024 * 1024)
        ideVersionSupported = true;
    }

  // open browser window here, no not wait and ignore any unhandled promise catch handlers
  const opn = require('opn');
  await opn('https://www.neonious.com/ThankYou', { wait: false }).catch(noop);

  // Get signed data based on MAC address and do flash erase in parallel, if requested
  let data;
  if (do_init) {
    console.log(
      '*** Step 2/3: Erasing flash and downloading image in parallel'
    );
    data = (await Promise.all([get_signed_data(mac, ideVersion), erase_flash()]))[0];
  } else {
    console.log('*** Step 2/3: Downloading image');
    setDoneErasing();
    data = await get_signed_data(mac, ideVersion);
  }
  if(data.length == 0 && ideVersion)
    throw new RunError('The IDE+OTA version of low.js not licensed for this device with the code ' + mac + '. Please buy a license in the neonious store at https://www.neonious.com/Store');
    if(ideVersion && !ideVersionSupported)
    throw new RunError('The IDE+OTA version of low.js is not supported on this device, as it has less than 9 MB of flash space available.');
  data.writeUInt8(reset_network ? 1 : 0, data.length - 33);

  console.log('*** Step 3/3: Flashing image');

  let dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lowsync-'));
  let boot_partition_file = path.join(dir, 'part1');
  let app_data_file = path.join(dir, 'part2');

  if(ideVersion) {
    await fs.writeFile(boot_partition_file, data.slice(0, 0x1F0000));
    await fs.writeFile(app_data_file, data.slice(0x1F0000));
    await call([
        'write_flash',
        '0x1000',
        boot_partition_file,
        '0x400000',
        app_data_file
    ]);
  } else {
    await fs.writeFile(boot_partition_file, data.slice(0, 0x8000));
    await fs.writeFile(app_data_file, data.slice(0x8000));
    await call([
        'write_flash',
        '0x1000',
        boot_partition_file,
        '0x10000',
        app_data_file
    ]);
  }
  try {
    await fs.unlink(boot_partition_file);
    await fs.unlink(app_data_file);
    await fs.rmdir(dir);
  } catch (e) {}

  if (do_init) console.log('*** Done, low.js flashed, now in factory state');
  else if (reset_network)
    console.log(
      '*** Done, low.js flashed and network settings resetted to factory state'
    );
  else console.log('*** Done, low.js updated');
  if (do_init || reset_network) {
    let passHash = data.slice(data.length - 12);
    let pass = '';
    for (let i = 0; i < 12; i++) {
      let val = ((passHash.readUInt8(i) / 256) * (26 + 26 + 10)) | 0;
      if (val < 26) pass += String.fromCharCode(val + 'a'.charCodeAt(0));
      else if (val < 26 + 26)
        pass += String.fromCharCode(val - 26 + 'A'.charCodeAt(0));
      else pass += String.fromCharCode(val - (26 + 26) + '0'.charCodeAt(0));
    }

    console.log(
      'To communicate with your microcontroller, connect to the Wifi:'
    );
    console.log('SSID:       low.js@ESP32 ' + mac);
    console.log('Password:   ' + pass);
    console.log('In this Wifi, the microcontroller has the IP 192.168.0.1');
  } else
    console.log('First time to flash? You need to use --init to get the required login credentials')
  if(!ideVersion && ideVersionSupported)
    console.log(chalk.bgYellow('Note: Your device has enough flash space to support the low.js version with on-board web-based IDE + debugger and over-the-air updating. Please check the neonious store https://www.neonious.com/Store for more information!'));
}
