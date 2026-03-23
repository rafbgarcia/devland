import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage, selectAtom } from 'jotai/utils';

import type { CodexDraftAttachment } from '@/ipc/contracts';

export type ComposerDraft = {
  prompt: string;
  attachments: CodexDraftAttachment[];
  updatedAt: string;
};

type StoredComposerDrafts = Record<string, ComposerDraft>;

const STORAGE_KEY = 'devland:composer-drafts';
const MAX_PERSISTED_COMPOSER_DRAFTS = 64;
const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
  prompt: '',
  attachments: [],
  updatedAt: '',
};

function sanitizeComposerDraftAttachment(value: unknown): CodexDraftAttachment | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() !== '' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null;
  const sizeBytes = typeof record.sizeBytes === 'number' && Number.isFinite(record.sizeBytes)
    ? Math.max(0, Math.trunc(record.sizeBytes))
    : null;
  const previewUrl =
    typeof record.previewUrl === 'string' && record.previewUrl.trim() !== ''
      ? record.previewUrl
      : null;

  if (id === null || name === null || mimeType === null || sizeBytes === null || previewUrl === null) {
    return null;
  }

  return {
    id,
    type: 'image',
    name,
    mimeType,
    sizeBytes,
    previewUrl,
  };
}

function sanitizeComposerDraft(value: unknown): ComposerDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === 'string' ? record.prompt : '';
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.flatMap((candidate) => {
        const attachment = sanitizeComposerDraftAttachment(candidate);

        return attachment === null ? [] : [attachment];
      })
    : [];

  if (prompt.trim().length === 0 && attachments.length === 0) {
    return null;
  }

  return {
    prompt,
    attachments,
    updatedAt:
      typeof record.updatedAt === 'string' && record.updatedAt.trim() !== ''
        ? record.updatedAt
        : new Date(0).toISOString(),
  };
}

export function sanitizeStoredComposerDrafts(value: unknown): StoredComposerDrafts {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const drafts = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([targetId, candidate]) => {
      const normalizedTargetId = targetId.trim();

      if (normalizedTargetId === '') {
        return [];
      }

      const draft = sanitizeComposerDraft(candidate);

      return draft === null ? [] : [[normalizedTargetId, draft] as const];
    }),
  );

  return pruneComposerDrafts(drafts);
}

function pruneComposerDrafts(drafts: StoredComposerDrafts): StoredComposerDrafts {
  const entries = Object.entries(drafts);

  if (entries.length <= MAX_PERSISTED_COMPOSER_DRAFTS) {
    return drafts;
  }

  return Object.fromEntries(
    entries
      .sort((left, right) => right[1].updatedAt.localeCompare(left[1].updatedAt))
      .slice(0, MAX_PERSISTED_COMPOSER_DRAFTS),
  );
}

function nextComposerDraft(
  prompt: string,
  attachments: CodexDraftAttachment[],
): ComposerDraft | null {
  if (prompt.trim().length === 0 && attachments.length === 0) {
    return null;
  }

  return {
    prompt,
    attachments,
    updatedAt: new Date().toISOString(),
  };
}

const storedComposerDraftsAtom = atomWithStorage<StoredComposerDrafts>(STORAGE_KEY, {});
const composerDraftsAtom = atom<StoredComposerDrafts>((get) =>
  sanitizeStoredComposerDrafts(get(storedComposerDraftsAtom)),
);

const updateComposerDraftAtom = atom(
  null,
  (
    get,
    set,
    input: {
      targetId: string;
      updater: (draft: ComposerDraft) => ComposerDraft | null;
    },
  ) => {
    const currentDrafts = get(composerDraftsAtom);
    const previousDraft = currentDrafts[input.targetId] ?? EMPTY_COMPOSER_DRAFT;
    const nextDraft = input.updater(previousDraft);

    if (previousDraft === nextDraft) {
      return;
    }

    const nextDrafts = nextDraft === null
      ? Object.fromEntries(
          Object.entries(currentDrafts).filter(([targetId]) => targetId !== input.targetId),
        )
      : {
          ...currentDrafts,
          [input.targetId]: nextDraft,
        };

    set(storedComposerDraftsAtom, sanitizeStoredComposerDrafts(nextDrafts));
  },
);

function createComposerDraftAtom(targetId: string) {
  return selectAtom(composerDraftsAtom, (drafts) => drafts[targetId] ?? EMPTY_COMPOSER_DRAFT);
}

const composerDraftAtoms = new Map<string, ReturnType<typeof createComposerDraftAtom>>();

function getComposerDraftAtom(targetId: string) {
  const existingAtom = composerDraftAtoms.get(targetId);

  if (existingAtom) {
    return existingAtom;
  }

  const nextAtom = createComposerDraftAtom(targetId);
  composerDraftAtoms.set(targetId, nextAtom);

  return nextAtom;
}

export function isComposerDraftDirty(draft: Pick<ComposerDraft, 'prompt' | 'attachments'>): boolean {
  return draft.prompt.trim().length > 0 || draft.attachments.length > 0;
}

export function useComposerDraft(targetId: string) {
  const draft = useAtomValue(getComposerDraftAtom(targetId));
  const updateDraft = useSetAtom(updateComposerDraftAtom);

  return {
    draft,
    isDirty: isComposerDraftDirty(draft),
    setPrompt: (prompt: string) => {
      updateDraft({
        targetId,
        updater: (currentDraft) => nextComposerDraft(prompt, currentDraft.attachments),
      });
    },
    setAttachments: (
      nextAttachments:
        | CodexDraftAttachment[]
        | ((attachments: CodexDraftAttachment[]) => CodexDraftAttachment[]),
    ) => {
      updateDraft({
        targetId,
        updater: (currentDraft) => nextComposerDraft(
          currentDraft.prompt,
          typeof nextAttachments === 'function'
            ? nextAttachments(currentDraft.attachments)
            : nextAttachments,
        ),
      });
    },
    clearDraft: () => {
      updateDraft({
        targetId,
        updater: () => null,
      });
    },
  };
}

export function useComposerDrafts(): StoredComposerDrafts {
  return useAtomValue(composerDraftsAtom);
}

export function useComposerDraftActions() {
  const updateDraft = useSetAtom(updateComposerDraftAtom);

  return {
    clearDraft: (targetId: string) => {
      updateDraft({
        targetId,
        updater: () => null,
      });
    },
  };
}
