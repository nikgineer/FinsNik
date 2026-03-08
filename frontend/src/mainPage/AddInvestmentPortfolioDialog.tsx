import React from "react";

interface AddInvestmentPortfolioDialogProps {
  show: boolean;
  onClose: () => void;
  investmentPortfolioName: string;
  setInvestmentPortfolioName: (value: string) => void;
  investmentType: string;
  setInvestmentType: (value: string) => void;
  addInvestmentPortfolio: () => void;
}

const AddInvestmentPortfolioDialog: React.FC<
  AddInvestmentPortfolioDialogProps
> = ({
  show,
  onClose,
  investmentPortfolioName,
  setInvestmentPortfolioName,
  addInvestmentPortfolio,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-6 w-full max-w-sm flex flex-col text-gray-900 dark:text-gray-100">
        <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-purple-300">
          Add Investement Portfolio
        </h3>

        <label className="text-sm mb-1 font-medium dark:text-gray-300">
          Portfolio Name
        </label>
        <input
          type="text"
          className="glass-input mb-4"
          placeholder="eg. Investent Portfolio"
          value={investmentPortfolioName}
          onChange={(e) => setInvestmentPortfolioName(e.target.value)}
        />

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
            onClick={addInvestmentPortfolio}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddInvestmentPortfolioDialog;
