import { useEffect, useState } from 'react';

import {
  CircleAlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
} from 'lucide-react';

import type { ExtensionVersion, ProjectExtension } from '@/extensions/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

function getInstalledVersionSelectionValue(
  extension: ProjectExtension,
  versions: ExtensionVersion[],
): string {
  if (extension.source.kind !== 'github') {
    return extension.version ?? '';
  }

  if (extension.installedReleaseVersion !== null) {
    return extension.installedReleaseVersion;
  }

  if (extension.version !== null) {
    const matchingVersion = versions.find((version) => version.label === extension.version);

    if (matchingVersion !== undefined) {
      return matchingVersion.tag;
    }
  }

  return '';
}

function VersionSubmenu({
  repoPath,
  extension,
  onSelectVersion,
}: {
  repoPath: string;
  extension: ProjectExtension;
  onSelectVersion: (version: ExtensionVersion) => void;
}) {
  const [versions, setVersions] = useState<ExtensionVersion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void window.electronAPI
      .listExtensionVersions(repoPath, extension.id)
      .then((nextVersions) => {
        if (!cancelled) {
          setVersions(nextVersions);
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
  }, [repoPath, extension.id]);

  const isGitHub = extension.source.kind === 'github';
  const currentValue = getInstalledVersionSelectionValue(extension, versions);

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
          Failed to load versions.
        </div>
      ) : null}
      {status === 'ready' ? (
        <>
          {versions.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={currentValue}
                onValueChange={(tag) => {
                  const version = versions.find((v) => v.tag === tag);
                  if (!version) return;
                  onSelectVersion(version);
                }}
              >
                {versions.map((version) => (
                  <DropdownMenuRadioItem
                    key={version.tag}
                    value={version.tag}
                    disabled={!isGitHub}
                  >
                    v{version.label}
                    <DropdownMenuRadioItemIndicator className="ml-auto">
                      <CheckIcon className="size-3.5" />
                    </DropdownMenuRadioItemIndicator>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          ) : (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No versions available
            </div>
          )}
        </>
      ) : null}
    </DropdownMenuContent>
  );
}

export function ExtensionTabMenu({
  repoPath,
  extension,
  onVersionInstalled,
}: {
  repoPath: string;
  extension: ProjectExtension;
  onVersionInstalled: () => void;
}) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const hasUpdate = extension.status === 'update-available';
  const installedVersionLabel = extension.version !== null
    ? `Installed v${extension.version}`
    : 'Not installed';

  useEffect(() => {
    if (installError === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setInstallError(null);
    }, 6000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [installError]);

  const handleSelectVersion = async (version: ExtensionVersion) => {
    if (extension.source.kind !== 'github') return;

    const isCurrentlyInstalled = extension.installedReleaseVersion !== null
      ? version.tag === extension.installedReleaseVersion
      : extension.version !== null && version.label === extension.version;

    if (isCurrentlyInstalled) return;

    setIsInstalling(true);
    setInstallError(null);

    try {
      await window.electronAPI.installRepoExtensionVersion({
        repoPath,
        extensionId: extension.id,
        version: version.tag,
      });
      onVersionInstalled();
    } catch (error) {
      setInstallError(
        error instanceof Error ? error.message : 'Could not install this extension version.',
      );
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors',
            hasUpdate
              ? 'text-primary animate-pulse hover:text-primary/80'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
          aria-label="Extension menu"
          onClick={(e) => e.stopPropagation()}
        >
          {isInstalling ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : (
            <ChevronDownIcon className="size-3" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" sideOffset={6} align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="space-y-0.5">
              <div className="text-sm text-foreground">{extension.tabName}</div>
            </DropdownMenuLabel>
            <DropdownMenuSubmenu>
              <DropdownMenuSubmenuTrigger className="items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>Version</span>
                    {hasUpdate ? (
                      <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        update
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">
                    {installedVersionLabel}
                  </div>
                </div>
                <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuSubmenuTrigger>
              <VersionSubmenu
                repoPath={repoPath}
                extension={extension}
                onSelectVersion={(version) => void handleSelectVersion(version)}
              />
            </DropdownMenuSubmenu>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {installError !== null ? (
        <div
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-destructive/30 bg-background/98 px-3 py-2 text-xs text-destructive shadow-lg backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
          role="alert"
        >
          <div className="flex items-start gap-2">
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive/80" />
            <p className="leading-relaxed">{installError}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
