import React, { memo } from "react";

interface AddInvestmentModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;

  name: string;
  setName: (v: string) => void;

  type: string;
  setType: (v: string) => void;

  currency: string;
  setCurrency: (v: string) => void;

  category: string;
  setCategory: (v: string) => void;
  equityType: string;
  setEquityType: (v: string) => void;

  suggestions: string[];
  onSearchName: (query: string) => void;
  setSuggestions: (v: string[]) => void;
  wasSuggestionSelected: boolean;
  setWasSuggestionSelected: (v: boolean) => void;
  editMode: boolean;
}

const AddInvestmentModal: React.FC<AddInvestmentModalProps> = ({
  open,
  onClose,
  onSave,
  name,
  setName,
  type,
  setType,
  currency,
  setCurrency,
  category,
  setCategory,
  equityType,
  setEquityType,
  suggestions,
  onSearchName,
  setSuggestions,
  wasSuggestionSelected,
  setWasSuggestionSelected,
  editMode,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-gray-900 dark:text-white">
        <h2 className="text-xl font-bold mb-5 text-gray-900 dark:text-white text-center">
          Add Investment
        </h2>

        {/* Type - Moved to Top */}
        <div className="mb-4">
          <label className="block mb-1 font-semibold text-gray-800 dark:text-gray-200">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="glass-select"
          >
            <option value="">Select Type</option>
            <option value="etf">ETF</option>
            <option value="mutual fund">Mutual Fund</option>
            {/* <option value="stocks">Stocks</option> */}
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Name with Suggestions */}
        {type && (
          <div className="mb-4 relative">
            <label className="block mb-1 font-semibold text-gray-800 dark:text-gray-200">
              Name
            </label>
            <input
              type="text"
              value={name}
              readOnly={editMode}
              className={`glass-input ${editMode ? "cursor-not-allowed opacity-70" : ""}`}
              onChange={(e) => {
                const val = e.target.value;
                setName(val);
                setWasSuggestionSelected(false);
                if (
                  val.length >= 2 &&
                  (type === "etf" || type === "mutual fund")
                ) {
                  onSearchName(val);
                } else {
                  setSuggestions([]);
                }
              }}
              placeholder="Enter name"
            />

            {Array.isArray(suggestions) && suggestions.length > 0 ? (
              <ul className="absolute z-10 glass-menu mt-1 w-full rounded-2xl max-h-48 overflow-y-auto">
                {suggestions.map((sug, i) => (
                  <li
                    key={i}
                    onMouseDown={() => {
                      setName(sug);
                      setSuggestions([]);
                      setWasSuggestionSelected(true);
                    }}
                    className="px-4 py-2 hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer transition text-sm"
                  >
                    <span className="text-gray-800 dark:text-white">{sug}</span>
                  </li>
                ))}
              </ul>
            ) : (
              name.length > 1 &&
              !wasSuggestionSelected &&
              Array.isArray(suggestions) &&
              suggestions.length === 0 && (
                <div className="absolute z-10 glass-menu mt-1 w-full rounded-2xl p-3">
                  <span className="text-gray-800 dark:text-white">
                    No suggestions found
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Currency */}
        {/* <div className="mb-4">
          <label className="block mb-1 font-semibold text-gray-800 dark:text-gray-200">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-rose-400 transition"
          >
            <option value="">Select Currency</option>
            <option value="INR">INR</option>
            <option value="EUR">EUR</option> 
            <option value="USD">USD</option>
          </select>
        </div> */}

        {/* Category */}
        <div className="mb-4">
          <label className="block mb-1 font-semibold text-gray-800 dark:text-gray-200">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (e.target.value !== "Indian Equity") setEquityType("");
            }}
            className="glass-select"
          >
            <option value="">None</option>
            <option value="Indian Equity">Indian Equity</option>
            <option value="International Equity">International Equity</option>
            <option value="Gold">Gold</option>
            <option value="Debt/Liquid">Debt/Liquid</option>
          </select>
        </div>

        {category === "Indian Equity" && (
          <div className="mb-4">
            <label className="block mb-1 font-semibold text-gray-800 dark:text-gray-200">
              Equity Type
            </label>
            <select
              value={equityType}
              onChange={(e) => setEquityType(e.target.value)}
              className="glass-select"
            >
              <option value="">Select Type</option>
              <option value="Large Cap">Large Cap</option>
              <option value="Mid Cap">Mid Cap</option>
              <option value="Small Cap">Small Cap</option>
              <option value="Flexi Cap">Flexi Cap</option>
              <option value="Multi Asset">Multi Asset</option>
              <option value="Aggressive Hybrid">Aggressive Hybrid</option>
              <option value="Conservative Hybrid">Conservative Hybrid</option>
              <option value="ELSS Tax Saver">ELSS Tax Saver</option>
              <option value="ULIP">ULIP</option>
              <option value="Others">Others</option>
            </select>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="glass-button px-5 py-2 text-sm"
            data-variant="ghost"
          >
            Cancel
          </button>
          <button onClick={onSave} className="glass-button px-5 py-2 text-sm">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(AddInvestmentModal);
