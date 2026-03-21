import {
  createDevlandClient,
  GhIssuesGetIssueFeedInputSchema,
  GhIssuesHostMethods,
  ProjectIssueFeedSchema,
  type DevlandHostContext,
} from '@devlandapp/sdk';

const devland = createDevlandClient();

const electronApiBridge = {
  getProjectIssues: async (owner: string, name: string, skipCache?: boolean) =>
    await devland.invoke({
      method: GhIssuesHostMethods.getIssueFeed,
      input: GhIssuesGetIssueFeedInputSchema.parse({
        owner,
        name,
        skipCache,
      }),
      resultSchema: ProjectIssueFeedSchema,
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
