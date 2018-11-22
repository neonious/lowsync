import * as minimatch from "minimatch";

export default function matchesAnyGlob(
  relPathFromRootPosix: string,
  globs: string[]
) {
  return globs.some(glob => {
    return minimatch("/" + relPathFromRootPosix, glob);
  });
}
