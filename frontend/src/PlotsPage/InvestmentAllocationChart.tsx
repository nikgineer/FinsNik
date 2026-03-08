import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import config from "../config";
import { IndianFormatter } from "../config/types";
import { buildAuthHeaders } from "../utils/auth";

type ChartStatus = "idle" | "loading" | "ready" | "empty" | "error";

type Allocation = {
  name: string;
  value: number;
};

type AllocationRow = Allocation & {
  percent: number;
};

interface InvestmentAllocationProps {
  onReady?: () => void;
}

const CACHE_KEY = "investmentAllocation:v2";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const getCached = <T,>(key: string, ttl: number): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts =
      typeof parsed?.ts === "number" ? parsed.ts : Number(parsed?.ts ?? 0);
    if (!ts || Date.now() - ts > ttl) return null;
    return (parsed?.data ?? parsed) as T;
  } catch {
    return null;
  }
};

const setCache = (key: string, data: unknown) => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), data, schema: "v2" }),
    );
  } catch {
    /* no-op */
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normaliseRows = (payload: unknown): AllocationRow[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const rows: AllocationRow[] = [];
  const items = Array.isArray(payload)
    ? payload
    : (payload as { data?: unknown[] }).data;
  if (!Array.isArray(items)) {
    return [];
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawName = record.name ?? record.category ?? record.label;
    const rawValue = record.value ?? record.amount;

    const name =
      typeof rawName === "string" && rawName.trim().length > 0
        ? rawName.trim()
        : "Unknown";
    const value = isFiniteNumber(rawValue) ? rawValue : Number(rawValue) || 0;
    if (value <= 0) continue;

    rows.push({ name, value, percent: 0 });
  }

  if (rows.length === 0) {
    return [];
  }

  rows.sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return rows.map((row) => ({ ...row, percent: 0 }));
  }

  return rows.map((row) => ({
    ...row,
    percent: (row.value / total) * 100,
  }));
};

const buildPalette = (count: number): string[] => {
  if (count <= 0) return [];
  const colours: string[] = [];
  const goldenAngle = 137.508;
  for (let index = 0; index < count; index += 1) {
    const hue = (index * goldenAngle) % 360;
    colours.push(`hsl(${hue}, 72%, 52%)`);
  }
  return colours;
};

const lightenHsl = (color: string, delta = 12): string => {
  const match = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(
    color,
  );
  if (!match) return color;
  const [, h, s, l] = match;
  const lightness = Math.min(parseFloat(l) + delta, 96);
  return `hsl(${parseFloat(h)}, ${parseFloat(s)}%, ${lightness}%)`;
};

export default function InvestmentAllocationChart({
  onReady,
}: InvestmentAllocationProps): React.JSX.Element {
  const [status, setStatus] = useState<ChartStatus>("idle");
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const startedRef = useRef(false);
  const hasSignalledRef = useRef(false);

  useEffect(() => {
    if (hasSignalledRef.current) {
      return;
    }
    if (status === "ready" || status === "empty" || status === "error") {
      hasSignalledRef.current = true;
      onReady?.();
    }
  }, [status, onReady]);

  const applyRows = useCallback((payload: unknown) => {
    const cleaned = normaliseRows(payload);
    if (cleaned.length === 0) {
      setRows([]);
      setStatus("empty");
      return false;
    }
    setRows(cleaned);
    setStatus("ready");
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      hasSignalledRef.current = false;
      setStatus("loading");
      try {
        const response = await fetch(
          `${config.backendUrl}/investment/allocation`,
          {
            headers: buildAuthHeaders(),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const json = await response.json();
        if (cancelled) return;

        if (applyRows(json)) {
          setCache(CACHE_KEY, json);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load investment allocation", error);
        setRows([]);
        setStatus("error");
      }
    };

    if (!startedRef.current) {
      startedRef.current = true;

      const cached = getCached<unknown>(CACHE_KEY, CACHE_TTL);
      if (!cached || !applyRows(cached)) {
        load();
      }
    }

    return () => {
      cancelled = true;
      controller.abort();
      startedRef.current = false;
    };
  }, [applyRows]);

  const palette = useMemo(() => buildPalette(rows.length), [rows.length]);

  const statusBadge = (() => {
    if (status === "loading") {
      return <span className="app-badge app-badge--pulse">Loading…</span>;
    }
    if (status === "error") {
      return <span className="app-badge app-badge--warn">Failed to load</span>;
    }
    return null;
  })();

  return (
    <div className="glass-panel w-full min-w-0 rounded-3xl p-4 sm:p-6">
      <div className="plot-header">
        <h2 className="plot-heading plot-heading--section">
          Investment Allocation
        </h2>
        {statusBadge && <div className="plot-header__aside">{statusBadge}</div>}
      </div>

      {status === "error" && (
        <p className="text-center text-sm text-red-500">
          We couldn't load your investment allocation. Please refresh to try
          again.
        </p>
      )}

      {status === "empty" && (
        <p className="text-center text-sm text-slate-500">
          No investment holdings available to display.
        </p>
      )}

      {status === "ready" && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const color = palette[index % palette.length];
            return (
              <motion.div
                key={row.name}
                className="glass-chip flex flex-col gap-1 rounded-2xl px-3 py-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.35 }}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 flex-none rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-medium text-slate-800 text-fade-end dark:text-slate-100">
                      {row.name}
                    </span>
                  </div>
                  <div className="text-right text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {row.percent.toFixed(1)}%
                  </div>
                </div>
                <div className="flex items-end justify-between gap-1 text-slate-600 dark:text-slate-300">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(row.percent, 1), 100)}%`,
                        background: `linear-gradient(90deg, ${color}, ${lightenHsl(color)})`,
                      }}
                    />
                  </div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {IndianFormatter(row.value)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {(status === "idle" || status === "loading") && rows.length === 0 && (
        <div className="h-[180px] w-full animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/50" />
      )}
    </div>
  );
}
