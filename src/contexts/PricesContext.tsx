// src/contexts/PricesContext.tsx
'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useBatchedPrices } from '@/lib/useBatchedPrices';

type Ctx = {
  priceMap: Map<string, number | null>;
  getPrice: (id?: string | null) => number | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

const PricesCtx = createContext<Ctx | null>(null);

type ProviderProps = {
  ids: string[] | Set<string> | undefined;
  children: React.ReactNode;
};

export function PricesProvider({ ids, children }: ProviderProps) {
  const normalized = useMemo(
    () =>
      Array.from(new Set([...(ids ?? [])]))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [ids]
  );

  const { map, loading, error, updatedAt } = useBatchedPrices(normalized);

  const ctx = useMemo<Ctx>(() => {
    const getPrice = (id?: string | null) => {
      if (!id) return null;
      const v = map.get(id.toLowerCase());
      return typeof v === 'number' ? v : null;
    };
    return { priceMap: map, getPrice, loading, error, updatedAt };
  }, [map, loading, error, updatedAt]);

  return <PricesCtx.Provider value={ctx}>{children}</PricesCtx.Provider>;
}

export function usePrices(): Ctx {
  const v = useContext(PricesCtx);
  if (!v) throw new Error('usePrices() must be used within <PricesProvider>');
  return v;
}

