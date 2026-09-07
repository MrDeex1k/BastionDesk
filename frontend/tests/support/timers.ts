const timeouts = new Set<ReturnType<typeof setTimeout>>();
const intervals = new Set<ReturnType<typeof setInterval>>();
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

// Install before application imports: dependencies can retain timer functions.
// Time still advances normally, including user-event and Testing Library waits.
export function trackTimers() {
  globalThis.setTimeout = Object.assign((...args: Parameters<typeof setTimeout>) => {
    const [callback, delay, ...values] = args;
    const timer = originalSetTimeout(() => {
      timeouts.delete(timer);
      callback(...values);
    }, delay);
    timeouts.add(timer);
    return timer;
  }, originalSetTimeout);
  globalThis.clearTimeout = (timer) => {
    timeouts.delete(timer as ReturnType<typeof setTimeout>);
    originalClearTimeout(timer as ReturnType<typeof setTimeout>);
  };
  globalThis.setInterval = Object.assign((...args: Parameters<typeof setInterval>) => {
    const timer = originalSetInterval(...args);
    intervals.add(timer);
    return timer;
  }, originalSetInterval);
  globalThis.clearInterval = (timer) => {
    intervals.delete(timer as ReturnType<typeof setInterval>);
    originalClearInterval(timer as ReturnType<typeof setInterval>);
  };
}

export function cancelPendingTimers() {
  for (const timer of timeouts) originalClearTimeout(timer);
  for (const timer of intervals) originalClearInterval(timer);
  timeouts.clear();
  intervals.clear();
}
