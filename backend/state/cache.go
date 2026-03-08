package state

import (
	"encoding/json"
	"fmt"
	"strings"
)

func NetWorthKey(user string) string {
	return "networth_" + SanitizeEmail(user)
}

func HomeKey(user string) string {
	return "home_" + SanitizeEmail(user)
}

func InvestmentWorthKey(user, id string) string {
	return "investworth_" + SanitizeEmail(user) + "_" + id
}

func CashGrowthKey(user, r string) string {
	return "cashgrowth_" + SanitizeEmail(user) + "_" + strings.ToLower(r)
}

func InvestmentGrowthKey(user, r string) string {
	return "investgrowth_" + SanitizeEmail(user) + "_" + strings.ToLower(r)
}

func SingleInvestmentGrowthKey(user, id, r, portfolio string) string {
	return "singlegrowth_" + SanitizeEmail(user) + "_" + portfolio + "_" + id + "_" + strings.ToLower(r)
}

func InvestmentListKey(user, portfolio string) string {
	return "investlist_" + SanitizeEmail(user) + "_" + portfolio
}

func InvestmentAllocationKey(user string) string {
	return "investalloc_" + SanitizeEmail(user)
}

func CategoryAllocationKey(user string) string {
	return "categoryalloc_" + SanitizeEmail(user)
}

func IndianEquityAllocationKey(user string) string {
	return "iealloc_" + SanitizeEmail(user)
}

func CashCategoryCurrencyKey(user string) string {
	return "cashcatcur_" + SanitizeEmail(user)
}

func cashEntriesPrefix(user, portfolio string) string {
	if portfolio == "" {
		portfolio = "all"
	}
	return fmt.Sprintf("cashentries_%s_%s_", SanitizeEmail(user), portfolio)
}

func CashEntriesPageKey(user, portfolio string, page, limit int) string {
	return fmt.Sprintf("%sp%d_l%d", cashEntriesPrefix(user, portfolio), page, limit)
}

func InvalidateCashEntries(user, portfolio string) {
	prefixes := []string{cashEntriesPrefix(user, portfolio)}
	if portfolio != "" {
		// Any portfolio update can affect the aggregated "all" view.
		prefixes = append(prefixes, cashEntriesPrefix(user, ""))
	}
	for key := range Cache.Items() {
		for _, prefix := range prefixes {
			if strings.HasPrefix(key, prefix) {
				Cache.Delete(key)
				break
			}
		}
	}
}

func investmentTransactionsPrefix(user, investment, portfolio string) string {
	if portfolio == "" {
		portfolio = "all"
	}
	if investment == "" {
		investment = "all"
	}
	return fmt.Sprintf("investtx_%s_%s_%s_", SanitizeEmail(user), investment, portfolio)
}

func InvestmentTransactionsPageKey(user, investment, portfolio string, page, limit int) string {
	return fmt.Sprintf("%sp%d_l%d", investmentTransactionsPrefix(user, investment, portfolio), page, limit)
}

func InvalidateInvestmentTransactions(user, investment, portfolio string) {
	prefixes := []string{investmentTransactionsPrefix(user, investment, portfolio)}
	if investment != "" {
		// Transactions also appear in the aggregated portfolio/all views
		prefixes = append(prefixes, investmentTransactionsPrefix(user, investment, ""))
	}
	for key := range Cache.Items() {
		for _, prefix := range prefixes {
			if strings.HasPrefix(key, prefix) {
				Cache.Delete(key)
				break
			}
		}
	}
}

func InvalidateUserCache(user string) {
	Cache.Delete(NetWorthKey(user))
	Cache.Delete(HomeKey(user))

	prefixes := []string{
		"investworth_" + SanitizeEmail(user),
		"cashgrowth_" + SanitizeEmail(user),
		"investgrowth_" + SanitizeEmail(user),
		"singlegrowth_" + SanitizeEmail(user),
		"investlist_" + SanitizeEmail(user),
		"investalloc_" + SanitizeEmail(user),
		"categoryalloc_" + SanitizeEmail(user),
		"iealloc_" + SanitizeEmail(user),
		"cashcatcur_" + SanitizeEmail(user),
		"cashentries_" + SanitizeEmail(user),
		"investtx_" + SanitizeEmail(user),
	}
	for k := range Cache.Items() {
		for _, prefix := range prefixes {
			if strings.HasPrefix(k, prefix) {
				Cache.Delete(k)
				break
			}
		}
	}
}

func InvalidateAllNetWorth() {
	for k := range Cache.Items() {
		if strings.HasPrefix(k, "networth_") || strings.HasPrefix(k, "home_") || strings.HasPrefix(k, "investworth_") {
			Cache.Delete(k)
		}
	}
}

// CacheSize returns the approximate size in bytes of all cached values.
func CacheSize() int {
	size := 0
	for k, v := range Cache.Items() {
		size += len(k)
		if b, err := json.Marshal(v.Object); err == nil {
			size += len(b)
		}
	}
	return size
}
