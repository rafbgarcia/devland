import type { DiffHighlightTokens } from '@/lib/diff/content-sources';

export type DiffHighlightRequest = {
  tabSize: number;
  basename: string;
  extension: string;
  contentLines: ReadonlyArray<string>;
  lines?: number[];
  addModeClass?: boolean;
};

export type DiffHighlightResponse = DiffHighlightTokens;
