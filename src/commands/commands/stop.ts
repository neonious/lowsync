import { httpApi } from '../../../common/src/http/httpApiService';
import { httpApiNew } from '../../config/remoteAccessOpts';

export default async function() {
  await httpApiNew.Stop();
}
