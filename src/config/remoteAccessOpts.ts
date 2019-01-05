import chalk from 'chalk';
import { httpApi } from '../../common/src/http/httpApiService';
import { HttpLikeOptions } from '../../common/src/http/httpLike';
import {
  onBeforeEachHttp,
  onBeforeHttp,
  onHttpFail,
  onHttpSuccess,
  McHttpOptions
} from '../../common/src/http/mcHttp';
import { authConfigFile } from './authConfigFile';
import { configFile } from './configFile';

let warnedNoPassword = false;

export async function prepareHttp(
  noSession: boolean
): Promise<HttpLikeOptions> {
  let ip = await configFile.getKey('ip');
  let port = await configFile.getKey('port');
  let useHttp = await configFile.getKey('useHttp');
  const usePort = port === undefined ? (useHttp ? 8000 : 8443) : port;

  let options: Partial<HttpLikeOptions> = {
    ip,
    port: usePort,
    ssl: !useHttp
  };

  if (!noSession) {
    if (!warnedNoPassword) {
      const { noPassword } = await httpApi.GetSoftwareVersion();
      if (noPassword) {
        console.warn(
          chalk.keyword('orange')(
            'A password was not set for the microcontroller. Please set a password via the lowsync settings set command.'
          )
        );
      }
      warnedNoPassword = true;
    }
    let password = await authConfigFile.getKey('password');
    options = {
      ...options,
      noSession: true,
      password
    };
  }
  return options;
}

onBeforeHttp(async (options: MyOptions) => {
  const opts = await prepareHttp(!!options.noSession);
  return { ...options, ...opts };
});

interface MyOptions extends McHttpOptions {
  timer: NodeJS.Timer | undefined;
}

onBeforeEachHttp(async (options: MyOptions) => {
  const protocol = options.ssl ? 'https' : 'http';
  const url = `${protocol}://${options.ip}:${options.port}`;
  options.timer = setTimeout(() => {
    console.log(
      `Testing connection to microcontroller at ${url}... This can take a while if your connection is bad. If the url is incorrect, please abort lowsync and change the config file or run lowsync init.`
    );
  }, 4000);

  return options;
});

onHttpSuccess(async (options: MyOptions) => {
  if (options.headers && options.headers.Password)
    await authConfigFile.setKey('password', options.headers.Password);
  await configFile.setKey('ip', options.ip!);
  await configFile.setKey('port', options.port!); // todo
  await configFile.setKey('useHttp', !options.ssl);
});

export async function onFail<TOptions extends MyOptions>(
  options: TOptions,
  forbidden: boolean
): Promise<TOptions | void> {
  if (forbidden) {
    let password = await authConfigFile.getKey('password');
    const msg =
      password === undefined
        ? 'A password was not provided.'
        : 'Wrong password.';
    password = await authConfigFile.prompt('password', {
      err: msg
    });
    options = {
      ...options,
      headers: {
        ...options.headers,
        Password: password!
      }
    };
    return options;
  }

  options.timer && clearTimeout(options.timer);
  delete options.timer;
  console.error(
    chalk.red(
      `The device cannot be reached with the provided protocol, IP and port (${
        options.url
      }).`
    )
  );
  const ip = await configFile.prompt('ip');
  const port = await configFile.prompt('port');
  const useHttp = await configFile.prompt('useHttp');
  options = {
    ip,
    port,
    ssl: !useHttp,
    ...options
  };
  return options;
}

onHttpFail((options: MyOptions, error, response) => {
  return onFail(options, (response && response.status === 401) || false);
});
