import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ApiStore } from "../services/api";
import type { User } from "../types";

/**
 * The single source of truth for "which store am I looking at".
 *
 * `ALL` is a UI-level sentinel, never a database id — the backend expands it
 * into every store the caller is permitted to see. Everything else is a real
 * Store `_id`, which is what every store-aware query filters on.
 */
export const ALL_STORES = "ALL";

export type SelectedStoreId = typeof ALL_STORES | string;

export interface StoreSelection {
  selectedStoreId: SelectedStoreId;
  selectedStoreName: string;
  isAllStores: boolean;
  stores: ApiStore[];
  /** Admins may switch stores; everyone else is pinned to their assignment. */
  canSwitchStore: boolean;
  selectStore: (store: { id: string; name: string }) => void;
}

const STORE_KEY = "quality-mobiles-current-store";

const StoreSelectionContext = createContext<StoreSelection | null>(null);

function readPersistedStore(): { id: string; name: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "");
    if (raw && typeof raw === "object" && raw.id) {
      // Older builds persisted the literal id "all"; normalise it.
      const id = String(raw.id).toLowerCase() === "all" ? ALL_STORES : String(raw.id);
      return { id, name: raw.name || "All Stores" };
    }
  } catch {
    // Corrupt or absent — fall through to the consolidated view.
  }
  return { id: ALL_STORES, name: "All Stores" };
}

export const StoreSelectionProvider: React.FC<{
  user: User;
  stores: ApiStore[];
  children: React.ReactNode;
}> = ({ user, stores, children }) => {
  const canSwitchStore = user.role === "Admin";
  const [selection, setSelection] = useState(readPersistedStore);

  const selectStore = useCallback((store: { id: string; name: string }) => {
    const id = !store.id || String(store.id).toLowerCase() === "all" ? ALL_STORES : String(store.id);
    const next = { id, name: id === ALL_STORES ? "All Stores" : store.name };
    setSelection(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }, []);

  // A non-admin can only ever see their own store, and a persisted selection may
  // point at a store that has since been renamed or deactivated. Reconcile both
  // against the live store list so the id we send is always one that exists.
  useEffect(() => {
    if (!canSwitchStore) {
      const assigned = stores.find((store) => String(store.id) === String(user.assignedStoreId));
      if (assigned && assigned.id !== selection.id) selectStore(assigned);
      return;
    }
    if (selection.id === ALL_STORES || stores.length === 0) return;

    const match = stores.find((store) => String(store.id) === selection.id);
    if (!match) selectStore({ id: ALL_STORES, name: "All Stores" });
    else if (match.name !== selection.name) selectStore(match);
  }, [canSwitchStore, selectStore, selection.id, selection.name, stores, user.assignedStoreId]);

  const value = useMemo<StoreSelection>(() => ({
    selectedStoreId: selection.id,
    selectedStoreName: selection.name,
    isAllStores: selection.id === ALL_STORES,
    stores,
    canSwitchStore,
    selectStore,
  }), [canSwitchStore, selectStore, selection.id, selection.name, stores]);

  return <StoreSelectionContext.Provider value={value}>{children}</StoreSelectionContext.Provider>;
};

export function useStoreSelection(): StoreSelection {
  const context = useContext(StoreSelectionContext);
  if (!context) throw new Error("useStoreSelection must be used inside a StoreSelectionProvider");
  return context;
}
