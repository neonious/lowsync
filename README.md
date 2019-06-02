# lowsync

>  A tool to program the neonious one and other low.js for ESP32 based devices with external IDEs. Allows the user to sync directories to the device, change settings, start/stop programs and more.

## Why

- Enables usage of external IDEs
- Automation

## Install

As administrator/root:

```
$ npm install --unsafe-perm -g lowsync
```

The option `--unsafe-perm` lets the install script run as root instead of letting npm change the user to nobody before running the install script. This is required for the serialport module.

Alternativly, install as normal user into your local node_modules directory:

```
$ npm install lowsync
```

You then have to always call lowsync with path however:

```
node_modules/.bin/lowsync [your parameters...]
```

## Usage

View the official [documentation](https://www.lowjs.org/lowsync-doc/index.html).

## Development

### Preparations

- checkout the github repository (make sure to init/update submodules)
- `npm run init`
- `npm run watch` (to build and watch for changes to source files and rebuild automatically)

### Run lowsync as npm module

- `npm link` (will link the working directory to the global npm namespace. Make sure first that you uninstall any existing installations of lowsync)
- run `lowsync <command>` (see documentation for commands)

### Debug lowsync in vs code

- just press `F5` (or "Start Debugging" in vs code menu) to launch the program in vs code, set breakpoints if you wish
- adjust `.vscode/launch.json` to launch lowsync with different arguments

### Gulp tasks

Use the locally installed version of gulp if you don't have it installed globally

- `gulp publish-doc` - Publish documentation.

## License

MIT
