import { ipAddress } from '../../common/src/common/regexConst';
import { RunError } from '../runError';
import { Opts } from './base/opts';
import { RemoteAccessConfig } from './config2';
import { configFile, TheConfig } from './configFile';
import {
  setPort,
  setHostNameOrIp,
  setUseSsl
} from '../../common/src/hooks/forbidden';
import { McHttpError } from '../../common/src/http/mcHttpError';

export const remoteAccessOpts = new Opts<RemoteAccessConfig, TheConfig>({
  config: configFile,
  metas: {
    ip: {
      required: true,
      validate: value => {
        if (typeof value !== 'string') {
          return 'Invalid datatype. Expected a string.';
        }
        if (!ipAddress.test(value)) {
          return 'Not a valid IP address!';
        }
      },
      prompt: {
        type: 'input',
        provideValueForQuestion:
          'What is the IP address of the microcontroller on your network?',
        default: '192.168.0.1'
      }
    },
    port: {
      validate: value => {
        if (value !== undefined) {
          if (isNaN(value as any)) {
            return 'Invalid datatype. Expected a number.';
          }
          const num = Number(value);
          if (!Number.isInteger(num)) {
            return 'Invalid datatype. Expected an integer.';
          }
          if (num < 0 || num > 65535) {
            return 'Not a valid port number (0-65535). Specify -1 to use the default port.';
          }
        }
      },
      noInit: true,
      prompt: {
        type: 'input',
        provideValueForQuestion:
          'What is the port of the microcontroller on your network?'
      },
      saveConfigTransform: value =>
        value !== undefined ? Number(value) : undefined
    },
    useHttp: {
      validate: value => {
        if (value !== undefined && typeof value !== 'boolean')
          return 'Invalid datatype. Expected a boolean.';
      },
      noInit: true
    }
  },
  askOrder: ['ip', 'port', 'useHttp'],
  ask: async ({ port: _port, ip, useHttp }) => {
    const protocol = useHttp ? 'http' : 'https';
    const port = _port === undefined ? (useHttp ? 8000 : 8443) : _port;
    const url = `${protocol}://${ip}:${port}`;
    const timer = setTimeout(() => {
      console.log(
        `Testing connection to microcontroller at ${url}... This can take a while if your connection is bad. If the url is incorrect, please abort lowsync and change the config file or run lowsync init.`
      );
    }, 4000);
    try {
      setPort(port);
      setHostNameOrIp(ip);
      setUseSsl(!useHttp);
      const { postJson } =await import( '../../common/src/http/mcHttp');
      await postJson({
        url: `/api/IsLoggedIn`,
        headers: {
          SessionID: 'dummy_session_id'
        },
        timeout: 30_000,
        noSession:true
      });
    } catch (e){
      if (e instanceof McHttpError)
        throw new RunError(
          `The device cannot be reached with the provided protocol, IP and port (${url}). (maybe a network problem). Please correct the problem in your configuration or delete it and run lowsync init`
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
});
