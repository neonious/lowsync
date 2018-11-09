import { configureContainerForNode } from "@common/src/configureContainerNode";
import { HttpHandler } from "@common/src/services/http/handler/handler";
import { getStatusText } from 'http-status-codes';
import { Container } from "inversify";
import "reflect-metadata";
import { configureContainerLowRmt } from "./ioc/configure";
import { RunError } from "./runError";

let hostPrefix = '';
export function setHostPrefix(prefix: string) {
    hostPrefix = prefix;
}

export async function setupContainer(){
    const container = new Container({ defaultScope: 'Singleton' });

    await configureContainerLowRmt(container);

    function getStatusTextNoError(status: number) {
        try {
            getStatusText(status);
        } catch{
            return null;
        }
    }

    configureContainerForNode(container as any, {
        get hostPrefix() {
            return hostPrefix;
        },
        setToBroken(response: HttpHandler.Response | null, error: any): void {
            if (response) {
                const { status } = response;
                const statusText = getStatusTextNoError(status);
                throw new RunError(`An error occured while communicating with the remote. The remote returned the HTTP status code ${status}${statusText ? ` (${statusText})` : ''}.`);
            } else {
                throw new RunError(`An unexpected error occured while communicating with the remote. ${error}`);
            }
        },
        setLoadingState(loading: boolean): void {
            /* nothing */
        },
        setTimeout(timeout: boolean): void {
            /* nothing */
        },
        setProgressStatus(progress: HttpHandler.Progress): void {
            /* nothing */
        },
        setProgressStatusVisible(visible: boolean): void {
            /* nothing */
        }
    });

    return container;
}

