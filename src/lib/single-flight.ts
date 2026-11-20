/** Share work only while it is running; failures and results are never retained. */
export function singleFlight<A extends unknown[], R>(
  key: (...args: A) => string,
  work: (...args: A) => Promise<R>,
) {
  const pending = new Map<string, Promise<R>>();
  return (...args: A): Promise<R> => {
    const id = key(...args);
    const existing = pending.get(id);
    if (existing) return existing;
    const result = Promise.resolve().then(() => work(...args)).finally(() => pending.delete(id));
    pending.set(id, result);
    return result;
  };
}
