export type CoalescedTaskRunner = {
  run: (task: () => Promise<void>) => Promise<void>;
};

export function createCoalescedTaskRunner(): CoalescedTaskRunner {
  let inFlight: Promise<void> | null = null;
  let hasQueuedRun = false;

  return {
    run(task) {
      if (inFlight) {
        hasQueuedRun = true;
        return inFlight;
      }

      const nextRun = (async () => {
        do {
          hasQueuedRun = false;
          await task();
        } while (hasQueuedRun);
      })().finally(() => {
        inFlight = null;
      });

      inFlight = nextRun;

      return nextRun;
    },
  };
}
