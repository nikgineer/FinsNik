import { useEffect, useMemo, useState } from "react";
import config from "../config";
import { IndianFormatter } from "../config/types";
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { buildAuthHeaders } from "../utils/auth";

const getCached = <T,>(key: string, ttl: number): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ttl) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
};

const setCache = (key: string, data: unknown) => {
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
};

interface CategoryData {
  category: string;
  value: number;
  percent: number;
}

interface CategoryAllocationResponse {
  networth: CategoryData[];
  assets: CategoryData[];
}

interface Props {
  onReady?: () => void;
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

type ViewMode = "networth" | "assets";

const isCategoryDataArray = (value: unknown): value is CategoryData[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      "category" in item &&
      "value" in item &&
      "percent" in item &&
      typeof (item as CategoryData).category === "string" &&
      typeof (item as CategoryData).value === "number" &&
      typeof (item as CategoryData).percent === "number",
  );

const sanitizeSeries = (series: CategoryData[]): CategoryData[] =>
  series
    .filter((item) => item.value > 0)
    .map((item) => ({
      category: item.category,
      value: item.value,
      percent: item.percent,
    }))
    .sort((a, b) => b.value - a.value);

const sanitizeResponse = (
  value: CategoryAllocationResponse,
): CategoryAllocationResponse => ({
  networth: sanitizeSeries(value.networth ?? []),
  assets: sanitizeSeries(value.assets ?? []),
});

const isEmergencyCategoryName = (name: string): boolean =>
  name.toLowerCase().includes("emergency fund");

const deriveAssetSeries = (series: CategoryData[]): CategoryData[] =>
  sanitizeSeries(
    series.filter((item) => !isEmergencyCategoryName(item.category)),
  );

const normalizeCategoryPayload = (
  payload: unknown,
): CategoryAllocationResponse | null => {
  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    const networth = candidate.networth ?? candidate.netWorth;
    const assets = candidate.assets ?? candidate.asset;

    if (isCategoryDataArray(networth) && isCategoryDataArray(assets)) {
      return sanitizeResponse({
        networth,
        assets,
      });
    }

    if (isCategoryDataArray(networth)) {
      const sanitizedNetworth = sanitizeSeries(networth);
      return {
        networth: sanitizedNetworth,
        assets: deriveAssetSeries(sanitizedNetworth),
      };
    }

    if (isCategoryDataArray(assets)) {
      const sanitizedAssets = sanitizeSeries(assets);
      return {
        networth: sanitizedAssets,
        assets: sanitizedAssets,
      };
    }
  }

  if (isCategoryDataArray(payload)) {
    const sanitizedNetworth = sanitizeSeries(payload);
    return {
      networth: sanitizedNetworth,
      assets: deriveAssetSeries(sanitizedNetworth),
    };
  }

  return null;
};

export default function CategoryAllocationChart({
  onReady,
}: Props): React.JSX.Element {
  const [allocation, setAllocation] =
    useState<CategoryAllocationResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("networth");

  useEffect(() => {
    const cacheKey = "categoryAllocation:v2";
    const cached = getCached<unknown>(cacheKey, 900000);
    const normalizedCache = cached ? normalizeCategoryPayload(cached) : null;
    if (normalizedCache) {
      setAllocation(normalizedCache);
      onReady?.();
      return;
    }

    let cancelled = false;

    const fetchData = async (): Promise<void> => {
      try {
        const res = await fetch(`${config.backendUrl}/investment/category`, {
          headers: buildAuthHeaders(),
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const categoryJson: unknown = await res.json();
        const normalized = normalizeCategoryPayload(categoryJson);
        if (!normalized) {
          if (!cancelled) {
            setAllocation({ networth: [], assets: [] });
          }
          return;
        }

        if (!cancelled) {
          setAllocation(normalized);
          setCache(cacheKey, normalized);
        }
      } catch (err) {
        console.error("Failed to load category data", err);
        if (!cancelled) {
          setAllocation({ networth: [], assets: [] });
        }
      } finally {
        if (!cancelled) {
          onReady?.();
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [onReady]);

  useEffect(() => {
    if (!allocation) {
      return;
    }

    if (allocation.networth.length === 0 && allocation.assets.length > 0) {
      setViewMode("assets");
    } else if (
      allocation.assets.length === 0 &&
      allocation.networth.length > 0
    ) {
      setViewMode("networth");
    }
  }, [allocation]);

  const dataset = useMemo(() => {
    if (!allocation) {
      return [] as CategoryData[];
    }
    return viewMode === "assets" ? allocation.assets : allocation.networth;
  }, [allocation, viewMode]);

  const generateColor = (index: number, total: number): string => {
    const hue = total === 0 ? 0 : (index * 360) / total;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps): React.ReactNode => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip glass-menu rounded-2xl p-2 text-sm">
          <p className="label font-semibold">{label}</p>
          <p>{IndianFormatter(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  const toggleButtonBase =
    "rounded-full px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-slate-600";
  const activeButtonClasses =
    "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:shadow-none";
  const inactiveButtonClasses =
    "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/60";

  const headerTitle =
    viewMode === "assets" ? "By Category · Assets" : "By Category · Net Worth";

  let content: React.ReactNode;
  if (!allocation) {
    content = (
      <p className="text-center text-gray-500">Loading category allocation…</p>
    );
  } else if (dataset.length === 0) {
    content = <p className="text-center text-gray-500">No data to display.</p>;
  } else {
    content = (
      <div className="flex flex-col lg:flex-row lg:items-center">
        <div className="h-[250px] w-full min-w-0 lg:flex-1 lg:min-w-[220px]">
          <ResponsiveContainer width="100%" height="100%" minHeight={250}>
            <PieChart>
              <Pie
                data={dataset}
                dataKey="value"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={90}
              >
                {dataset.map((_, index) => (
                  <Cell
                    key={index}
                    fill={generateColor(index, dataset.length)}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-1 sm:grid-cols-2">
          {dataset.map((item, index) => (
            <div
              key={item.category}
              className="glass-chip flex items-center justify-between gap-2 px-3 py-1 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                  style={{
                    backgroundColor: generateColor(index, dataset.length),
                  }}
                />
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {item.category}
                </span>
              </div>
              <div className="text-right text-slate-600 dark:text-slate-300">
                <div>{IndianFormatter(item.value)}</div>
                <div className="text-[10px] uppercase tracking-wide">
                  {item.percent.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel w-full min-w-0 rounded-3xl p-4 sm:p-6">
      <div className="plot-header">
        <h2 className="plot-heading plot-heading--section">{headerTitle}</h2>
        <div className="plot-header__aside">
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800/70">
            <button
              type="button"
              className={`${toggleButtonBase} ${
                viewMode === "networth"
                  ? activeButtonClasses
                  : inactiveButtonClasses
              }`}
              onClick={() => setViewMode("networth")}
            >
              Net Worth
            </button>
            <button
              type="button"
              className={`${toggleButtonBase} ${
                viewMode === "assets"
                  ? activeButtonClasses
                  : inactiveButtonClasses
              }`}
              onClick={() => setViewMode("assets")}
            >
              Assets
            </button>
          </div>
        </div>
      </div>

      {content}
    </div>
  );
}
