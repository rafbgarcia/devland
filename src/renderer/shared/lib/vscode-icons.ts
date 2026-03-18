import vscodeIconsLanguageAssociations from '@/renderer/shared/lib/vscode-icons-language-associations.json';
import vscodeIconsManifest from '@/renderer/shared/lib/vscode-icons-manifest.json';

const VSCODE_ICONS_VERSION = 'v12.17.0';
const VSCODE_ICONS_BASE_URL = `https://raw.githubusercontent.com/vscode-icons/vscode-icons/${VSCODE_ICONS_VERSION}/icons`;

type IconDefinition = {
  iconPath: string;
};

type IconLookupSection = {
  file?: string;
  folder?: string;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  languageIds?: Record<string, string>;
};

type VscodeIconsManifest = IconLookupSection & {
  iconDefinitions: Record<string, IconDefinition>;
  light: IconLookupSection;
};

type LanguageAssociations = {
  version: string;
  extensionToLanguageId: Record<string, string>;
  fileNameToLanguageId: Record<string, string>;
};

const manifest = vscodeIconsManifest as VscodeIconsManifest;
const languageAssociations = vscodeIconsLanguageAssociations as LanguageAssociations;
const iconDefinitions = manifest.iconDefinitions;

const darkFileNames = toLowercaseLookup(manifest.fileNames);
const lightFileNames = toLowercaseLookup(manifest.light.fileNames);
const darkFileExtensions = toLowercaseLookup(manifest.fileExtensions);
const lightFileExtensions = toLowercaseLookup(manifest.light.fileExtensions);
const darkFolderNames = toLowercaseLookup(manifest.folderNames);
const lightFolderNames = toLowercaseLookup(manifest.light.folderNames);
const darkLanguageIds = toLowercaseLookup(manifest.languageIds ?? {});
const lightLanguageIds = toLowercaseLookup(manifest.light.languageIds ?? {});
const languageIdByExtension = toLowercaseLookup(languageAssociations.extensionToLanguageId);
const languageIdByFileName = toLowercaseLookup(languageAssociations.fileNameToLanguageId);
const localLanguageIdByExtensionOverrides = {
  html: 'html',
  mdc: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
} as const;

const defaultDarkFileIconDefinition = manifest.file ?? '_file';
const defaultLightFileIconDefinition = manifest.light.file ?? defaultDarkFileIconDefinition;
const defaultDarkFolderIconDefinition = manifest.folder ?? '_folder';
const defaultLightFolderIconDefinition = manifest.light.folder ?? defaultDarkFolderIconDefinition;

function toLowercaseLookup(source: Record<string, string>): Record<string, string> {
  const lookup: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    lookup[key.toLowerCase()] = value;
  }

  return lookup;
}

export function basenameOfPath(pathValue: string): string {
  const slashIndex = pathValue.lastIndexOf('/');
  return slashIndex === -1 ? pathValue : pathValue.slice(slashIndex + 1);
}

function extensionCandidates(fileName: string): string[] {
  const candidates = new Set<string>();

  if (fileName.includes('.')) {
    candidates.add(fileName);
  }

  let dotIndex = fileName.indexOf('.');
  while (dotIndex !== -1 && dotIndex < fileName.length - 1) {
    const candidate = fileName.slice(dotIndex + 1);
    if (candidate.length > 0) {
      candidates.add(candidate);
    }
    dotIndex = fileName.indexOf('.', dotIndex + 1);
  }

  return [...candidates];
}

function resolveLanguageFallbackDefinition(
  pathValue: string,
  theme: 'light' | 'dark',
): string | null {
  const basename = basenameOfPath(pathValue).toLowerCase();
  const languageIds = theme === 'light' ? lightLanguageIds : darkLanguageIds;

  const basenameLanguageId = languageIdByFileName[basename];
  if (basenameLanguageId) {
    return languageIds[basenameLanguageId] ?? darkLanguageIds[basenameLanguageId] ?? null;
  }

  for (const candidate of extensionCandidates(basename)) {
    const languageId =
      localLanguageIdByExtensionOverrides[
        candidate as keyof typeof localLanguageIdByExtensionOverrides
      ] ?? languageIdByExtension[candidate];

    if (!languageId) {
      continue;
    }

    return languageIds[languageId] ?? darkLanguageIds[languageId] ?? null;
  }

  return null;
}

function iconFilenameForDefinitionKey(definitionKey: string | undefined): string | null {
  if (!definitionKey) {
    return null;
  }

  const iconPath = iconDefinitions[definitionKey]?.iconPath;
  if (!iconPath) {
    return null;
  }

  const slashIndex = iconPath.lastIndexOf('/');
  return slashIndex === -1 ? iconPath : iconPath.slice(slashIndex + 1);
}

function resolveFileDefinition(pathValue: string, theme: 'light' | 'dark'): string {
  const basename = basenameOfPath(pathValue).toLowerCase();
  const fileNames = theme === 'light' ? lightFileNames : darkFileNames;
  const fileExtensions = theme === 'light' ? lightFileExtensions : darkFileExtensions;

  const fileNameDefinition = fileNames[basename] ?? darkFileNames[basename];
  if (fileNameDefinition) {
    return fileNameDefinition;
  }

  for (const candidate of extensionCandidates(basename)) {
    const extensionDefinition = fileExtensions[candidate] ?? darkFileExtensions[candidate];
    if (extensionDefinition) {
      return extensionDefinition;
    }
  }

  const languageDefinition = resolveLanguageFallbackDefinition(pathValue, theme);
  if (languageDefinition) {
    return languageDefinition;
  }

  return theme === 'light' ? defaultLightFileIconDefinition : defaultDarkFileIconDefinition;
}

function resolveFolderDefinition(pathValue: string, theme: 'light' | 'dark'): string {
  const basename = basenameOfPath(pathValue).toLowerCase();
  const folderNames = theme === 'light' ? lightFolderNames : darkFolderNames;

  return (
    folderNames[basename] ??
    darkFolderNames[basename] ??
    (theme === 'light' ? defaultLightFolderIconDefinition : defaultDarkFolderIconDefinition)
  );
}

export function getVscodeIconUrlForEntry(
  pathValue: string,
  kind: 'file' | 'directory',
  theme: 'light' | 'dark',
): string {
  const definitionKey =
    kind === 'directory'
      ? resolveFolderDefinition(pathValue, theme)
      : resolveFileDefinition(pathValue, theme);
  const iconFilename =
    iconFilenameForDefinitionKey(definitionKey) ??
    (kind === 'directory' ? 'default_folder.svg' : 'default_file.svg');

  return `${VSCODE_ICONS_BASE_URL}/${iconFilename}`;
}
