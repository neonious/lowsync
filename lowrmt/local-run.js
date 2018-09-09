const execa = require('execa');
const os = require('os');
const path = require('path');

const tmppath = path.resolve(os.tmpdir(), 'lowrmt_build_tmp', 'tmp_install', 'node_modules', 'lowrmt', 'index.js');

const result = execa.sync('node', [tmppath, ...process.argv.slice(2)], { stdio: 'inherit', reject: false });

process.exit(result.code);