package process

import (
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"math"
	"sort"
	"strings"
	"time"
)

// WorthSnapshot holds total net worth at a given date
// recorded around 2 AM server time

type WorthSnapshot struct {
	Date  time.Time `bson:"date" json:"date"`
	Total float64   `bson:"total" json:"total"`
	Email string    `bson:"email" json:"-"`
}

func convertAmountToINR(amount float64, currency string, rates map[string]float64) float64 {
	if amount <= 0 {
		return 0
	}

	trimmed := strings.TrimSpace(currency)
	if trimmed == "" {
		return amount
	}

	upper := strings.ToUpper(trimmed)
	if upper == "INR" {
		return amount
	}

	if rates == nil {
		return 0
	}

	lookupKeys := []string{trimmed, upper, strings.ToLower(trimmed)}
	var rate float64
	for _, key := range lookupKeys {
		if val, ok := rates[key]; ok {
			rate = val
			break
		}
	}
	if rate <= 0 {
		return 0
	}

	inrRate := rates["INR"]
	if inrRate == 0 {
		inrRate = rates["inr"]
	}
	if inrRate == 0 {
		inrRate = 1
	}

	if math.Abs(inrRate-1) < 1e-9 {
		return amount / rate
	}

	return (amount / rate) * inrRate
}

func normalizeCashCategory(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "Others"
	}

	switch strings.ToLower(trimmed) {
	case "savings", "saving":
		return "Savings"
	case "emergency fund", "emergencyfund", "emergency":
		return "Emergency Fund"
	case "others", "other":
		return "Others"
	default:
		return trimmed
	}
}

// InvestmentAllocation returns current value of each investment for percentage charts
func InvestmentAllocation(c *fiber.Ctx) error {
	token := state.AuthToken(c)
	user := state.AuthToEmail(token)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "No Authorization header", "token": false})
	}
	if val, found := state.Cache.Get(state.InvestmentAllocationKey(user)); found {
		if arr, ok := val.([]map[string]any); ok {
			return c.JSON(arr)
		}
	}
	holdings, _ := IndividualInvestHoldingsRaw(user)
	var result []map[string]any
	var total float64
	for _, v := range holdings {
		total += v
	}
	for name, val := range holdings {
		percent := 0.0
		if total > 0 {
			percent = (val / total) * 100
		}
		result = append(result, map[string]any{"name": name, "value": val, "percent": percent})
	}
	// Sort slice so larger values appear first
	sort.Slice(result, func(i, j int) bool {
		vi := result[i]["value"].(float64)
		vj := result[j]["value"].(float64)
		return vi > vj
	})
	state.Cache.Set(state.InvestmentAllocationKey(user), result, 12*time.Hour)
	return c.JSON(result)
}

// InvestmentCategoryAllocation groups investment values by category
func InvestmentCategoryAllocation(c *fiber.Ctx) error {
	token := state.AuthToken(c)
	user := state.AuthToEmail(token)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "No Authorization header", "token": false})
	}
	if val, found := state.Cache.Get(state.CategoryAllocationKey(user)); found {
		if payload, ok := val.(categoryAllocationPayload); ok {
			return c.JSON(payload)
		}

		if _, ok := val.([]map[string]any); ok {
			// Legacy cache entry from a previous version – discard and recompute.
			state.Cache.Delete(state.CategoryAllocationKey(user))
		}
	}

	payload, err := computeInvestmentCategoryAllocation(user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Failed to compute category allocation"})
	}

	state.Cache.Set(state.CategoryAllocationKey(user), payload, 12*time.Hour)
	return c.JSON(payload)
}

// IndianEquityAllocation groups Indian equity investments by equity type
func IndianEquityAllocation(c *fiber.Ctx) error {
	token := state.AuthToken(c)
	user := state.AuthToEmail(token)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "No Authorization header", "token": false})
	}
	if val, found := state.Cache.Get(state.IndianEquityAllocationKey(user)); found {
		if arr, ok := val.([]map[string]any); ok {
			return c.JSON(arr)
		}
	}

	filter := bson.M{"email": user, "investment": true, "category": "Indian Equity"}
	portfolios := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)
	typeTotals := make(map[string]float64)

	for _, p := range portfolios {
		var units float64
		entryFilter := bson.M{"email": user, "investmentid": p.ID}
		entries, err := mongo.GetAllFromMongoWithFilter(state.Database, state.EntriesCollection, entryFilter)
		if err != nil {
			continue
		}
		for _, e := range entries {
			t, _ := e["type"].(string)
			u, _ := e["units"].(float64)
			if t == "buy" {
				units += u
			} else if t == "sell" {
				units -= u
			}
		}
		_, nav, err := GetLatestNAV(float64(p.Code))
		if err != nil {
			continue
		}
		val := units * nav
		et := p.EquityType
		if et == "" {
			et = "Other"
		}
		typeTotals[et] += val
	}

	var total float64
	for _, v := range typeTotals {
		total += v
	}

	var result []map[string]any
	for et, val := range typeTotals {
		percent := 0.0
		if total > 0 {
			percent = (val / total) * 100
		}
		result = append(result, map[string]any{"type": et, "value": val, "percent": percent})
	}
	state.Cache.Set(state.IndianEquityAllocationKey(user), result, 12*time.Hour)
	return c.JSON(result)
}

// CashCurrencyAllocation groups cash holdings by currency using current rates
func CashCurrencyAllocation(c *fiber.Ctx) error {
	token := state.AuthToken(c)
	user := state.AuthToEmail(token)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "No Authorization header", "token": false})
	}

	holdings, currencies, _ := IndividualCashHoldingsRaw(user)
	rates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates, using fallback")
		rates = map[string]float64{"INR": 1, "USD": 0.012, "EUR": 0.011}
	}

	totals := make(map[string]float64)
	var totalINR float64
	for id, amount := range holdings {
		if amount <= 0 {
			continue
		}

		currency := strings.TrimSpace(currencies[id])
		if currency == "" {
			currency = "INR"
		}

		upperCurrency := strings.ToUpper(currency)
		rate := rates[currency]
		if rate == 0 {
			rate = rates[upperCurrency]
		}
		if upperCurrency == "INR" {
			rate = 1
		}
		if rate == 0 {
			continue
		}

		val := amount
		if upperCurrency != "INR" {
			val = amount / rate
		}

		totals[upperCurrency] += val
		totalINR += val
	}

	var result []map[string]any
	for cur, val := range totals {
		percent := 0.0
		if totalINR > 0 {
			percent = (val / totalINR) * 100
		}
		result = append(result, map[string]any{"name": cur, "value": val, "percent": percent})
	}

	return c.JSON(result)
}

func computeCashCategoryTotals(user string) (map[string]float64, error) {
	holdings, currencies, categories := IndividualCashHoldingsRaw(user)
	totals := make(map[string]float64)
	if len(holdings) == 0 {
		return totals, nil
	}

	rates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates for cash categories, using fallback")
		rates = map[string]float64{"INR": 1, "USD": 0.012, "EUR": 0.011}
	}

	for id, amount := range holdings {
		if amount <= 0 {
			continue
		}

		category := normalizeCashCategory(categories[id])

		currency := strings.TrimSpace(currencies[id])
		if currency == "" {
			currency = "INR"
		}

		value := convertAmountToINR(amount, currency, rates)
		if value <= 0 {
			continue
		}

		key := fmt.Sprintf("%s Cash", category)
		totals[key] += value
	}

	return totals, nil
}

func computeSavingsCurrencyTotals(user string) (map[string]float64, error) {
	holdings, currencies, categories := IndividualCashHoldingsRaw(user)
	totals := make(map[string]float64)
	if len(holdings) == 0 {
		return totals, nil
	}

	rates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates for savings categories, using fallback")
		rates = map[string]float64{"INR": 1, "USD": 0.012, "EUR": 0.011}
	}

	for id, amount := range holdings {
		if amount <= 0 {
			continue
		}

		category := normalizeCashCategory(categories[id])
		if category != "Savings" {
			continue
		}

		currency := strings.TrimSpace(currencies[id])
		if currency == "" {
			currency = "INR"
		}

		value := convertAmountToINR(amount, currency, rates)
		if value <= 0 {
			continue
		}

		upperCurrency := strings.ToUpper(currency)
		key := fmt.Sprintf("Cash %s", upperCurrency)
		totals[key] += value
	}

	return totals, nil
}

// CashCategoryCurrencyAllocation groups cash holdings by their category and currency combination.
func CashCategoryCurrencyAllocation(c *fiber.Ctx) error {
	token := state.AuthToken(c)
	user := state.AuthToEmail(token)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "No Authorization header", "token": false})
	}

	if val, found := state.Cache.Get(state.CashCategoryCurrencyKey(user)); found {
		if arr, ok := val.([]map[string]any); ok {
			return c.JSON(arr)
		}
	}

	holdings, currencies, categories := IndividualCashHoldingsRaw(user)
	if len(holdings) == 0 {
		return c.JSON([]map[string]any{})
	}

	rates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates for cash category chart, using fallback")
		rates = map[string]float64{"INR": 1, "USD": 0.012, "EUR": 0.011}
	}

	totals := make(map[string]float64)
	var totalINR float64

	for id, amount := range holdings {
		if amount <= 0 {
			continue
		}

		category := normalizeCashCategory(categories[id])

		currency := strings.TrimSpace(currencies[id])
		if currency == "" {
			currency = "INR"
		}

		value := convertAmountToINR(amount, currency, rates)
		if value <= 0 {
			continue
		}

		upperCurrency := strings.ToUpper(currency)
		key := category + "|" + upperCurrency
		totals[key] += value
		totalINR += value
	}

	var result []map[string]any
	for key, value := range totals {
		parts := strings.SplitN(key, "|", 2)
		category := parts[0]
		currency := ""
		if len(parts) > 1 {
			currency = parts[1]
		}
		percent := 0.0
		if totalINR > 0 {
			percent = (value / totalINR) * 100
		}
		label := fmt.Sprintf("%s - %s", category, currency)
		result = append(result, map[string]any{
			"category": category,
			"currency": currency,
			"value":    value,
			"percent":  percent,
			"label":    label,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		vi := result[i]["value"].(float64)
		vj := result[j]["value"].(float64)
		return vi > vj
	})

	state.Cache.Set(state.CashCategoryCurrencyKey(user), result, 15*time.Minute)

	return c.JSON(result)
}
