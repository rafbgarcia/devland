import { useEffect, useMemo, useState } from 'react';

import {
  AlertCircleIcon,
  CheckIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
} from 'lucide-react';

import {
  EXTERNAL_EDITOR_TARGET_COLUMN_ARGUMENT,
  EXTERNAL_EDITOR_TARGET_LINE_ARGUMENT,
  EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
  type AvailableExternalEditor,
  type ExternalEditorPreference,
} from '@/ipc/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shadcn/components/ui/field';
import { Input } from '@/shadcn/components/ui/input';

const CUSTOM_EDITOR_VALUE = '__custom-editor__';

type EditorDraft = {
  selectedValue: string;
  customPath: string;
  customArguments: string;
};

function getInitialEditorDraft(
  availableEditors: readonly AvailableExternalEditor[],
  preference: ExternalEditorPreference | null,
): EditorDraft {
  if (preference?.kind === 'custom') {
    return {
      selectedValue: CUSTOM_EDITOR_VALUE,
      customPath: preference.path,
      customArguments: preference.arguments,
    };
  }

  if (
    preference?.kind === 'detected' &&
    availableEditors.some((editor) => editor.id === preference.editorId)
  ) {
    return {
      selectedValue: preference.editorId,
      customPath: '',
      customArguments: EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
    };
  }

  if (availableEditors.length > 0) {
    return {
      selectedValue: availableEditors[0]!.id,
      customPath: '',
      customArguments: EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
    };
  }

  return {
    selectedValue: CUSTOM_EDITOR_VALUE,
    customPath: '',
    customArguments: EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
  };
}

export function ExternalEditorDialog({
  open,
  onOpenChange,
  preference,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preference: ExternalEditorPreference | null;
  onSave: (preference: ExternalEditorPreference) => void;
}) {
  const [availableEditors, setAvailableEditors] = useState<AvailableExternalEditor[]>([]);
  const [selectedValue, setSelectedValue] = useState<string>(CUSTOM_EDITOR_VALUE);
  const [customPath, setCustomPath] = useState('');
  const [customArguments, setCustomArguments] = useState(
    EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
  );
  const [isLoadingEditors, setIsLoadingEditors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;

    const loadEditors = async () => {
      setIsLoadingEditors(true);
      setLoadingError(null);
      setError(null);

      try {
        const nextEditors = await window.electronAPI.listAvailableExternalEditors();

        if (isCancelled) {
          return;
        }

        const initialDraft = getInitialEditorDraft(nextEditors, preference);

        setAvailableEditors(nextEditors);
        setSelectedValue(initialDraft.selectedValue);
        setCustomPath(initialDraft.customPath);
        setCustomArguments(initialDraft.customArguments);
      } catch (loadError) {
        if (isCancelled) {
          return;
        }

        setAvailableEditors([]);
        setLoadingError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load installed editors.',
        );

        const initialDraft = getInitialEditorDraft([], preference);
        setSelectedValue(initialDraft.selectedValue);
        setCustomPath(initialDraft.customPath);
        setCustomArguments(initialDraft.customArguments);
      } finally {
        if (!isCancelled) {
          setIsLoadingEditors(false);
        }
      }
    };

    void loadEditors();

    return () => {
      isCancelled = true;
    };
  }, [open, preference]);

  const selectedDetectedEditor = useMemo(
    () => availableEditors.find((editor) => editor.id === selectedValue) ?? null,
    [availableEditors, selectedValue],
  );
  const isCustomEditor = selectedValue === CUSTOM_EDITOR_VALUE;

  const handleBrowseCustomEditor = async () => {
    const pickedEditor = await window.electronAPI.pickExternalEditorPath();

    if (pickedEditor === null) {
      return;
    }

    setCustomPath(pickedEditor.path);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);

    if (isCustomEditor) {
      const trimmedPath = customPath.trim();
      const normalizedArguments =
        customArguments.trim() || EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT;

      if (trimmedPath === '') {
        setError('Choose a custom editor path.');
        return;
      }

      if (!normalizedArguments.includes(EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT)) {
        setError(
          `Arguments must include ${EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT}.`,
        );
        return;
      }

      setIsSaving(true);

      try {
        const validation = await window.electronAPI.validateExternalEditorPath(trimmedPath);

        if (!validation.isValid) {
          setError('The selected custom editor path is invalid.');
          return;
        }

        onSave({
          kind: 'custom',
          path: trimmedPath,
          arguments: normalizedArguments,
          bundleId: validation.bundleId,
        });
        onOpenChange(false);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Could not save the custom editor.',
        );
      } finally {
        setIsSaving(false);
      }

      return;
    }

    if (selectedDetectedEditor === null) {
      setError('Choose an installed editor or configure a custom editor.');
      return;
    }

    onSave({
      kind: 'detected',
      editorId: selectedDetectedEditor.id,
      editorName: selectedDetectedEditor.name,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setError(null);
          setLoadingError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>External editor</DialogTitle>
          <DialogDescription>
            Choose which editor Devland uses when you double-click a file in the
            changes list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {loadingError ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Could not load editors</AlertTitle>
              <AlertDescription>{loadingError}</AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Could not save editor</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {availableEditors.length === 0 && !isLoadingEditors ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No installed editors found</AlertTitle>
              <AlertDescription>
                Configure a custom editor path to open files from Devland.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border p-1">
            {availableEditors.map((editor) => {
              const isSelected = selectedValue === editor.id;

              return (
                <Button
                  key={editor.id}
                  type="button"
                  variant={isSelected ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedValue(editor.id);
                    setError(null);
                  }}
                >
                  {isSelected ? <CheckIcon data-icon="inline-start" /> : null}
                  {editor.name}
                </Button>
              );
            })}

            <Button
              type="button"
              variant={isCustomEditor ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => {
                setSelectedValue(CUSTOM_EDITOR_VALUE);
                setError(null);
              }}
            >
              {isCustomEditor ? <CheckIcon data-icon="inline-start" /> : null}
              Configure custom editor...
            </Button>
          </div>

          {isCustomEditor ? (
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="custom-editor-path">Editor path</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="custom-editor-path"
                    value={customPath}
                    onChange={(event) => {
                      setCustomPath(event.target.value);
                      setError(null);
                    }}
                    placeholder={window.electronAPI.platform === 'darwin'
                      ? '/Applications/Editor.app'
                      : '/path/to/editor'}
                    aria-invalid={Boolean(error)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleBrowseCustomEditor()}
                  >
                    <FolderOpenIcon data-icon="inline-start" />
                    Browse
                  </Button>
                </div>
                <FieldDescription>
                  Pick an application bundle or executable file.
                </FieldDescription>
              </Field>

              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="custom-editor-arguments">Arguments</FieldLabel>
                <Input
                  id="custom-editor-arguments"
                  value={customArguments}
                  onChange={(event) => {
                    setCustomArguments(event.target.value);
                    setError(null);
                  }}
                  placeholder={EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT}
                  aria-invalid={Boolean(error)}
                />
                <FieldDescription>
                  Include {EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT} where Devland
                  should insert the file path. Optional line-aware links can use{' '}
                  {EXTERNAL_EDITOR_TARGET_LINE_ARGUMENT} and{' '}
                  {EXTERNAL_EDITOR_TARGET_COLUMN_ARGUMENT}.
                </FieldDescription>
                <FieldError>
                  {error?.includes(EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT)
                    ? error
                    : null}
                </FieldError>
              </Field>
            </FieldGroup>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isLoadingEditors || isSaving}
          >
            {isSaving || isLoadingEditors ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : null}
            Save editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
