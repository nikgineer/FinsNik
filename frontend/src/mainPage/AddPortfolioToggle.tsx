import React from "react";
import { FiPlus, FiPocket, FiBarChart2 } from "react-icons/fi";

interface AddPortfolioToggleProps {
  showAddPortfolio: boolean;
  setShowAddPortfolio: React.Dispatch<React.SetStateAction<boolean>>;
  portfolioType: string;
  setPortfolioType: (value: string) => void;
  setShowCashDialog: (value: boolean) => void;
  setShowInvestmentDialog: (value: boolean) => void;
}

const AddPortfolioToggle: React.FC<AddPortfolioToggleProps> = ({
  showAddPortfolio,
  setShowAddPortfolio,
  portfolioType,
  setPortfolioType,
  setShowCashDialog,
  setShowInvestmentDialog,
}) => {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setShowAddPortfolio((v) => !v)}
        className="glass-icon-button app-nav-button flex items-center gap-2 sm:gap-3 px-2 sm:px-5 py-1 sm:py-3 text-sm font-semibold text-white"
        data-active={showAddPortfolio}
        data-tone="menu"
        aria-expanded={showAddPortfolio}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-300 ${
            showAddPortfolio ? "rotate-45" : ""
          }`}
        >
          <FiPlus className="text-lg" />
        </span>
        <span className="tracking-wide">Add Portfolio</span>
      </button>

      {showAddPortfolio && (
        <div className="flex flex-col items-center gap-4">
          <span className="glass-chip text-xs uppercase tracking-[0.35em] text-light-text/70 dark:text-dark-text/70">
            Choose a portfolio type
          </span>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => {
                setPortfolioType("cash_savings");
                setShowCashDialog(true);
              }}
              className="glass-icon-button app-nav-button flex items-center gap-3 px-5 py-3 text-sm text-white"
              data-active={portfolioType === "cash_savings"}
              data-tone="cash"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-white">
                <FiPocket className="text-lg" />
              </span>
              <span className="text-left leading-tight">
                <span className="block font-semibold">Cash &amp; Savings</span>
                <span className="block text-[0.7rem] text-white/75">
                  Secure reserves
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPortfolioType("investments");
                setShowInvestmentDialog(true);
              }}
              className="glass-icon-button app-nav-button flex items-center gap-3 px-5 py-3 text-sm text-white"
              data-active={portfolioType === "investments"}
              data-tone="invest"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-white">
                <FiBarChart2 className="text-lg" />
              </span>
              <span className="text-left leading-tight">
                <span className="block font-semibold">Investments</span>
                <span className="block text-[0.7rem] text-white/75">
                  Growth focused
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddPortfolioToggle;
