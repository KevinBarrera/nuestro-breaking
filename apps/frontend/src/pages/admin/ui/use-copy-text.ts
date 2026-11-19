import { useState } from 'react';

// Copying the event's public address (Resumen, Datos del evento). The outcome is announced, and a
// failure (no clipboard access) says what to do instead.
export type CopyState = 'idle' | 'copied' | 'failed';

export function useCopyText() {
  const [state, setState] = useState<CopyState>('idle');

  async function copy(text: string) {
    setState('idle');
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return { state, copy };
}
