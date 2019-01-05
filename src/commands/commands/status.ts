import { httpApi } from '../../../common/src/http/httpApiService';
import { httpApiNew } from '../../config/remoteAccessOpts';

export default async function() {
  const {
    code: { status }
  } = await httpApiNew.Status({ code: true });

  let statusStr: string;

  switch (status) {
    case 'paused':
      statusStr = 'paused / crashed';
      break;
    case 'updating_sys':
      statusStr = 'performing system update';
      break;
    default:
      statusStr = status;
      break;
  }
  console.log(`Current status: ${statusStr}`);
}
