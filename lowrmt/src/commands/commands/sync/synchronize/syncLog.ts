export default interface SyncLog {
  side: 'mc' | 'pc';
  op: 'add' | 'remove';
  statType?: 'file' | 'dir';
  path: string;
}
