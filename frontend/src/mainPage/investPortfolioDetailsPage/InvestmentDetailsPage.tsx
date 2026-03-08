import {
  useEffect,
  useState,
  useCallback,
  useRef,
  memo,
  useDeferredValue,
  useMemo,
  useTransition,
} from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FiMoreVertical } from "react-icons/fi";
import config, { generateUUID } from "../../config";
import type {
  IndividualInvestment,
  TransactionEntry,
} from "../../config/types";
import { IndianFormatter } from "../../config/types";
import AddInvestmentModal from "./investmentModal";
import {
  getCached,
  setCache,
  CACHE_TTL,
  invalidateGrowthCache,
  invalidateInvestmentListCache,
  invalidateInvestmentCache,
} from "../../utils/cache";
import { createSafeAreaStyle } from "../../utils/safeArea";
import { buildAuthHeaders } from "../../utils/auth";

type TransactionRowProps = {
  entry: TransactionEntry;
  investmentTypeLabel: string;
  currentNav: number;
  isMenuOpen: boolean;
  isConfirmingDelete: boolean;
  onToggleMenu: (entryId: string) => void;
  onEdit: (entry: TransactionEntry) => void;
  onRequestDelete: (entryId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (entry: TransactionEntry) => void;
};

type WorthMetrics = {
  currentNav: number;
  currentValue: number | null;
  investedValue: number | null;
  totalUnits: number | null;
  profitValue: number | null;
  xirrValue: number | null;
  averagePrice: number | null;
  navDate: Date | null;
  dayChangeValue: number | null;
  dayChangePct: number | null;
  investedSince: string | null;
};

const DEFAULT_WORTH_METRICS: WorthMetrics = {
  currentNav: 1,
  currentValue: null,
  investedValue: null,
  totalUnits: null,
  profitValue: null,
  xirrValue: null,
  averagePrice: null,
  navDate: null,
  dayChangeValue: null,
  dayChangePct: null,
  investedSince: null,
};

const createDefaultWorthMetrics = (): WorthMetrics => ({
  ...DEFAULT_WORTH_METRICS,
});

const TransactionRow = memo(function TransactionRow({
  entry,
  investmentTypeLabel,
  currentNav,
  isMenuOpen,
  isConfirmingDelete,
  onToggleMenu,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: TransactionRowProps) {
  const rise = (Number(currentNav) - Number(entry.price)) * Number(entry.units);
  const isPositive = rise >= 0;
  const menuActive = isMenuOpen || isConfirmingDelete;

  return (
    <div
      className={`glass-panel relative w-full flex flex-wrap items-center sm:justify-between gap-3 sm:gap-5 px-4 sm:px-6 pr-12 sm:pr-16 py-3 sm:py-4 rounded-3xl transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl ${menuActive ? "z-40" : "z-0"}`}
      data-allow-overflow
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-[420px]:gap-x-6 flex-1 min-w-0">
        <div className="flex flex-col leading-tight min-w-[5.5rem] sm:min-w-[6.5rem]">
          <span className="capitalize font-semibold text-white text-sm sm:text-base">
            {entry.type}
          </span>
          <span className="mt-0.5 text-[10px] sm:text-xs text-slate-300/80">
            {new Date(entry.date).toLocaleDateString()}
          </span>
        </div>

        <div
          className={`self-center min-[420px]:ml-2 text-left min-[420px]:text-center text-[10px] sm:text-sm font-medium px-1 sm:px-2 ${
            isPositive ? "text-emerald-200" : "text-rose-200"
          }`}
        >
          <div className="font-semibold text-[10px] sm:text-sm truncate max-w-[10rem] sm:max-w-none">
            {investmentTypeLabel} {isPositive ? "+" : "-"}
            {IndianFormatter(Math.abs(rise))}
          </div>
        </div>
      </div>

      <div className="ml-auto text-left min-[420px]:text-right">
        <div className="text-[10px] sm:text-base font-semibold text-white leading-tight">
          {IndianFormatter(entry.amount)}
        </div>
        <div className="text-[9px] sm:text-xs text-slate-300/80 leading-tight">
          {entry.units?.toFixed(1)} × {entry.price?.toFixed(1)}
        </div>
      </div>

      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          onClick={() => onToggleMenu(entry.id)}
          className="glass-icon-button w-6 h-8 rounded-full text-slate-100/80 hover:scale-105"
          title="Actions"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {isMenuOpen && (
          <div className="glass-menu absolute right-0 mt-2 rounded-2xl p-3  w-48 shadow-2xl z-50 text-slate-100">
            {!isConfirmingDelete ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onEdit(entry)}
                  className="glass-button flex w-full justify-start px-4 py-2 text-sky-100 text-left"
                >
                  Edit
                </button>

                <button
                  onClick={() => onRequestDelete(entry.id)}
                  className="glass-button flex w-full justify-start px-4 py-2 text-rose-200 text-left"
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                  Confirm Delete
                </p>
                <div className="flex justify-center gap-1">
                  <button
                    onClick={onCancelDelete}
                    className="glass-chip px-4 py-1.5 text-xs uppercase tracking-wide"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onConfirmDelete(entry)}
                    className="glass-button px-4 py-1.5 text-xs uppercase tracking-wide text-rose-200"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function InvestmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const portfolioid = (location.state as any)?.portfolioid as
    | string
    | undefined;

  const [investment, setInvestment] = useState<IndividualInvestment | null>(
    null,
  );
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
  const deferredTransactions = useDeferredValue(transactions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const intersectionRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);
  const stageHasAnimated = useRef(false);
  const dragStartXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const isPointerActiveRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const TRANSACTION_PAGE_SIZE = 10;
  const [, startTransactionsTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [units, setUnits] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [activeInfoSlide, setActiveInfoSlide] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [openEntryMenu, setOpenEntryMenu] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const [investmentModalOpen, setInvestmentModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState("");
  const [category, setCategory] = useState("");
  const [equityType, setEquityType] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [wasSuggestionSelected, setWasSuggestionSelected] = useState(false);

  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy");
  const [worthMetrics, setWorthMetrics] = useState<WorthMetrics>(
    createDefaultWorthMetrics,
  );
  const [isDataReady, setIsDataReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customNavInput, setCustomNavInput] = useState("");
  const [customAliasInput, setCustomAliasInput] = useState("");

  const totalReturnDisplay = useMemo(() => {
    const { profitValue, investedValue } = worthMetrics;
    if (profitValue == null || investedValue == null) {
      return null;
    }
    const percent =
      investedValue === 0 ? 0 : (profitValue / investedValue) * 100;
    const color =
      profitValue > 0
        ? "text-emerald-300"
        : profitValue < 0
          ? "text-rose-300"
          : "text-slate-200/90";
    const prefix = profitValue > 0 ? "+" : profitValue < 0 ? "-" : "";
    return {
      profitValue,
      percentLabel: `${prefix}${Math.abs(percent).toFixed(2)}%`,
      color,
    };
  }, [worthMetrics.profitValue, worthMetrics.investedValue]);

  const xirrDisplay = useMemo(() => {
    const value = worthMetrics.xirrValue ?? 0;
    const color =
      value > 0
        ? "text-emerald-300"
        : value < 0
          ? "text-rose-300"
          : "text-slate-200/90";
    return {
      label: `${(value * 100).toFixed(2)}%`,
      color,
    };
  }, [worthMetrics.xirrValue]);

  const dayChangeDisplay = useMemo(() => {
    if (
      worthMetrics.dayChangeValue == null ||
      worthMetrics.dayChangePct == null
    ) {
      return null;
    }
    return {
      color:
        worthMetrics.dayChangeValue >= 0 ? "text-emerald-300" : "text-rose-300",
      value: worthMetrics.dayChangeValue,
      pct: worthMetrics.dayChangePct,
    };
  }, [worthMetrics.dayChangeValue, worthMetrics.dayChangePct]);

  const resetModalState = () => {
    setEditingEntryId(null);
    setUnits("");
    setPricePerUnit("");
    setDate(new Date().toISOString().slice(0, 10));
    setTransactionType("buy");
  };

  const handleToggleEntryMenu = useCallback((entryId: string) => {
    setConfirmDeleteId(null);
    setOpenEntryMenu((prev) => (prev === entryId ? null : entryId));
  }, []);

  const handleEditEntry = useCallback((entry: TransactionEntry) => {
    setModalOpen(true);
    const entryDate = entry.date ? new Date(entry.date) : null;
    const isoDate =
      typeof entry.date === "string" && entry.date.length >= 10
        ? entry.date.slice(0, 10)
        : entryDate && !Number.isNaN(entryDate.valueOf())
          ? entryDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
    setTransactionType((entry.type as "buy" | "sell") || "buy");
    setDate(isoDate);
    setEditingEntryId(entry.id);
    setUnits(entry.units?.toString() || "");
    setPricePerUnit(entry.price?.toString() || "");
    setOpenEntryMenu(null);
    setConfirmDeleteId(null);
  }, []);

  const handleRequestDeleteEntry = useCallback((entryId: string) => {
    setConfirmDeleteId(entryId);
  }, []);

  const handleCancelDeleteEntry = useCallback(() => {
    setConfirmDeleteId(null);
    setOpenEntryMenu(null);
  }, []);

  const fetchInvestment = useCallback(
    async (signal?: AbortSignal, options: { silent?: boolean } = {}) => {
      const silent = options.silent ?? false;
      if (!id) {
        if (!silent) {
          setIsLoading(false);
        }
        return;
      }

      const cacheKey = `investment_${id}`;
      const cached = getCached<IndividualInvestment>(cacheKey, CACHE_TTL);
      let resolvedFromCache = false;

      if (cached && !signal?.aborted) {
        setInvestment(cached);
        if (!silent) {
          setIsLoading(false);
        }
        resolvedFromCache = true;
      } else if (!signal?.aborted && !silent) {
        setIsLoading(true);
      }

      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(`${config.backendUrl}/investments/${id}`, {
          headers: {
            "Content-Type": "application/json",
            token,
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
          throw new Error("Not found");
        }

        const inv = (data as any).investments?.[id];
        if (Array.isArray(inv) && inv.length > 0 && !signal?.aborted) {
          const nextInvestment = inv[0];
          setInvestment(nextInvestment);
          setCache(cacheKey, nextInvestment);
        } else {
          throw new Error("Investment not found");
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch investment:", err);
        if (!resolvedFromCache && !silent) {
          setTimeout(() => {
            if (portfolioid) navigate(`/investportfolio/${portfolioid}`);
            else navigate("/main");
          }, 300);
        }
      } finally {
        if (!resolvedFromCache && !signal?.aborted && !silent) {
          setIsLoading(false);
        }
      }
    },
    [id, navigate, portfolioid],
  );

  const refreshTransactions = useCallback(() => {
    setTransactions([]);
    setPage(1);
    setHasMore(true);
    setRefreshKey((prev) => prev + 1);
    loadingRef.current = false;
  }, []);

  const handleConfirmDeleteEntry = useCallback(
    async (entry: TransactionEntry) => {
      const token = localStorage.getItem("token") || "";
      try {
        const res = await fetch(
          `${config.backendUrl}/transactions/${entry.id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              token,
              portfolioid: portfolioid ?? "",
              investmentid: id ?? "",
            },
          },
        );
        if (!res.ok) throw new Error("Failed to delete entry");
        refreshTransactions();
        invalidateGrowthCache(id ?? "");
        if (portfolioid) invalidateInvestmentListCache(portfolioid);
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Could not delete entry.");
      } finally {
        setConfirmDeleteId(null);
        setOpenEntryMenu(null);
      }
    },
    [id, portfolioid, refreshTransactions],
  );

  useEffect(() => {
    if (!id) return;
    refreshTransactions();
  }, [id, portfolioid, refreshTransactions]);

  useEffect(() => {
    if (!id || refreshKey === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    const fetchPage = async () => {
      loadingRef.current = true;
      setLoading(true);

      const token = localStorage.getItem("token") || "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        token,
      };
      if (portfolioid) headers["portfolioid"] = portfolioid;

      try {
        const res = await fetch(
          `${config.backendUrl}/transactions/${id}?page=${page}&limit=${TRANSACTION_PAGE_SIZE}`,
          { headers, signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        const data = await res.json();
        if (controller.signal.aborted || cancelled) {
          return;
        }

        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to load transactions");

        const newEntries: TransactionEntry[] = Array.isArray(
          (data as any).entries,
        )
          ? (data as any).entries
          : [];

        startTransactionsTransition(() => {
          setTransactions((prev) => {
            const base = page === 1 ? [] : prev;
            const seen = new Set(base.map((entry) => entry.id));
            const filtered = newEntries.filter(
              (entry) => entry && !seen.has(entry.id),
            );
            return page === 1 ? filtered : [...base, ...filtered];
          });
        });

        if (newEntries.length < TRANSACTION_PAGE_SIZE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError" || cancelled) {
          return;
        }
        console.error("fetchTransactions failed:", err);
        if (page === 1) setTransactions([]);
        setHasMore(false);
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setLoading(false);
        }
        loadingRef.current = false;
      }
    };

    fetchPage();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    id,
    page,
    refreshKey,
    portfolioid,
    navigate,
    startTransactionsTransition,
  ]);

  const setLoadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (intersectionRef.current) {
        intersectionRef.current.disconnect();
        intersectionRef.current = null;
      }

      if (!node || !hasMore) {
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !loadingRef.current && hasMore) {
            loadingRef.current = true;
            requestAnimationFrame(() => {
              setPage((prev) => prev + 1);
            });
          }
        },
        { rootMargin: "0px 0px 280px 0px", threshold: 0 },
      );

      intersectionRef.current = observer;
      observer.observe(node);
    },
    [hasMore],
  );

  useEffect(() => {
    return () => {
      intersectionRef.current?.disconnect();
      intersectionRef.current = null;
    };
  }, []);

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${config.backendUrl}/investments/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          token,
          portfolioid: portfolioid ?? "",
        },
      });
      if (!res.ok) throw new Error("Delete failed");

      invalidateInvestmentCache(id ?? "");
      invalidateGrowthCache(id ?? "");
      if (portfolioid) invalidateInvestmentListCache(portfolioid);

      setTimeout(() => {
        if (portfolioid) navigate(`/investportfolio/${portfolioid}`);
        else navigate("/main");
      }, 300);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleEditInvestment = async () => {
    if (!investment) return;
    const trimmedCategory = category.trim() || "Others";
    const trimmedCurrency = currency.trim() || "INR";
    const trimmedName = name.trim();
    const trimmedType = type.trim();
    const trimmedEquity =
      trimmedCategory === "Indian Equity" ? equityType.trim() : "";

    if (trimmedCategory === "Indian Equity" && !trimmedEquity) {
      alert("Please select equity type.");
      return;
    }
    try {
      const res = await fetch(
        `${config.backendUrl}/investments/${investment.id}`,
        {
          method: "PUT",
          headers: buildAuthHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: trimmedName,
            type: trimmedType,
            category: trimmedCategory,
            equitytype: trimmedEquity,
            currency: trimmedCurrency,
            portfolioid,
            investmentid: id,
          }),
        },
      );
      if (!res.ok) throw new Error("Update failed");
      await res.json();
      setInvestment((prev) =>
        prev
          ? {
              ...prev,
              name: trimmedName,
              type: trimmedType,
              category: trimmedCategory,
              equitytype: trimmedEquity,
              currency: trimmedCurrency,
            }
          : prev,
      );
      invalidateInvestmentListCache(portfolioid ?? "");
      invalidateInvestmentCache(id ?? "");
      invalidateGrowthCache(id ?? "");
      setInvestmentModalOpen(false);
      await Promise.all([
        fetchInvestment(undefined, { silent: true }),
        fetchInvestmentData(undefined, { silent: true }),
      ]);
    } catch (err) {
      console.error("Failed to update investment:", err);
      alert("Failed to update investment.");
    }
  };

  const applyWorthSnapshot = useCallback((snapshot: any) => {
    if (!snapshot) {
      setWorthMetrics(createDefaultWorthMetrics());
      return;
    }

    setWorthMetrics((prev) => {
      const investedAmount =
        typeof snapshot.invested === "number" ? snapshot.invested : null;
      const currentValueAmount =
        typeof snapshot.current === "number" ? snapshot.current : null;
      const totalUnits =
        typeof snapshot.units === "number" ? snapshot.units : null;
      const nav =
        typeof snapshot.nav === "number" ? snapshot.nav : prev.currentNav;

      const profitValue =
        typeof snapshot.profit === "number"
          ? snapshot.profit
          : investedAmount !== null && currentValueAmount !== null
            ? currentValueAmount - investedAmount
            : null;

      const navDateRaw = snapshot.date ? new Date(snapshot.date) : null;
      const navDate =
        navDateRaw && !isNaN(navDateRaw.getTime()) ? navDateRaw : null;

      return {
        currentNav: nav,
        currentValue: currentValueAmount,
        investedValue: investedAmount,
        totalUnits,
        profitValue,
        xirrValue: typeof snapshot.xirr === "number" ? snapshot.xirr : null,
        averagePrice:
          typeof snapshot.averageprice === "number"
            ? snapshot.averageprice
            : null,
        navDate,
        dayChangeValue:
          typeof snapshot.daychange === "number" ? snapshot.daychange : null,
        dayChangePct:
          typeof snapshot.daychangepct === "number"
            ? snapshot.daychangepct
            : null,
        investedSince:
          typeof snapshot.investedsince === "string"
            ? snapshot.investedsince
            : null,
      } satisfies WorthMetrics;
    });
  }, []);

  const fetchInvestmentData = useCallback(
    async (signal?: AbortSignal, options: { silent?: boolean } = {}) => {
      const silent = options.silent ?? false;
      if (!id) return;

      const cacheKey = `investworth_${id}`;
      const cached = getCached<any>(cacheKey, CACHE_TTL);
      let resolvedFromCache = false;

      if (cached && !signal?.aborted) {
        applyWorthSnapshot(cached);
        if (!silent) {
          setIsDataReady(true);
        }
        resolvedFromCache = true;
      } else if (!signal?.aborted && !silent) {
        setIsDataReady(false);
      }

      try {
        const response = await fetch(
          `${config.backendUrl}/investment/worth/${id}`,
          {
            method: "GET",
            headers: buildAuthHeaders({
              portfolioid: portfolioid ?? "",
            }),
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

        applyWorthSnapshot(data);
        setCache(cacheKey, data);
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return;
        }
        console.error("Error fetching net worth:", err);
      } finally {
        if (!signal?.aborted) {
          if (silent) {
            setIsDataReady(true);
          } else if (!resolvedFromCache) {
            setIsDataReady(true);
          }
        }
      }
    },
    [applyWorthSnapshot, id, portfolioid],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchInvestment(controller.signal);
    fetchInvestmentData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchInvestment, fetchInvestmentData]);

  const infoSlides = useMemo(() => {
    if (!investment)
      return [] as { key: string; label: string; content: ReactNode }[];

    const navDateLabel = worthMetrics.navDate
      ? worthMetrics.navDate.toLocaleDateString()
      : null;
    const currentNavLabel =
      worthMetrics.currentNav != null
        ? worthMetrics.currentNav.toFixed(2)
        : "N/A";
    const totalUnitsLabel =
      worthMetrics.totalUnits != null
        ? worthMetrics.totalUnits.toFixed(2)
        : "N/A";
    const averagePriceLabel =
      worthMetrics.averagePrice != null
        ? worthMetrics.averagePrice.toFixed(2)
        : "N/A";
    const dayChangeLabel =
      dayChangeDisplay && typeof dayChangeDisplay.pct === "number"
        ? `${IndianFormatter(dayChangeDisplay.value)} (${dayChangeDisplay.pct.toFixed(2)}%)`
        : "N/A";
    const investedSinceLabel = worthMetrics.investedSince ?? "—";

    return [
      {
        key: "overview",
        label: "Overview",
        content: (
          <div className="flex flex-col items-center text-center gap-5 sm:gap-6 min-h-[220px] sm:min-h-[240px] justify-center">
            <h1 className="portfolio-name font-bold text-center">
              {investment.name}
            </h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] sm:text-sm text-slate-200/90 w-full">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Current Value
                </p>
                <p className="text-lg font-semibold text-sky-200">
                  {worthMetrics.currentValue != null
                    ? IndianFormatter(worthMetrics.currentValue)
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Invested
                </p>
                <p className="text-lg font-semibold text-fuchsia-200">
                  {worthMetrics.investedValue != null
                    ? IndianFormatter(worthMetrics.investedValue)
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Total Return
                </p>
                <p className="text-lg font-semibold">
                  {totalReturnDisplay ? (
                    <span className={totalReturnDisplay.color}>
                      {IndianFormatter(totalReturnDisplay.profitValue)} (
                      {totalReturnDisplay.percentLabel})
                    </span>
                  ) : (
                    "N/A"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  XIRR
                </p>
                <p className="text-lg font-semibold">
                  <span className={xirrDisplay.color}>{xirrDisplay.label}</span>
                </p>
                {navDateLabel && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
                    {navDateLabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "snapshot",
        label: "Snapshot",
        content: (
          <div className="flex flex-col items-center text-center gap-5 sm:gap-6 min-h-[220px] sm:min-h-[240px] justify-center">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] sm:text-sm text-slate-200/90 w-full">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Current NAV
                </p>
                <p className="text-lg font-semibold text-sky-200">
                  {currentNavLabel}
                </p>
                {navDateLabel && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
                    {navDateLabel}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Average Price
                </p>
                <p className="text-lg font-semibold text-fuchsia-200">
                  {averagePriceLabel}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Total Units
                </p>
                <p className="text-lg font-semibold text-indigo-200">
                  {totalUnitsLabel}
                </p>
              </div>
              <div className="col-span-1 sm:row-start-3 sm:col-start-1">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Day Change
                </p>
                <p
                  className={`text-lg font-semibold ${dayChangeDisplay?.color ?? "text-slate-200/90"}`}
                >
                  {dayChangeLabel}
                </p>
              </div>
              <div className="col-span-1 sm:row-start-3 sm:col-start-2">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Invested Since
                </p>
                <p className="text-lg font-semibold text-emerald-200">
                  {investedSinceLabel}
                </p>
              </div>
            </div>
          </div>
        ),
      },
    ];
  }, [
    dayChangeDisplay,
    investment,
    totalReturnDisplay,
    worthMetrics,
    xirrDisplay,
  ]);

  const totalInfoSlides = infoSlides.length;

  useEffect(() => {
    if (totalInfoSlides <= 1) {
      if (activeInfoSlide !== 0) {
        setActiveInfoSlide(0);
      }
      return;
    }
    if (activeInfoSlide > totalInfoSlides - 1) {
      setActiveInfoSlide(totalInfoSlides - 1);
    }
  }, [activeInfoSlide, totalInfoSlides]);

  useEffect(() => {
    dragOffsetRef.current = 0;
    setDragOffset(0);
  }, [activeInfoSlide]);

  const finishDrag = useCallback(
    (target: HTMLDivElement | null) => {
      if (!isPointerActiveRef.current) {
        return;
      }

      if (activePointerIdRef.current != null && target) {
        try {
          target.releasePointerCapture(activePointerIdRef.current);
        } catch (err) {
          // ignore release errors
        }
      }

      isPointerActiveRef.current = false;
      activePointerIdRef.current = null;
      setIsDragging(false);

      const delta = dragOffsetRef.current;
      const threshold = 50;
      if (Math.abs(delta) > threshold && totalInfoSlides > 1) {
        setActiveInfoSlide((prev) => {
          let nextIndex = prev + (delta < 0 ? 1 : -1);
          if (nextIndex < 0) {
            nextIndex = 0;
          } else if (nextIndex > totalInfoSlides - 1) {
            nextIndex = totalInfoSlides - 1;
          }
          return nextIndex;
        });
      }

      dragOffsetRef.current = 0;
      dragStartXRef.current = 0;
      setDragOffset(0);
    },
    [totalInfoSlides],
  );

  const handleInfoPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (totalInfoSlides <= 1) return;

      isPointerActiveRef.current = true;
      activePointerIdRef.current = event.pointerId;
      dragStartXRef.current = event.clientX;
      dragOffsetRef.current = 0;
      setDragOffset(0);
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [totalInfoSlides],
  );

  const handleInfoPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPointerActiveRef.current) return;
      const delta = event.clientX - dragStartXRef.current;
      dragOffsetRef.current = delta;
      setDragOffset(delta);
    },
    [],
  );

  const handleInfoPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishDrag(event.currentTarget);
    },
    [finishDrag],
  );

  const handleInfoPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishDrag(event.currentTarget);
    },
    [finishDrag],
  );

  if (isLoading || !investment || !isDataReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
        <div className="animate-spin h-12 w-12 rounded-full border-t-4 border-b-4 border-cyan-400" />
      </div>
    );
  }

  const stageInitial = stageHasAnimated.current ? false : { opacity: 0, y: 50 };
  if (!stageHasAnimated.current) {
    stageHasAnimated.current = true;
  }

  const isPageLoading = loading && transactions.length === 0;

  return (
    <motion.div
      initial={stageInitial}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
      className="app-stage text-light-text dark:text-dark-text text-sm sm:text-base"
      style={createSafeAreaStyle({ includeStageVars: true, top: "1.25rem" })}
    >
      {/* Back Button */}
      <button
        onClick={() => {
          setTimeout(() => {
            if (portfolioid) navigate(`/investportfolio/${portfolioid}`);
            else navigate("/main");
          }, 300);
        }}
        className="glass-icon-button app-icon-frame app-nav-button app-back-button w-10 h-10 sm:w-12 sm:h-12 text-white"
        data-tone="back"
        title="Go Back"
      >
        <svg
          className="w-5 h-5 sm:w-6 sm:h-6"
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

      {/* Kebab menu (top-right) */}
      <div className="app-menu-button">
        <button
          onClick={() => {
            setMenuOpen((v) => !v);
            setShowConfirm(false);
          }}
          className="glass-icon-button app-icon-frame app-nav-button w-10 h-10 sm:w-12 sm:h-12 text-white"
          data-tone="menu"
        >
          <FiMoreVertical className="text-xl" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 glass-menu rounded-2xl p-3 z-50 shadow-xl">
            {!showConfirm ? (
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => {
                    if (!investment) return;
                    setName(investment.name);
                    setType(investment.type);
                    setCurrency(investment.currency);
                    setCategory(investment.category || "");
                    setEquityType(investment.equitytype || "");
                    setWasSuggestionSelected(true);
                    setEditMode(true);
                    setInvestmentModalOpen(true);
                    setMenuOpen(false);
                  }}
                  className="glass-button w-full text-left px-4 py-2 text-sky-300 hover:text-sky-200 rounded-xl font-semibold transition"
                >
                  Edit Investment
                </button>

                <button
                  onClick={() => {
                    setCustomNavInput("");
                    setCustomAliasInput("");
                    setCustomModalOpen(true);
                    setMenuOpen(false);
                  }}
                  className="glass-button w-full text-left px-4 py-2 text-fuchsia-300 hover:text-fuchsia-200 rounded-xl font-semibold transition"
                >
                  ➕ Add Custom
                </button>

                <button
                  onClick={() => setShowConfirm(true)}
                  className="glass-button w-full text-left px-4 py-2 text-rose-300 hover:text-rose-200 rounded-xl font-semibold transition"
                >
                  Delete Investment
                </button>
              </div>
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
                    onClick={handleDelete}
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

      {/* Custom modal */}
      {customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-slate-100">
            <h2 className="text-xl font-semibold mb-5 text-center text-white">
              Add Custom Info
            </h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Custom NAV
              </label>
              <input
                type="number"
                value={customNavInput}
                onChange={(e) => setCustomNavInput(e.target.value)}
                placeholder="e.g. 123.45"
                className="glass-input"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Alias Name
              </label>
              <input
                type="text"
                value={customAliasInput}
                onChange={(e) => setCustomAliasInput(e.target.value)}
                placeholder="e.g. My Fund"
                className="glass-input"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setCustomModalOpen(false)}
                className="glass-button"
                data-variant="ghost"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!id || !portfolioid) return;
                  try {
                    const payload = {
                      investmentid: id,
                      portfolioid,
                      customnav: Number(customNavInput),
                      alias: customAliasInput.trim(),
                    };
                    const res = await fetch(
                      `${config.backendUrl}/investment/custom`,
                      {
                        method: "POST",
                        headers: buildAuthHeaders({
                          "Content-Type": "application/json",
                        }),
                        body: JSON.stringify(payload),
                      },
                    );
                    if (!res.ok) throw new Error("Custom save failed");
                    invalidateInvestmentCache(id ?? "");
                    invalidateGrowthCache(id ?? "");
                    if (portfolioid) invalidateInvestmentListCache(portfolioid);
                    setCustomModalOpen(false);
                    await Promise.all([
                      fetchInvestment(undefined, { silent: true }),
                      fetchInvestmentData(undefined, { silent: true }),
                    ]);
                  } catch (err) {
                    console.error("Error saving custom data:", err);
                    alert("Failed to save custom values.");
                  }
                }}
                className="glass-button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {investmentModalOpen && (
        <AddInvestmentModal
          open={investmentModalOpen}
          onClose={() => {
            setInvestmentModalOpen(false);
            resetModalState();
          }}
          onSave={handleEditInvestment}
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
          setSuggestions={setSuggestions}
          onSearchName={() => {}}
          wasSuggestionSelected={wasSuggestionSelected}
          setWasSuggestionSelected={setWasSuggestionSelected}
          editMode={editMode}
        />
      )}

      <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 pb-10">
        {/* Investment summary */}
        <section className="mt-16 sm:mt-20 flex flex-col items-center text-center w-full">
          <div className="w-full max-w-2xl mx-auto">
            <div
              className="glass-panel relative w-full rounded-3xl overflow-hidden"
              role="group"
              aria-roledescription="carousel"
              aria-label="Investment overview"
            >
              <div
                className={`flex w-full ${totalInfoSlides > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                onPointerDown={handleInfoPointerDown}
                onPointerMove={handleInfoPointerMove}
                onPointerUp={handleInfoPointerUp}
                onPointerCancel={handleInfoPointerCancel}
                style={{
                  transform: `translateX(-${activeInfoSlide * 100}%) translateX(${dragOffset}px)`,
                  transition: isDragging ? "none" : "transform 0.35s ease",
                  touchAction: "pan-y",
                }}
              >
                {infoSlides.map((slide) => (
                  <div key={slide.key} className="w-full shrink-0">
                    <div className="px-6 sm:px-8 py-6 sm:py-8">
                      {slide.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {totalInfoSlides > 1 && (
              <>
                <div className="sr-only" aria-live="polite">
                  Showing {infoSlides[activeInfoSlide]?.label} information
                </div>
                <div className="flex justify-center gap-3 mt-4">
                  {infoSlides.map((slide, index) => (
                    <button
                      type="button"
                      key={slide.key}
                      onClick={() => setActiveInfoSlide(index)}
                      className={`rounded-full transition-all duration-200 ${
                        index === activeInfoSlide
                          ? "h-3 w-3 bg-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.25)]"
                          : "h-2.5 w-2.5 bg-slate-500/60 hover:bg-slate-400/80"
                      }`}
                      aria-label={`Show ${slide.label} details`}
                      aria-pressed={index === activeInfoSlide}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={() => {
              resetModalState();
              setTransactionType("buy");
              setModalOpen(true);
            }}
            className="glass-panel px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-sm font-semibold text-slate-100 hover:scale-[1.02] transition"
          >
            Add Entry
          </button>
        </div>

        {/* Transactions */}
        <div
          className="glass-panel rounded-3xl p-4 sm:p-6 space-y-4 page-turn-shell"
          data-allow-overflow
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Transactions
            </h2>
            <button
              onClick={() => refreshTransactions()}
              className="glass-chip text-xs uppercase tracking-widest"
            >
              Refresh
            </button>
          </div>

          {isPageLoading ? (
            <div className="space-y-3 sm:space-y-4 py-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="loading-glass-panel px-5 sm:px-7 py-5 shadow-2xl border border-white/10"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="h-11 w-11 rounded-2xl bg-white/10" />
                    <div className="flex flex-col gap-2 flex-1">
                      <span className="h-3 w-20 rounded-full bg-white/20" />
                      <span className="h-3 w-28 sm:w-36 rounded-full bg-white/10" />
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="h-3 w-16 sm:w-20 rounded-full bg-white/20" />
                      <span className="h-8 w-8 rounded-full bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-sm text-slate-300 py-6">
              No transactions yet. Add your first buy or sell entry to start
              tracking.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                {deferredTransactions.map((entry) => (
                  <TransactionRow
                    key={entry.id}
                    entry={entry}
                    investmentTypeLabel={
                      (investment as any)?.investmentType || ""
                    }
                    currentNav={worthMetrics.currentNav}
                    isMenuOpen={openEntryMenu === entry.id}
                    isConfirmingDelete={confirmDeleteId === entry.id}
                    onToggleMenu={handleToggleEntryMenu}
                    onEdit={handleEditEntry}
                    onRequestDelete={handleRequestDeleteEntry}
                    onCancelDelete={handleCancelDeleteEntry}
                    onConfirmDelete={handleConfirmDeleteEntry}
                  />
                ))}
              </div>
              {loading && deferredTransactions.length > 0 && (
                <div className="flex justify-center py-4">
                  <div className="loading-bar h-2 w-36">
                    <span className="sr-only">Loading more entries…</span>
                  </div>
                </div>
              )}
              {hasMore && (
                <div ref={setLoadMoreRef} className="h-1" aria-hidden />
              )}
              {!hasMore && deferredTransactions.length > 0 && (
                <p className="mt-6 text-center text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  🎉 You&apos;ve reached the end of this investment&apos;s
                  history.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {/* Add/Edit Transaction modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-slate-100">
            <h2 className="text-xl font-semibold mb-5 text-center text-white">
              Add Transaction
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Units
              </label>
              <input
                type="number"
                min={0}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="glass-input"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Price per Unit
              </label>
              <input
                type="number"
                min={0}
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                className="glass-input"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Total
              </label>
              <div className="glass-input bg-white/5 text-left font-semibold">
                {(Number(units) * Number(pricePerUnit)).toFixed(2)}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="glass-input glass-date-input"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Transaction Type
              </label>
              <select
                value={transactionType}
                onChange={(e) =>
                  setTransactionType(e.target.value as "buy" | "sell")
                }
                className="glass-input"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setModalOpen(false);
                  resetModalState();
                }}
                className="glass-button"
                data-variant="ghost"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsSaving(true);
                  const unitVal = Number(units);
                  const priceVal = Number(pricePerUnit);
                  if (unitVal <= 0 || priceVal <= 0) {
                    alert(
                      "Units and Price per Unit must both be greater than 0.",
                    );
                    setIsSaving(false);
                    return;
                  }
                  try {
                    const isEditing = !!editingEntryId;
                    const payload = {
                      id: editingEntryId || generateUUID(),
                      investmentid: id,
                      units: unitVal,
                      price: priceVal,
                      amount: unitVal * priceVal,
                      date: new Date(date).toISOString(),
                      type: transactionType,
                      portfolioid: portfolioid,
                    };
                    const res = await fetch(
                      isEditing
                        ? `${config.backendUrl}/transactions/${editingEntryId}`
                        : `${config.backendUrl}/transactions`,
                      {
                        method: isEditing ? "PUT" : "POST",
                        headers: buildAuthHeaders({
                          "Content-Type": "application/json",
                        }),
                        body: JSON.stringify(payload),
                      },
                    );
                    if (!res.ok) throw new Error("Failed to save transaction");
                    await res.json();

                    invalidateInvestmentCache(id ?? "");
                    invalidateGrowthCache(id ?? "");
                    await Promise.all([
                      fetchInvestment(undefined, { silent: true }),
                      fetchInvestmentData(undefined, { silent: true }),
                    ]);
                    refreshTransactions();
                    setModalOpen(false);
                    resetModalState();
                  } catch (err) {
                    console.error("Error saving transaction:", err);
                    alert("Failed to save transaction");
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="glass-button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
