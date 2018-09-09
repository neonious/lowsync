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

- checkout the github repository (make sure to init/update submodules)
- cd lowrmt
- npm run init

gulp tasks (use the locally installed version of gulp if you don't have it installed globally)

- (cd lowrmt)
- gulp publish-local: Pack the npm package and install into fresh folder in os temp dir (overrides existing). Then follow the on screen instructions to execute the package. This is for testing only.
- gulp publish-local-dev: Same as above, but build in dev mode. This is for testing only.
- gulp publish: Publish to npm.
- gulp publish-doc: Publish documentation.

## License

MIT