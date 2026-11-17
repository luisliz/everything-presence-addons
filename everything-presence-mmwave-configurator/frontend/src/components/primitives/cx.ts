export const cx = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(' ');

/** Grows the hit area to 44 px on touch screens without changing the visual size (needs a positioned element). */
export const COARSE_HIT = {
  sm: "after:absolute after:content-[''] [@media(pointer:coarse)]:after:-inset-1.5",
  xs: "after:absolute after:content-[''] [@media(pointer:coarse)]:after:-inset-2.5",
} as const;
