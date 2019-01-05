import * as inquirer from 'inquirer';
import { extname } from 'path';
import { configFile, createNewConfig } from '../../config/configFile';
const replaceExt = require('replace-ext');

export default async function() {
  if (await configFile.exists()) {
    const prompt = inquirer.createPromptModule();
    const { action } = (await prompt({
      name: 'action',
      type: 'list',
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
    })) as any;

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
