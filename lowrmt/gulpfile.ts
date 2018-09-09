import * as gulp from 'gulp';
import { copy, readFile, writeFile, readdir, move, emptyDir, mkdirp } from 'fs-extra';
import * as execa from 'execa';
import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { runNonWindowsCmd } from '../common/src/common/processUtil';

const tmppath = path.resolve(os.tmpdir(), 'lowrmt_build_tmp', 'tmp_install');

async function prepareForPack(dev: boolean) {
    await execa('webpack', ['--mode', dev ? 'development' : 'production', '--progress'], { stdio: 'inherit' });
    await copy('package.json', 'build/package.json');
    await copy('../readme.md', 'build/readme.md');
    await copy('../LICENSE', 'build/LICENSE');
    const content = (await readFile('build/index.js')).toString();
    await writeFile('build/index.js', `#!/usr/bin/env node\n${content}`);
}

async function publishLocal(dev: boolean) {
    await prepareForPack(dev);
    await execa('npm', ['pack'], { cwd: 'build' });
    const files = await readdir('build');
    const archive = files.find(f => f.endsWith('.tgz'))!;
    assert(archive);
    const archiveFp = path.resolve('build/' + archive);

    await mkdirp(tmppath);
    await emptyDir(tmppath);
    await move(archiveFp, path.resolve(tmppath, archive));
    await execa('npm', ['init', '-y'], { cwd: tmppath });
    await execa('npm', ['i', archive], { cwd: tmppath, stdio: 'inherit' });
    await execa('npm', ['i', '-D', 'npx'], { cwd: tmppath, stdio: 'inherit' });

    console.log('Lowrmt was stored in the os temp directory. Run "node local-run.js <args..>" to run the test installation of lowrmt.');
}

gulp.task('publish-local', async () => {
    await publishLocal(false)
})

gulp.task('publish-local-dev', async () => {
    await publishLocal(true)
});

async function publish() {
    console.warn('Run "npm version <update_type>" first to update the package version!! Press enter when ready.');

    process.stdin.setRawMode!(true);
    process.stdin.resume();
    await new Promise((r, rj) => {
        process.stdin.once('data', () => {
            prepareForPack(false).then(() => r()).catch(e => rj(e));
        });
    });

    console.log('Publishing to npm');
    await execa('npm', ['publish'], { cwd: 'build', stdio: 'inherit' });

    process.exit(0);
}

gulp.task('publish', async () => {
    await publish();
});

async function publicDoc() {
    // for windows 2 make calls
    await execa('make', ['clean'], { cwd: 'doc', stdio: 'inherit' });
    await execa('make', ['html'], { cwd: 'doc', stdio: 'inherit' });
    await runNonWindowsCmd('rsync', ['-a', '--delete', '_build/html/', 'root@neonious.com:/opt/neonious-server/lowrmt-doc'], { cwd: 'doc', stdio: 'inherit' });
}

gulp.task('publish-doc', async () => {
    await publicDoc();
});
