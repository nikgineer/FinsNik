import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import config from "../../config";
import { IndianFormatter } from "../../config/types";
import { createSafeAreaStyle } from "../../utils/safeArea";
import { buildAuthHeaders } from "../../utils/auth";

// -------------------- Types --------------------
type Portfolio = {
  id: string;
  type: string;
  name: string;
  currency: string;
  category?: string;
  token?: string;
  investmentType?: string;
};

const CATEGORY_OPTIONS = ["Savings", "Emergency Fund", "Others"] as const;

type CashCategoryOption = (typeof CATEGORY_OPTIONS)[number];

interface Entry {
  id: string;
  type: "deposit" | "withdraw";
  amount: number | string;
  date: string; // ISO string
  portfolioid?: string; // ← keep snake‑case used by backend
  currency?: string;
}

type CashEntryRowProps = {
  entry: Entry;
  isMenuOpen: boolean;
  isConfirmingDelete: boolean;
  onToggleMenu: (entryId: string) => void;
  onEdit: (entry: Entry) => void;
  onRequestDelete: (entryId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (entry: Entry) => void;
};

const CashEntryRow = memo(function CashEntryRow({
  entry,
  isMenuOpen,
  isConfirmingDelete,
  onToggleMenu,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: CashEntryRowProps) {
  const isDeposit = entry.type === "deposit";
  const menuActive = isMenuOpen || isConfirmingDelete;

  return (
    <div
      className={`relative isolate overflow-visible w-full transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl ${menuActive ? "z-[999]" : "z-[1]"}`}
    >
      <div className="glass-panel rounded-3xl w-full flex items-center px-4 py-2 sm:px-6 sm:py-3 shadow-xl">
        <div className="flex-shrink-0 flex flex-col">
          <span
            className={`capitalize font-bold text-base ${isDeposit ? "text-emerald-200" : "text-rose-200"}`}
          >
            {entry.type}
          </span>
          <span className="text-xs mt-1 text-slate-200/80">
            {new Date(entry.date).toLocaleDateString()}
          </span>
        </div>

        <div className="flex-1 text-center font-semibold text-base whitespace-nowrap text-slate-50">
          {Number(entry.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}
        </div>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggleMenu(entry.id);
        }}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-8 rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform duration-200 ease-out hover:scale-[1.05] hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {isMenuOpen && (
        <div
          role="menu"
          className="glass-menu absolute right-3 sm:right-4 top-1/2 translate-y-6 min-w-[11rem] rounded-2xl p-2 z-[1000]"
        >
          {!isConfirmingDelete ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onEdit(entry)}
                className="glass-chip w-full text-left px-4 py-2 font-semibold hover:bg-white/10 transition text-slate-100 dark:text-slate-200 text-center"
              >
                Edit
              </button>

              <button
                onClick={() => onRequestDelete(entry.id)}
                className="glass-button w-full text-left px-4 py-2 font-semibold text-rose-200 hover:brightness-110 transition"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                Confirm Delete
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={onCancelDelete}
                  className="glass-chip text-[0.65rem] uppercase tracking-[0.3em] text-slate-200/80"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onConfirmDelete(entry)}
                  className="glass-button px-4 py-1 text-xs"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// -------------------- Modal Portal --------------------
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let el = document.getElementById("modal-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "modal-root";
      document.body.appendChild(el);
    }
    setRoot(el);
  }, []);
  if (!root) return null;
  return createPortal(children, root);
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"deposit" | "withdraw">("deposit");
  const [modalAmount, setModalAmount] = useState("");
  const [modalDate, setModalDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [openEntryMenu, setOpenEntryMenu] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] =
    useState<CashCategoryOption>("Savings");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Pagination
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const entriesRef = useRef<Entry[]>([]);

  const openEditModal = () => {
    const existingName = portfolio?.name ?? "";
    const rawCategory = (portfolio?.category ?? "Others").trim();
    const matchedCategory = CATEGORY_OPTIONS.includes(
      rawCategory as CashCategoryOption,
    )
      ? (rawCategory as CashCategoryOption)
      : "Others";

    setEditName(existingName);
    setEditCategory(matchedCategory);
    setShowConfirm(false);
    setMenuOpen(false);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      alert("Please provide a portfolio name.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await fetch(`${config.backendUrl}/portfolios/${id}`, {
        method: "PUT",
        headers: buildAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: trimmedName, category: editCategory }),
      });

      const data = await res.json().catch(() => ({}));
      if ((data as any)?.token === false) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }

      if (!res.ok) {
        throw new Error((data as any)?.message || "Failed to update portfolio");
      }

      setPortfolio((prev) =>
        prev
          ? {
              ...prev,
              name: trimmedName,
              category: editCategory,
            }
          : prev,
      );

      const stored = localStorage.getItem("portfolios");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Portfolio[];
          const updated = parsed.map((p) =>
            p.id === id
              ? { ...p, name: trimmedName, category: editCategory }
              : p,
          );
          localStorage.setItem("portfolios", JSON.stringify(updated));
        } catch (error) {
          console.error("Failed to update cached portfolios", error);
        }
      }

      localStorage.removeItem("homeData");
      setShowEditModal(false);
    } catch (error) {
      console.error("Failed to update portfolio", error);
      alert("Unable to update portfolio. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // -------------------- Fetch portfolio (localStorage → backend) --------------------
  useEffect(() => {
    if (!id) {
      navigate("/main");
      return;
    }
    const fetchPortfolio = async () => {
      const stored = localStorage.getItem("portfolios");
      if (stored) {
        const found = (JSON.parse(stored) as Portfolio[]).find(
          (p) => p.id === id,
        );
        if (found) {
          setPortfolio(found);
          setIsPageLoading(false);
          return;
        }
      }
      try {
        const res = await fetch(`${config.backendUrl}/portfolios/${id}`, {
          headers: buildAuthHeaders({
            "Content-Type": "application/json",
            type: "cash",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        setPortfolio(data as Portfolio);
      } catch (e) {
        console.error(e);
        navigate("/main");
      } finally {
        setIsPageLoading(false);
      }
    };
    fetchPortfolio();
  }, [id, navigate]);

  const PAGE_SIZE = 10;

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // -------------------- Fetch entries (paginated) --------------------
  useEffect(() => {
    if (!portfolio || !id || refreshKey === 0) return;

    let cancelled = false;

    const fetchEntries = async () => {
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await fetch(
          `${config.backendUrl}/entries/database/${id}?page=${page}&limit=${PAGE_SIZE}`,
          {
            headers: buildAuthHeaders({
              "Content-Type": "application/json",
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch entries");
        const newEntries: Entry[] = Array.isArray((data as any).entries)
          ? (data as any).entries
          : [];

        setEntries((prev) => {
          const base = page === 1 ? [] : prev;
          const seen = new Set(base.map((entry) => entry.id));
          const filtered = newEntries.filter(
            (entry) => entry && !seen.has(entry.id),
          );
          return page === 1 ? filtered : [...base, ...filtered];
        });

        if (newEntries.length < PAGE_SIZE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Error fetching entries", e);
          if (page === 1) setEntries([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        loadingRef.current = false;
      }
    };

    fetchEntries();
    return () => {
      cancelled = true;
    };
  }, [page, portfolio, id, navigate, refreshKey]);

  useEffect(() => {
    if (loading || !hasMore) return;
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current && hasMore) {
          loadingRef.current = true;
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: "0px 0px 320px 0px", threshold: 0 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [entries.length, hasMore, loading]);

  const refreshEntries = useCallback(() => {
    setEntries([]);
    setPage(1);
    setHasMore(true);
    setRefreshKey((prev) => prev + 1);
    loadingRef.current = false;
  }, []);

  const handleToggleEntryMenu = useCallback((entryId: string) => {
    setConfirmDeleteId(null);
    setOpenEntryMenu((prev) => (prev === entryId ? null : entryId));
  }, []);

  const handleEditEntry = useCallback((entry: Entry) => {
    setModalOpen(true);
    setModalType(entry.type);
    setModalAmount(String(entry.amount));
    setModalDate(entry.date.slice(0, 10));
    setEditingEntryId(entry.id);
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

  const handleConfirmDeleteEntry = useCallback(
    async (entry: Entry) => {
      try {
        localStorage.removeItem("cashGrowthData");
        const headers = buildAuthHeaders({
          "Content-Type": "application/json",
        });
        if (id) headers["portfolioid"] = id;

        const res = await fetch(
          `${config.backendUrl}/cash/entries/${entry.id}`,
          {
            method: "DELETE",
            headers,
          },
        );
        const data = await res.json().catch(() => ({}) as any);
        if ((data as any)?.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to delete entry");

        refreshEntries();

        const updatedHoldings = JSON.parse(
          localStorage.getItem("cashholdings") || "{}",
        );
        const total = entriesRef.current
          .filter((e) => e.id !== entry.id)
          .reduce((sum, e) => {
            const numericAmount =
              typeof e.amount === "string" ? parseFloat(e.amount) : e.amount;
            return e.type === "withdraw"
              ? sum - numericAmount
              : sum + numericAmount;
          }, 0);
        if (id) {
          updatedHoldings[id] = Number(total.toFixed(2));
          localStorage.setItem("cashholdings", JSON.stringify(updatedHoldings));
        }
      } catch (err) {
        console.error("Error deleting entry:", err);
        alert("Failed to delete entry");
      } finally {
        setConfirmDeleteId(null);
        setOpenEntryMenu(null);
      }
    },
    [id, navigate, refreshEntries],
  );

  const isEntriesLoading = loading && entries.length === 0;
  useEffect(() => {
    if (!id) return;
    refreshEntries();
  }, [id, refreshEntries]);

  // -------------------- Delete portfolio --------------------
  const handleDeleteConfirmed = async () => {
    if (!id) return;
    try {
      localStorage.removeItem("cashGrowthData");
      const res = await fetch(`${config.backendUrl}/portfolios/${id}`, {
        method: "DELETE",
        headers: buildAuthHeaders({
          "Content-Type": "application/json",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if ((data as any)?.token === false) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to delete portfolio");

      const stored = localStorage.getItem("portfolios");
      if (stored) {
        const filtered = (JSON.parse(stored) as Portfolio[]).filter(
          (p) => p.id !== id,
        );
        localStorage.setItem("portfolios", JSON.stringify(filtered));
      }
      navigate("/main");
    } catch (e) {
      console.error(e);
      alert("Could not delete portfolio.");
    }
  };

  if (isPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9998]">
        <div className="animate-spin h-12 w-12 rounded-full border-t-4 border-b-4 border-cyan-400" />
      </div>
    );
  }

  // Currency label for entries list
  const portfolioCurrency =
    portfolio?.currency || portfolio?.investmentType || "";

  const balanceDetails = (() => {
    if (typeof window === "undefined" || !id) return null;
    try {
      const holdings = JSON.parse(localStorage.getItem("cashholdings") || "{}");
      const value = holdings?.[id];
      if (typeof value === "number") {
        return { value, isPositive: value >= 0 };
      }
    } catch (error) {
      console.error("Failed to read cash holdings", error);
    }
    return null;
  })();

  // -------------------- Render --------------------
  return (
    <div
      className="app-stage text-light-text dark:text-dark-text text-sm sm:text-base"
      style={createSafeAreaStyle({ includeStageVars: true, top: "1.25rem" })}
    >
      {/* Back Button */}
      <button
        onClick={() => navigate("/main")}
        title="Go Back"
        className="glass-icon-button app-icon-frame app-nav-button app-back-button w-10 h-10 text-white z-40"
        data-tone="back"
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

      {/* Portfolio Actions Menu */}
      <div className="app-menu-button z-40">
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
          <div className="absolute right-0 mt-2 w-55 glass-menu rounded-2xl p-2 z-50 text-slate-900 dark:text-slate-100">
            {!showConfirm ? (
              <div className="space-y-2">
                <button
                  onClick={openEditModal}
                  className="glass-button w-full text-left px-4 py-2 rounded-xl"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="glass-button w-full text-left px-4 py-2 text-rose-300 hover:text-rose-200 transition rounded-xl font-semibold"
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
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

      {showEditModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-slate-900 dark:text-slate-100">
              <h2 className="text-xl font-semibold text-center mb-4">
                Edit Portfolio
              </h2>

              <label className="text-sm font-medium mb-1 block">
                Portfolio Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="glass-input mb-3"
                placeholder="Enter portfolio name"
              />

              <label className="text-sm font-medium mb-1 block">Category</label>
              <select
                value={editCategory}
                onChange={(e) =>
                  setEditCategory(e.target.value as CashCategoryOption)
                }
                className="glass-select mb-3"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <label className="text-sm font-medium mb-1 block">Currency</label>
              <input
                type="text"
                value={portfolioCurrency || ""}
                disabled
                className="glass-input mb-2 opacity-80"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Currency cannot be changed for an existing cash portfolio.
              </p>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="glass-button px-4 py-2 text-sm"
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="glass-button px-4 py-2 text-sm"
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Header */}
      <div className="mt-12 sm:mt-20 flex flex-col items-center text-center px-2">
        <div className="glass-panel w-full max-w-2xl mx-auto rounded-3xl p-6 sm:p-8 text-center sm:text-center shadow-xl">
          <h1 className="portfolio-name font-semibold mb-3 text-center">
            {portfolio?.name}
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[13px] sm:text-sm text-slate-200/90">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                Type
              </p>
              <p
                className="cash-portfolio-info-value text-lg font-semibold"
                data-tone="type"
              >
                {portfolio?.type ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                Category
              </p>
              <p
                className="cash-portfolio-info-value text-lg font-semibold"
                data-tone="category"
              >
                {portfolio?.category ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                Currency
              </p>
              <p
                className="cash-portfolio-info-value text-lg font-semibold"
                data-tone="currency"
              >
                {portfolioCurrency || "—"}
              </p>
            </div>
            {balanceDetails && (
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Balance
                </p>
                <p
                  className={`text-lg font-semibold ${
                    balanceDetails.isPositive
                      ? "text-emerald-300"
                      : balanceDetails.value < 0
                        ? "text-rose-300"
                        : "text-slate-200/90"
                  }`}
                >
                  {balanceDetails.isPositive
                    ? "+"
                    : balanceDetails.value < 0
                      ? "-"
                      : ""}
                  {IndianFormatter(Math.abs(balanceDetails.value))}{" "}
                  {portfolioCurrency}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Transaction */}
      <div className="w-full flex justify-center mb-1">
        <button
          onClick={() => {
            setModalOpen(true);
            setModalType("deposit");
            setModalAmount("");
            setModalDate(new Date().toISOString().slice(0, 10));
            setEditingEntryId(null);
          }}
          className="glass-button px-6 py-2"
        >
          Add Transaction
        </button>
      </div>

      {/* Modal Dialog (PORTAL) */}
      {modalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
            <div className="glass-panel w-full max-w-sm rounded-3xl p-7 sm:p-8 shadow-2xl text-slate-100 relative">
              <button
                aria-label="Close"
                onClick={() => {
                  setModalOpen(false);
                  setEditingEntryId(null);
                }}
                className="absolute top-3 right-3 glass-chip px-2 py-1"
              >
                ✕
              </button>

              <h2 className="text-xl font-bold mb-5 text-center tracking-tight text-white">
                {editingEntryId ? "Edit Transaction" : "Add Transaction"}
              </h2>

              {/* Type Selector */}
              <div className="mb-4">
                <label className="block mb-1 font-semibold text-slate-200">
                  Type
                </label>
                <select
                  value={modalType}
                  onChange={(e) =>
                    setModalType(e.target.value as "deposit" | "withdraw")
                  }
                  className="glass-select"
                >
                  <option value="deposit">Deposit</option>
                  <option value="withdraw">Withdraw</option>
                </select>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block mb-1 font-semibold text-slate-200">
                  Amount
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="glass-input"
                />
              </div>

              {/* Date Picker */}
              <div className="mb-4">
                <label className="block mb-1 font-semibold text-slate-200">
                  Date
                </label>
                <input
                  type="date"
                  value={modalDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="glass-input glass-date-input"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-3 justify-center mt-6">
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setEditingEntryId(null);
                  }}
                  className="glass-chip px-4 py-1.5 font-semibold"
                >
                  Cancel
                </button>

                <button
                  onClick={async () => {
                    if (!modalAmount || isNaN(Number(modalAmount))) {
                      alert("Please enter a valid amount.");
                      return;
                    }
                    if (!id) return;

                    const token = localStorage.getItem("token") || "";

                    try {
                      localStorage.removeItem("cashGrowthData");
                      const numericAmount = parseFloat(String(modalAmount));
                      const isoDate = new Date(modalDate).toISOString();
                      const currency = portfolio?.currency;

                      if (editingEntryId) {
                        // -------- Edit mode --------
                        const updatedEntry: Entry = {
                          id: editingEntryId,
                          type: modalType,
                          amount: numericAmount,
                          date: isoDate,
                          portfolioid: id,
                          currency,
                        };

                        const res = await fetch(
                          `${config.backendUrl}/cash/entries/${editingEntryId}`,
                          {
                            method: "PUT",
                            headers: {
                              "Content-Type": "application/json",
                              token,
                            },
                            body: JSON.stringify(updatedEntry),
                          },
                        );

                        const data = await res.json().catch(() => ({}));
                        if ((data as any)?.token === false) {
                          localStorage.removeItem("token");
                          navigate("/login");
                          return;
                        }
                        if (!res.ok) throw new Error("Failed to update entry");

                        refreshEntries();
                      } else {
                        // -------- Add mode --------
                        const newEntry: Entry = {
                          id: Date.now().toString(),
                          type: modalType,
                          amount: numericAmount,
                          date: isoDate,
                          portfolioid: id,
                          currency,
                        };

                        const res = await fetch(
                          `${config.backendUrl}/cash/entries`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              token,
                            },
                            body: JSON.stringify(newEntry),
                          },
                        );

                        const data = await res.json().catch(() => ({}));
                        if ((data as any)?.token === false) {
                          localStorage.removeItem("token");
                          navigate("/login");
                          return;
                        }
                        if (!res.ok) throw new Error("Failed to create entry");

                        refreshEntries();
                      }

                      // ------ Update local balance (cashholdings) ------
                      const currentHoldings = JSON.parse(
                        localStorage.getItem("cashholdings") || "{}",
                      );
                      let prevBal: number = id
                        ? Number(currentHoldings[id] || 0)
                        : 0;

                      let delta = parseFloat(String(modalAmount));
                      if (modalType === "withdraw") delta *= -1;

                      if (editingEntryId) {
                        // remove the old entry's impact before adding the new one
                        const existing = entries.find(
                          (e) => e.id === editingEntryId,
                        );
                        if (existing) {
                          const oldAmount = parseFloat(String(existing.amount));
                          const oldDelta =
                            existing.type === "withdraw"
                              ? -oldAmount
                              : oldAmount;
                          prevBal -= oldDelta;
                        }
                      }

                      const newBalance = parseFloat(
                        (prevBal + delta).toFixed(2),
                      );
                      if (id) {
                        localStorage.setItem(
                          "cashholdings",
                          JSON.stringify({
                            ...currentHoldings,
                            [id]: newBalance,
                          }),
                        );
                      }

                      setModalOpen(false);
                      setEditingEntryId(null);
                    } catch (err) {
                      console.error("Error saving entry:", err);
                      alert("Failed to save entry to backend.");
                    }
                  }}
                  className="glass-button px-5 py-2"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Entries List */}
      <div className="w-full sm:w-10/12 md:w-9/12 lg:w-8/12 mx-auto px-2 sm:px-4 md:px-6 mt-2 flex flex-col gap-2 sm:gap-3 md:gap-4">
        <div className="page-turn-shell rounded-[28px] sm:rounded-[32px]">
          {isEntriesLoading ? (
            <div className="space-y-3 sm:space-y-4 py-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="loading-glass-panel px-5 sm:px-7 py-5 shadow-2xl border border-white/10"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="h-11 w-11 rounded-2xl bg-white/10" />
                    <div className="flex-1 flex flex-col gap-2">
                      <span className="h-3 w-24 rounded-full bg-white/20" />
                      <span className="h-3 w-32 sm:w-40 rounded-full bg-white/10" />
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="h-3 w-16 sm:w-20 rounded-full bg-white/20" />
                      <span className="h-8 w-8 rounded-full bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-slate-300">No transactions yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <CashEntryRow
                    key={entry.id}
                    entry={entry}
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
              {loading && entries.length > 0 && (
                <div className="flex justify-center py-4">
                  <div className="loading-bar h-2 w-36">
                    <span className="sr-only">Loading more entries…</span>
                  </div>
                </div>
              )}
              {hasMore && <div ref={observerRef} className="h-1" aria-hidden />}
              {!hasMore && entries.length > 0 && (
                <p className="mt-6 text-center text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  🎉 You&apos;ve reached the end of your cash history.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
