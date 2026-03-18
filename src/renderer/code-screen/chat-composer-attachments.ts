export type ComposerImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

export async function readFileAsDataUrl(file: Blob): Promise<string> {
  const mimeType = file.type || 'application/octet-stream';
  const buffer = await file.arrayBuffer();

  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

export async function createComposerImageAttachment(
  file: File,
): Promise<ComposerImageAttachment> {
  return {
    id: crypto.randomUUID(),
    name: file.name || 'image',
    mimeType: file.type,
    sizeBytes: file.size,
    dataUrl: await readFileAsDataUrl(file),
  };
}
