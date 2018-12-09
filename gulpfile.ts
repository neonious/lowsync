import * as gulp from 'gulp';
import * as execa from 'execa';
import { runNonWindowsCmd } from './common/src/common/processUtil';

async function publishDoc() {
    // for windows 2 make calls
    await execa('make', ['clean'], { cwd: 'doc', stdio: 'inherit' });
    await execa('make', ['html'], { cwd: 'doc', stdio: 'inherit' });
    await runNonWindowsCmd('rsync', ['-a', '--delete', '_build/html/', 'root@neonious.com:/opt/neonious-server/lowsync-doc'], { cwd: 'doc', stdio: 'inherit' });
}

gulp.task('publish-doc', async () => {
    await publishDoc();
});
