import { BuildOptions } from '../../args';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as path from 'path';
import { request } from 'https';
import { RunError } from '../../runError';
import * as bytes from 'bytes';
import { configFile } from '../../config/mainConfigFile';
import { isJavascriptFile } from '@common/common/pathUtil';

function transpileJavaScript(
    source: string
  ): { compiled: string; map: string } {
    const babel = require('@babel/core');
    const result = babel.transform(source, {
        configFile: false,
      presets: [[require("@babel/preset-env"), {'ignoreBrowserslistConfig': true}]],
      sourceMaps: true,
      parserOpts: {
              allowReturnOutsideFunction: true
            }
    });
    const compiled = result.code;
    const map = JSON.stringify(result.map);
    return {
      compiled,
      map
    };
  } // todo make sure all dot files are excluded and .build not synced

  
export default async function({ firmwareFile, firmwareConfig }: BuildOptions, flashOptions: any) {
  let config: any;

  if(!flashOptions)
    flashOptions = {};
  if(!flashOptions.stock) {
      if(firmwareConfig)
          config = JSON.parse(await fs.readFile(firmwareConfig, 'utf8'));
      else
        throw new RunError('No configuration file specified with --firmware-config=..');

    if(!config)
        config = {};
    if(!config.lowjs)
        config.lowjs = {};
  } else {
      config = {lowjs: {
        pro: flashOptions.pro,
        system_flash_size: flashOptions.pro ? 8 * 1024 * 1024 : 3 * 1024 * 1024,
        ota_update_support: flashOptions.pro
      }};
  }

  if(config.lowjs.ide_support && !config.lowjs.pro)
    throw new RunError('Only low.js Professional supports the neonious IDE, please fix the configuration');
  if(config.lowjs.ota_update_support && !config.lowjs.pro)
    throw new RunError('Only low.js Professional supports Over-The-Air updating, please fix the configuration');

  // Handle typical problems
  if(config.settings && config.settings.wifi && config.settings.wifi.ssid && config.settings.wifi.ssid.length > 32)
    throw new RunError('The Wifi SSID in the settings must be a maximum of 32 characters long');
  if(config.settings && config.settings.wifi && config.settings.wifi.password && config.settings.wifi.password.length < 8)
    throw new RunError('The Wifi password in the settings must be at least 8 characters long');

  let firmware_file;
  let modules_file;
  let modules_json_file: any;
  let do_promises = [];

  firmware_file = await new Promise((resolve, reject) => {
    const options = {
        hostname: 'neonious.com',
        port: 8444,
        path: '/api/GetFirmware',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8'
        }
    };

    let done = false;
    let timeout = setTimeout(() => {
        if(!done) {
            done = true;
            try {
                req.abort();
            } catch(e) {}

            reject(new RunError('timeout trying to reach neonious servers'));
        }
    }, 120000);

    let req = request(options, (res) => {
        let dat = [] as any;
        res.on('data', (d) => {
            dat.push(d);
        });
        res.on('error', (e) => {
            if(!done) {
                done = true;
                reject(e);
            }
        });
        res.on('end', () => {
            done = true;
            clearTimeout(timeout);
            if(res.statusCode != 200 && dat.length)
                reject(new RunError('From server: ' + Buffer.concat(dat).toString()));
            else if(res.statusCode != 200)
                reject(new RunError('Cannot get firmware from server'));
            else
                resolve(Buffer.concat(dat));
        });
    }).on('error', (e) => {
        if(!done) {
            done = true;
            reject(e);
        }
    });
    req.end(JSON.stringify({"version": config.lowjs.version, "pro": config.lowjs.pro, "proKey": flashOptions.proKey}));
  });
  if(config.modules) {
      if(JSON.stringify(config.modules) == '{}')
        modules_file = null;
    else {
        modules_file = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'neonious.com',
                port: 8444,
                path: '/api/GetModules',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                }
            };

            let done = false;
            let timeout = setTimeout(() => {
                if(!done) {
                    done = true;
                    try {
                        req.abort();
                    } catch(e) {}

                    reject(new RunError('timeout trying to reach neonious servers'));
                }
            }, 120000);

            let req = request(options, (res) => {
                modules_json_file = res.headers['finalpkgs'];

                let dat = [] as any;
                res.on('data', (d) => {
                    dat.push(d);
                });
                res.on('error', (e) => {
                    if(!done) {
                        done = true;
                        reject(e);
                    }
                });
                res.on('end', () => {
                    done = true;
                    clearTimeout(timeout);
                    if(res.statusCode != 200 && dat.length)
                        reject(new RunError('From server: ' + Buffer.concat(dat).toString()));
                    else if(res.statusCode != 200 || !modules_json_file)
                        reject(new RunError('Cannot get modules from server'));
                    else
                        resolve(Buffer.concat(dat));
                });
            }).on('error', (e) => {
                if(!done) {
                    done = true;
                    reject(e);
                }
            });
            req.end(JSON.stringify({"pkgs": config.modules})); 
        });
        do_promises.push(modules_file);
    }
  }

  console.log("Downloading data from neonious servers...");
  await Promise.all(do_promises);
  console.log("Building firmware...");

  let data = (await firmware_file) as any;
  if(data.length < 0x1F0088)
    throw new Error('Cannot get firmware from server');

  // Add flags
  data.write('lwjs', 0);
  if(config.lowjs.system_flash_size == 'all')
      config.lowjs.system_flash_size = 0;
  else if(config.lowjs.system_flash_size === undefined)
    config.lowjs.system_flash_size = (config.lowjs.pro ? 0x600000 : 0x300000) * (config.lowjs.ota_update_support ? 2 : 1);
  else {
    config.lowjs.system_flash_size = bytes.parse(config.lowjs.system_flash_size);
    if(!config.lowjs.system_flash_size || config.lowjs.system_flash_size <= 0) 
        throw new RunError('lowjs.system_flash_size of firmware config is invalid.')
  }
  data.writeUInt32LE(config.lowjs.system_flash_size, 4);
  data.writeUInt8(
      (config.lowjs.ota_update_support ? 16 : 0) |
      (config.lowjs.pro ? 8 : 0) |
      (flashOptions.stock ? 0 : 4) |
      (config.settings && config.settings.wifi && (config.settings.wifi.ssid !== undefined || config.settings.wifi.password !== undefined) ? 32 : 0), 8);

    // Load all files
    let files: any = {};
    // 0: length of meta data
    let numFiles = data.readUInt32LE(0x1F0080 + 4);
    for(let i = 0; i < numFiles; i++)
    {
        let pos = data.readUInt32LE(0x1F0080 + i * 16 + 8);
        let txtBuf = data.slice(0x1F0080 + pos, 0x1F0080 + pos + 256);
        let j;
        for(j = 0; j < 256; j++)
            if(txtBuf.readUInt8(j) == 0)
                break;
        let txt = txtBuf.toString('utf8', 0, j);

        if(config.static_files !== undefined && txt.substr(0, '/fs/user/'.length) == '/fs/user/')
            continue;
        if(config.factory_files !== undefined && txt.substr(0, '/fs_factory/user/'.length) == '/fs_factory/user/')
            continue;
        if(config.lowjs.ide_support === false && config.lowjs.pro && txt.substr(0, '/client/'.length) == '/client/')
            continue;

        pos = data.readUInt32LE(0x1F0080 + i * 16 + 12);
        let sizeCompressed = data.readUInt32LE(0x1F0080 + i * 16 + 16);
        let size = data.readUInt32LE(0x1F0080 + i * 16 + 20);
        let fileData = data.slice(0x1F0080 + pos, 0x1F0080 + pos + (sizeCompressed ? sizeCompressed : size));
        files[txt] = [sizeCompressed ? size : 0, fileData];
    }

    // Modify files
    if(!flashOptions.stock) {
        if(modules_file) {
            files['/fs_factory/modules.dat'] = [0, (await modules_file) as any];
            files['/fs_factory/modules.json'] = [0, Buffer.from(modules_json_file) as any];
        } else if(config.modules) {
            delete files['/fs_factory/modules.dat'];
            delete files['/fs_factory/modules.json'];
        }

        let transpile = false;
        let configTranspile = await configFile.getKey('transpile');
        if (typeof config.transpile !== 'undefined') {
            transpile = config.transpile;
        } else if (typeof configTranspile !== 'undefined') {
            transpile = configTranspile;
        }

        // FACTORY
        async function walkdir(pathIn: string, pathOut: string, buildPathOut: string) {
            let added = false;
            let filesdir = await fs.readdir(pathIn);
            for(let i = 0; i < filesdir.length; i++) {
                if(filesdir[i][0] == '.')
                    continue;

                let newPathIn = path.join(pathIn, filesdir[i]);
                let newPathOut = pathOut + '/' + filesdir[i];
                let newBuildPathOut = buildPathOut + '/' + filesdir[i];
                if((await fs.stat(newPathIn)).isDirectory()) {
                    if(!await walkdir(newPathIn, newPathOut, newBuildPathOut))
                        files[newPathOut + '/'] = [0, (Buffer.alloc(0)) as any];

                    added = true;
                } else {
                    try {
                        files[newPathOut] = [0, (await fs.readFile(newPathIn)) as any];

                        if (isJavascriptFile(path.basename(newPathIn)) && transpile) {
                            const source = files[newPathOut].toString();
                            const { compiled, map } = transpileJavaScript(source);
                            files[newBuildPathOut] = [0, Buffer.from(compiled)];
                            files[newBuildPathOut + '.map'] = [0, Buffer.from(map)];
                        }
                        added = true;
                    } catch(e) {
                        console.error('Adding ' + newPathIn + ' failed: ' + e.message);
                    }
                }
            }
            return added;
        }
        if(config.factory_files)
            await walkdir(config.factory_files, '/fs_factory/user', '/fs_factory/user/.build');
        if(config.static_files)
            await walkdir(config.static_files, '/fs/user', '/fs/user/.build');
        if(config.lowjs.ide_support === false && config.lowjs.pro)
            files['/client/index.html'] = [0, Buffer.from('<!DOCTYPE html><html><head><title>low.js / lowsync endpoint</title><style type="text/css">body { background-color: white; } * { font-family: Arial; }</style></head><body><h1>low.js / lowsync endpoint</h1><p>This is the HTTP(S) server which handles lowsync requests.</p></body>')];

        if(config.settings) {
            function walksettings(orig: any, added: any) {
                for(let i in added) {
                    if(typeof added[i] == 'object' && typeof orig[i] == 'object')
                        walksettings(orig[i], added[i]);
                    else
                        orig[i] = added[i];
                }
            }
            let settings = JSON.parse(files['/fs_factory/settings.json'][1].toString());
            walksettings(settings, config.settings);
            files['/fs_factory/settings.json'][1] = Buffer.from(JSON.stringify(settings, null, 2));
        }

        let filesSorted = Object.keys(files);
        filesSorted.sort();

        let lenMeta = 8, lenPath = 0, lenData = 0, numFiles = 0;
        for(let i_ = 0; i_ < filesSorted.length; i_++) {
            let i = filesSorted[i_];
            lenMeta += 16;
            lenPath += Buffer.from(i).length + 1;
            lenData += files[i][1].length;
            numFiles++;
        }

        let final = Buffer.alloc(0x1F0080 + lenMeta + lenPath + lenData);
        data.copy(final, 0, 0, 0x1F0080);

        final.writeUInt32LE(lenMeta + lenPath, 0x1F0080);
        final.writeUInt32LE(numFiles, 0x1F0080 + 4);
        let posMeta = 8, posPath = lenMeta, posFile = lenMeta + lenPath;
        for(let i_ = 0; i_ < filesSorted.length; i_++) {
            let i = filesSorted[i_];
            final.writeUInt32LE(posPath, 0x1F0080 + posMeta + 0);
            final.writeUInt32LE(posFile, 0x1F0080 + posMeta + 4);
            final.writeUInt32LE(files[i][0] ? files[i][1].length : 0, 0x1F0080 + posMeta + 8);
            final.writeUInt32LE(files[i][0] ? files[i][0] : files[i][1].length, 0x1F0080 + posMeta + 12);
            posMeta += 16;

            let fName = Buffer.from(i);
            fName.copy(final, 0x1F0080 + posPath);
            final.writeUInt8(0, 0x1F0080 + posPath + fName.length);
            posPath += fName.length + 1;

            files[i][1].copy(final, 0x1F0080 + posFile);
            posFile += files[i][1].length;
        }

        data = final;
    }

    // Add MD5
    let hash = crypto
      .createHash('md5')
      .update(data.slice(0x1F0080))
      .digest();
    hash.copy(data, 64 + 16);

        let memLowJS = 0, memStatic = 0, memFactory = 0, memModules = 0, memSettings = 0;
        for(let i in files) {
            if(i.indexOf('/fs_factory/user/') == 0)
                memFactory += files[i][1].length;
            else if(i.indexOf('/fs/user/') == 0)
                memStatic += files[i][1].length;
            else if(i.indexOf('/fs_factory/modules.') == 0)
                memModules += files[i][1].length;
            else if(i.indexOf('/fs_factory/settings.json') == 0)
                memSettings += files[i][1].length;
            else
                memLowJS += files[i][1].length;
        }
        memLowJS = data.length - 0x1F0080 - memStatic - memFactory - memModules - memSettings;

        console.log("****** Used flash space: ******")
        console.log("low.js code     " + ('          ' + 0x200000).substr(-9) + ' bytes');
        console.log("low.js data     " + ('          ' + memLowJS).substr(-9) + ' bytes');
        console.log("Static files    " + ('          ' + memStatic).substr(-9) + ' bytes');
        console.log("Factory files   " + ('          ' + memFactory).substr(-9) + ' bytes');
        console.log("Modules         " + ('          ' + memModules).substr(-9) + ' bytes');
        console.log("Settings        " + ('          ' + memSettings).substr(-9) + ' bytes');
        let memRequired = 0x200000 + memLowJS + memStatic + memFactory + memModules + memSettings;
        if(flashOptions.stock) {
            if(config.lowjs.pro) {
                console.log("OTA support     " + ('          ' + 0x200000).substr(-9) + ' bytes');
                memRequired += 0x200000;
            }
        } else if(config.lowjs.ota_update_support) {
            console.log("OTA support     " + ('          ' + memRequired).substr(-9) + ' bytes');
            memRequired *= 2;
        }
        if(config.lowjs.system_flash_size && memRequired > config.lowjs.system_flash_size) {
            console.log("-------------------------------")
            console.log("Total           " + ('          ' + memRequired).substr(-9) + ' bytes');
            throw new RunError('Total used flash space is higher than the space reserved with lowjs.system_flash_size');
        }
        if(config.lowjs.system_flash_size) {
            console.log("Reserved        " + ('          ' + (config.lowjs.system_flash_size - memRequired)).substr(-9) + ' bytes');
            console.log("-------------------------------")
            console.log("Total           " + ('          ' + config.lowjs.system_flash_size).substr(-9) + ' bytes');
        } else {
            console.log("-------------------------------")
            console.log("Total           " + ('          ' + memRequired).substr(-9) + ' bytes');
            console.log("Reserved          rest of Flash");
        }
        if(firmwareFile) {
            await fs.writeFile(firmwareFile, data);
    console.log("Written firmware file " + firmwareFile + " (" + data.length + " bytes)");
  } else
    return data;
}
