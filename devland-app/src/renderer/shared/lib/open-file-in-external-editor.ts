import type { ExternalEditorPreference } from '@/ipc/contracts';
import { resolveDetectedExternalEditorPreference } from '@/renderer/shared/use-app-preferences';

export async function openRepoFileInExternalEditor({
  repoPath,
  relativeFilePath,
  lineNumber,
  columnNumber,
  externalEditorPreference,
  onExternalEditorPreferenceChange,
  onRequestConfigureExternalEditor,
}: {
  repoPath: string;
  relativeFilePath: string;
  lineNumber?: number | null;
  columnNumber?: number | null;
  externalEditorPreference: ExternalEditorPreference | null;
  onExternalEditorPreferenceChange?: ((preference: ExternalEditorPreference) => void) | undefined;
  onRequestConfigureExternalEditor?: (() => void) | undefined;
}) {
  const resolvedPreference = externalEditorPreference ??
    await resolveDetectedExternalEditorPreference();

  if (resolvedPreference === null) {
    onRequestConfigureExternalEditor?.();
    throw new Error('Choose an external editor in settings first.');
  }

  if (externalEditorPreference === null) {
    onExternalEditorPreferenceChange?.(resolvedPreference);
  }

  await window.electronAPI.openFileInExternalEditor({
    repoPath,
    relativeFilePath,
    ...(lineNumber !== null && lineNumber !== undefined ? { lineNumber } : {}),
    ...(columnNumber !== null && columnNumber !== undefined ? { columnNumber } : {}),
    preference: resolvedPreference,
  });
}
