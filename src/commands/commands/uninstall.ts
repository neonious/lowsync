import { UninstallOptions } from '../../args';
import { addRemove } from '../../pkgman/addRemove';

export default function(options: UninstallOptions) {
  return addRemove(options);
}
