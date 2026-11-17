"use client";

import { useCallback, useEffect, useState } from "react";
import type { Db } from "@/lib/types";

export type AppState = Db & { ai: { configured: boolean; model: string; provider: "openai" | "demo" } };

const listeners = new Set<() => void>();

/** Ask every mounted page/sidebar to refetch (after a mutation). */
export function refreshAppState() {
  listeners.forEach((fn) => fn());
}

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    listeners.add(reload);
    window.addEventListener("focus", reload);
    return () => {
      listeners.delete(reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);

  return { state, error, reload };
}

export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}
