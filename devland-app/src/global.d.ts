import type { ElectronApi } from './ipc/contracts';
import type { DevPerformanceCounters } from './renderer/shared/lib/dev-performance';

declare global {
  interface Window {
    electronAPI: ElectronApi;
    __DEVLAND_PERF_DIAGNOSTICS__?: {
      counters: DevPerformanceCounters;
      reset: () => void;
      snapshot: () => DevPerformanceCounters;
    };
  }
}

export {};
