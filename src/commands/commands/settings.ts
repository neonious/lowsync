import { SettingsKey, SettingDef } from '@common/settings/definitions';
import {
  getDotKeyFromKey,
  getDotKeyMapping,
  toFlatStructure,
  toSettingsStructure,
  validateAll,
  getDef
} from '@common/settings/util';
import { getTranslation, ValidationKey } from '@common/settings/validations';
import { EnglishTranslations } from '@common/translations/en';
import { chain, mapKeys, maxBy, pickBy } from 'lodash';
import { pad } from 'underscore.string';
import { httpApi } from '../../../common/src/http/httpApiService';
import { SettingsOptions } from '../../args';
import { RunError } from '../../runError';
import { httpApiNew } from '../../config/remoteAccessOpts';

function jsonParse(str: string, type: SettingDef['$type']) {
  switch (type) {
    case 'boolean':
      if (str === '') return null;
      return JSON.parse(str);
    case 'string':
    case 'ip':
    case 'password':
    case 'fileinput':
      return str;
    case 'number':
      if (str === '') return null;
      return JSON.parse(str);
  }
}
 
function throwErrrorsIfExist(results: { setting: string; msg: string }[]) {
  if (results.length) {
    const padBy = maxBy(results, e => e.setting.length)!.setting.length;
    const errList = results
      .map(({ setting, msg }) => `${pad(setting, padBy)}: ${msg}`)
      .join('\n');
    throw new RunError(`${errList}`);
  }
}

async function setSettings(keyEquals: string[]) {
  const dotKeysToKey = getDotKeyMapping();
  const parsed = [];
  for (const keyEqual of keyEquals) {
    const eqIndex = keyEqual.indexOf('=');
    const dotKey = keyEqual.substr(0, eqIndex);
    const valueStr = keyEqual.substr(eqIndex + 1);
    const value = jsonParse(valueStr,getDef(dotKeysToKey[dotKey] as SettingsKey).$type);
    parsed.push({ dotKey, value });
  }

  let flatSettings = {} as Record<SettingsKey, any>;
  for (const { dotKey, value } of parsed) {
    const key = dotKeysToKey[dotKey];
    flatSettings[key] = value;
  }
  const newSettings = toSettingsStructure(flatSettings);

  const validations = await httpApiNew.ValidateSettings({
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
    await httpApiNew.SetSettings({ settings: newSettings });
  }
}

async function showSettings(settingKeys: Set<string> | null) {
  const dotKeysToKey = getDotKeyMapping();

  const showKeys = settingKeys
    ? (pickBy(dotKeysToKey, (_, d) => settingKeys.has(d)) as Dict<string>)
    : dotKeysToKey;
  const values = await getValues(showKeys);

  const keys = Object.keys(values);
  const lines = keys.sort().map(k => {
    const value = values[k];
    return `${k}=${JSON.stringify(value)}`;
  });
  console.log(lines.join('\n'));
}

async function getValues(dotKeysToKey: Dict<string>) {
  const settings = await httpApiNew.GetSettings();
  const flatSettings = toFlatStructure<any>(settings);
  return chain(dotKeysToKey)
    .pickBy(key => key in flatSettings)
    .mapValues((key: SettingsKey) => flatSettings[key])
    .value();
}

async function checkShow(settings: string[]) {
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

async function checkSet(settings: string[]) {
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
      const value = jsonParse(valueStr,getDef(dotKeysToKey[dotKey] as SettingsKey).$type);
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
          msg: `Could not parse value (${valueStr}). Please make sure you are passing a valid value (e.g. correct datatype)?`
        });
        continue;
      } else throw e;
    }
  }
  throwErrrorsIfExist(results);
}

export default async function({
  setSettings: setSettings1,
  showSettings: showSettings1
}: SettingsOptions) {
  setSettings1 && await checkSet(setSettings1 || []);
  showSettings1 && await checkShow(showSettings1 || []);

  if (setSettings1) {
    await setSettings(setSettings1);
  } else {
    await showSettings(showSettings1!.length ? new Set(showSettings1) : null);
  }
}
