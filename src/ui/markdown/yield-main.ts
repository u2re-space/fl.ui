/**
 * FIND:paint-yield
 * WHY: HEX/raw encode+DOM write of a whole image freezes Capacitor.
 * PERF: yield after each chunk so the first screen can paint.
 */

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

export const yieldToMain = (): Promise<void> =>
    new Promise((resolve) => {
        const ric = (
            globalThis as unknown as {
                requestIdleCallback?: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => number;
            }
        ).requestIdleCallback;
        if (typeof ric === "function") {
            ric(() => resolve(), { timeout: 24 });
            return;
        }
        globalThis.setTimeout(resolve, 0);
    });
