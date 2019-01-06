import { getProgramStatus } from '../../http';

export default async function() {
  const status = await getProgramStatus();
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
