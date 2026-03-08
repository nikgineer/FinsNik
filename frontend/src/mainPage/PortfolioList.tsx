import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import config from "../config";
import Loader from "./Loader";
import { IndianFormatter } from "../config/types";
import { buildAuthHeaders } from "../utils/auth";

// Portfolio type
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
  currency?: string;
  category?: string;
  portfolioid?: string;
  investmentid?: string;
};

type Investement = {
  id: string;
};

// Props type
interface PortfolioListProps {
  portfolios: Portfolio[];
  investfolios: InvestPortfolio[];
  setPortfolios: React.Dispatch<React.SetStateAction<Portfolio[]>>;
  cashHoldings: Record<string, number>;
  setCashHoldings: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setNetWorthINR: (value: number) => void;
  setInvestfolios: React.Dispatch<React.SetStateAction<InvestPortfolio[]>>;
}

const PortfolioList: React.FC<PortfolioListProps> = ({
  portfolios,
  investfolios,
  setPortfolios,
  setInvestfolios,
  cashHoldings = {},
  setCashHoldings,
  setNetWorthINR,
}) => {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [xirr, setXIRR] = useState<number | null>(null);
  const [investments, setInvestment] = useState<Investement | []>([]);

  const handleClick = (id: string) => {
    setIsNavigating(true);
    navigate(`/portfolio/${id}`);
  };

  const handleInvestClick = async (id: string) => {
    setIsNavigating(true);
    navigate(`/investportfolio/${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${config.backendUrl}/portfolios/${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders({
          "Content-Type": "application/json",
        }),
      });

      localStorage.removeItem("homeData");
      localStorage.removeItem("networthData");

      // Refresh portfolio lists
      const homeRes = await fetch(`${config.backendUrl}/home`, {
        headers: buildAuthHeaders(),
      });
      const homeData = await homeRes.json();
      if (homeRes.ok) {
        if (homeData.portfolios) {
          setPortfolios(homeData.portfolios);
          localStorage.setItem(
            "portfolios",
            JSON.stringify(homeData.portfolios),
          );
        }
        if (homeData.investfolios) {
          setInvestfolios(homeData.investfolios);
          localStorage.setItem(
            "investfolios",
            JSON.stringify(homeData.investfolios),
          );
        }
      }

      const res = await fetch(`${config.backendUrl}/networth`, {
        headers: buildAuthHeaders({
          "Content-Type": "application/json",
        }),
      });

      const data = await res.json();
      if (!res.ok && data.token === false) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      setNetWorthINR(data.networth ?? 0);

      if (data.cashholdings) {
        setCashHoldings(data.cashholdings);
      }
    } catch (error) {
      console.error("Error deleting from backend:", error);
      alert("Failed to delete portfolio from backend.");
    }
    setConfirmDeleteId(null);
    setOpenMenuId(null);
  };

  useEffect(() => {
    const handleRender = () => setIsNavigating(false);
    window.addEventListener("pageRendered", handleRender);
    return () => window.removeEventListener("pageRendered", handleRender);
  }, []);

  if (portfolios.length === 0 && setInvestfolios.length === 0) return null;

  if (portfolios.length === 0 && investfolios.length === 0) return null;

  return (
    <>
      {(portfolios.length > 0 || investfolios.length > 0) && (
        <h3 className="text-1xl font-bold uppercase tracking-[0.25em] text-slate-100 text-center dark:text-slate-400">
          Your Portfolios
        </h3>
      )}
      {isNavigating && <Loader />}

      <div className="w-full mt-0 flex flex-col items-center px-2">
        {/* INVESTFOLIOS */}
        {investfolios.length > 0 && (
          <>
            {/* (Optional) helps disable hover transforms on others when a menu is open */}
            {/** const anyMenuOpen = openMenuId !== null; */}

            <ul className="w-full max-w-2xl md:max-w-3xl flex flex-col gap-5">
              {investfolios.map((p) => {
                const menuActive =
                  openMenuId === p.id || confirmDeleteId === p.id;

                return (
                  <li
                    key={p.id}
                    className={`relative isolate overflow-visible w-full transition-transform duration-200 ease-out
                              hover:-translate-y-0.5 hover:shadow-2xl
                              ${menuActive ? "z-[999]" : "z-[1]"}`}
                  >
                    {/* Inner clipped panel keeps backdrop blur within rounded corners */}
                    <div className="glass-panel rounded-3xl px-3.5 sm:px-6 py-3.5 sm:py-4 text-slate-100">
                      {/* Main content */}
                      <div
                        onClick={() => handleInvestClick(p.id)}
                        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="portfolio-name font-semibold tracking-tight">
                            {p.name}
                          </span>
                          <span className="text-[0.65rem] uppercase tracking-[0.45em] text-slate-300/70">
                            {p.type}
                          </span>
                        </div>

                        {(xirr || xirr === 0) && (
                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="glass-chip text-[0.7rem] uppercase tracking-[0.4em] text-emerald-200/90">
                              XIRR {xirr}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3-dot button (absolute, outside the clipped panel) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === p.id ? null : p.id);
                        setConfirmDeleteId(null);
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 
                              flex items-center justify-center 
                              w-6 h-8 rounded-full
                              border border-white/20 
                              bg-white/10 
                              text-white 
                              shadow-lg 
                              backdrop-blur-md 
                              transition-transform duration-200 ease-out 
                              hover:scale-[1.05] hover:bg-white/20 
                              focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent
                              dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                      title="Portfolio menu"
                    >
                      &#x22EE;
                    </button>

                    {/* Dropdown menu (sibling -> not clipped by the panel) */}
                    {openMenuId === p.id && (
                      <div className="glass-menu absolute right-4 top-14 min-w-[190px] rounded-2xl p-3 z-[1000] text-sm text-slate-100/90">
                        {confirmDeleteId === p.id ? (
                          <div className="space-y-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                              Confirm Delete
                            </p>
                            <div className="flex justify-end gap-2">
                              <button
                                className="glass-chip text-[0.65rem] uppercase tracking-[0.3em] text-slate-200/80"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                  setOpenMenuId(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="glass-button px-4 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(p.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(p.id);
                            }}
                            className="glass-button w-full text-left px-4 py-2 rounded-xl text-rose-300 hover:text-rose-200 transition"
                          >
                            Delete Portfolio
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* CASH & SAVINGS */}
        {portfolios.length > 0 && (
          <>
            <ul className="w-full max-w-2xl md:max-w-3xl flex flex-col gap-5 mt-5">
              {portfolios.map((p) => {
                const menuActive =
                  openMenuId === p.id || confirmDeleteId === p.id;
                const balance = cashHoldings[p.id];
                const isPositive = balance !== undefined && balance >= 0;

                return (
                  <li
                    key={p.id}
                    className={`relative isolate overflow-visible w-full transition-transform duration-200 ease-out
                                hover:-translate-y-0.5 hover:shadow-2xl
                                ${menuActive ? "z-[999]" : "z-[1]"}`}
                  >
                    {/* Inner clipped panel (keeps blur inside rounded corners) */}
                    <div className="glass-panel rounded-3xl px-3.5 sm:px-6 py-3.5 sm:py-4 text-slate-100">
                      {/* Content area */}
                      <div
                        onClick={() => handleClick(p.id)}
                        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="portfolio-name font-semibold tracking-tight">
                            {p.name}
                          </span>
                          <span className="text-[0.65rem] uppercase tracking-[0.45em] text-slate-300/70">
                            {p.type}
                          </span>
                        </div>

                        {/* 
                        <div className="flex items-center gap-3 text-sm sm:text-base font-semibold">
                          {balance !== undefined ? (
                            <span className={isPositive ? "text-emerald-300" : "text-rose-300"}>
                              {IndianFormatter(balance)}
                            </span>
                          ) : (
                            <span className="inline-block h-4 w-16 rounded bg-white/20 animate-pulse" />
                          )}
                          <span className="glass-chip text-[0.6rem] uppercase tracking-[0.4em] text-slate-100/80">
                            {p.currency}
                          </span>
                        </div>
                        */}
                      </div>
                    </div>

                    {/* 3-dot bubble: absolute, outside the clipped panel */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === p.id ? null : p.id);
                        setConfirmDeleteId(null);
                      }}
                      title="Portfolio menu"
                      className="absolute right-4 top-1/2 -translate-y-1/2
                                group flex items-center justify-center w-6 h-8 rounded-full
                                border border-white/20 bg-white/10 text-white
                                shadow-lg backdrop-blur-md
                                transition-transform duration-200 ease-out
                                hover:scale-[1.05] hover:bg-white/20
                                focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent
                                dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    >
                      &#x22EE;
                    </button>

                    {/* Dropdown menu (sibling => not clipped by the panel) */}
                    {openMenuId === p.id && (
                      <div className="glass-menu absolute right-4 top-14 min-w-[190px] rounded-2xl p-3 z-[1000] text-sm text-slate-100/90">
                        {confirmDeleteId === p.id ? (
                          <div className="space-y-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                              Confirm Delete
                            </p>
                            <div className="flex justify-end gap-2">
                              <button
                                className="glass-chip text-[0.65rem] uppercase tracking-[0.3em] text-slate-200/80"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                  setOpenMenuId(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="glass-button px-4 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(p.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(p.id);
                            }}
                            className="glass-button w-full text-left px-4 py-2 rounded-xl text-rose-300 hover:text-rose-200 transition"
                          >
                            Delete Portfolio
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
};

export default PortfolioList;
