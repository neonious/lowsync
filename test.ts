import { installModules } from './common/src/pkgman/install';
import { join } from 'path';
import chalk from 'chalk';

process.on('unhandledRejection', (reason, p) => {
  console.error(
    chalk.white.bgRed('Unhandled Rejection at: Promise' + p, 'reason:', reason)
  );
});

installModules({
  destPath: join(__dirname, 'finalinstall'),
  installPackages: ['lodash'],
  path: join(__dirname, 'internalnodemodules')
});

/*
user machen lowsync pkg install ....
ls holt existierende name/version dict von MC
macht getzip (dict,new installs) und holt ein buffer obj, was ich an

POST /api/PkgManSetModules {...new pkg name/vers} schicke

bei lowsync pkg uninstall mach ich dasselbe und schicke

POST /api/PkgManSetModules [deleted pkg names]

mit lowsync pkg ls mache ich

POST /api/PkgManList => { name:version }



*/