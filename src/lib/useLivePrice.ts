// src/lib/useLivePrice.ts
'use client';
import { useBatchedPrices } from './useBatchedPrices';

export function useLivePrice(id?: string | null) {
  const ids = id ? [id] : [];
  const { map, loading, error, updatedAt } = useBatchedPrices(ids);
  return {
    price: id ? (map.get(id.toLowerCase()) ?? null) : null,
    loading,
    error,
    updatedAt,
  };
}

