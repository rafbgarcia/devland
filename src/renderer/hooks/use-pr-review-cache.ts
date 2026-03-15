import { useCallback, useMemo } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { PrReviewSchema, type PrReview } from '@/ipc/contracts';

type StoredPrReview = {
  review: PrReview;
  generatedAt: string;
};

type StoredPrReviews = Record<string, StoredPrReview>;

const STORAGE_KEY = 'devland:pr-reviews';

const sanitizeStoredPrReviews = (value: unknown): StoredPrReviews => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, candidate]) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return [];
      }

      const { review, generatedAt } = candidate as {
        review?: unknown;
        generatedAt?: unknown;
      };
      const parsedReview = PrReviewSchema.safeParse(review);

      if (!parsedReview.success || typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) {
        return [];
      }

      return [[key, { review: parsedReview.data, generatedAt } satisfies StoredPrReview]];
    }),
  );
};

const storedPrReviewsAtom = atomWithStorage<StoredPrReviews>(STORAGE_KEY, {});

const prReviewsAtom = atom<StoredPrReviews>((get) =>
  sanitizeStoredPrReviews(get(storedPrReviewsAtom)),
);

const updatePrReviewsAtom = atom(
  null,
  (
    get,
    set,
    nextValue: StoredPrReviews | ((current: StoredPrReviews) => StoredPrReviews),
  ) => {
    const current = get(prReviewsAtom);
    const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;

    set(storedPrReviewsAtom, sanitizeStoredPrReviews(resolved));
  },
);

const buildPrReviewKey = (repoId: string, prNumber: number): string => `${repoId}:${prNumber}`;

export function usePrReviewCache(repoId: string, prNumber: number | null) {
  const storedReviews = useAtomValue(prReviewsAtom);
  const updateReviews = useSetAtom(updatePrReviewsAtom);

  const reviewKey = useMemo(
    () => (prNumber === null ? null : buildPrReviewKey(repoId, prNumber)),
    [prNumber, repoId],
  );

  const cachedReview = reviewKey === null ? null : storedReviews[reviewKey] ?? null;

  const setCachedReview = useCallback(
    (nextReview: StoredPrReview) => {
      if (reviewKey === null) {
        return;
      }

      updateReviews((current) => ({
        ...current,
        [reviewKey]: nextReview,
      }));
    },
    [reviewKey, updateReviews],
  );

  return {
    cachedReview,
    setCachedReview,
  };
}
