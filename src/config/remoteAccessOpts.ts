import chalk from 'chalk';
import {
  setHostNameOrIp,
  setPort,
  setUseSsl
} from '../../common/src/hooks/forbidden';
import {
  getHttpMethodInfo,
  httpApi
} from '../../common/src/http/httpApiService';
import { McHttpError } from '../../common/src/http/mcHttpError';
import { RunError } from '../runError';
import { tryLogin } from './auth';
import { configFile } from './configFile';

let done = false;

export async function initHttp(callback: any) {
  let url: string;
  if (!done) {
    let ip = await configFile.getKey('ip');
    let port = await configFile.getKey('port');
    let origPort = port;
    let useHttp = await configFile.getKey('useHttp');
    setUseSsl(!useHttp);

    do {
      const protocol = useHttp ? 'http' : 'https';
      const usePort = port === undefined ? (useHttp ? 8000 : 8443) : port;
      url = `${protocol}://${ip}:${usePort}`;
      let timer: any = setTimeout(() => {
        console.log(
          `Testing connection to microcontroller at ${url}... This can take a while if your connection is bad. If the url is incorrect, please abort lowsync and change the config file or run lowsync init.`
        );
      }, 4000);
      try {
        setHostNameOrIp(ip);
        setPort(usePort);

        const { postJson } = await import('../../common/src/http/mcHttp');
        await postJson({
          url: `/api/IsLoggedIn`,
          headers: {
            SessionID: 'dummy_session_id'
          },
          timeout: 30_000,
          noSession: true
        });
        done = true;
        await configFile.setKey('ip', ip);
        if (port !== origPort) await configFile.setKey('port', port);
        await configFile.setKey('useHttp', useHttp);
      } catch (e) {
        if (e instanceof McHttpError) {
          timer && clearTimeout(timer);
          timer = null;
          console.error(
            chalk.red(
              `The device cannot be reached with the provided protocol, IP and port (${url}).`
            )
          );
          ip = await configFile.prompt('ip');
          port = await configFile.prompt('port');
        } else throw e;
      } finally {
        timer && clearTimeout(timer);
        timer = null;
      }
    } while (!done);
  }

  try {
    return await callback();
  } catch (e) {
    if (e instanceof McHttpError) {
      throw new RunError(
        `The device cannot be reached with the provided protocol, IP and port (${url!}). (maybe a network problem). Please correct the problem in your configuration or delete it and run lowsync init`
      );
    }
    throw e;
  }
}

export const httpApiNew = new Proxy(
  {},
  {
    get: function(target, method: keyof typeof httpApi) {
      return function(...args: any[]) {
        return initHttp(async () => {
          const { noSession } = await getHttpMethodInfo();
          if (!noSession.has(method)) {
            await tryLogin();
          }
          return await (httpApi[method] as any)(...args);
        });
      };
    }
  }
) as typeof httpApi;
