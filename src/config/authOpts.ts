import { Opts } from './base/opts';
import { AuthConfig } from './config2';
import { RunError } from '../runError';
import { authConfigFile } from './authConfigFile';

export const authOpts = new Opts<AuthConfig, AuthConfig>({
  config: authConfigFile,
  metas: {
    password: {
      required: true,
      validate: value => {
        if (typeof value !== 'string')
          return 'Invalid datatype. Expected a string.';
      },
      prompt: {
        type: 'password',
        provideValueForQuestion: 'What is the password for the microcontroller?'
      }
    }
  },
  askOrder: ['password'],
  ask: async ({ password }) => {
    const {
      tryLogin,
      logout
    } = await import('../../common/src/services/authentication/authentication');
    const ok = await tryLogin(password);
    if (ok) {
      await logout();
    } else {
      throw new RunError(
        'The password seems to be invalid. Please correct the problem in your configuration or delete it and run lowsync init'
      );
    }
  }
});
