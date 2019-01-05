export interface AuthOptions {
  password?: string;
}

export interface RemoteOptions {
  ip: string;
  port?: number;
  useHttp?: boolean;
}

export interface CommandOptions {
  syncDir?: string;
  transpile?: boolean;
  exclude?: string[];
}

export type ConfigOptions = CommandOptions & RemoteOptions;
