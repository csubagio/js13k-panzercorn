import { MeshKind } from "./shader";

export type CompoundMesh = number[];

export const compound = (
  expanded: CompoundMesh,
  quantum: number,
  data: number[],
  mirroredRanges: number[],
): void => {
  expanded.push(quantum);
  let from = 0;
  for (let range = 0; range < mirroredRanges.length; range += 2) {
    const end = mirroredRanges[range + 1],
      start = mirroredRanges[range],
      copy = data.slice(start, end);
    for (let i = 0; i < copy.length; ) {
      if (copy[i++] == MeshKind.Color) i += 3;
      else {
        copy[i] = -copy[i];
        copy[i + 4] = -copy[i + 4];
        copy[i + 5] = -copy[i + 5];
        i += 12;
      }
    }
    expanded.push(...data.slice(from, end), ...copy);
    from = end;
  }
  expanded.push(...data.slice(from));
};
