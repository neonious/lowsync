import { join } from "path";
import { loadConfigThrow } from "./config";
import { saveJsonFindFile } from "@common/src/common/jsonUtil";

export interface RawAuthConfig {
    password?: string;
}

export const authConfigFileName = 'lowrmt.auth.config.json';

export function getRawAuthConfig() {
    return loadConfigThrow<RawAuthConfig>(authConfigFileName);
}

export function saveAuthConfig(config: RawAuthConfig) {
    return saveJsonFindFile([authConfigFileName], config);
}