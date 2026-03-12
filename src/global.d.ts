import type { ElectronApi } from './ipc/contracts';

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}

export {};
