export function osRelPathToRootedPosix(path: string) {
  const slashPath = '/' + path.replace(/\\/g, '/');
  return slashPath;
}
