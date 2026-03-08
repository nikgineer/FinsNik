import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef, useTransition } from "react";
import config from "../../config";
import AddInvestmentModal from "./investmentModal";
import InvestmentList from "./Investmentlist";
import type { IndividualInvestment, FolioStat } from "../../config/types";
import { generateUUID } from "../../config";
import { motion } from "framer-motion";
import { IndianFormatter } from "../../config/types";
import {
  CACHE_TTL,
  getCached,
  setCache,
  invalidateGrowthCache,
  invalidateInvestmentListCache,
} from "../../utils/cache";
import { createSafeAreaStyle } from "../../utils/safeArea";

type Portfolio = {
  id: string;
  type: string;
  name: string;
  currency: string;
  token?: string;
  investmentType?: string;
};

export default function InvestPortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [investments, setInvestments] = useState<IndividualInvestment[]>([]);
  const [investment, setInvestment] = useState<IndividualInvestment | null>(
    null,
  );
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [investmentModalOpen, setInvestmentModalOpen] = useState(false);
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState("");
  const [category, setCategory] = useState("");
  const [equityType, setEquityType] = useState("");
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [wasSuggestionSelected, setWasSuggestionSelected] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [currentValue, setCurrentValue] = useState<number | undefined>(
    undefined,
  );
  const [xirr, setXirr] = useState<number | undefined>(undefined);
  const [invested, setInvested] = useState<number | undefined>(undefined);
  const [dayChange, setDayChange] = useState<number | undefined>(undefined);
  const [dayChangePct, setDayChangePct] = useState<number | undefined>(
    undefined,
  );
  const [isDataReady, setIsDataReady] = useState(false);
  const [folioStats, setFolioStats] = useState<Record<string, FolioStat>>({});

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const [, startInvestmentsTransition] = useTransition();

  const resetModal = useCallback(() => {
    setName("");
    setType("");
    setCurrency("");
    setCategory("");
    setEquityType("");
    setSuggestions([]);
    setWasSuggestionSelected(false);
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    resetModal();
    setInvestmentModalOpen(false);
  }, [resetModal]);

  const fetchPortfolio = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;

      const stored = localStorage.getItem("portfolios");
      if (stored) {
        const portfolios: Portfolio[] = JSON.parse(stored);
        const found = portfolios.find((p) => p.id === id);
        if (found) {
          if (!signal?.aborted) {
            setPortfolio(found);
          }
          return;
        }
      }

      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(`${config.backendUrl}/portfolios/${id}`, {
          headers: {
            "Content-Type": "application/json",
            token,
            type: "investment",
          },
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        const data = await res.json();
        if (signal?.aborted) {
          return;
        }

        if (!res.ok) {
          if ((data as any)?.token === false) {
            localStorage.removeItem("token");
            navigate("/login");
            return;
          }
          throw new Error("Failed to load portfolio");
        }

        const list = Array.isArray(data) ? data : [];
        const foundPortfolio = list.find((p: Portfolio) => p.id === id);
        if (foundPortfolio && !signal?.aborted) {
          setPortfolio(foundPortfolio);
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return;
        }
        console.error("Failed to load portfolio:", err);
        navigate("/main");
      }
    },
    [id, navigate],
  );

  const fetchInvestments = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;

      const cacheKey = `investments_${id}`;
      const cached = getCached<IndividualInvestment[]>(cacheKey, CACHE_TTL);
      if (cached && !signal?.aborted) {
        startInvestmentsTransition(() => {
          setInvestments(cached);
        });
        setIsPageLoading(false);
      }

      if (!cached && !signal?.aborted) {
        setIsPageLoading(true);
      }

      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(
          `${config.backendUrl}/invest/portfolios/${id}`,
          {
            headers: {
              "Content-Type": "application/json",
              token,
            },
            signal,
          },
        );

        if (signal?.aborted) {
          return;
        }

        const data = await res.json();
        if (signal?.aborted) {
          return;
        }

        if (!res.ok) {
          if ((data as any)?.token === false) {
            localStorage.removeItem("token");
            navigate("/login");
            return;
          }
          throw new Error("Failed to load investments");
        }

        const fetchedInvestments = Array.isArray(data.investments)
          ? (data.investments as IndividualInvestment[])
          : [];
        if (!signal?.aborted) {
          startInvestmentsTransition(() => {
            setInvestments(fetchedInvestments);
          });
          setCache(cacheKey, fetchedInvestments);
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return;
        }
        console.error("Failed to load investments:", err);
        navigate("/main");
      } finally {
        if (!signal?.aborted) {
          setIsPageLoading(false);
        }
      }
    },
    [id, navigate],
  );

  const fetchPortfolioHoldingsData = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) {
        console.error("ID is undefined");
        return;
      }

      const cacheKey = `investfoliodata_${id}`;
      const cached = getCached<any>(cacheKey, CACHE_TTL);
      if (cached && !signal?.aborted) {
        if (cached.allfolios) {
          setCurrentValue(cached.allfolios.current ?? 0);
          setInvested(cached.allfolios.invested ?? 0);
          setXirr(cached.allfolios.xirr ?? 0);
          setDayChange(cached.allfolios.daychange ?? 0);
          setDayChangePct(cached.allfolios.daychangepct ?? 0);
        }

        if (cached.investfoliodata) {
          const transformed: Record<string, FolioStat> = {};
          for (const [key, val] of Object.entries<any>(
            cached.investfoliodata,
          )) {
            transformed[key] = {
              invested: val.invested ?? 0,
              current: val.current ?? 0,
              xirr: val.xirr ?? 0,
            };
          }
          startInvestmentsTransition(() => {
            setFolioStats(transformed);
          });
        }
        setIsDataReady(true);
      }

      try {
        const token = localStorage.getItem("token") || "";
        const response = await fetch(
          `${config.backendUrl}/investfolio/worth/${id}`,
          {
            method: "GET",
            headers: {
              token,
              id,
            },
            signal,
          },
        );

        if (signal?.aborted) {
          return;
        }

        const data = await response.json();
        if (signal?.aborted) {
          return;
        }

        if (!response.ok) {
          if ((data as any)?.token === false) {
            localStorage.removeItem("token");
            navigate("/login");
            return;
          }
          throw new Error("Failed to load portfolio worth");
        }

        setCache(cacheKey, data);
        if (data.allfolios && !signal?.aborted) {
          setCurrentValue(data.allfolios.current ?? 0);
          setInvested(data.allfolios.invested ?? 0);
          setXirr(data.allfolios.xirr ?? 0);
          setDayChange(data.allfolios.daychange ?? 0);
          setDayChangePct(data.allfolios.daychangepct ?? 0);
        }

        if (data.investfoliodata && !signal?.aborted) {
          const transformed: Record<string, FolioStat> = {};
          for (const [key, val] of Object.entries<any>(data.investfoliodata)) {
            transformed[key] = {
              invested: val.invested ?? 0,
              current: val.current ?? 0,
              xirr: val.xirr ?? 0,
            };
          }
          startInvestmentsTransition(() => {
            setFolioStats(transformed);
          });
        }

        if (!signal?.aborted) {
          setIsDataReady(true);
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return;
        }
        console.error("Error fetching net worth:", err);
        setIsDataReady(true);
      }
    },
    [id, startInvestmentsTransition, navigate],
  );

  useEffect(() => {
    if (!id) return;

    const cached = getCached<IndividualInvestment[]>(
      `investments_${id}`,
      CACHE_TTL,
    );
    if (cached) {
      setInvestments(cached);
      setIsPageLoading(false);
    }

    const controller = new AbortController();

    const fetchAll = async () => {
      await Promise.allSettled([
        fetchInvestments(controller.signal),
        fetchPortfolio(controller.signal),
        fetchPortfolioHoldingsData(controller.signal),
      ]);
    };

    fetchAll();

    return () => {
      controller.abort();
    };
  }, [id, fetchInvestments, fetchPortfolio, fetchPortfolioHoldingsData]);

  const onSearchName = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!type || !trimmed) {
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
          searchAbortRef.current = null;
        }
        if (searchDebounceRef.current) {
          window.clearTimeout(searchDebounceRef.current);
          searchDebounceRef.current = null;
        }
        setSuggestions([]);
        return;
      }

      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }

      const controller = new AbortController();
      searchAbortRef.current = controller;

      searchDebounceRef.current = window.setTimeout(async () => {
        try {
          const token = localStorage.getItem("token") || "";
          const res = await fetch(
            `${config.backendUrl}/investments/search?type=${type}&query=${encodeURIComponent(trimmed)}`,
            {
              headers: {
                "Content-Type": "application/json",
                token,
              },
              signal: controller.signal,
            },
          );

          const data = await res.json();
          if (controller.signal.aborted) {
            return;
          }

          if (!res.ok) {
            if ((data as any)?.token === false) {
              localStorage.removeItem("token");
              navigate("/login");
              return;
            }
            throw new Error("Failed to fetch suggestions");
          }

          setSuggestions(Array.isArray(data) ? data : []);
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") {
            return;
          }
          console.error("Autocomplete error:", err);
          setSuggestions([]);
        } finally {
          if (searchDebounceRef.current) {
            window.clearTimeout(searchDebounceRef.current);
            searchDebounceRef.current = null;
          }
          if (searchAbortRef.current === controller) {
            searchAbortRef.current = null;
          }
        }
      }, 220);
    },
    [type, navigate],
  );

  const handleDelete = useCallback(
    (investmentId: string) => {
      startInvestmentsTransition(() => {
        setInvestments((prev) => prev.filter((inv) => inv.id !== investmentId));
      });
    },
    [startInvestmentsTransition],
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!type) {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      setSuggestions([]);
    }
  }, [type]);

  const handleDeleteConfirmed = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${config.backendUrl}/portfolios/${id}`, {
        method: "DELETE",
        headers: {
          token,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      if (!res.ok) {
        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        throw new Error("Failed to delete portfolio");
      }
      const stored = localStorage.getItem("investfolios");
      if (stored) {
        const list: IndividualInvestment[] = JSON.parse(stored);
        const updated = list.filter((inv) => inv.id !== id);
        invalidateInvestmentListCache(id ?? "");
        invalidateGrowthCache();
        localStorage.setItem("investfolios", JSON.stringify(updated));
      }

      navigate("/main");
    } catch (err) {
      console.error("Error deleting portfolio:", err);
      alert("An error occurred while deleting.");
    }
  };

  const handleSaveInvestment = useCallback(async () => {
    if (!name.trim()) {
      alert("Name is required.");
      return;
    }
    if (!type.trim()) {
      alert("Type is required.");
      return;
    }

    if (!wasSuggestionSelected && type !== "custom") {
      alert(
        `${type} "${name}" is not supported currently and should be tracked manually using NAV.`,
      );
    }

    const investCurrency = currency.trim() || "INR";
    const finalCategory = category.trim() || "Others";
    const token = localStorage.getItem("token") || "";

    if (finalCategory === "Indian Equity" && !equityType.trim()) {
      alert("Please select equity type.");
      return;
    }

    const newInvestment = {
      name: name.trim(),
      type: type.trim(),
      currency: investCurrency,
      category: finalCategory,
      equitytype: finalCategory === "Indian Equity" ? equityType.trim() : "",
      portfolioid: id,
      token,
      investmentid: generateUUID(),
    };

    try {
      const res = await fetch(`${config.backendUrl}/investments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token,
        },
        body: JSON.stringify(newInvestment),
      });

      const data = await res.json();
      if (!res.ok) {
        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        throw new Error("Failed to save investment");
      }

      invalidateInvestmentListCache(id ?? "");
      invalidateGrowthCache();
      await fetchInvestments();
      handleCloseModal();
    } catch (err) {
      console.error("Failed to save investment:", err);
      alert("Failed to save investment.");
    }
  }, [
    name,
    type,
    wasSuggestionSelected,
    currency,
    category,
    equityType,
    id,
    fetchInvestments,
    handleCloseModal,
    navigate,
  ]);

  const shouldBlock = isPageLoading && investments.length === 0;
  if (shouldBlock) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
        <div className="animate-spin h-12 w-12 rounded-full border-t-4 border-b-4 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
      className="app-stage text-light-text dark:text-dark-text"
      style={createSafeAreaStyle({ includeStageVars: true, top: "1.25rem" })}
    >
      {/* Back Button */}
      <button
        onClick={() => navigate("/main")}
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

      {/* Menu */}
      <div className="app-menu-button">
        <button
          onClick={() => {
            setMenuOpen((v) => !v);
            setShowConfirm(false);
          }}
          className="glass-icon-button app-icon-frame app-nav-button w-10 h-10 text-white"
          data-tone="menu"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1 w-55 glass-menu rounded-2xl p-3 z-50 text-slate-900 dark:text-slate-100 shadow-xl">
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="glass-button w-full text-left px-2 py-1 text-rose-300 hover:text-rose-200 transition rounded-xl font-semibold"
              >
                Delete
              </button>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                  Confirm Delete
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="glass-chip px-4 py-1.5 text-xs uppercase tracking-wide"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirmed}
                    className="glass-button px-4 py-1.5 text-xs text-rose-300 hover:text-rose-200"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portfolio Display */}
      <div className="mt-12 sm:mt-10 flex flex-col items-center text-center">
        <div className="glass-panel w-[90%] sm:w-[80%] md:w-[70%] lg:w-full max-w-2xl mx-auto rounded-3xl p-6 sm:p-8 text-center">
          <h1 className="portfolio-name font-semibold mb-3 text-lg text-center">
            {portfolio?.name}
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px] sm:text-sm text-slate-200/90">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                Current Value
              </p>
              {currentValue === undefined ? (
                <span className="inline-block h-4 w-24 rounded bg-white/20 animate-pulse" />
              ) : (
                <p className="text-lg font-semibold text-sky-200">
                  {IndianFormatter(currentValue)}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70 ">
                Invested
              </p>
              {invested === undefined ? (
                <span className="inline-block h-4 w-24 rounded bg-white/20 animate-pulse" />
              ) : (
                <p className="text-lg font-semibold text-fuchsia-200">
                  {IndianFormatter(invested)}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70 ">
                Total Return
              </p>
              {currentValue === undefined || invested === undefined ? (
                <span className="inline-block h-4 w-24 rounded bg-white/20 animate-pulse" />
              ) : (
                (() => {
                  const profit = currentValue - invested;
                  const percent =
                    invested === 0 ? 0 : (profit / invested) * 100;
                  const color =
                    profit > 0
                      ? "text-emerald-300"
                      : profit < 0
                        ? "text-rose-300"
                        : "text-slate-200/90";
                  const percentLabel =
                    invested === 0
                      ? "0.00%"
                      : `${profit > 0 ? "+" : profit < 0 ? "-" : ""}${Math.abs(percent).toFixed(2)}%`;
                  return (
                    <p className={`text-lg font-semibold ${color}`}>
                      {IndianFormatter(profit)} ({percentLabel})
                    </p>
                  );
                })()
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                XIRR
              </p>
              {xirr === undefined ? (
                <span className="inline-block h-4 w-20 rounded bg-white/20 animate-pulse" />
              ) : (
                <p
                  className={`text-lg font-semibold ${(xirr ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {(xirr * 100).toFixed(2)}%
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                Day Change
              </p>
              {dayChange === undefined || dayChangePct === undefined ? (
                <span className="inline-block h-4 w-24 rounded bg-white/20 animate-pulse" />
              ) : (
                <p
                  className={`text-lg font-semibold ${dayChange >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {IndianFormatter(dayChange)} ({dayChangePct.toFixed(2)}%)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Investment */}
      <div className="w-full flex justify-center">
        <button
          onClick={() => {
            resetModal();
            setInvestmentModalOpen(true);
          }}
          className="glass-button px-6 py-2"
        >
          Add Investment
        </button>
      </div>

      <AddInvestmentModal
        open={investmentModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveInvestment}
        name={name}
        setName={setName}
        type={type}
        setType={setType}
        currency={currency}
        setCurrency={setCurrency}
        category={category}
        setCategory={setCategory}
        equityType={equityType}
        setEquityType={setEquityType}
        suggestions={suggestions}
        onSearchName={onSearchName}
        setSuggestions={setSuggestions}
        wasSuggestionSelected={wasSuggestionSelected}
        setWasSuggestionSelected={setWasSuggestionSelected}
        editMode={false}
      />

      <InvestmentList
        investments={investments}
        handleDelete={handleDelete}
        folioStats={folioStats}
      />
    </motion.div>
  );
}
