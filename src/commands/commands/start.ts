import { StartOptions } from '../../args';
import { startProgram } from '../../http';

export default function({ file, force }: StartOptions) {
  return startProgram({ file, force });
}
