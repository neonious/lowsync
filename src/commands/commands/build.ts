import { BuildOptions } from '../../args';

export default async function({ firmwareFile, firmwareConfig }: BuildOptions) {
  console.log("BUILD FIRMWARE ", firmwareConfig, " => ", firmwareFile);
}
