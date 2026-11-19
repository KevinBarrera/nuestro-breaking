import { getFlaggedPayments } from '@/entities/flagged-payments';
import { useEffect, useState } from 'react';

// How many Mercado Pago payments of the event wait for review (#230), for the badge on Pagos
// por revisar. A failure or a denied request shows no badge; the screen itself reports errors.
export function useFlaggedPaymentsCount(eventId?: string) {
  const [count, setCount] = useState<{ eventId: string; value: number } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    getFlaggedPayments(eventId, controller.signal)
      .then(({ payments }) => {
        if (!controller.signal.aborted) setCount({ eventId, value: payments.length });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCount(null);
      });
    return () => controller.abort();
  }, [eventId]);

  return count && count.eventId === eventId ? count.value : 0;
}
