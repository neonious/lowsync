import { InstallOptions } from '../../args';
import { addRemove } from '../../pkgman/addRemove';

export default function(options: InstallOptions) {
  return addRemove(options);
}
