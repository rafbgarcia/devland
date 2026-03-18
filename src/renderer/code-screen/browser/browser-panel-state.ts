import { BLANK_PAGE_URL } from '@/renderer/code-screen/browser/browser-target-state';

export const shouldShowBrowserViewport = (input: {
  currentUrl: string;
  rememberedUrl: string;
}): boolean =>
  input.currentUrl !== BLANK_PAGE_URL || input.rememberedUrl.trim().length > 0;

export const shouldRestoreRememberedBrowserUrl = (input: {
  currentUrl: string;
  rememberedUrl: string;
}): boolean =>
  input.currentUrl === BLANK_PAGE_URL && input.rememberedUrl.trim().length > 0;

export const getBrowserAddressValue = (input: {
  currentUrl: string;
  rememberedUrl: string;
}): string =>
  input.currentUrl !== BLANK_PAGE_URL ? input.currentUrl : input.rememberedUrl;
