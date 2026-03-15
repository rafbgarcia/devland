import type { DiffFile } from '@/lib/diff/types';

export type DiffSelectionType = 'all' | 'partial' | 'none';

function cloneLineSet(lines: ReadonlySet<number> | null) {
  return lines === null ? null : new Set(lines);
}

export class DiffSelection {
  public static all(selectableLines: ReadonlySet<number>) {
    return new DiffSelection('all', null, new Set(selectableLines));
  }

  public static none(selectableLines: ReadonlySet<number>) {
    return new DiffSelection('none', null, new Set(selectableLines));
  }

  private constructor(
    private readonly defaultSelectionType: 'all' | 'none',
    private readonly divergingLines: ReadonlySet<number> | null,
    private readonly selectableLines: ReadonlySet<number>,
  ) {}

  public getSelectionType(): DiffSelectionType {
    if (this.selectableLines.size === 0) {
      return 'none';
    }

    if (this.divergingLines === null || this.divergingLines.size === 0) {
      return this.defaultSelectionType;
    }

    if (this.divergingLines.size === this.selectableLines.size) {
      const allSelectableLinesAreDivergent = [...this.selectableLines].every((line) =>
        this.divergingLines?.has(line),
      );

      if (allSelectableLinesAreDivergent) {
        return this.defaultSelectionType === 'all' ? 'none' : 'all';
      }
    }

    return 'partial';
  }

  public isSelectable(lineNumber: number) {
    return this.selectableLines.has(lineNumber);
  }

  public isSelected(lineNumber: number) {
    if (!this.isSelectable(lineNumber)) {
      return false;
    }

    const lineIsDivergent = this.divergingLines?.has(lineNumber) ?? false;

    return this.defaultSelectionType === 'all' ? !lineIsDivergent : lineIsDivergent;
  }

  public withLineSelection(lineNumber: number, selected: boolean) {
    if (!this.isSelectable(lineNumber)) {
      return this;
    }

    return this.withRangeSelection([lineNumber], selected);
  }

  public withRangeSelection(lineNumbers: Iterable<number>, selected: boolean) {
    const nextDivergingLines = cloneLineSet(this.divergingLines) ?? new Set<number>();

    for (const lineNumber of lineNumbers) {
      if (!this.isSelectable(lineNumber)) {
        continue;
      }

      const matchesDefault =
        (this.defaultSelectionType === 'all' && selected) ||
        (this.defaultSelectionType === 'none' && !selected);

      if (matchesDefault) {
        nextDivergingLines.delete(lineNumber);
      } else {
        nextDivergingLines.add(lineNumber);
      }
    }

    return new DiffSelection(this.defaultSelectionType, nextDivergingLines, this.selectableLines);
  }

  public withSelectionType(selectionType: 'all' | 'none') {
    return selectionType === 'all'
      ? DiffSelection.all(this.selectableLines)
      : DiffSelection.none(this.selectableLines);
  }

  public getSelectedLineNumbers() {
    return [...this.selectableLines].filter((lineNumber) => this.isSelected(lineNumber));
  }
}

export function getSelectableDiffLineNumbers(file: DiffFile) {
  const lineNumbers = new Set<number>();

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.isSelectable) {
        lineNumbers.add(line.originalDiffLineNumber);
      }
    }
  }

  return lineNumbers;
}

