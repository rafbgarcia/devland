declare global {
  interface Window {
    electronAPI: {
      getProjectPullRequests: (
        owner: string,
        name: string,
        skipCache?: boolean,
      ) => Promise<import('@devlandapp/sdk').ProjectPullRequestFeed>;
    };
  }
}

export {};
