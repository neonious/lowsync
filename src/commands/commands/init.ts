import { extname } from 'path';
import { configFile, createNewConfig } from '../../config/mainConfigFile';
import { promptList } from '../../prompts';
const replaceExt = require('replace-ext');

export default async function() {
  if (await configFile.exists()) {
    const action = await promptList<'replace' | 'load'>({
      message: 'A config file already exists in the current directory.',
      choices: [
        {
          name: 'Backup (rename) old file and create a new file in its place.',
          value: 'replace'
        },
        {
          name:
            'Load old file and use its values as defaults (modifies the old file).',
          value: 'load'
        }
      ]
    });

    if (action === 'replace') {
      await configFile.moveTo(
        replaceExt(
          configFile.file,
          `.old.${Date.now()}${extname(configFile.file)}`
        )
      );
      await createNewConfig().init();
    } else {
      await configFile.init(configFile);
    }
  } else {
    await configFile.init();
  }
}
