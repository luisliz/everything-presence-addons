import { useCallback } from 'react';
import { parseStoredViewport, type Viewport } from '../utils/fitViewport.ts';

export const viewportStorageKey = (roomId: string) => `zc:viewport:${roomId}`;

export const useViewportStorage = (roomId: string | null | undefined) => {
  const read = useCallback((): Viewport | null => {
    if (!roomId) return null;
    try {
      return parseStoredViewport(
        sessionStorage.getItem(viewportStorageKey(roomId)),
      );
    } catch {
      return null;
    }
  }, [roomId]);

  const write = useCallback(
    (viewport: Viewport) => {
      if (!roomId) return;
      try {
        sessionStorage.setItem(
          viewportStorageKey(roomId),
          JSON.stringify(viewport),
        );
      } catch {
        // Storage can be unavailable (private mode, quota); the viewport just is not remembered.
      }
    },
    [roomId],
  );

  const clear = useCallback(() => {
    if (!roomId) return;
    try {
      sessionStorage.removeItem(viewportStorageKey(roomId));
    } catch {
      // See write.
    }
  }, [roomId]);

  return { read, write, clear };
};
