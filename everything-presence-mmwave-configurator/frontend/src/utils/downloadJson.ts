/** `2026-11-17T08:05:09.123Z` -> `2026-11-17_080509`, for export file names. */
export const fileTimestamp = (date: Date = new Date()): string =>
  date
    .toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '')
    .slice(0, 17);

export const fileSafeName = (value: string): string =>
  value.replace(/[^a-z0-9]/gi, '_').toLowerCase();

export const downloadJson = (filename: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

/** Opens the browser file picker for one JSON file and resolves with its parsed content, or null when cancelled. */
export const pickJsonFile = (): Promise<unknown | null> =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('cancel', () => resolve(null));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(JSON.parse(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
