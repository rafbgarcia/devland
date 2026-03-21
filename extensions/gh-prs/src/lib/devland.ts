import {
  createDevlandClient,
  GhPrsGetPullRequestFeedInputSchema,
  GhPrsHostMethods,
  ProjectPullRequestFeedSchema,
  type DevlandHostContext,
} from '@devlandapp/sdk';

const devland = createDevlandClient();

const electronApiBridge = {
  getProjectPullRequests: async (owner: string, name: string, skipCache?: boolean) =>
    await devland.invoke({
      method: GhPrsHostMethods.getPullRequestFeed,
      input: GhPrsGetPullRequestFeedInputSchema.parse({
        owner,
        name,
        skipCache,
      }),
      resultSchema: ProjectPullRequestFeedSchema,
    }),
};

let electronApiBridgeInstalled = false;

export const installElectronApiBridge = () => {
  if (electronApiBridgeInstalled) {
    return;
  }

  window.electronAPI = electronApiBridge as typeof window.electronAPI;
  electronApiBridgeInstalled = true;
};

export const getExtensionContext = async (): Promise<DevlandHostContext> =>
  await devland.getContext();
