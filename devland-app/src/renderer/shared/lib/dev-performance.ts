export type DevPerformanceCounters = {
  gitWatchEventsReceived: number;
  gitStatusFetchStarted: number;
  gitStatusFetchCompleted: number;
  gitDefaultBranchFetchStarted: number;
  gitDefaultBranchFetchCompleted: number;
  gitBranchesFetchStarted: number;
  gitBranchesFetchCompleted: number;
  diffRenderBuilds: number;
  diffSyntaxEffectRuns: number;
};

type DevPerformanceDiagnostics = {
  counters: DevPerformanceCounters;
  reset: () => void;
  snapshot: () => DevPerformanceCounters;
};

const createEmptyCounters = (): DevPerformanceCounters => ({
  gitWatchEventsReceived: 0,
  gitStatusFetchStarted: 0,
  gitStatusFetchCompleted: 0,
  gitDefaultBranchFetchStarted: 0,
  gitDefaultBranchFetchCompleted: 0,
  gitBranchesFetchStarted: 0,
  gitBranchesFetchCompleted: 0,
  diffRenderBuilds: 0,
  diffSyntaxEffectRuns: 0,
});

function getDiagnostics(): DevPerformanceDiagnostics | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!window.__DEVLAND_PERF_DIAGNOSTICS__) {
    const counters = createEmptyCounters();

    window.__DEVLAND_PERF_DIAGNOSTICS__ = {
      counters,
      reset: () => {
        const nextCounters = createEmptyCounters();
        Object.assign(counters, nextCounters);
      },
      snapshot: () => ({ ...counters }),
    };
  }

  return window.__DEVLAND_PERF_DIAGNOSTICS__;
}

export function incrementDevPerformanceCounter(counter: keyof DevPerformanceCounters): void {
  const diagnostics = getDiagnostics();

  if (!diagnostics) {
    return;
  }

  diagnostics.counters[counter] += 1;
}

export function resetDevPerformanceCounters(): void {
  getDiagnostics()?.reset();
}
