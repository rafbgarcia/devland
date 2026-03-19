import { useCallback, useEffect, useState } from 'react';

import type { AsyncState } from './diff-types';
import {
  expandDiffGap,
  type DiffExpansionAction,
  type DiffExpansionGap,
  type DiffFileExpansionState,
} from './diff-expansion';

type DiffExpansionStateByPath = Record<string, DiffFileExpansionState>;

const EMPTY_EXPANSION_STATE: DiffFileExpansionState = {};

export function useDiffExpansionState(rawDiff: AsyncState<string>) {
  const [expansionStateByPath, setExpansionStateByPath] = useState<DiffExpansionStateByPath>({});

  useEffect(() => {
    setExpansionStateByPath({});
  }, [rawDiff]);

  const getFileExpansionState = useCallback(
    (path: string) => expansionStateByPath[path] ?? EMPTY_EXPANSION_STATE,
    [expansionStateByPath],
  );

  const expandFileGap = useCallback(
    (path: string, gap: DiffExpansionGap, action: DiffExpansionAction) => {
      setExpansionStateByPath((current) => {
        const currentFileState = current[path] ?? EMPTY_EXPANSION_STATE;
        const nextFileState = expandDiffGap(currentFileState, gap, action);

        if (nextFileState === currentFileState) {
          return current;
        }

        return {
          ...current,
          [path]: nextFileState,
        };
      });
    },
    [],
  );

  return {
    getFileExpansionState,
    expandFileGap,
  };
}
