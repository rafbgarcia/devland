declare global {
  interface Window {
    electronAPI: {
      getProjectIssues: (
        owner: string,
        name: string,
        skipCache?: boolean,
      ) => Promise<import('@devlandapp/sdk').ProjectIssueFeed>;
    };
  }
}

export {};
