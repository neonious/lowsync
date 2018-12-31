import { httpApi } from '../../../common/src/http/httpApiService';
import { Command } from '../command';

export default class StopCommand extends Command {
    readonly requestConfig = {};
    readonly usingNoRemoteApis = false;

    constructor(
    ) {
        super('stop')
    }

    async run() {
        await httpApi.Stop();
    }
}

