import { useEffect, useState } from 'react';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  SettingsIcon,
} from 'lucide-react';

import type {
  AvailableExternalEditor,
  ExternalEditorPreference,
} from '@/ipc/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';

function ExternalEditorSubmenu({
  preference,
  onSelectEditor,
  onConfigureCustom,
}: {
  preference: ExternalEditorPreference | null;
  onSelectEditor: (preference: ExternalEditorPreference) => void;
  onConfigureCustom: () => void;
}) {
  const [editors, setEditors] = useState<AvailableExternalEditor[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void window.electronAPI
      .listAvailableExternalEditors()
      .then((nextEditors) => {
        if (!cancelled) {
          setEditors(nextEditors);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentValue =
    preference?.kind === 'detected'
      ? preference.editorId
      : preference?.kind === 'custom'
        ? '__custom__'
        : '';

  return (
    <DropdownMenuContent
      side="right"
      sideOffset={2}
      align="start"
      className="w-56"
    >
      {status === 'loading' ? (
        <div className="flex items-center justify-center py-6">
          <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="px-3 py-4 text-xs text-destructive/70">
          Failed to load editors.
        </div>
      ) : null}
      {status === 'ready' ? (
        <>
          {editors.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={currentValue}
                onValueChange={(editorId) => {
                  const editor = editors.find((e) => e.id === editorId);
                  if (!editor) return;
                  onSelectEditor({
                    kind: 'detected',
                    editorId: editor.id,
                    editorName: editor.name,
                  });
                }}
              >
                {editors.map((editor) => (
                  <DropdownMenuRadioItem key={editor.id} value={editor.id}>
                    {editor.name}
                    <DropdownMenuRadioItemIndicator className="ml-auto">
                      <CheckIcon className="size-3.5" />
                    </DropdownMenuRadioItemIndicator>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          ) : (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No installed editors found
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onConfigureCustom}>
              <SettingsIcon className="size-3.5" />
              Configure custom editor
              {preference?.kind === 'custom' ? (
                <CheckIcon className="ml-auto size-3.5 text-primary" />
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      ) : null}
    </DropdownMenuContent>
  );
}

export function CodeTabMenu({
  preference,
  onSelectEditor,
  onConfigureCustomEditor,
}: {
  preference: ExternalEditorPreference | null;
  onSelectEditor: (preference: ExternalEditorPreference) => void;
  onConfigureCustomEditor: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
        aria-label="Code menu"
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" sideOffset={6} align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Settings</DropdownMenuLabel>
          <DropdownMenuSubmenu>
            <DropdownMenuSubmenuTrigger>
              External editor
              <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
            </DropdownMenuSubmenuTrigger>
            <ExternalEditorSubmenu
              preference={preference}
              onSelectEditor={onSelectEditor}
              onConfigureCustom={onConfigureCustomEditor}
            />
          </DropdownMenuSubmenu>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
