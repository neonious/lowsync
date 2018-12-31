import { Config } from './config';
import * as inquirer from 'inquirer';

type PromptType = 'input' | 'confirm' | 'password';

interface PropMeta {
  required?: boolean;
  validate: (value: unknown) => string | undefined;
  default?: unknown;
  noInit?: boolean;
  prompt?: {
    type: PromptType;
    provideValueForQuestion: string;
    default?: unknown;
  };
  saveConfigTransform?: (value: unknown) => unknown;
  transformForUse?: (value: unknown) => unknown;
}

type PropMetas<TConfig> = { [K in keyof TConfig]-?: PropMeta };

interface OptsOptions<TConfig, TConfigFile extends TConfig> {
  config: Config<TConfigFile>;
  metas: PropMetas<TConfig>;
  askOrder: (keyof TConfig)[];
  ask?: (config: TConfig) => Promise<void>;
}

export class Opts<TConfig, TConfigFile extends TConfig> {
  private config: Config<TConfigFile>;
  readonly metas: PropMetas<TConfig>;
  readonly askOrder: (keyof TConfig)[];
  readonly ask?: (config: TConfig) => Promise<void>;

  constructor({
    config,
    metas,
    askOrder,
    ask
  }: OptsOptions<TConfig, TConfigFile>) {
    this.config = config;
    this.metas = metas;
    this.askOrder = askOrder;
    this.ask = ask;
  }

  async getErrors(keys?: (keyof TConfig)[]) {
    const errors = [];
    const requestKeys = new Set(keys || this.askOrder);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const {
          required,
          prompt: promptOpts,
          validate,
          default: _default
        } = this.metas[key];
        if (promptOpts) continue;
        let currentValue = await this.config.getKey(key);
        if (currentValue !== undefined || _default === undefined) {
          if (currentValue === undefined && required) {
            errors.push(
              `No value was found in ${this.config.filename} for "${key}".`
            );
          } else {
            const errMsg = validate(currentValue);
            if (errMsg) {
              errors.push(
                `An invalid value was found in ${
                  this.config.filename
                } for "${key}". ${errMsg}`
              );
            }
          }
        }
      }
    }
    return errors;
  }

  async init(pconfig?: Config<TConfigFile>) {
    const config = pconfig || this.config;
    for (const key of this.askOrder) {
      const {
        prompt: promptOpts,
        validate,
        default: _default,
        noInit,
        saveConfigTransform
      } = this.metas[key];
      if (noInit || !promptOpts) {
        // if pconfig here means that pconfig is a new config object since only new config objects are passed into this method
        if (pconfig && _default !== undefined) {
          config.setKey(key, _default as any);
        }
        continue;
      }
      const {
        type,
        provideValueForQuestion,
        default: promptDefault
      } = promptOpts;
      let defValue = await config.getKey(key);
      const errMsg = validate(defValue);
      if (errMsg) {
        defValue = undefined;
      }
      const prompt = inquirer.createPromptModule();
      let { newValue } = await prompt<{ newValue: unknown }>({
        name: 'newValue',
        type,
        message: provideValueForQuestion,
        default: this.s(type, defValue, promptDefault, _default),
        validate: value => validate(value) || true
      });
      if (saveConfigTransform) {
        newValue = saveConfigTransform(newValue);
      }

      await config.setKey(key, newValue as any);
    }

    this.ask && (await this.ask(await config.getConfig()));
  }

  private s(type: PromptType, ...vals: any[]) {
    switch (type) {
      case 'confirm': {
        for (const val of vals) {
          if (val) {
            return true;
          }
        }
        return false;
      }
      default: {
        for (const val of vals) {
          if (val !== undefined && val !== null) return val.toString();
        }
        return undefined;
      }
    }
  }

  async askUser(keys?: (keyof TConfig)[]) {
    const requestKeys = new Set(keys || this.askOrder);
    for (const key of this.askOrder) {
      if (requestKeys.has(key)) {
        const {
          required,
          prompt: promptOpts,
          validate,
          default: _default,
          saveConfigTransform
        } = this.metas[key];
        const currentValue = await this.config.getKey(key);
        if (currentValue === undefined && _default !== undefined) continue;
        if (!promptOpts) {
          // was already handled in getErrors
          continue;
        }

        const req = currentValue === undefined && required;
        const errMsg = validate(currentValue);
        if (req || errMsg) {
          const {
            type,
            provideValueForQuestion,
            default: promptDefault
          } = promptOpts;
          const message = req
            ? `No value was found in ${
                this.config.filename
              } for "${key}". ${provideValueForQuestion}`
            : `An invalid value was found in ${
                this.config.filename
              } for "${key}". ${errMsg} ${provideValueForQuestion}`;
          const prompt = inquirer.createPromptModule();
          let { newValue } = await prompt<{ newValue: unknown }>({
            name: 'newValue',
            type,
            message,
            default: this.s(type, promptDefault, _default),
            validate: value => {
              if (value === undefined && required) {
                return 'An input is required.';
              }
              return validate(value) || true;
            }
          });
          if (saveConfigTransform) {
            newValue = saveConfigTransform(newValue);
          }

          await this.config.setKey(key, newValue as any);
        }
      }
    }

    this.ask && (await this.ask(await this.getConfig(keys)));
  }

  async getConfig(keys?: (keyof TConfig)[]) {
    const result = {} as TConfig;
    const requestKeys = keys || this.askOrder;
    for (const key of requestKeys) {
      let value = await this.config.getKey(key);
      const { transformForUse, default: _default } = this.metas[key];
      if (value === undefined && _default !== undefined) {
        value = _default as any;
      }
      if (transformForUse) {
        value = transformForUse(value) as any;
      }
      if (value !== undefined) result[key] = value as any;
    }
    return result;
  }
}
