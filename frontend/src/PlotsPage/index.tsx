import { useNavigate } from "react-router-dom";
import GrowthChart from "./GrowthChart";
import InvestmentAllocationChart from "./InvestmentAllocationChart";
import CategoryAllocationChart from "./CategoryAllocationChart";
import AllInvestmentGrowthChart from "./AllInvestmentGrowthChart";
import IndianEquityAllocationChart from "./IndianEquityAllocationChart";
import CashCategoryCurrencyChart from "./CashCategoryCurrencyChart";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createSafeAreaStyle } from "../utils/safeArea";

export default function PlotsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const initialChartState = {
    category: false,
    allocation: false,
    growth: false,
    allGrowth: false,
    indianEquity: false,
    cashCategoryCurrency: false,
  };
  const [chartsReady, setChartsReady] = useState(initialChartState);

  type ChartKey = keyof typeof initialChartState;

  const markChartReady = useCallback((key: ChartKey) => {
    setChartsReady((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const readyHandlers = useMemo(
    () => ({
      category: () => markChartReady("category"),
      allocation: () => markChartReady("allocation"),
      growth: () => markChartReady("growth"),
      allGrowth: () => markChartReady("allGrowth"),
      indianEquity: () => markChartReady("indianEquity"),
      cashCategoryCurrency: () => markChartReady("cashCategoryCurrency"),
    }),
    [markChartReady],
  );

  const allChartsReady = Object.values(chartsReady).every(Boolean);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setChartsReady({
        category: true,
        allocation: true,
        growth: true,
        allGrowth: true,
        indianEquity: true,
        cashCategoryCurrency: true,
      });
    }, 100); // 10 seconds max wait

    return () => clearTimeout(timeout);
  }, []);

  return (
    <motion.div
      className="app-stage text-light-text dark:text-dark-text"
      style={{
        ...createSafeAreaStyle({
          includeStageVars: true,
          top: "1rem",
          bottom: "0px", // ← remove the fixed extra padding
          inline: "clamp(1.25rem, 3vw, 2.75rem)",
        }),
      }}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Back Button */}
      <button
        onClick={() => navigate("/main")}
        className="glass-icon-button app-icon-frame app-nav-button app-back-button w-12 h-12 text-white"
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

      <h1 className="plot-heading plot-heading--hero mt-10 text-[16px]">
        Portfolio Summary
      </h1>

      {loading || !allChartsReady ? (
        <div className="flex justify-center items-center flex-1 py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gray-900 dark:border-white" />
        </div>
      ) : (
        <>
          {/* Other Charts */}
          <CategoryAllocationChart onReady={readyHandlers.category} />

          <IndianEquityAllocationChart onReady={readyHandlers.indianEquity} />

          <CashCategoryCurrencyChart
            onReady={readyHandlers.cashCategoryCurrency}
          />

          <InvestmentAllocationChart onReady={readyHandlers.allocation} />

          <GrowthChart onReady={readyHandlers.growth} />

          <AllInvestmentGrowthChart onReady={readyHandlers.allGrowth} />
        </>
      )}
    </motion.div>
  );
}
