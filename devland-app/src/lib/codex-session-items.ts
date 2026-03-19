export const TOOL_LIFECYCLE_ITEM_TYPES = [
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'dynamic_tool_call',
  'collab_agent_tool_call',
  'web_search',
  'image_view',
] as const;

export type CodexToolLifecycleItemType = (typeof TOOL_LIFECYCLE_ITEM_TYPES)[number];
export const CODEX_ACTIVITY_PHASES = ['started', 'updated', 'completed', 'instant'] as const;
export type CodexActivityPhase = (typeof CODEX_ACTIVITY_PHASES)[number];

export type CodexActivityItemType =
  | 'user_message'
  | 'assistant_message'
  | 'reasoning'
  | 'plan'
  | CodexToolLifecycleItemType
  | 'review_entered'
  | 'review_exited'
  | 'context_compaction'
  | 'error'
  | 'unknown';

function normalizeItemType(raw: unknown): string {
  if (typeof raw !== 'string') {
    return 'item';
  }

  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function toCodexActivityItemType(raw: unknown): CodexActivityItemType {
  const type = normalizeItemType(raw);

  if (type.includes('user')) return 'user_message';
  if (type.includes('agent message') || type.includes('assistant')) return 'assistant_message';
  if (type.includes('reasoning') || type.includes('thought')) return 'reasoning';
  if (type.includes('plan') || type.includes('todo')) return 'plan';
  if (type.includes('command')) return 'command_execution';
  if (type.includes('file change') || type.includes('patch') || type.includes('edit')) {
    return 'file_change';
  }
  if (type.includes('mcp')) return 'mcp_tool_call';
  if (type.includes('dynamic tool')) return 'dynamic_tool_call';
  if (type.includes('collab')) return 'collab_agent_tool_call';
  if (type.includes('web search')) return 'web_search';
  if (type.includes('image')) return 'image_view';
  if (type.includes('review entered')) return 'review_entered';
  if (type.includes('review exited')) return 'review_exited';
  if (type.includes('compact')) return 'context_compaction';
  if (type.includes('error')) return 'error';

  return 'unknown';
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function formatCodexActivityLabel(input: {
  itemType: CodexActivityItemType;
  rawType?: unknown;
  title?: string | null;
}): string {
  const explicitTitle = input.title?.trim();

  if (explicitTitle) {
    return explicitTitle;
  }

  switch (input.itemType) {
    case 'command_execution':
      return 'Run command';
    case 'file_change':
      return 'Edit files';
    case 'mcp_tool_call':
      return 'Use MCP tool';
    case 'dynamic_tool_call':
      return 'Use tool';
    case 'collab_agent_tool_call':
      return 'Delegate agent';
    case 'web_search':
      return 'Search the web';
    case 'image_view':
      return 'Open image';
    case 'reasoning':
      return 'Reasoning';
    case 'plan':
      return 'Plan';
    case 'review_entered':
      return 'Entered review mode';
    case 'review_exited':
      return 'Exited review mode';
    case 'context_compaction':
      return 'Compacted context';
    case 'assistant_message':
      return 'Assistant message';
    case 'user_message':
      return 'User message';
    case 'error':
      return 'Error';
    case 'unknown':
      return toTitleCase(normalizeItemType(input.rawType));
  }
}

export function isToolLifecycleItemType(
  itemType: string | null | undefined,
): itemType is CodexToolLifecycleItemType {
  return (
    typeof itemType === 'string' &&
    TOOL_LIFECYCLE_ITEM_TYPES.includes(itemType as CodexToolLifecycleItemType)
  );
}
