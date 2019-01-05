import { httpApi } from '../../../common/src/http/httpApiService';

export default async function() {
  await httpApi.Stop();
}
