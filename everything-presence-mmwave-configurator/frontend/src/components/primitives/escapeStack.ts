export type EscapeEntry = { current: () => void };

const stack: EscapeEntry[] = [];

/** Registers an open layer's Escape handler above every layer opened before it; returns the release. */
export const pushEscape = (entry: EscapeEntry): (() => void) => {
  stack.push(entry);
  return () => {
    const index = stack.lastIndexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  };
};

/** Runs the topmost layer's handler only; false when no layer is open. */
export const runTopEscape = (): boolean => {
  const top = stack.at(-1);
  top?.current();
  return top !== undefined;
};
