import { iconNames, type IconName } from 'lucide-react/dynamic';

export const DEFAULT_EXTENSION_ICON_NAME = 'puzzle';

const extensionIconNames = new Set<string>(iconNames);

export function isExtensionIconName(value: string): value is IconName {
  return extensionIconNames.has(value);
}

export function resolveExtensionIconName(value: string): IconName {
  return isExtensionIconName(value) ? value : DEFAULT_EXTENSION_ICON_NAME;
}
