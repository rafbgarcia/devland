import { defaultUrlTransform } from 'react-markdown';

const DEVLAND_CODEX_ATTACHMENT_PROTOCOL_PREFIX = 'devland-codex-attachment://';

export function devlandMarkdownUrlTransform(value: string): string {
  if (value.startsWith(DEVLAND_CODEX_ATTACHMENT_PROTOCOL_PREFIX)) {
    return value;
  }

  return defaultUrlTransform(value);
}
