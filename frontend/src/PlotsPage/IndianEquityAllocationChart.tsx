import { useEffect, useRef, useState } from "react";
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

const setCache = (key: string, data: unknown) =>
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));

interface EquityData {
  type: string;
  value: number;
  percent: number;
}

interface Props {
  onReady?: () => void;
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

export default function IndianEquityAllocationChart({
  onReady,
}: Props): React.JSX.Element {
  const [data, setData] = useState<EquityData[]>([]);
  const onReadyRef = useRef<Props["onReady"]>(onReady);

  // keep the latest onReady without re-running the fetch effect
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const cacheKey = "indianEquityAllocation";
    const cached = getCached<EquityData[]>(cacheKey, 900000);
    if (cached) {
      setData(cached);
      onReadyRef.current?.();
      return;
    }

    const fetchData = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${config.backendUrl}/investment/indianequity`,
          {
            headers: buildAuthHeaders(),
          },
        );
        const json = await res.json();
        if (!Array.isArray(json)) return;

        const total = json.reduce(
          (sum: number, d: { value: number }) => sum + (d?.value ?? 0),
          0,
        );
        const final: EquityData[] = json
          .map((item: { type: string; value: number }) => ({
            type: item.type,
            value: item.value,
            percent: total > 0 ? (item.value / total) * 100 : 0,
          }))
          .filter((d) => d.value > 0) // optional: drop zero/negatives
          .sort((a, b) => b.value - a.value);

        setData(final);
        setCache(cacheKey, final);
      } catch (err) {
        console.error("Failed to load Indian equity allocation", err);
      } finally {
        onReadyRef.current?.();
      }
    };

    fetchData();
    // IMPORTANT: no onReady in deps
  }, []); // <-- run once

  const generateColor = (index: number, total: number): string => {
    const hue = (index * 360) / total;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps): React.ReactNode => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip glass-menu px-3 py-2 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100">
          <p className="label font-semibold">{label}</p>
          <p>{IndianFormatter(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel w-full min-w-0 rounded-3xl p-4 sm:p-6">
      <div className="plot-header">
        <h2 className="plot-heading plot-heading--section">
          Indian Equity Allocation
        </h2>
      </div>

      {data.length === 0 ? (
        <p className="text-center text-gray-500">No data to display.</p>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center">
          {/* Chart */}
          <div className="h-[250px] w-full min-w-0 lg:flex-1 lg:min-w-[220px]">
            <ResponsiveContainer width="100%" height="100%" minHeight={250}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                >
                  {data.map((_, index) => (
                    <Cell
                      key={index}
                      fill={generateColor(index, data.length)}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend (styled like the other chart) */}
          <div className="grid flex-1 grid-cols-1 gap-1 sm:grid-cols-2">
            {data.map((item, index) => (
              <div
                key={item.type}
                className="glass-chip flex items-center justify-between gap-2 px-3 py-1 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 flex-none rounded-full"
                    style={{
                      backgroundColor: generateColor(index, data.length),
                    }}
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {item.type}
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
    </div>
  );
}
