import { BLANK_PAGE_URL } from '@/renderer/code-screen/browser/browser-view-state';

const trimBrowserLabel = (value: string): string => value.trim();

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

export const getBrowserTabLabel = (input: {
  currentUrl: string;
  rememberedUrl: string;
  pageTitle: string;
  rememberedPageTitle: string;
}): string => {
  const liveTitle = trimBrowserLabel(input.pageTitle);

  if (liveTitle.length > 0) {
    return liveTitle;
  }

  const rememberedTitle = trimBrowserLabel(input.rememberedPageTitle);

  if (rememberedTitle.length > 0) {
    return rememberedTitle;
  }

  if (input.currentUrl !== BLANK_PAGE_URL) {
    return input.currentUrl;
  }

  const rememberedUrl = trimBrowserLabel(input.rememberedUrl);

  return rememberedUrl.length > 0 ? rememberedUrl : 'New Tab';
};
