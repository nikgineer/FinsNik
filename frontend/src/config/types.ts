// src/types.ts
export type IndividualInvestment = {
  id: string;
  type: string;
  name: string;
  category: string;
  equitytype?: string;
  currency: string;
  email: string;
  value?: number;
  xirr?: number;
  portfolioid: string;
  investmentType?: string;
};

export type InvestmentData = {
  id: string;
  nav: number;
  xirr: number;
  value: number;
  averagePrice?: number;
  date?: string;
};

export type TransactionEntry = {
  id: string;
  date: string;
  amount: number;
  type: string;
  units: number;
  price: number;
};

export interface FolioStat {
  invested: number;
  current: number;
  xirr: number;
}

const baseIndianFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Truncates accurately to 2 decimals (safe for financial use without rounding)
function truncateTo2Decimals(num: number): number {
  return Math.trunc(num * 100) / 100;
}

function formatInLakhs(v: number): string {
  const truncated = truncateTo2Decimals(v / 1e5);
  return `${truncated.toFixed(2)} L`;
}

function formatInCrores(v: number): string {
  const truncated = truncateTo2Decimals(v / 1e7);
  return `${truncated.toFixed(2)} Cr`;
}

export function IndianFormatter(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1e7) {
    return formatInCrores(value);
  }

  if (abs >= 1e5) {
    return formatInLakhs(value);
  }

  return baseIndianFmt.format(value);
}

// src/types/global.d.ts
interface Navigator {
  /** iOS Safari flag: true if running as "Add to Home Screen" web app */
  standalone?: boolean;
}
