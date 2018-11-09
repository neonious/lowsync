export default interface SyncLog {
  op: 'add' | 'remove';
  statType?: 'file' | 'dir';
  path: string;
}
