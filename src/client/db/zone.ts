// Dexie keeps its ambient transaction across native `await`s only for a shallow chain of async functions: an async
// helper that awaits another async helper that awaits Dexie lets the IndexedDB transaction auto-commit ("Transaction
// committed too early"). Every async function that may run inside a transaction is therefore wrapped with `dx`, which
// returns a Dexie.Promise: awaiting it re-enters the transaction zone, so helpers can call each other freely.
import Dexie from "dexie";

export function inZone<T>(body: () => Promise<T>): Promise<T> {
  return new Dexie.Promise<T>((resolve, reject) => {
    try {
      body().then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }) as unknown as Promise<T>;
}

export function dx<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => inZone(() => fn(...args));
}
