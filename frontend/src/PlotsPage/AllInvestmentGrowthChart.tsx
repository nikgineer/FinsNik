import { useEffect, useState, useCallback } from "react";
import config from "../config";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const ranges = ["MTD", "1M", "6M", "YTD", "1Y", "2Y", "5Y", "Max"] as const;

interface GrowthDataPoint {
  date: string;
  value: number;
  percent: number;
  invested: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: GrowthDataPoint }[];
  label?: string;
}

interface AllInvestmentGrowthProps {
  onReady?: () => void;
}

export default function GrowthChart({
  onReady,
}: AllInvestmentGrowthProps): React.JSX.Element {
  const [range, setRange] = useState<(typeof ranges)[number]>("1M");
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalChange, setTotalChange] = useState<number | null>(null);
  const [allData, setAllData] = useState<
    Record<string, { data: GrowthDataPoint[]; total: number }>
  >({});
  const [loadingRange, setLoadingRange] = useState<string | null>(null);

  const storageKey = "investGrowthData";
  const CACHE_TTL = 900000; // 15 minutes
  const { prefetchGrowthData } = config;

  // ------- Cache helpers
  const getCached = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const d = parsed.data ?? parsed;
      const ts = parsed.ts ?? 0;
      if (Date.now() - ts > CACHE_TTL) return null;
      return d as Record<string, { data: GrowthDataPoint[]; total: number }>;
    } catch {
      return null;
    }
  };

  const setCached = (
    obj: Record<string, { data: GrowthDataPoint[]; total: number }>,
  ) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ts: Date.now(), data: obj }),
    );
  };

  // ------- Fetching
  const fetchRangeData = async (
    selectedRange: string,
  ): Promise<{ data: GrowthDataPoint[]; total: number }> => {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${config.backendUrl}/investment/growth?range=${selectedRange}`,
      {
        headers: {
          "Content-Type": "application/json",
          token: token ?? "",
        },
      },
    );
    const result: { date: string; value: number; invested: number }[] =
      await response.json();

    if (!Array.isArray(result) || result.length === 0) {
      return { data: [], total: 0 };
    }

    const firstRealIdx = result.findIndex(
      (d) => d.value !== 0 || d.invested !== 0,
    );
    const actual = firstRealIdx >= 0 ? result.slice(firstRealIdx) : result;

    let cumulativeInvested = 0;
    const points = actual.map((d) => {
      cumulativeInvested += d.invested;
      const pct =
        cumulativeInvested === 0
          ? 0
          : ((d.value - cumulativeInvested) / cumulativeInvested) * 100;
      return {
        date: d.date,
        value: d.value,
        invested: d.invested,
        percent: pct,
      };
    });

    const firstVal = actual[0].value;
    const lastVal = actual[actual.length - 1].value;
    const overallPct =
      firstVal === 0 ? 0 : ((lastVal - firstVal) / firstVal) * 100;

    return { data: points, total: overallPct };
  };

  const fetchAndStoreRange = async (r: string) => {
    setLoadingRange(r);
    try {
      const res = await fetchRangeData(r);
      setAllData((prev) => {
        const updated = { ...prev, [r]: res };
        setCached(updated);
        return updated;
      });
      if (r === range) {
        setData(res.data);
        setTotalChange(res.total);
      }
    } catch (err) {
      console.error("Failed to fetch investment growth data", err);
    } finally {
      setLoadingRange(null);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(ranges.map((r) => fetchRangeData(r)));
      const aggregated: Record<
        string,
        { data: GrowthDataPoint[]; total: number }
      > = {};
      results.forEach((res, idx) => {
        aggregated[ranges[idx]] = res;
      });
      setAllData(aggregated);
      setCached(aggregated);

      if (aggregated[range]) {
        setData(aggregated[range].data);
        setTotalChange(aggregated[range].total);
        onReady?.();
      }
    } catch (err) {
      console.error("Failed to fetch investment growth data", err);
    } finally {
      setLoading(false);
    }
  };

  const prefetchRemainingRanges = async (
    existingData: Record<string, { data: GrowthDataPoint[]; total: number }>,
  ) => {
    const rangesToFetch = ranges.filter((r) => !existingData[r]);
    const results = await Promise.all(
      rangesToFetch.map((r) =>
        fetchRangeData(r)
          .then((res) => [r, res] as const)
          .catch(() => null),
      ),
    );

    setAllData((prev) => {
      const updated = { ...prev };
      results.forEach((res) => {
        if (res) {
          const [r, data] = res;
          updated[r] = data;
        }
      });
      setCached(updated);
      return updated;
    });
  };

  // ------- Init
  useEffect(() => {
    const cached = getCached();
    if (cached) {
      setAllData(cached);
      if (cached[range]) {
        setData(cached[range].data);
        setTotalChange(cached[range].total);
      }
      onReady?.();
      prefetchRemainingRanges(cached);
    } else {
      prefetchGrowthData ? fetchAllData() : fetchInitialAndThenRest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInitialAndThenRest = async () => {
    setLoading(true);
    try {
      const initial = await fetchRangeData(range);
      const initialData = { [range]: initial } as Record<
        string,
        { data: GrowthDataPoint[]; total: number }
      >;
      setAllData(initialData);
      setData(initial.data);
      setTotalChange(initial.total);
      setCached(initialData);
      onReady?.();
      prefetchRemainingRanges(initialData);
    } catch (e) {
      console.error("Failed to fetch initial range", e);
    } finally {
      setLoading(false);
    }
  };

  // ------- On range change
  useEffect(() => {
    if (allData[range]) {
      setData(allData[range].data);
      setTotalChange(allData[range].total);
    } else {
      fetchAndStoreRange(range);
    }
  }, [range, allData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------- Stable tooltip
  const CustomTooltip = useCallback(
    ({ active, payload, label }: TooltipProps): React.JSX.Element | null => {
      if (active && payload?.length) {
        const value = payload[0].payload.value;
        const date = new Date(label ?? "");
        const isValid = !isNaN(date.getTime());
        return isValid ? (
          <div className="glass-menu px-3 py-2 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100">
            <div>{date.toLocaleDateString()}</div>
            <div className="font-semibold">₹ {value.toFixed(2)}</div>
          </div>
        ) : null;
      }
      return null;
    },
    [],
  );

  const isLoading = loading || loadingRange === range;

  return (
    <div className="glass-panel rounded-3xl p-4 sm:p-6 w-full max-w-6xl mx-auto">
      <div className="plot-header">
        <h2 className="plot-heading plot-heading--section">
          Investment Value Over Time
        </h2>
      </div>

      <div className="text-center font-medium mb-4">
        {totalChange !== null && (
          <span
            className={totalChange >= 0 ? "text-emerald-300" : "text-rose-300"}
          >
            Overall Change: {totalChange >= 0 ? "+" : ""}
            {totalChange.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Range selector */}
      <div className="flex justify-center flex-wrap gap-2 mb-6">
        {ranges.map((r) => {
          const hasData = allData[r]?.data?.length > 0;
          const isActive = r === range;
          return (
            <button
              type="button" // prevent form submit
              key={r}
              onClick={() => setRange(r)}
              disabled={r === loadingRange}
              className={`glass-button px-4 py-1.5 text-xs ${
                isActive
                  ? "ring-2 ring-white/60 dark:ring-rose-400/40"
                  : hasData
                    ? "opacity-90 hover:opacity-100"
                    : "opacity-40"
              } ${r === loadingRange ? "cursor-wait" : ""}`}
              data-variant={isActive ? undefined : "ghost"}
            >
              {r}
            </button>
          );
        })}
      </div>

      {/* Keep chart mounted; show overlays for loading/empty */}
      <div className="relative h-[60vh] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, bottom: 40, left: 0 }}>
            <CartesianGrid stroke="#444" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              stroke="currentColor"
              tick={{ fill: "currentColor", fontSize: 10 }}
              tickFormatter={(dateStr: string) => {
                const d = new Date(dateStr);
                return d.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                });
              }}
            />
            <YAxis hide={true} domain={["dataMin", "dataMax"]} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!isLoading}
            />
          </LineChart>
        </ResponsiveContainer>

        {isLoading && (
          <div className="absolute inset-0 grid place-items-center bg-black/20">
            <span className="text-slate-200/80 text-sm">Loading…</span>
          </div>
        )}

        {!isLoading && data.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-slate-200/70">
            No data to display.
          </div>
        )}
      </div>
    </div>
  );
}
