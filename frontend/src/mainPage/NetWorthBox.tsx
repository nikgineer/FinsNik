import React, { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { Currency } from "../config";
import { FaExchangeAlt } from "react-icons/fa";
import { FiTrendingUp } from "react-icons/fi";
import { AiOutlineSwap } from "react-icons/ai";
import { MdOutlineHistory } from "react-icons/md";

interface NetWorthBoxProps {
  currency: string;
  currencySymbols: Record<string, string>;
  convertedAmount: number | string;
  loading: boolean;
  setCurrency: (value: Currency) => void;
  rates: Record<string, number>;
  title: string;
  onToggleView: () => void;
  isAssetsView: boolean;
}

// Curated palette of vibrant yet balanced colors that work across light
// and dark themes. Using a fixed set avoids the overwhelming variety from
// arbitrary RGB generation while keeping the Net Worth box visually
// appealing. Colors are chosen from Tailwind's mid‑tone ranges to maintain
// sufficient contrast with white text.
const palette = [
  "#9333ea", // purple-600
  "#7c3aed", // violet-600
  "#dc2626", // red-600
  "#f59e0b", // amber-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#f43f5e", // rose-500
  "#8b5cf6", // violet-500
  "#a855f7", // violet-600
  "#d97706", // amber-600
  "#ef4444", // red-500
  "#fb7185", // rose-400
  "#f472b6", // pink-400
  "#e879f9", // fuchsia-400
  "#fcd34d", // amber-300
  "#eab308", // amber-500
  "#c2410c", // orange-700
  "#fda4af", // rose-300
  "#be123c", // rose-700
];

function randomColorFromPalette() {
  return palette[Math.floor(Math.random() * palette.length)];
}

const NetWorthBox: React.FC<NetWorthBoxProps> = ({
  currency,
  currencySymbols,
  convertedAmount,
  loading,
  setCurrency,
  rates,
  title,
  onToggleView,
  isAssetsView,
}) => {
  const navigate = useNavigate();

  // Save rates to localStorage when they change
  useEffect(() => {
    localStorage.setItem("rates", JSON.stringify(rates));
  }, [rates]);

  // Pick a random color from the curated palette once when the component mounts
  const bgRef = useRef<string>(randomColorFromPalette());

  return (
    <div
      className="relative mt-1 sm:mt-1 mx-auto flex flex-col items-center justify-center glass-panel networth-panel rounded-[2.5rem] w-full max-w-2xl min-h-[200px] px-6 sm:px-12 py-6 pb-2 sm:pb-10 pt-10 sm:pt-14 text-white overflow-hidden"
      style={
        {
          "--panel-accent": bgRef.current,
        } as CSSProperties
      }
      data-accent
    >
      <button
        type="button"
        onClick={onToggleView}
        title={isAssetsView ? "Show Net Worth" : "Show Assets"}
        className="absolute top-4 right-4 w-5 h-7 text-white"
        data-tone="toggle"
        aria-label={isAssetsView ? "Show Net Worth" : "Show Assets"}
      >
        <AiOutlineSwap className="text-lg" />
      </button>

      <h2 className="networth-title text-white drop-shadow-[0_12px_32px_rgba(15,23,42,0.75)] text-xl sm:text-2xl md:text-3xl text-gray-500 dark:text-slate-400">
        {title}
      </h2>

      <div
        className="networth-amount-block select-all break-words text-center"
        data-loading={loading}
      >
        {loading ? (
          <span className="inline-block h-12 w-40 max-w-full bg-white/25 rounded-full animate-pulse" />
        ) : (
          <span
            className="networth-amount text-base sm:text-lg md:text-xl font-semibold mx-auto"
            aria-live="polite"
          >
            <span className="currency">{currencySymbols[currency]}</span>
            <span className="value">{convertedAmount}</span>
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-1 sm:mb-5 mt-1 sm:mt-4">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="glass-select w-32 text-sm font-semibold text-black/80 dark:text-white text-center"
          aria-label="Select currency"
        >
          <option value="INR">INR</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      <div className="flex w-full items-center justify-between">
        {/* Left: Transactions */}
        <button
          type="button"
          onClick={() => navigate("/transactions")}
          title="View Transactions"
          className="flex items-center gap-2 px-3 py-2 text-[0.75rem] font-semibold text-white"
          data-tone="transactions"
        >
          <MdOutlineHistory size={20} className="shrink-0 sm:mr-2" />
          <span className="tracking-wide hidden sm:inline">Transactions</span>
        </button>

        {/* Right: Insights */}
        <button
          type="button"
          onClick={() => navigate("/plots")}
          title="View Trend Plots"
          className="flex items-center gap-2 px-3 py-2 text-[0.75rem] font-semibold text-white"
          data-tone="plots"
        >
          <FiTrendingUp className="text-base" />
          <span className="tracking-wide hidden sm:inline">Insights</span>
        </button>
      </div>
    </div>
  );
};

export default NetWorthBox;
