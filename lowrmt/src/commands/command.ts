import { Options } from "../args";
import { Config, validateConfigKey, RawConfig, throwOnInvalidResult } from "../config";
import { inject, injectable } from "inversify";
import { LOWTYPES } from "../ioc/types";

export interface CommandOptions {
    noLogin?: boolean;
    skipConfigValidation?: boolean;
    requestConfig?: (keyof Config)[];
}

@injectable()
export abstract class Command implements CommandOptions {
    readonly noLogin?: boolean | undefined;
    readonly skipConfigValidation?: boolean | undefined;
    readonly requestConfig?: ("syncDir" | "ip" | "transpile" | "exclude")[] | undefined;

    @inject(LOWTYPES.RawConfig)
    private rawConfig!: RawConfig;

    private configCache: { [K in keyof Config]: Config[K] } | undefined;
    get config(): { [K in keyof Config]: Config[K] } {
        if (!this.configCache) {
            const result: { [K in keyof Config]: Config[K] } = {} as any;
            for (const key of this.requestConfig || []) {
                const vresult = validateConfigKey(key, this.rawConfig[key]);
                throwOnInvalidResult(vresult);
                result[key] = this.rawConfig[key];
            }
            this.configCache = result;
        } 
        return this.configCache;
    }

    constructor(public readonly command: Options['type'], options: CommandOptions = {}) {
        Object.assign(this, options || {});
    }

    abstract run(): Promise<void>;
}