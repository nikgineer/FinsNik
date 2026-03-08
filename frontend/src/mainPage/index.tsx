import { useCallback, useEffect, useState } from "react";
import config from "../config";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import useGreeting from "./greetings";
import LogoutButton from "../context/LogoutButton";
import NetWorthBox from "./NetWorthBox";
import type { Currency } from "../config";
import AddPortfolioToggle from "./AddPortfolioToggle";
import AddCashPortfolioDialog from "./AddCashPortfolioDialog";
import AddInvestmentPortfolioDialog from "./AddInvestmentPortfolioDialog";
import PortfolioList from "./PortfolioList";
import { generateUUID } from "../config";
import { createSafeAreaStyle } from "../utils/safeArea";
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

const setCache = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
};

export default function MainPage() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("User");
  const token = localStorage.getItem("token");
  const [netWorthINR, setNetWorthINR] = useState(0);
  const [assetWorthINR, setAssetWorthINR] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [portfolioType, setPortfolioType] = useState("");

  type Portfolio = {
    id: string;
    type: string;
    name: string;
    currency: string;
    category?: string;
    token?: string;
    investmentType?: string;
  };

  type InvestPortfolio = {
    id: string;
    type: string;
    name: string;
    token?: string;
  };

  // Cash dialog state
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [cashPortfolioName, setCashPortfolioName] = useState("");
  const [cashPortfolioCurrency, setCashPortfolioCurrency] = useState("INR");
  const [cashPortfolioCategory, setCashPortfolioCategory] = useState("Savings");

  // Investment dialog state
  const [showInvestmentDialog, setShowInvestmentDialog] = useState(false);
  const [investmentPortfolioName, setInvestmentPortfolioName] = useState("");
  const [investmentType, setInvestmentType] = useState("");
  const [cashHoldings, setCashHoldings] = useState<Record<string, number>>({});

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [investfolios, setInvestPortfolios] = useState<InvestPortfolio[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [sortOption, setSortOption] = useState<"default" | "name">("default");
  const [showAssetsView, setShowAssetsView] = useState(false);

  const currencySymbols: Record<Currency, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
  };

  const [currency, setCurrency] = useState<Currency>("INR");
  const [rates, setRates] = useState<Record<Currency, number>>({
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
  });
  const rate = rates[currency] ?? 1;
  const activeAmountINR = showAssetsView ? assetWorthINR : netWorthINR;
  const convertedAmount =
    currency === "INR"
      ? activeAmountINR.toLocaleString("en-IN", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : (activeAmountINR * rate).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        });
  const netWorthTitle = showAssetsView ? "Assets" : "Net Worth";

  useEffect(() => {
    fetch(`${config.backendUrl}/token-authorisation`, {
      method: "GET",
      headers: buildAuthHeaders({
        "Content-Type": "application/json",
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.token === false) {
          navigate("/login");
        }
      })
      .catch((error) => {
        console.error("Fetch error:", error);
        navigate("/login");
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setTimeout(() => navigate("/"), 200);
  };

  const fetchRates = useCallback(async () => {
    try {
      const response = await fetch(`${config.backendUrl}/rates`);
      const data = await response.json();
      setRates(data);
    } catch {}
  }, []);

  const fetchNetWorth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.backendUrl}/networth`, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      const data = await response.json();
      if (typeof data.networth === "number") {
        setNetWorthINR(data.networth);
      }
      if (typeof data.assets === "number") {
        setAssetWorthINR(data.assets);
      } else if (typeof data.networth === "number") {
        setAssetWorthINR(data.networth);
      }
      if (data.cashholdings) {
        localStorage.setItem("cashholdings", JSON.stringify(data.cashholdings));
        setCashHoldings(data.cashholdings);
      }
      setCache("networthData", {
        networth: data.networth,
        assets: data.assets,
        cashholdings: data.cashholdings,
      });
    } catch (err) {
      console.error("Error fetching net worth:", err);
    }
    setLoading(false);
  }, [token]);

  const fetchHome = useCallback(async () => {
    try {
      const response = await fetch(`${config.backendUrl}/home`, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      const data = await response.json();
      if (data.welcome) {
        setUserName(data.welcome);
      }
      if (data.portfolios) {
        setPortfolios(data.portfolios);
        localStorage.setItem("portfolios", JSON.stringify(data.portfolios));
      }
      if (data.investfolios) {
        setInvestPortfolios(data.investfolios);
        localStorage.setItem("investfolios", JSON.stringify(data.investfolios));
      }
      setCache("homeData", {
        welcome: data.welcome,
        portfolios: data.portfolios,
        investfolios: data.investfolios,
      });
    } catch (err) {
      console.error("Error fetching home data:", err);
    }
  }, [token]);

  useEffect(() => {
    window.scrollTo(0, 0);

    const cachedHome = getCached<any>("homeData", 900000);
    if (cachedHome) {
      setUserName(cachedHome.welcome || "User");
      setPortfolios(cachedHome.portfolios || []);
      setInvestPortfolios(cachedHome.investfolios || []);
    }
    const cachedNW = getCached<any>("networthData", 900000);
    if (cachedNW) {
      setNetWorthINR(
        typeof cachedNW.networth === "number" ? cachedNW.networth : 0,
      );
      if (typeof cachedNW.assets === "number") {
        setAssetWorthINR(cachedNW.assets);
      } else {
        setAssetWorthINR(
          typeof cachedNW.networth === "number" ? cachedNW.networth : 0,
        );
      }
      if (cachedNW.cashholdings) setCashHoldings(cachedNW.cashholdings);
    }

    const fetchData = async () => {
      setIsPageLoading(true);
      try {
        // Kick off net worth retrieval but don't await it so the page can render
        fetchNetWorth().catch((err) =>
          console.error("Net worth loading failed", err),
        );

        await Promise.all([fetchHome(), fetchRates()]);
      } catch (err) {
        console.error("Data loading failed", err);
      } finally {
        // Render the page while net worth continues loading in the background
        setIsPageLoading(false);
      }
    };

    fetchData();
  }, [fetchHome, fetchNetWorth, fetchRates]);

  useEffect(() => {
    const interval = window.setInterval(
      () => {
        fetchRates();
        fetchNetWorth();
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(interval);
  }, [fetchRates, fetchNetWorth]);

  // Add portfolio handlers
  const addCashPortfolio = async () => {
    const token = localStorage.getItem("token");
    if (cashPortfolioName.trim()) {
      const id = generateUUID();
      const newPortfolio = {
        id,
        type: "Cash & Savings",
        name: cashPortfolioName.trim(),
        currency: cashPortfolioCurrency,
        category: cashPortfolioCategory,
        token: `${token}`,
      };

      const updated = [...portfolios, newPortfolio];
      setPortfolios(updated);
      localStorage.setItem("portfolios", JSON.stringify(updated));

      try {
        const res = await fetch(`${config.backendUrl}/portfolios`, {
          method: "POST",
          headers: buildAuthHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(newPortfolio),
        });
        const data = await res.json();
        if (!res.ok && data.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }

        if (!res.ok) {
          console.error("Failed to save to backend:", await res.text());
        } else {
          localStorage.removeItem("homeData");
          localStorage.removeItem("networthData");
          fetchNetWorth();
          fetchHome();
        }
      } catch (err) {
        console.error("Error sending to backend:", err);
      }

      setShowCashDialog(false);
      setCashPortfolioName("");
      setCashPortfolioCurrency("INR");
      setCashPortfolioCategory("Savings");
    }
  };

  const addInvestmentPortfolio = async () => {
    const token = localStorage.getItem("token");

    if (investmentPortfolioName.trim()) {
      const id = generateUUID();
      const newPortfolio = {
        id,
        type: "Investment",
        name: investmentPortfolioName.trim(),
        token: `${token}`,
      };

      const updated = [...investfolios, newPortfolio];
      setInvestPortfolios(updated);
      localStorage.setItem("investfolios", JSON.stringify(updated));

      try {
        const res = await fetch(`${config.backendUrl}/portfolios`, {
          method: "POST",
          headers: buildAuthHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(newPortfolio),
        });

        if (!res.ok) {
          console.error("Failed to save to backend:", await res.text());
        } else {
          localStorage.removeItem("homeData");
          localStorage.removeItem("networthData");
          fetchNetWorth();
          fetchHome();
        }
      } catch (err) {
        console.error("Error sending to backend:", err);
      }

      setShowInvestmentDialog(false);
      setInvestmentPortfolioName("");
    }
  };

  const greet = useGreeting();
  const sortedPortfolios =
    sortOption === "name"
      ? [...portfolios].sort((a, b) => a.name.localeCompare(b.name))
      : portfolios;

  const sortedInvestfolios =
    sortOption === "name"
      ? [...investfolios].sort((a, b) => a.name.localeCompare(b.name))
      : investfolios;

  if (isPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
        <div className="animate-spin h-12 w-12 rounded-full border-t-4 border-b-4 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <motion.div
      className="app-stage text-light-text dark:text-dark-text"
      style={createSafeAreaStyle({
        top: "1rem",
        bottom: "2.25rem",
        inline: "clamp(1rem, 4vw, 1.8rem)",
        includeStageVars: true,
      })}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 sm:gap-6 transform scale-[0.985] sm:scale-100 transition-transform duration-300">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <motion.div
            className="text-left text-gray-900 dark:text-white select-none"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-gray-500 dark:text-slate-400">
              {greet}
            </p>
            <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-rose-500 dark:text-rose-300 leading-tight">
              {userName}!
            </p>
          </motion.div>

          <div className="flex items-center gap-3 ml-auto">
            <LogoutButton handleLogout={handleLogout} />
          </div>
        </div>

        <NetWorthBox
          currency={currency}
          currencySymbols={currencySymbols}
          convertedAmount={convertedAmount}
          loading={loading}
          setCurrency={setCurrency}
          rates={rates}
          title={netWorthTitle}
          onToggleView={() => setShowAssetsView((prev) => !prev)}
          isAssetsView={showAssetsView}
        />
      </div>

      <AddPortfolioToggle
        showAddPortfolio={showAddPortfolio}
        setShowAddPortfolio={setShowAddPortfolio}
        portfolioType={portfolioType}
        setPortfolioType={setPortfolioType}
        setShowCashDialog={setShowCashDialog}
        setShowInvestmentDialog={setShowInvestmentDialog}
      />

      {/* Add Cash & Savings Dialog */}
      <AddCashPortfolioDialog
        show={showCashDialog}
        onClose={() => {
          setShowCashDialog(false);
          setCashPortfolioCategory("Savings");
        }}
        cashPortfolioName={cashPortfolioName}
        setCashPortfolioName={setCashPortfolioName}
        cashPortfolioCurrency={cashPortfolioCurrency}
        setCashPortfolioCurrency={setCashPortfolioCurrency}
        cashPortfolioCategory={cashPortfolioCategory}
        setCashPortfolioCategory={setCashPortfolioCategory}
        addCashPortfolio={addCashPortfolio}
        refreshNetWorth={fetchNetWorth}
      />

      {/* Add Investment Dialog */}
      <AddInvestmentPortfolioDialog
        show={showInvestmentDialog}
        onClose={() => setShowInvestmentDialog(false)}
        investmentPortfolioName={investmentPortfolioName}
        setInvestmentPortfolioName={setInvestmentPortfolioName}
        investmentType={investmentType}
        setInvestmentType={setInvestmentType}
        addInvestmentPortfolio={addInvestmentPortfolio}
      />

      {/* Portfolio List */}
      <PortfolioList
        portfolios={portfolios}
        investfolios={investfolios}
        setPortfolios={setPortfolios}
        setInvestfolios={setInvestPortfolios}
        cashHoldings={cashHoldings}
        setCashHoldings={setCashHoldings}
        setNetWorthINR={setNetWorthINR}
      />
    </motion.div>
  );
}
