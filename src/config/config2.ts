export interface AuthConfig {
  password: string;
}

export interface RemoteAccessConfig {
  ip: string;
  port?: number;
  useHttp?: boolean;
}

export interface CommandConfig {
  syncDir: string;
  transpile?: boolean;
  exclude?: string[];
}

export type AllConfig = RemoteAccessConfig & CommandConfig;
