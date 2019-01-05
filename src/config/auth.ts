import chalk from 'chalk';
import { authConfigFile } from './authConfigFile';
import { initHttp, httpApiNew } from './remoteAccessOpts';

function auth() {
  return import('../../common/src/services/authentication/authentication');
}

let loggedIn = false;

export async function tryLogin() {
  if (loggedIn) return;
  return await initHttp(async () => {
    let value = await authConfigFile.getKey('password');

    let ok;

    do {
      const { tryLogin } = await auth();
      ok = await tryLogin(value || '');
      if (!ok) {
        const msg =
          value === undefined
            ? 'A password was not provided.'
            : 'Wrong password.';
        value = await authConfigFile.prompt('password', {
          err: msg
        });
      } else {
        loggedIn = true;
        await authConfigFile.setKey('password', value);
        const { noPassword } = await httpApiNew.GetSoftwareVersion();
        if (noPassword) {
          console.warn(
            chalk.keyword('orange')(
              'A password was not set for the microcontroller. Please set a password via the lowsync settings set command.'
            )
          );
        }
      }
    } while (!ok);
  });
}

export function isLoggedIn() {
  return loggedIn;
}

export async function logout() {
  if (!loggedIn) return;
  return await initHttp(async () => {
    const { logout } = await auth();
    await logout();
    loggedIn = false;
  });
}
