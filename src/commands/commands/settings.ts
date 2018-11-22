import { inject, injectable } from 'inversify';
import { mapKeys, mapValues, maxBy, pickBy } from 'lodash';
import { pad } from 'underscore.string';

import { SettingsOptions, jsonParse } from '../../args';
import { LOWTYPES } from '../../ioc/types';
import { RunError } from '../../runError';
import { Command } from '../command';
import { TYPES } from '@common/src/types';
import { HttpApiService } from '@common/src/services/http/api';
import { getDotKeyMapping, toFlatStructure, toSettingsStructure, getDotKeyFromKey, fillFlatStructureWithDefaults } from '@common/src/settings/util';
import { ValidationKey, getTranslation } from '@common/src/settings/validations';
import { EnglishTranslations } from '@common/src/translations/en';
import { SettingsKey } from '@common/src/settings/definitions';

@injectable()
export class SettingsCommand extends Command {

    constructor(
        @inject(LOWTYPES.Options) private options: SettingsOptions,
        @inject(TYPES.HttpApiService) private httpApiService: HttpApiService
    ) { 
        super('settings');
    }

    private async setSettings(keyEquals: string[]) {
        const dotKeysToKey = getDotKeyMapping();
        const parsed = [];
        for (const keyEqual of keyEquals) {
            const eqIndex = keyEqual.indexOf('=');
            const dotKey = keyEqual.substr(0, eqIndex);
            const valueStr = keyEqual.substr(eqIndex + 1);
            const value = jsonParse(valueStr);
            parsed.push({ dotKey, value });
        }

        const settings = await this.httpApiService.GetSettings();
        let flatSettings = toFlatStructure<any>(settings);
        for (const { dotKey, value } of parsed) {
            const key = dotKeysToKey[dotKey];
            flatSettings[key] = value;
        }
        const newSettings = toSettingsStructure(flatSettings);

        const validations = await this.httpApiService.ValidateSettings({ settings: newSettings });
        const validationsFlat = toFlatStructure<ValidationKey>(validations);
        const validationsDotKeysFlat = mapKeys(validationsFlat, (v, k) => {
            return getDotKeyFromKey(k);
        });

        const dotKeys = Object.keys(validationsDotKeysFlat).sort();
        if (dotKeys.length) {
            const errors = [];
            const maxKeyLength = maxBy(dotKeys, k => k.length)!.length;
            for (const dotKey of dotKeys) {
                const code = validationsDotKeysFlat[dotKey];
                const msg = getTranslation(code, new EnglishTranslations());
                errors.push(`${pad(dotKey, maxKeyLength)}: ${msg}`)
            }
            if (errors.length) {
                throw new RunError(`Cannot set settings\n${errors.join('\n')}`);
            } else {
                await this.httpApiService.SetSettings({ settings: newSettings })
            }
        } else {
            await this.httpApiService.SetSettings({ settings: newSettings })
        }
    }

    private async showSettings(settingKeys: Set<string> | null) {
        const dotKeysToKey = getDotKeyMapping();

        const showKeys = settingKeys ? pickBy(dotKeysToKey, (_, d) => settingKeys.has(d)) as Dict<string> : dotKeysToKey;
        const values = await this.getValues(showKeys);

        const keys = Object.keys(values);
        const lines = keys.sort().map((k) => {
            const value = values[k];
            return `${k}=${JSON.stringify(value)}`
        });
        console.log(lines.join('\n'));
    }

    private async getValues(dotKeysToKey: Dict<string>) {
        const settings = await this.httpApiService.GetSettings();
        const flatSettings = toFlatStructure<any>(settings);
        fillFlatStructureWithDefaults(flatSettings);
        return mapValues(dotKeysToKey, (key: SettingsKey) => {
            return flatSettings[key];
        })
    }

    async run() {
        const { setSettings, showSettings } = this.options;
        if (setSettings) {
            await this.setSettings(setSettings);
        } else {
            await this.showSettings(showSettings!.length ? new Set(showSettings) : null);
        }
    }
}

