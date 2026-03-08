import React, { useMemo, useDeferredValue, useCallback } from "react";
import type { IndividualInvestment, FolioStat } from "../../config/types";
import { FiTrendingUp } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { IndianFormatter } from "../../config/types";

interface InvestmentListProps {
  investments: IndividualInvestment[];
  handleDelete: (investmentId: string) => void;
  folioStats: Record<string, FolioStat>;
}

const InvestmentList: React.FC<InvestmentListProps> = ({
  investments,
  handleDelete,
  folioStats,
}) => {
  const navigate = useNavigate();

  const sortedInvestments = useMemo(() => {
    if (investments.length === 0) return [] as IndividualInvestment[];
    return [...investments].sort((a, b) => {
      const valA = folioStats?.[a.id]?.current ?? 0;
      const valB = folioStats?.[b.id]?.current ?? 0;
      return valB - valA;
    });
  }, [investments, folioStats]);

  const deferredInvestments = useDeferredValue(sortedInvestments);

  const handleOpenDetails = useCallback(
    (investmentId: string, portfolioId?: string) => {
      requestAnimationFrame(() => {
        navigate(`/investments/${investmentId}`, {
          state: { portfolioid: portfolioId },
        });
      });
    },
    [navigate],
  );

  const handleOpenChart = useCallback(
    (investmentId: string, portfolioId?: string) => {
      requestAnimationFrame(() => {
        navigate(`/investments/${investmentId}/chart`, {
          state: { portfolioid: portfolioId },
        });
      });
    },
    [navigate],
  );

  return (
    <>
      {investments.length > 0 && (
        <ul className="w-full max-w-2xl md:max-w-3xl flex flex-col gap-5 mx-auto">
          {deferredInvestments.map((investment) => {
            const stats = folioStats?.[investment.id];
            const currentColor = stats
              ? stats.current > stats.invested
                ? "text-emerald-300"
                : stats.current < stats.invested
                  ? "text-rose-300"
                  : "text-slate-200/80"
              : "text-slate-200/80";
            return (
              <li
                key={investment.id}
                onClick={() =>
                  handleOpenDetails(investment.id, investment.portfolioid)
                }
                className="relative glass-panel cursor-pointer rounded-3xl px-5 sm:px-6 py-4 sm:py-6 text-slate-100 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Text side */}
                  <div className="flex-1 min-w-0">
                    <span
                      className="
                          portfolio-name
                          font-semibold tracking-tight
                  
                          block overflow-hidden whitespace-nowrap
                          [mask-image:linear-gradient(to_right,black_85%,transparent)]
                          [-webkit-mask-image:linear-gradient(to_right,black_85%,transparent)]
                          sm:[mask-image:none] sm:[-webkit-mask-image:none]
                        "
                      title={investment.name}
                    >
                      {investment.name}
                    </span>

                    {/* If you also want these inline and fade, wrap them similarly */}
                    {/* <div className="mt-1 hidden sm:flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.35em] text-slate-300/70">
                        <span>{investment.type}</span>
                        {investment.category && (
                          <span className="glass-chip text-[0.6rem] uppercase tracking-[0.3em] text-slate-100/80">
                            {investment.category}
                          </span>
                        )}
                        <span className="glass-chip text-[0.6rem] uppercase tracking-[0.3em] text-slate-100/80">
                          {investment.currency}
                        </span>
                      </div> */}
                  </div>

                  {/* Right side (kept on same line) */}
                  <div className="flex items-center gap-2 shrink-0 text-xs sm:text-sm text-slate-200/90">
                    {stats ? (
                      <span
                        className={
                          stats.xirr >= 0 ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        XIRR {(stats.xirr * 100).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="inline-block h-4 w-20 rounded bg-white/15 animate-pulse" />
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenChart(investment.id, investment.portfolioid);
                      }}
                      title="View Chart"
                      className="w-6 h-6 text-slate-100"
                      data-tone="plots"
                    >
                      <FiTrendingUp className="text-base" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export default React.memo(InvestmentList);
