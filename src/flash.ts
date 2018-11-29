import * as fs from 'fs-extra';
import * as os from 'os';
import { spawn } from 'child_process';
import * as https from 'https';
import * as cliProgress from 'cli-progress';
import { RunError } from './runError';

const PATH_ESPTOOL = __dirname + '/esptool/esptool.py';

// Example call
// flash(require('fs').readFileSync(os.homedir() + '/.neonious/esp_port', 'utf8').trim(), ['--reset-network']);

export async function flash(port: string, params: string[]) {

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

  function get_signed_data(mac: string) {
    return new Promise<Buffer>((resolve, reject) => {
      https.get(
        `https://www.neonious.com:8443/GetFlashData?mac=${mac}`,
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

  function call(
    cmd: string | string[],
    sane_check?: boolean,
    get_mac?: boolean
  ) {
    return new Promise<unknown>((resolve, reject) => {
      if (typeof cmd == 'string') cmd = [cmd];
      const flasher = spawn(PATH_ESPTOOL, params.concat(cmd));

      let txt = '';
      flasher.stdout.on('data', data => {
        if (sane_check || get_mac) txt += data;
        else process.stdout.write(data);
      });
      flasher.stderr.on('data', data => {
        if (sane_check || get_mac) txt += data;
        else process.stderr.write(data);
      });

      flasher.on('close', code => {
        if (sane_check && code) {
          console.log(txt);
          resolve(false);
        } else if (get_mac) {
          let pos = txt.indexOf('MAC: ');
          let posEnd = txt.indexOf('\n', pos);
          let id = txt
            .substring(pos + 5, posEnd)
            .replace(/:/g, '')
            .toUpperCase();

          if (pos == -1 || posEnd == -1 || id.length != 12) {
            console.log(txt);
            reject(
              new RunError('Cannot read MAC address of ESP32 chip. Exiting.')
            );
          } else resolve(id);
        } else {
          if (code)
            reject(
              new RunError('esptool exited with exit code ' + code + '. Exiting.')
            );
          else resolve();
        }
      });
    });
  }
  async function erase_flash() {
    await call('erase_flash');
    setDoneErasing();
  }

  let do_init = false,
    reset_network = false;
  let pos;

  if (!params) params = [];
  else {
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

  if (params.indexOf('-b') == -1) {
    params.push('-b');
    params.push((921600).toString());
  }
  params.push('-p');
  params.push(port.toString());

  // Sane check
  if ((await call('version', true)) === false) {
    console.log('*** esptool cannot be used.');
    console.log('Please check if you have Python installed.');
    console.log(
      "If yes, please check if you have pyserial installed (if not try 'pip install pyserial')."
    );
    return;
  }

  // Get mac address
  console.log('*** Step 1/3: Probing ESP32 microcontroller');
  let mac = (await call('read_mac', false, true)) as string;

  // Get signed data based on MAC address and do flash erase in parallel, if requested
  let data;
  if (do_init) {
    console.log(
      '*** Step 2/3: Erasing flash and downloading image in parallel'
    );
    data = (await Promise.all([get_signed_data(mac), erase_flash()]))[0];
  } else {
    console.log('*** Step 2/3: Downloading image');
    setDoneErasing();
    data = await get_signed_data(mac);
  }
  data.writeUInt8(reset_network ? 1 : 0, data.length - 33);

  console.log('*** Step 3/3: Flashing image');

  let dir = await fs.mkdtemp(os.tmpdir() + 'lowsync-');
  let boot_partition_file = dir + '/part1';
  let app_data_file = dir + '/part2';

  await fs.writeFile(boot_partition_file, data.slice(0, 0x8000));
  await fs.writeFile(app_data_file, data.slice(0x8000));
  await call([
    'write_flash',
    '0x1000',
    boot_partition_file,
    '0x10000',
    app_data_file
  ]);
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
  }
}
