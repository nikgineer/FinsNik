export const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function getCached<T>(key: string, ttl: number = CACHE_TTL): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ttl) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function setCache(key: string, data: any): void {
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
}

export function invalidateGrowthCache(investmentId?: string) {
  if (investmentId) {
    localStorage.removeItem(`investmentGrowth_${investmentId}`);
  }
  localStorage.removeItem("investGrowthData");
}

export function invalidateInvestmentListCache(portfolioId: string) {
  localStorage.removeItem(`investments_${portfolioId}`);
}

export function invalidateInvestmentCache(investmentId: string) {
  localStorage.removeItem(`investment_${investmentId}`);
  localStorage.removeItem(`investworth_${investmentId}`);
}
