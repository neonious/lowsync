import { spawn, SpawnOptions } from 'child_process';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs-extra';
import { request } from 'https';
import { configFile } from '../../config/mainConfigFile';
import { noop } from 'lodash';
import * as os from 'os';
import * as path from 'path';
import { FlashOptions } from '../../args';
import { RunError } from '../../runError';
import chalk from 'chalk';
import build from './build';

const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

function check_wrover(path: string) {
    return new Promise((resolve, reject) => {
        const port = new SerialPort(path, { baudRate: 115200 });
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

export default async function({ port, init, resetNetwork, pro, proKey, firmwareFile, firmwareConfig, params }: FlashOptions) {
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

  async function get_signed_data(firmwareFile: any, firmwareConfig: any, mac: string, pro?: boolean, proKey?: string) {
    let firmware: any;
    if(firmwareFile && firmwareConfig)
        throw new RunError('Only one of --firmware-file=.. and --firmware-config.. may be used.');
    else if(firmwareFile)
        firmware = await fs.readFile(firmwareFile);
    else if(firmwareConfig)
        firmware = await build({
            type: 'build',
            firmwareConfig
        }, {
            proKey,
            mac
        });
    else
        firmware = await build({
            type: 'build'
        }, {
            stock: true,
            pro: pro ? pro : false,
            proKey,
            mac
        });
    if(pro === undefined)
        pro = (firmware.readUInt8(8) & 8) ? true : false;

    return await new Promise((resolve, reject) => {
        const options = {
            hostname: 'neonious.com',
            port: 8444,
            path: '/api/SignFirmware?mac=' + mac + (pro ? '&pro=1' : '') + (proKey ? '&proKey=' + proKey : ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/firmware'
            }
        };
    
        let done = false;
        let timeout = setTimeout(() => {
            if(!done) {
                done = true;
                try {
                    req.abort();
                } catch(e) {}
    
                finish();
                reject(new RunError('timeout trying to reach neonious servers'));
            }
        }, 120000);
    
        let req = request(options, (res) => {
            if(res.statusCode == 200)
                setTotalLength(parseInt(res.headers['content-length']!));
    
            let dat = [] as any;
            res.on('data', (d) => {
                dat.push(d);
                if(res.statusCode == 200)
                    addLength(d.length);
            });
            res.on('error', (e) => {
                if(!done) {
                    done = true;
                    finish();
                    reject(e);
                }
            });
            res.on('end', () => {
                done = true;
                clearTimeout(timeout);

                if(res.statusCode != 200 && dat.length)
                    reject(new RunError('From server: ' + Buffer.concat(dat).toString()));
                else if(res.statusCode != 200) {
                    reject(new RunError('Cannot get firmware from server'));
                }
                else {
                    let data = Buffer.concat(dat);
                    let final = Buffer.concat([data.slice(0, 0xF000), firmware.slice(0x80, 0x1F0080 - 128), data.slice(0xF000), firmware.slice(0x1F0080)]);
                    finish();
                    resolve(final);
                }
            });
        }).on('error', (e) => {
            if(!done) {
                done = true;
                finish();
                reject(e);
            }
        });
        req.end(firmware.slice(0, 0x1F0080));
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

  let portAny: any;
  portAny = port;
  if(!portAny) {
      portAny = await configFile.getKey('flashPort');
      if(!portAny)
        throw new RunError('No port specified. Please use --port=.. to specify the port.')
  }
  params.push('-p');
  params.push(portAny.toString());

  // Sane check
  if ((await call('version', true)) === false) {
    console.log(chalk.bgRed('*** esptool cannot be used.'));
    console.log('Please check if you have Python installed.');
    console.log(
      "If yes, please check if you have pyserial installed (if not try 'pip install pyserial' or 'py -m pip install pyserial' depending on the system)."
    );
    process.exit(1);
    return;
  }

  let dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lowsync-'));
  let proSupported = false;

  // Get mac address
  console.log('*** Step 1/3: Probing ESP32 microcontroller');
  let mac = (await call('read_mac', false, true)) as string;

  let data;
  let lowjsFlags;

  try {

    let systemSize;
    let sig: any;

    if(init) {
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

        systemSize = await check_wrover(portAny.toString());
        if(!systemSize)
            throw new RunError('ESP32 is not an ESP32-WROVER or at least does not have required 4 MB PSRAM!\nPlease check: https://www.lowjs.org/supported-hardware.html');
        if(systemSize >= 9 * 1024 * 1024)
            proSupported = true;
     } else {
            let lwjs_signature_file = path.join(dir, 'sig');
            await call(['read_flash', '0x7000', '9', lwjs_signature_file], false, false, true);
            sig = await fs.readFile(lwjs_signature_file);

            systemSize = sig.readUInt32LE(4);
            if(sig.slice(0, 4).toString() != 'lwjs')
                throw new RunError('Current firmware on microcontroller is not based on low.js, please flash with --init option');
        }


    if(!pro && !firmwareFile && !firmwareConfig) {
        // open browser window here, no not wait and ignore any unhandled promise catch handlers
        const opn = require('opn');
        await opn('https://www.neonious.com/ThankYou', { wait: false }).catch(noop);
    }

    // Get signed data based on MAC address and do flash erase in parallel, if requested
    if (init) {
        console.log(
        '*** Step 2/3: Erasing flash and ' + (firmwareFile ? 'signing' : 'building') + ' image in parallel'
        );
        function reflect(promise: any){
            return promise.then(function(v: any){ return {v:v, status: "fulfilled" }},
                                function(e: any){ return {e:e, status: "rejected" }});
        }
        let erase = erase_flash();
        try {
            data = (await Promise.all([get_signed_data(firmwareFile, firmwareConfig, mac, pro, proKey), erase]))[0] as any;
        } catch(e) {
            await reflect(erase);
            throw e;
        }
    } else {
        console.log('*** Step 2/3: ' + (firmwareFile ? 'Signing' : 'Building') + ' image');
        setDoneErasing();
        data = await get_signed_data(firmwareFile, firmwareConfig, mac, pro, proKey) as any;
    }

    // pro && (!custom || ota support)
    let newSize = data.readUInt32LE(0x6004);
    lowjsFlags = data.readUInt8(0x6008);

    let dataAt4xx = (lowjsFlags & 8) && (!(lowjsFlags & 4) || (lowjsFlags & 16));
    if(!newSize) {
        newSize = systemSize;
        let dataMaxLen = (systemSize as number) - (dataAt4xx ? 0x400000 : 0x200000);
        if(dataAt4xx && (lowjsFlags & (4 | 16)) == (4 | 16))
            dataMaxLen = dataMaxLen / 2;
        if(data.length - 0x1FF000 > dataMaxLen)
            throw new RunError('Total used flash space is higher than the space available on the device (' + systemSize + ' bytes)');
    
        data.writeUInt32LE(newSize, 0x6004);
    }

    if(pro !== undefined && ((pro && !(lowjsFlags & 8)) || (!pro && (lowjsFlags & 8))))
        throw new RunError('--pro flag is not identical with setting of firmware file / firmware config')
    if(init) {
        if(newSize > systemSize)
            throw new RunError('Total used flash space is higher than the space available on the device (' + systemSize + ' bytes)');
    } else {
        if((newSize && newSize != systemSize)
        || (lowjsFlags & (8 | 4 | 16)) != (sig!.readUInt8(8) & (8 | 4 | 16)))
            throw new RunError('Current firmware on microcontroller is not compatible to the one being flashed, check firmware config for differences, or erase all data with the additional parameter --init');
    }
    data.writeUInt8(resetNetwork ? 1 : 0, 0x1FF000 - 21);

    console.log('*** Step 3/3: Flashing firmware');

    // pro && (!costom || ota support)
    let params = ['write_flash'];
    let partNo = 1;
    async function push_parts(at: number, data: any) {
        let file = path.join(dir, 'part' + partNo++);
        await fs.writeFile(file, data);
        params.push('' + at);
        params.push(file);
    }
    if(init) {
        if(dataAt4xx) {
            await push_parts(0x1000, data.slice(0, 0x1FF000));
            await push_parts(0x400000, data.slice(0x1FF000));
            await call(params);
        } else {
            await push_parts(0x1000, data);
            await call(params);
        }
    } else {
        // skip everything below NVS
        if(dataAt4xx) {
            await push_parts(0xE000, data.slice(0xD000, 0x1FF000));
            await push_parts(0x400000, data.slice(0x1FF000));
            await call(params);
        } else {
            await push_parts(0xE000, data.slice(0xD000));
            await call(params);
        }
    }
  } catch(e) {
    try {
        await fs.remove(dir);
    } catch (e) {}
    throw e;
  }
  try {
    await fs.remove(dir);
} catch (e) {}

  if (init)
    console.log('*** Done, low.js flashed. Please give your device a few seconds to reset to factory state');
  else if (resetNetwork)
    console.log('*** Done, low.js flashed and network settings resetted to factory state');
  else
    console.log('*** Done, low.js updated');

    if ((init || resetNetwork) && !(lowjsFlags & 32)) {
    let passHash = data.slice(0x6000 + 16, 0x6000 + 16 + 12);
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
    console.log('SSID:       low.js@ESP32 ' + (mac as any));
    console.log('Password:   ' + (pass as any));
    console.log('In this Wifi, the microcontroller has the IP 192.168.0.1');
  }
  if(!pro && !firmwareFile && !firmwareConfig && proSupported)
    console.log(chalk.bgYellow('Note: Your device has enough flash space to support low.js Professional with on-board web-based IDE + debugger, over-the-air updating and native modules. Please check https://www.neonious.com/Store for more information!'));
}
