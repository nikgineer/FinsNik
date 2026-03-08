import { useEffect, useState } from "react";
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
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { createSafeAreaStyle } from "../utils/safeArea";

const ranges = ["MTD", "1M", "6M", "YTD", "1Y", "2Y", "5Y", "Max"] as const;

interface GrowthDataPoint {
  date: string;
  value: number;
  percent: number;
  invested: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: {
    payload: GrowthDataPoint;
  }[];
  label?: string;
}

export default function InvestmentChart(): React.JSX.Element {
  const [range, setRange] = useState<(typeof ranges)[number]>("1M");
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [totalChange, setTotalChange] = useState<number | null>(null);
  const [allData, setAllData] = useState<
    Record<string, { data: GrowthDataPoint[]; total: number }>
  >({});
  const [loadingRange, setLoadingRange] = useState<string | null>(null);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const portfolioid = location.state?.portfolioid;
  const storageKey = id ? `investmentGrowth_${id}` : "investmentGrowth";
  const { prefetchGrowthData } = config;
  const CACHE_TTL = 900000; // 15 minutes

  const getCached = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const data = parsed.data ?? parsed;
      const ts = parsed.ts ?? 0;
      if (Date.now() - ts > CACHE_TTL) return null;
      return data as Record<string, { data: GrowthDataPoint[]; total: number }>;
    } catch {
      return null;
    }
  };

  const setCached = (
    d: Record<string, { data: GrowthDataPoint[]; total: number }>,
  ) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ts: Date.now(), data: d }),
    );
  };

  const fetchRangeData = async (
    selectedRange: string,
  ): Promise<{ data: GrowthDataPoint[]; total: number }> => {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${config.backendUrl}/investments/${id}/growth?range=${selectedRange}`,
      {
        headers: {
          "Content-Type": "application/json",
          token: token ?? "",
          portfolioid,
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
      const updated = { ...allData, [r]: res };
      setAllData(updated);
      setCached(updated);
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
    setLoadingRange(range);
    try {
      const results = await Promise.all(ranges.map((r) => fetchRangeData(r)));
      const aggregated: Record<
        string,
        { data: GrowthDataPoint[]; total: number }
      > = {};
      results.forEach((res, idx) => {
        aggregated[ranges[idx]] = res;
      });
      setCached(aggregated);
      setAllData(aggregated);
      if (aggregated[range]) {
        setData(aggregated[range].data);
        setTotalChange(aggregated[range].total);
      }
    } catch (err) {
      console.error("Failed to fetch investment growth data", err);
    } finally {
      setLoadingRange(null);
    }
  };

  const fetchInitialAndThenRest = async () => {
    setLoadingRange(range);
    try {
      const initial = await fetchRangeData(range);
      const initialData = { [range]: initial };
      setAllData(initialData);
      setData(initial.data);
      setTotalChange(initial.total);
      setCached(initialData);
      prefetchRemainingRanges(initialData);
    } catch (e) {
      console.error("Failed to fetch initial range", e);
    } finally {
      setLoadingRange(null);
    }
  };

  const prefetchRemainingRanges = async (
    existingData: Record<string, { data: GrowthDataPoint[]; total: number }>,
  ) => {
    const rangesToFetch = ranges.filter((r) => !existingData[r]);
    const promises = rangesToFetch.map((r) =>
      fetchRangeData(r)
        .then((res) => [r, res] as const)
        .catch(() => null),
    );

    const results = await Promise.all(promises);
    const updated: Record<string, { data: GrowthDataPoint[]; total: number }> =
      {
        ...existingData,
      };

    results.forEach((res) => {
      if (res) {
        const [r, data] = res;
        updated[r] = data;
      }
    });

    setAllData(updated);
    setCached(updated);
  };

  useEffect(() => {
    const cached = getCached();
    if (cached) {
      setAllData(cached);
      if (cached[range]) {
        setData(cached[range].data);
        setTotalChange(cached[range].total);
      }
      prefetchRemainingRanges(cached);
    } else {
      prefetchGrowthData ? fetchAllData() : fetchInitialAndThenRest();
    }
  }, [id]);

  useEffect(() => {
    if (allData[range]) {
      setData(allData[range].data);
      setTotalChange(allData[range].total);
    } else {
      fetchAndStoreRange(range);
    }
  }, [range, allData]);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps): React.JSX.Element | null => {
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
  };

  return (
    <div
      className="app-stage text-light-text dark:text-dark-text"
      style={createSafeAreaStyle({ includeStageVars: true, top: "1.25rem" })}
    >
      <button
        onClick={() => navigate(`/investportfolio/${portfolioid}`)}
        className="glass-icon-button app-icon-frame app-nav-button app-back-button w-10 h-10 text-white"
        data-tone="back"
        title="Go Back"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <div className="w-full max-w-6xl mx-auto">
        <div className="glass-panel rounded-3xl p-4 sm:p-6 mt-12">
          <div className="plot-header">
            <h2 className="plot-heading plot-heading--section">
              Investment Value Over Time
            </h2>
          </div>

          <div className="text-center font-medium mb-4">
            {totalChange !== null && (
              <span
                className={
                  totalChange >= 0 ? "text-emerald-300" : "text-rose-300"
                }
              >
                Overall Change: {totalChange >= 0 ? "+" : ""}
                {totalChange.toFixed(2)}%
              </span>
            )}
          </div>

          <div className="flex justify-center flex-wrap gap-2">
            {ranges.map((r) => {
              const hasData = allData[r]?.data?.length > 0;
              return (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  disabled={r === loadingRange}
                  className={`glass-button px-4 py-1.5 text-xs ${
                    r === range
                      ? "ring-2 ring-white/60 dark:ring-rose-400/40"
                      : hasData
                        ? "opacity-90 hover:opacity-100"
                        : "opacity-40"
                  } ${r === loadingRange ? "cursor-wait" : ""}`}
                  data-variant={r === range ? undefined : "ghost"}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {loadingRange === range ? (
            <div className="text-center text-slate-200/70">
              Loading chart...
            </div>
          ) : data.length === 0 ? (
            <div className="text-center text-slate-200/70">
              No data to display.
            </div>
          ) : (
            <div className="h-[60vh] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ top: 20, bottom: 40, left: 0 }}
                >
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
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
