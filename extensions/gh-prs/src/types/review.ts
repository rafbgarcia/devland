import { z } from 'zod';

export const PromptRequestThreadSettingsSchema = z.object({
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
});
export type PromptRequestThreadSettings = z.infer<typeof PromptRequestThreadSettingsSchema>;

export const PromptRequestCheckpointSchema = z.object({
  transcriptEntryStart: z.number().int().nonnegative(),
  transcriptEntryEnd: z.number().int().nonnegative(),
});
export type PromptRequestCheckpoint = z.infer<typeof PromptRequestCheckpointSchema>;

export const PromptRequestAttachmentSchema = z.object({
  type: z.literal('image'),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  previewUrl: z.string().nullable(),
});
export type PromptRequestAttachment = z.infer<typeof PromptRequestAttachmentSchema>;

export const PromptRequestMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  attachments: z.array(PromptRequestAttachmentSchema),
  createdAt: z.string().min(1),
  completedAt: z.string().nullable(),
  turnId: z.string().nullable(),
  itemId: z.string().nullable(),
});
export type PromptRequestMessage = z.infer<typeof PromptRequestMessageSchema>;

export const PromptRequestActivitySchema = z.object({
  id: z.string().min(1),
  tone: z.enum(['info', 'tool', 'error']),
  phase: z.enum(['started', 'updated', 'completed', 'instant']),
  label: z.string().min(1),
  detail: z.string().nullable(),
  itemId: z.string().nullable(),
  itemType: z.string().nullable(),
  filePath: z.string().nullable().optional(),
  filePaths: z.array(z.string().min(1)).optional(),
});
export type PromptRequestActivity = z.infer<typeof PromptRequestActivitySchema>;

export const PromptRequestTranscriptEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('message'),
    message: PromptRequestMessageSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('work'),
    activities: z.array(PromptRequestActivitySchema),
  }),
]);
export type PromptRequestTranscriptEntry = z.infer<typeof PromptRequestTranscriptEntrySchema>;

export const PromptRequestNoteSchema = z.object({
  version: z.literal(1),
  threadId: z.string().min(1),
  branchName: z.string().min(1),
  createdAt: z.string().min(1),
  settings: PromptRequestThreadSettingsSchema,
  checkpoint: PromptRequestCheckpointSchema,
  transcriptEntries: z.array(PromptRequestTranscriptEntrySchema),
});
export type PromptRequestNote = z.infer<typeof PromptRequestNoteSchema>;

export const PullRequestReviewCommitSchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  messageHeadline: z.string().min(1),
  committedAt: z.string().min(1),
  authorName: z.string().nullable(),
  url: z.string().url(),
  note: PromptRequestNoteSchema.nullable(),
});
export type PullRequestReviewCommit = z.infer<typeof PullRequestReviewCommitSchema>;

export const PullRequestReviewSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  commits: z.array(PullRequestReviewCommitSchema),
});
export type PullRequestReview = z.infer<typeof PullRequestReviewSchema>;
