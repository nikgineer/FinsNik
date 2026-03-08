import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import config from "../config";
import { createSafeAreaStyle } from "../utils/safeArea";
import { buildAuthHeaders } from "../utils/auth";

interface Entry {
  id: string;
  type: string;
  amount: number;
  date: string;
  portfolioid?: string;
  currency: string;
}

export default function AllTransactions() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalAmount, setModalAmount] = useState("");
  const [modalDate, setModalDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [openEntryMenu, setOpenEntryMenu] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);

  const calculateMonthlyCurrencyTotals = (entries: Entry[]) => {
    return entries.reduce(
      (acc, entry) => {
        const currency = entry.currency || "INR";
        const rawAmount =
          typeof entry.amount === "string"
            ? parseFloat(entry.amount)
            : entry.amount;
        const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
        if (!acc[currency]) {
          acc[currency] = { credit: 0, debit: 0 };
        }
        if (entry.type === "deposit" || entry.type === "buy") {
          acc[currency].credit += amount;
        } else {
          acc[currency].debit += amount;
        }
        return acc;
      },
      {} as Record<string, { credit: number; debit: number }>,
    );
  };

  const formatAmount = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  useEffect(() => {
    const fetchEntries = async () => {
      if (page === 1) setIsPageLoading(true);
      loadingRef.current = true;
      setLoading(true);

      try {
        const res = await fetch(
          `${config.backendUrl}/entries/all?page=${page}&limit=15`,
          {
            headers: buildAuthHeaders({
              "Content-Type": "application/json",
            }),
          },
        );

        const data = await res.json();
        if (!res.ok && data.token === false) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        const newEntries: Entry[] = data.entries || [];

        setEntries((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const filtered = newEntries.filter((e) => !seen.has(e.id));
          return [...prev, ...filtered];
        });

        if (newEntries.length < 15) setHasMore(false);
      } catch (err) {
        console.error("Error fetching entries:", err);
      } finally {
        setLoading(false);
        loadingRef.current = false;
        if (page === 1) setIsPageLoading(false);
      }
    };

    fetchEntries();
  }, [page]);

  const formatMonthKey = (dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`; // e.g., "2025-09"
  };

  // Group entries by month
  const groupedEntries: Record<string, typeof entries> = entries.reduce(
    (acc, entry) => {
      const key = formatMonthKey(entry.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    },
    {} as Record<string, typeof entries>,
  );

  useEffect(() => {
    if (loading || !hasMore || entries.length === 0) return;
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

  if (isPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
        <div className="animate-spin h-12 w-12 rounded-full border-t-4 border-b-4 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div
      className="app-stage text-light-text dark:text-dark-text"
      style={createSafeAreaStyle({ includeStageVars: true, top: "1.25rem" })}
    >
      <h1 className="text-3xl font-bold text-center mt-16 sm:mt-12 text-slate-100">
        All Transactions
      </h1>
      {/* 🔙 Back Button */}
      <button
        onClick={() => navigate("/main")}
        className="glass-icon-button app-icon-frame app-back-button w-12 h-12 text-white"
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
      {Object.keys(groupedEntries).map((month) => {
        const entriesForMonth = groupedEntries[month];
        const currencyTotals = calculateMonthlyCurrencyTotals(entriesForMonth);
        const currencyEntries = Object.entries(currencyTotals);
        return (
          <div
            key={month}
            className="glass-panel mb-8 rounded-3xl p-4 sm:p-6 shadow-xl"
            data-accent
            data-allow-overflow
            style={
              { "--panel-accent": "rgba(79, 70, 229, 0.35)" } as CSSProperties
            }
          >
            {/* Header with month and total */}
            <div className="flex justify-between items-center mb-4 px-1 text-slate-200">
              <h2 className="text-lg font-bold text-slate-100">
                {new Date(month).toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            {currencyEntries.length > 0 && (
              <div className="flex flex-wrap gap-3 sm:gap-4 mb-6">
                {currencyEntries.map(([currency, totals]) => (
                  <div
                    key={`${month}-${currency}`}
                    className="flex-1 min-w-[11rem] rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent px-4 py-3 shadow-inner backdrop-blur"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-300/80">
                      <span>{currency}</span>
                      <span className="text-cyan-200 font-semibold">
                        Summary
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 text-sm font-semibold">
                      <span className="text-emerald-200">
                        🟢 {currency} {formatAmount(totals.credit)}
                      </span>
                      <span className="text-rose-200">
                        🔴 {currency} {formatAmount(totals.debit)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Transactions List */}
            <div className="space-y-4">
              {entriesForMonth.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-panel rounded-3xl shadow-lg px-4 py-3 sm:px-6 sm:py-3 w-full flex items-center justify-between flex-wrap text-slate-100"
                >
                  {/* Left: Type & Date */}
                  <div className="flex flex-col">
                    <span
                      className={`capitalize text-lg font-bold ${entry.type === "deposit" || entry.type === "buy" ? "text-emerald-200" : "text-rose-200"}`}
                    >
                      {entry.type}
                    </span>
                    <span className="text-sm mt-1 text-slate-200/80">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Middle: Amount */}
                  <div className="text-right font-semibold text-slate-50 whitespace-nowrap mt-2 sm:mt-0 sm:ml-auto sm:mr-6 text-lg sm:text-xl">
                    {entry.currency}{" "}
                    {Number(entry.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </div>

                  {/* Right: 3-dot Menu */}
                  {/* <div className="relative">
                                <button
                                onClick={() =>
                                    setOpenEntryMenu(entry.id === openEntryMenu ? null : entry.id)
                                }
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"
                                >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <circle cx="12" cy="5" r="1.5" />
                                    <circle cx="12" cy="12" r="1.5" />
                                    <circle cx="12" cy="19" r="1.5" />
                                </svg>
                                </button>

                                {openEntryMenu === entry.id && (
                                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-xl z-20">
                                    {confirmDeleteId !== entry.id ? (
                                    <div className="flex flex-col">
                                        <button
                                        onClick={() => {
                                            setModalOpen(true);
                                            setModalType(entry.type);
                                            setModalAmount(entry.amount.toString());
                                            setModalDate(entry.date);
                                            setEditingEntryId(entry.id);
                                            setOpenEntryMenu(null);
                                        }}
                                        className="px-4 py-3 text-left text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 font-semibold rounded-t-xl transition"
                                        >
                                        ✏️ Edit
                                        </button>
                                        <button
                                        onClick={() => setConfirmDeleteId(entry.id)}
                                        className="px-4 py-3 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 font-semibold rounded-b-xl transition"
                                        >
                                        🗑️ Delete
                                        </button>
                                    </div>
                                    ) : (
                                    <div className="px-4 py-3 text-sm text-center">
                                        <p className="text-gray-800 dark:text-gray-100 mb-3">
                                        Delete this transaction?
                                        </p>
                                        <div className="flex justify-between gap-2">
                                        <button
                                            onClick={() => {
                                            setConfirmDeleteId(null);
                                            setOpenEntryMenu(null);
                                            }}
                                            className="flex-1 py-1.5 rounded-lg bg-gray-200 dark:bg-neutral-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-neutral-600 transition text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={async () => {
                                            const token = localStorage.getItem("token") || "";
                                            try {
                                                const res = await fetch(
                                                `${config.backendUrl}/cash/entries/${entry.id}`,
                                                {
                                                    method: "DELETE",
                                                    headers: {
                                                    "Content-Type": "application/json",
                                                    token,
                                                    },
                                                }
                                                );

                                                if (!res.ok)
                                                throw new Error("Failed to delete entry");

                                                setEntries((prev) =>
                                                prev.filter((e) => e.id !== entry.id)
                                                );
                                            } catch (err) {
                                                console.error("Delete failed:", err);
                                                alert("Could not delete entry.");
                                            }

                                            setConfirmDeleteId(null);
                                            setOpenEntryMenu(null);
                                            }}
                                            className="flex-1 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm"
                                        >
                                            Confirm
                                        </button>
                                        </div>
                                    </div>
                                    )}
                                </div>
                                )}
                            </div> */}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {hasMore && <div ref={observerRef} className="h-1 mt-16" aria-hidden />}
      {/* End Message */}
      <div className="text-center mt-12 text-gray-400 dark:text-gray-500 text-sm">
        🎉 You've reached the end of your transaction history.
      </div>
    </div>
  );
}
