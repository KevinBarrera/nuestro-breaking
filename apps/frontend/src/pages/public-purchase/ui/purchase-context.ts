import type { PublicCatalog } from '@/entities/public-event';
import type { BuyerForm, PurchaseSelection } from '@/features/public-purchase';
import { createContext, useContext } from 'react';

// The purchase in progress for one event: its catalog (loaded once per slug) and the draft.
export type PurchaseState = {
  slug: string;
  catalog: PublicCatalog;
  selection: PurchaseSelection;
  buyer: BuyerForm;
  togglePass: (passId: string) => void;
  setSelection: (selection: PurchaseSelection) => void;
  setBuyer: (buyer: BuyerForm) => void;
};

export const PurchaseContext = createContext<PurchaseState | null>(null);

export function usePurchase(): PurchaseState {
  const purchase = useContext(PurchaseContext);
  if (!purchase) throw new Error('usePurchase needs a PurchaseProvider');
  return purchase;
}
