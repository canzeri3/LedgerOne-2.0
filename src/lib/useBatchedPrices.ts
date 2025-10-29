// src/lib/useBatchedPrices.ts
'use client';
import useSWR from 'swr';

export type BatchedPrices = {
  map: Map<string, number | null>;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useBatchedPrices(ids: string[] | Set<string> | undefined): BatchedPrices {
  const unique = Array.from(new Set([...(ids ?? [])]))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const key = unique.length ? `/api/price-live?ids=${encodeURIComponent(unique.join(','))}` : null;

  const { data, error, isLoading } = useSWR<any>(key, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    dedupingInterval: 5_000,
    keepPreviousData: true,
  });

  const map = new Map<string, number | null>();
  if (Array.isArray(data?.rows)) {
    for (const row of data.rows) map.set(String(row.id), row.price ?? null);
  }

  return {
    map,
    loading: !!key && (isLoading && !data),
    error: error ? String(error.message || error) : null,
    updatedAt: Number.isFinite(Number(data?.updatedAt)) ? Number(data.updatedAt) : null,
  };
}

