import type { DiffFile } from '@/lib/diff/types';

export type DiffChangeGroup = {
  startLineNumber: number;
  selectableLineNumbers: number[];
};

export function getDiffChangeGroups(file: DiffFile): DiffChangeGroup[] {
  const groups: DiffChangeGroup[] = [];

  for (const hunk of file.hunks) {
    let currentGroup: DiffChangeGroup | null = null;

    for (const line of hunk.lines) {
      if (!line.isSelectable) {
        if (currentGroup !== null) {
          groups.push(currentGroup);
          currentGroup = null;
        }

        continue;
      }

      if (currentGroup === null) {
        currentGroup = {
          startLineNumber: line.originalDiffLineNumber,
          selectableLineNumbers: [],
        };
      }

      currentGroup.selectableLineNumbers.push(line.originalDiffLineNumber);
    }

    if (currentGroup !== null) {
      groups.push(currentGroup);
    }
  }

  return groups;
}

export function getDiffChangeGroupSelectableLineNumbers(
  file: DiffFile,
  startLineNumber: number,
) {
  return getDiffChangeGroups(file).find((group) => group.startLineNumber === startLineNumber)
    ?.selectableLineNumbers ?? [];
}
