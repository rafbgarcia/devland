import { z } from 'zod';

export const DevlandExtensionManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1).default('/'),
  commands: z.array(z.string().min(1)).default([]),
});
export type DevlandExtensionManifest = z.infer<typeof DevlandExtensionManifestSchema>;

export const DevlandRepoContextSchema = z.object({
  repoId: z.string().min(1),
  projectPath: z.string().min(1),
  isLocal: z.boolean(),
  githubSlug: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
});
export type DevlandRepoContext = z.infer<typeof DevlandRepoContextSchema>;

export const DevlandHostContextSchema = z.object({
  repo: DevlandRepoContextSchema,
});
export type DevlandHostContext = z.infer<typeof DevlandHostContextSchema>;

export const DevlandRunCommandResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
});
export type DevlandRunCommandResult = z.infer<typeof DevlandRunCommandResultSchema>;

export const DevlandHostRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('devland:ready'),
  }),
  z.object({
    type: z.literal('devland:get-context'),
    requestId: z.string().min(1),
  }),
  z.object({
    type: z.literal('devland:run-command'),
    requestId: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().min(1).nullable().optional(),
  }),
  z.object({
    type: z.literal('devland:invoke'),
    requestId: z.string().min(1),
    method: z.string().min(1),
    input: z.unknown().optional(),
  }),
]);
export type DevlandHostRequest = z.infer<typeof DevlandHostRequestSchema>;

export const DevlandHostResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('devland:context'),
    requestId: z.string().min(1),
    context: DevlandHostContextSchema,
  }),
  z.object({
    type: z.literal('devland:command-result'),
    requestId: z.string().min(1),
    result: DevlandRunCommandResultSchema,
  }),
  z.object({
    type: z.literal('devland:invoke-result'),
    requestId: z.string().min(1),
    result: z.unknown(),
  }),
  z.object({
    type: z.literal('devland:error'),
    requestId: z.string().min(1),
    message: z.string().min(1),
  }),
]);
export type DevlandHostResponse = z.infer<typeof DevlandHostResponseSchema>;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export function createDevlandClient() {
  const pendingRequests = new Map<string, PendingRequest>();
  let requestCount = 0;

  const postToHost = (message: DevlandHostRequest): void => {
    window.parent.postMessage(message, '*');
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const parsedMessage = DevlandHostResponseSchema.safeParse(event.data);

    if (!parsedMessage.success) {
      return;
    }

    const message = parsedMessage.data;
    const pending = pendingRequests.get(message.requestId);

    if (pending === undefined) {
      return;
    }

    pendingRequests.delete(message.requestId);

    switch (message.type) {
      case 'devland:context':
        pending.resolve(message.context);
        break;
      case 'devland:command-result':
        pending.resolve(message.result);
        break;
      case 'devland:invoke-result':
        pending.resolve(message.result);
        break;
      case 'devland:error':
        pending.reject(new Error(message.message));
        break;
    }
  });

  const requestFromHost = <TResponse>(
    message:
      | { type: 'devland:get-context' }
      | {
          type: 'devland:run-command';
          command: string;
          args: string[];
          cwd?: string | null;
        }
      | {
          type: 'devland:invoke';
          method: string;
          input?: unknown;
        },
  ): Promise<TResponse> => {
    const requestId = `${message.type}:${++requestCount}`;

    return new Promise<TResponse>((resolve, reject) => {
      pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
      });

      postToHost({
        ...message,
        requestId,
      } as DevlandHostRequest);
    });
  };

  postToHost({ type: 'devland:ready' });

  return {
    getContext: async (): Promise<DevlandHostContext> =>
      await requestFromHost<DevlandHostContext>({
        type: 'devland:get-context',
      }),
    runCommand: async (input: {
      command: string;
      args: string[];
      cwd?: string | null;
    }): Promise<DevlandRunCommandResult> =>
      await requestFromHost<DevlandRunCommandResult>({
        type: 'devland:run-command',
        command: input.command,
        args: input.args,
        cwd: input.cwd ?? null,
      }),
    invoke: async <TResponse>(input: {
      method: string;
      input?: unknown;
      resultSchema?: z.ZodType<TResponse>;
    }): Promise<TResponse> => {
      const result = await requestFromHost<unknown>({
        type: 'devland:invoke',
        method: input.method,
        input: input.input,
      });

      return input.resultSchema
        ? input.resultSchema.parse(result)
        : (result as TResponse);
    },
  };
}

export * from './gh-prs.js';
