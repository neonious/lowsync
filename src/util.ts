import * as findUp from 'find-up';
import * as path from 'path';

export function getExistingOrNewConfigPath(name: string) {
  const file = findUp.sync([name]) || path.join(process.cwd(), name);
  return file;
}
