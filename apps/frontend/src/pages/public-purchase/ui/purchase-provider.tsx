import type { PublicCatalog } from '@/entities/public-event';
import {
  normalizeSelection,
  togglePass,
  type BuyerForm,
  type PurchaseDraft,
  type PurchaseSelection,
} from '@/features/public-purchase';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStoredDraft, sessionDraftStorage, storeDraft } from './draft-storage';
import { PurchaseContext, type PurchaseState } from './purchase-context';

type PurchaseProviderProps = { slug: string; catalog: PublicCatalog; children: ReactNode };

// Restores the saved draft against the fresh catalog (dropping what it no longer allows) and
// saves every change, so a refresh keeps the purchase (D2).
export function PurchaseProvider({ slug, catalog, children }: PurchaseProviderProps) {
  const [draft, setDraft] = useState<PurchaseDraft>(() => {
    const stored = readStoredDraft(sessionDraftStorage(), slug);
    return { ...stored, selection: normalizeSelection(catalog.passes, stored.selection) };
  });

  useEffect(() => {
    storeDraft(sessionDraftStorage(), slug, draft);
  }, [slug, draft]);

  const value = useMemo<PurchaseState>(
    () => ({
      slug,
      catalog,
      selection: draft.selection,
      buyer: draft.buyer,
      togglePass: (passId) =>
        setDraft((current) => ({
          ...current,
          selection: togglePass(catalog.passes, current.selection, passId),
        })),
      setSelection: (selection: PurchaseSelection) =>
        setDraft((current) => ({
          ...current,
          selection: normalizeSelection(catalog.passes, selection),
        })),
      setBuyer: (buyer: BuyerForm) => setDraft((current) => ({ ...current, buyer })),
    }),
    [slug, catalog, draft],
  );

  return <PurchaseContext value={value}>{children}</PurchaseContext>;
}
