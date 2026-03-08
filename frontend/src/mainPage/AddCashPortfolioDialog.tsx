import React from "react";

interface AddCashPortfolioDialogProps {
  show: boolean;
  onClose: () => void;
  cashPortfolioName: string;
  setCashPortfolioName: (value: string) => void;
  cashPortfolioCurrency: string;
  setCashPortfolioCurrency: (value: string) => void;
  cashPortfolioCategory: string;
  setCashPortfolioCategory: (value: string) => void;
  addCashPortfolio: () => void;
  refreshNetWorth: () => Promise<void>;
}

const AddCashPortfolioDialog: React.FC<AddCashPortfolioDialogProps> = ({
  show,
  onClose,
  cashPortfolioName,
  setCashPortfolioName,
  cashPortfolioCurrency,
  setCashPortfolioCurrency,
  cashPortfolioCategory,
  setCashPortfolioCategory,
  addCashPortfolio,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-6 w-full max-w-sm flex flex-col text-gray-900 dark:text-gray-100">
        <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-purple-300">
          Add Cash Portfolio
        </h3>

        <label className="text-sm mb-1 font-medium dark:text-gray-300">
          Portfolio Name
        </label>
        <input
          type="text"
          className="glass-input mb-3"
          placeholder="eg. My Savings Account"
          value={cashPortfolioName}
          onChange={(e) => setCashPortfolioName(e.target.value)}
        />

        <label className="text-sm mb-1 font-medium dark:text-gray-300">
          Category
        </label>
        <select
          className="glass-select mb-3"
          value={cashPortfolioCategory}
          onChange={(e) => setCashPortfolioCategory(e.target.value)}
        >
          <option value="Savings">Savings</option>
          <option value="Emergency Fund">Emergency Fund</option>
          <option value="Others">Others</option>
        </select>

        <label className="text-sm mb-1 font-medium dark:text-gray-300">
          Currency
        </label>
        <select
          className="glass-select mb-4"
          value={cashPortfolioCurrency}
          onChange={(e) => setCashPortfolioCurrency(e.target.value)}
        >
          <option value="INR">INR</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>

        <div className="flex justify-end gap-3 mt-4">
          <button
            className="glass-button px-5 py-2 text-sm"
            data-variant="ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="glass-button px-5 py-2 text-sm"
            onClick={addCashPortfolio}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCashPortfolioDialog;
