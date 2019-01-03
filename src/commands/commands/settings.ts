import { SettingsKey } from '@common/settings/definitions';
import {
  getDotKeyFromKey,
  getDotKeyMapping,
  toFlatStructure,
  toSettingsStructure,
  validateAll
} from '@common/settings/util';
import {
  getTranslation,
  ValidationKey
} from '@common/settings/validations';
import { EnglishTranslations } from '@common/translations/en';
import { chain, mapKeys, maxBy, pickBy } from 'lodash';
import { pad } from 'underscore.string';
import { jsonParse, SettingsOptions } from '../../args';
import { RunError } from '../../runError';
import { Command } from '../command';
import { httpApi } from '../../../common/src/http/httpApiService';

function throwErrrorsIfExist(results: { setting: string; msg: string }[]) {
  if (results.length) {
    const padBy = maxBy(results, e => e.setting.length)!.setting.length;
    const errList = results
      .map(({ setting, msg }) => `${pad(setting, padBy)}: ${msg}`)
      .join('\n');
    throw new RunError(`${errList}`);
  }
}

export default class SettingsCommand extends Command {
  readonly requestConfig = {};
  readonly usingNoRemoteApis = false;

  constructor(private options: SettingsOptions) {
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

    let flatSettings = {} as Record<SettingsKey, any>;
    for (const { dotKey, value } of parsed) {
      const key = dotKeysToKey[dotKey];
      flatSettings[key] = value;
    }
    const newSettings = toSettingsStructure(flatSettings);

    const validations = await httpApi.ValidateSettings({
      settings: newSettings
    });
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
        errors.push(`${pad(dotKey, maxKeyLength)}: ${msg}`);
      }
      throw new RunError(`Cannot set settings\n${errors.join('\n')}`);
    } else {
      await httpApi.SetSettings({ settings: newSettings });
    }
  }

  private async showSettings(settingKeys: Set<string> | null) {
    const dotKeysToKey = getDotKeyMapping();

    const showKeys = settingKeys
      ? (pickBy(dotKeysToKey, (_, d) => settingKeys.has(d)) as Dict<string>)
      : dotKeysToKey;
    const values = await this.getValues(showKeys);

    const keys = Object.keys(values);
    const lines = keys.sort().map(k => {
      const value = values[k];
      return `${k}=${JSON.stringify(value)}`;
    });
    console.log(lines.join('\n'));
  }

  private async getValues(dotKeysToKey: Dict<string>) {
    const settings = await httpApi.GetSettings();
    const flatSettings = toFlatStructure<any>(settings);
    return chain(dotKeysToKey)
      .pickBy(key => key in flatSettings)
      .mapValues((key: SettingsKey) => flatSettings[key])
      .value();
  }

  private checkShow(settings:string[]){

    const results = [];
    const dotKeysToKey = getDotKeyMapping();
    for (const setting of settings) {
      if (!dotKeysToKey[setting]) {
        results.push({
          setting,
          msg: `Unknown setting. Use 'show' without arguments to show what settings exist.`
        });
        continue;
      }
    }
    throwErrrorsIfExist(results);
  }

  private checkSet(settings:string[]){

    if (!settings.length) {
      throw new RunError('Must provide settings to set');
    }
    const results = [];
    const dotKeysToKey = getDotKeyMapping();
    for (const setting of settings) {
      const eqIndex = setting.indexOf('=');
      if (eqIndex === -1) {
        results.push({
          setting,
          msg: `Invalid set setting syntax. Use <setting>=<value>. Enclose string values with quotes ("").`
        });
        continue;
      }
      const dotKey = setting.substr(0, eqIndex);
      if (!dotKeysToKey[dotKey]) {
        results.push({
          setting,
          msg: `Unknown setting ${dotKey}. Use 'show' without arguments to show what settings exist.`
        });
        continue;
      }
      const valueStr = setting.substr(eqIndex + 1);
      try {
        const value = jsonParse(valueStr);
        const msg = validateAll(
          dotKeysToKey[dotKey] as SettingsKey,
          value,
          new EnglishTranslations()
        ); // todo nach new EnglishTranslations() suchen
        if (typeof msg === 'string') {
          results.push({
            setting,
            msg: `Value (${valueStr}) is not valid for this setting. ${msg}`
          });
          continue;
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          results.push({
            setting,
            msg: `Could not parse value (${valueStr}).`
          });
          continue;
        } else throw e;
      }
    }
    throwErrrorsIfExist(results);
  }

  async run() {

    const { setSettings, showSettings } = this.options;

    setSettings&&this.checkSet(setSettings||[]);
    showSettings&&this.checkShow(showSettings||[]);

    if (setSettings) {
      await this.setSettings(setSettings);
    } else {
      await this.showSettings(
        showSettings!.length ? new Set(showSettings) : null
      );
    }
  }
}
