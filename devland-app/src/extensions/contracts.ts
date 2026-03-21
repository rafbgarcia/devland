import { z } from 'zod';

export const ExtensionIconSchema = z.enum(['git-pull-request', 'gh-issue']);
export type ExtensionIcon = z.infer<typeof ExtensionIconSchema>;

const PortSchema = z
  .union([z.string(), z.number().int().positive()])
  .transform((value) => {
    if (typeof value === 'number') {
      return value;
    }

    const parsedPort = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
      throw new Error('Port must be a positive integer.');
    }

    return parsedPort;
  });

export const RepoExtensionDefinitionSchema = z.object({
  source: z.string().min(1),
  tabName: z.string().min(1),
  tabIcon: ExtensionIconSchema,
  port: PortSchema.optional(),
});
export type RepoExtensionDefinition = z.infer<typeof RepoExtensionDefinitionSchema>;

export const RepoConfigSchema = z.object({
  extensions: z.array(RepoExtensionDefinitionSchema).default([]),
  worktreeSetupCommand: z.string().trim().min(1).optional(),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const PathRepoExtensionSourceSchema = z.object({
  kind: z.literal('path'),
  raw: z.string().min(1),
  extensionPath: z.string().min(1),
  port: z.number().int().positive().nullable(),
  extensionKey: z.string().min(1),
});
export type PathRepoExtensionSource = z.infer<typeof PathRepoExtensionSourceSchema>;

export const GitHubRepoExtensionSourceSchema = z.object({
  kind: z.literal('github'),
  raw: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  version: z.string().min(1),
  assetName: z.string().min(1),
  repoUrl: z.string().url(),
  extensionKey: z.string().min(1),
});
export type GitHubRepoExtensionSource = z.infer<typeof GitHubRepoExtensionSourceSchema>;

export const RepoExtensionSourceSchema = z.discriminatedUnion('kind', [
  PathRepoExtensionSourceSchema,
  GitHubRepoExtensionSourceSchema,
]);
export type RepoExtensionSource = z.infer<typeof RepoExtensionSourceSchema>;

export const ProjectExtensionStatusSchema = z.enum([
  'ready',
  'install-required',
  'update-available',
  'error',
]);
export type ProjectExtensionStatus = z.infer<typeof ProjectExtensionStatusSchema>;

export const ProjectExtensionSchema = z.object({
  id: z.string().min(1),
  tabName: z.string().min(1),
  tabIcon: ExtensionIconSchema,
  status: ProjectExtensionStatusSchema,
  name: z.string().min(1).nullable(),
  version: z.string().min(1).nullable(),
  requestedVersion: z.string().min(1).nullable(),
  commands: z.array(z.string().min(1)),
  entryUrl: z.string().min(1).nullable(),
  installPath: z.string().min(1).nullable(),
  repositoryUrl: z.string().url().nullable(),
  source: RepoExtensionSourceSchema,
  error: z.string().min(1).nullable(),
});
export type ProjectExtension = z.infer<typeof ProjectExtensionSchema>;

export const RunExtensionCommandInputSchema = z.object({
  repoPath: z.string().min(1),
  extensionId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().min(1).nullable().optional(),
});
export type RunExtensionCommandInput = z.infer<typeof RunExtensionCommandInputSchema>;

export const InstallRepoExtensionInputSchema = z.object({
  repoPath: z.string().min(1),
  extensionId: z.string().min(1),
});
export type InstallRepoExtensionInput = z.infer<typeof InstallRepoExtensionInputSchema>;
