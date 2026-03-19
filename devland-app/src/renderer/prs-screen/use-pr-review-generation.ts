import { useCallback, useMemo } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

type PrReviewGenerationMap = Record<string, boolean>;

const prReviewGenerationAtom = atom<PrReviewGenerationMap>({});

const updatePrReviewGenerationAtom = atom(
  null,
  (
    get,
    set,
    nextValue:
      | PrReviewGenerationMap
      | ((current: PrReviewGenerationMap) => PrReviewGenerationMap),
  ) => {
    const current = get(prReviewGenerationAtom);
    const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;

    set(prReviewGenerationAtom, resolved);
  },
);

export const buildPrReviewGenerationKey = (
  repoId: string,
  prNumber: number,
): string => `${repoId}:${prNumber}`;

export function usePrReviewGeneration(repoId: string | null, prNumber: number | null) {
  const generationMap = useAtomValue(prReviewGenerationAtom);
  const updateGenerationMap = useSetAtom(updatePrReviewGenerationAtom);

  const reviewKey = useMemo(
    () => (repoId === null || prNumber === null ? null : buildPrReviewGenerationKey(repoId, prNumber)),
    [prNumber, repoId],
  );

  const isGenerating = reviewKey === null ? false : generationMap[reviewKey] === true;

  const setIsGenerating = useCallback(
    (nextIsGenerating: boolean) => {
      if (reviewKey === null) {
        return;
      }

      updateGenerationMap((current) => {
        if (nextIsGenerating) {
          return { ...current, [reviewKey]: true };
        }

        return Object.fromEntries(
          Object.entries(current).filter(([currentKey]) => currentKey !== reviewKey),
        );
      });
    },
    [reviewKey, updateGenerationMap],
  );

  return {
    isGenerating,
    setIsGenerating,
  };
}
