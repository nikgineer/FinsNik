import { useEffect, useMemo, useRef, useState } from "react";
import config from "../config";
import { IndianFormatter } from "../config/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { buildAuthHeaders } from "../utils/auth";

type CashCategoryCurrencyData = {
  category: string;
  currency: string;
  label: string;
  value: number;
  percent: number;
};

type ChartStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface Props {
  onReady?: () => void;
}

const CACHE_KEY = "cashCategoryCurrency:v2";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const coerceNumber = (value: unknown): number => {
  if (isFiniteNumber(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data;
    }
    if (Array.isArray(record.result)) {
      return record.result;
    }
  }

  return [];
};

const normaliseDataset = (payload: unknown): CashCategoryCurrencyData[] => {
  const rows = extractArray(payload);
  if (rows.length === 0) {
    return [];
  }

  const cleaned = rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const record = row as Record<string, unknown>;
      const categoryRaw = record.category;
      const currencyRaw = record.currency;
      const labelRaw = record.label;
      const valueRaw = "value" in record ? record.value : record.amount;
      const percentRaw = record.percent;

      const category =
        typeof categoryRaw === "string" && categoryRaw.trim().length > 0
          ? categoryRaw.trim()
          : "Unknown";

      const currency =
        typeof currencyRaw === "string" && currencyRaw.trim().length > 0
          ? currencyRaw.trim().toUpperCase()
          : "INR";

      const value = coerceNumber(valueRaw);
      if (value <= 0) {
        return null;
      }

      const fallbackLabel = `${category} - ${currency}`;
      const label =
        typeof labelRaw === "string" && labelRaw.trim().length > 0
          ? labelRaw.trim()
          : fallbackLabel;

      const percent = Math.max(coerceNumber(percentRaw), 0);

      return { category, currency, label, value, percent };
    })
    .filter((row): row is CashCategoryCurrencyData => row !== null);

  if (cleaned.length === 0) {
    return [];
  }

  const total = cleaned.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return cleaned.map((item) => ({ ...item, percent: 0 }));
  }

  return cleaned.map((item) => ({
    ...item,
    percent: item.percent > 0 ? item.percent : (item.value / total) * 100,
  }));
};

const readCache = (): CashCategoryCurrencyData[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    const ts = coerceNumber(parsed.ts);
    if (!ts || Date.now() - ts > CACHE_TTL) {
      return null;
    }

    const dataset = normaliseDataset(parsed.data ?? parsed);
    return dataset.length > 0 ? dataset : null;
  } catch (error) {
    console.warn("Failed to read cached cash category currency data", error);
    return null;
  }
};

const writeCache = (data: CashCategoryCurrencyData[]): void => {
  try {
    const payload = {
      ts: Date.now(),
      data,
      schema: "v2",
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to cache cash category currency data", error);
  }
};

const normaliseRates = (input: unknown): Record<string, number> => {
  if (!input || typeof input !== "object") {
    return { INR: 1 };
  }

  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;

    const numericValue = coerceNumber(value);
    if (numericValue <= 0) continue;

    rates[trimmedKey.toUpperCase()] = numericValue;
  }

  if (!rates.INR) {
    rates.INR = 1;
  }

  return rates;
};

const convertToINR = (
  amount: unknown,
  currencyRaw: unknown,
  rates: Record<string, number>,
): number => {
  const value = coerceNumber(amount);
  if (value <= 0) {
    return 0;
  }

  const currency =
    typeof currencyRaw === "string" && currencyRaw.trim().length > 0
      ? currencyRaw.trim().toUpperCase()
      : "INR";

  if (currency === "INR") {
    return value;
  }

  const rate = rates[currency] ?? rates[currency.toLowerCase()];
  if (!rate || rate <= 0) {
    return 0;
  }

  return value / rate;
};

type PortfolioSummary = {
  id: string;
  category?: string;
  currency?: string;
};

type HomeResponse = {
  portfolios?: PortfolioSummary[];
};

type NetworthResponse = {
  cashholdings?: Record<string, unknown>;
};

const buildDatasetFromStructures = (
  portfolios: PortfolioSummary[] | undefined,
  holdings: Record<string, unknown> | undefined,
  rates: Record<string, number>,
): CashCategoryCurrencyData[] => {
  if (!holdings || Object.keys(holdings).length === 0) {
    return [];
  }

  const portfolioMap = new Map<string, PortfolioSummary>();
  portfolios?.forEach((portfolio) => {
    if (!portfolio?.id) return;
    portfolioMap.set(portfolio.id, portfolio);
  });

  const grouped = new Map<
    string,
    { category: string; currency: string; value: number }
  >();

  for (const [portfolioId, rawAmount] of Object.entries(holdings)) {
    const info = portfolioMap.get(portfolioId);
    const category = info?.category?.trim() || "Others";
    const currency = info?.currency?.trim() || "INR";

    const value = convertToINR(rawAmount, currency, rates);
    if (value <= 0) continue;

    const upperCurrency =
      currency.trim().length > 0 ? currency.trim().toUpperCase() : "INR";
    const key = `${category}|${upperCurrency}`;

    const current = grouped.get(key);
    if (current) {
      current.value += value;
    } else {
      grouped.set(key, { category, currency: upperCurrency, value });
    }
  }

  if (grouped.size === 0) {
    return [];
  }

  let total = 0;
  for (const entry of grouped.values()) {
    total += entry.value;
  }

  if (total <= 0) {
    return [];
  }

  const result: CashCategoryCurrencyData[] = [];
  for (const entry of grouped.values()) {
    const percent = (entry.value / total) * 100;
    result.push({
      category: entry.category,
      currency: entry.currency,
      label: `${entry.category} - ${entry.currency}`,
      value: entry.value,
      percent,
    });
  }

  result.sort((a, b) => b.value - a.value);
  return result;
};

const fetchFallbackDataset = async (
  signal: AbortSignal,
): Promise<CashCategoryCurrencyData[]> => {
  try {
    const [homeResponse, networthResponse, ratesResponse] = await Promise.all([
      fetch(`${config.backendUrl}/home`, {
        headers: buildAuthHeaders(),
        signal,
      }).then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              new Error(`Home request failed with status ${res.status}`),
            ),
      ),
      fetch(`${config.backendUrl}/networth`, {
        headers: buildAuthHeaders(),
        signal,
      }).then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              new Error(`Networth request failed with status ${res.status}`),
            ),
      ),
      fetch(`${config.backendUrl}/rates`, {
        headers: buildAuthHeaders(),
        signal,
      }).then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              new Error(`Rates request failed with status ${res.status}`),
            ),
      ),
    ]);

    const portfolios = (homeResponse as HomeResponse)?.portfolios;
    const holdings = (networthResponse as NetworthResponse)?.cashholdings;
    const rates = normaliseRates(ratesResponse);

    return buildDatasetFromStructures(portfolios, holdings, rates);
  } catch (error) {
    console.error(
      "Failed to build fallback cash category currency dataset",
      error,
    );
    return [];
  }
};

const buildPalette = (count: number): string[] => {
  if (count <= 0) return [];
  const colours: string[] = [];
  const goldenAngle = 137.508;
  for (let index = 0; index < count; index += 1) {
    const hue = (index * goldenAngle) % 360;
    colours.push(`hsl(${hue}, 68%, 52%)`);
  }
  return colours;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = coerceNumber(payload[0]?.value);
  return (
    <div className="glass-menu rounded-2xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100">
      <p className="font-semibold">{label}</p>
      <p>{IndianFormatter(value)}</p>
    </div>
  );
};

export default function CashCategoryCurrencyChart({ onReady }: Props) {
  const [status, setStatus] = useState<ChartStatus>("idle");
  const [dataset, setDataset] = useState<CashCategoryCurrencyData[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      hasSignalledRef.current = false;
      setStatus("loading");
      try {
        const response = await fetch(
          `${config.backendUrl}/cash/category-currency`,
          {
            headers: buildAuthHeaders(),
            signal: controller.signal,
          },
        );

        let cleaned: CashCategoryCurrencyData[] | null = null;
        if (response.ok) {
          const json = await response.json();
          if (cancelled) return;
          cleaned = normaliseDataset(json);
        } else if (response.status === 404) {
          cleaned = await fetchFallbackDataset(controller.signal);
        } else {
          throw new Error(`Request failed with status ${response.status}`);
        }

        if (cancelled) return;

        if (!cleaned || cleaned.length === 0) {
          const fallback = await fetchFallbackDataset(controller.signal);
          if (cancelled) return;
          cleaned = fallback;
        }

        if (!cleaned || cleaned.length === 0) {
          setDataset([]);
          setStatus("empty");
          return;
        }

        setDataset(cleaned);
        setStatus("ready");
        writeCache(cleaned);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load cash category currency data", error);
        setDataset([]);
        setStatus("error");
      }
    };

    if (!startedRef.current) {
      startedRef.current = true;

      const cached = readCache();
      if (cached) {
        setDataset(cached);
        setStatus("ready");
      } else {
        load();
      }
    }

    return () => {
      cancelled = true;
      controller.abort();
      startedRef.current = false;
    };
  }, []);

  const palette = useMemo(() => buildPalette(dataset.length), [dataset.length]);

  const legendItems = useMemo(
    () =>
      dataset.map((item, index) => ({
        ...item,
        color: palette[index % palette.length],
      })),
    [dataset, palette],
  );

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
    <div className="glass-panel w-full min-w-0 rounded-3xl p-1 sm:p-6">
      <div className="plot-header">
        <h2 className="plot-heading plot-heading--section">
          Cash Distribution
        </h2>
        {statusBadge && <div className="plot-header__aside">{statusBadge}</div>}
      </div>

      {status === "error" && (
        <p className="text-center text-sm text-red-500">
          We couldn&apos;t load the cash distribution. Please refresh the page
          to try again.
        </p>
      )}

      {status === "empty" && (
        <p className="text-center text-sm text-slate-500">
          No cash holdings available to plot.
        </p>
      )}

      {status === "ready" && dataset.length > 0 && (
        <div className="flex flex-col gap-1 lg:flex-row lg:items-center">
          <div className="h-[240px] w-full min-w-0 lg:flex-1 lg:min-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataset}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={90}
                >
                  {dataset.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={palette[index % palette.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-1 sm:grid-cols-2">
            {legendItems.map((item) => (
              <div
                key={item.label}
                className="glass-chip flex items-center justify-between gap-2 px-3 py-1 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 flex-none rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {item.label}
                  </span>
                </div>
                <div className="text-right text-slate-600 dark:text-slate-300">
                  <div>{IndianFormatter(item.value)}</div>
                  <div className="text-[11px] uppercase tracking-wide">
                    {item.percent.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(status === "idle" || status === "loading") && dataset.length === 0 && (
        <div className="h-[200px] w-full animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/50" />
      )}
    </div>
  );
}
