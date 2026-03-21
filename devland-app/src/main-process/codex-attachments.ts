import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

import type {
  CodexChatImageAttachment,
  CodexImageAttachmentInput,
} from '@/lib/codex-chat';

export const DEVLAND_CODEX_ATTACHMENT_PROTOCOL = 'devland-codex-attachment';

const ATTACHMENTS_ROOT_DIRNAME = 'codex-attachments';
const ATTACHMENT_PROTOCOL_HOST = 'asset';

const MIME_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
};

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';

const encodeRelativePath = (relativePath: string): string =>
  relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodeRelativePath = (pathname: string): string =>
  pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join(path.sep);

const getAttachmentsRoot = (): string =>
  path.join(app.getPath('userData'), ATTACHMENTS_ROOT_DIRNAME);

const buildStoredFileName = (index: number, name: string, mimeType: string): string => {
  const trimmedName = name.trim();
  const providedExtension = path.extname(trimmedName);
  const baseName = sanitizeSegment(path.basename(trimmedName, providedExtension)) || 'image';
  const extension = providedExtension || MIME_EXTENSION_BY_TYPE[mimeType] || '';

  return `${String(index + 1).padStart(2, '0')}-${baseName}${extension}`;
};

const parseImageDataUrl = (dataUrl: string): { mimeType: string; bytes: Buffer } => {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Unsupported attachment URL format.');
  }

  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    throw new Error('Malformed attachment data URL.');
  }

  const metadata = dataUrl.slice('data:'.length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = metadata.endsWith(';base64');
  const mimeType = (isBase64 ? metadata.slice(0, -';base64'.length) : metadata).trim();

  if (!isBase64) {
    throw new Error('Attachment data URL must be base64 encoded.');
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported attachment MIME type: ${mimeType || 'unknown'}`);
  }

  return {
    mimeType,
    bytes: Buffer.from(payload, 'base64'),
  };
};

export const getCodexAttachmentEntryUrl = (relativePath: string): string =>
  `${DEVLAND_CODEX_ATTACHMENT_PROTOCOL}://${ATTACHMENT_PROTOCOL_HOST}/${encodeRelativePath(relativePath)}`;

export const resolveCodexAttachmentPathFromRoot = (
  attachmentsRootPath: string,
  requestUrl: string,
): string | null => {
  const parsedUrl = new URL(requestUrl);

  if (
    parsedUrl.protocol !== `${DEVLAND_CODEX_ATTACHMENT_PROTOCOL}:` ||
    parsedUrl.host !== ATTACHMENT_PROTOCOL_HOST
  ) {
    return null;
  }

  const attachmentsRoot = path.resolve(attachmentsRootPath);
  const relativePath = decodeRelativePath(parsedUrl.pathname);
  const absolutePath = path.resolve(attachmentsRoot, relativePath);

  if (absolutePath !== attachmentsRoot && !absolutePath.startsWith(`${attachmentsRoot}${path.sep}`)) {
    return null;
  }

  return absolutePath;
};

export const resolveCodexAttachmentPath = (requestUrl: string): string | null =>
  resolveCodexAttachmentPathFromRoot(getAttachmentsRoot(), requestUrl);

export const persistCodexAttachments = async (
  sessionId: string,
  attachments: readonly CodexImageAttachmentInput[],
): Promise<CodexChatImageAttachment[]> => {
  if (attachments.length === 0) {
    return [];
  }

  const sessionKey = sanitizeSegment(sessionId);
  const batchKey = randomUUID();
  const relativeBatchDir = path.join(sessionKey, batchKey);
  const batchDir = path.join(getAttachmentsRoot(), relativeBatchDir);

  await mkdir(batchDir, { recursive: true });

  return Promise.all(
    attachments.map(async (attachment, index) => {
      const { mimeType: parsedMimeType, bytes } = parseImageDataUrl(attachment.dataUrl);
      const mimeType = attachment.mimeType.trim() || parsedMimeType;
      const fileName = buildStoredFileName(index, attachment.name, mimeType);
      const absolutePath = path.join(batchDir, fileName);
      const relativeFilePath = path.join(relativeBatchDir, fileName);

      await writeFile(absolutePath, bytes);

      return {
        type: 'image',
        name: attachment.name,
        mimeType,
        sizeBytes: attachment.sizeBytes,
        previewUrl: getCodexAttachmentEntryUrl(relativeFilePath),
      };
    }),
  );
};
