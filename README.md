# lowrmt

>  A tool to program the neonious one and other low.js for ESP32 based devices with external IDEs. Allows the user to sync directories to the device, change settings, start/stop programs and more.

## Why

- Enables usage of external IDEs
- Automation

## Install

```
$ npm install -g lowrmt
```

## Usage

View the official [documentation](https://www.neonious.com/Documentation/lowrmt).

## Development

### Preparations

- checkout the github repository (make sure to init/update submodules)
- `npm run init`
- `npm run watch` (to build and watch for changes to source files and rebuild automatically)

### Run lowrmt as npm module

- `npm link` (will link the working directory to the global npm namespace. Make sure first that you uninstall any existing installations of lowrmt)
- run `lowrmt <command>` (see documentation for commands)

### Debug lowrmt in vs code

- just press `F5` (or "Start Debugging" in vs code menu) to launch the program in vs code, set breakpoints if you wish
- adjust `.vscode/launch.json` to launch lowrmt with different arguments

### Gulp tasks

Use the locally installed version of gulp if you don't have it installed globally

- `gulp publish-doc` - Publish documentation.

## License

MIT