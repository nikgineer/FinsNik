package process

import (
	"context"
	"encoding/json"
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func NetWorth(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	cacheKey := state.NetWorthKey(user)
	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.(map[string]any); ok {
			return c.JSON(data)
		}
	}

	cashHoldings, cashCurrency, cashCategory := IndividualCashHoldingsRaw(user)
	investHoldings, investCurrency := IndividualInvestHoldingsRaw(user)

	payload := assembleNetWorthPayload(cashHoldings, cashCurrency, cashCategory, investHoldings, investCurrency)
	state.Cache.Set(cacheKey, payload, 12*time.Hour)
	return c.JSON(payload)
}

// HomeData returns quick-loading data for the main page
func HomeData(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}

	cacheKey := state.HomeKey(user)
	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.(map[string]any); ok {
			return c.JSON(data)
		}
	}

	name := getWelComeName(user)
	portfolios := getCashPortfolios(user)
	investfolios := getInvestmentPortfolios(user)

	result := map[string]any{
		"welcome":      name,
		"portfolios":   portfolios,
		"investfolios": investfolios,
	}
	state.Cache.Set(cacheKey, result, 12*time.Hour)
	return c.JSON(result)
}

func getWelComeName(value string) string {
	value = strings.ToLower(value)
	userData, err := mongo.GetFromMongoFiltered(state.Database, state.UsersCollection, "email", value)
	if err != nil {
		fmt.Println("Error while getting user specific data from database")
		return ""
	}
	firstName := strings.Split(userData["fullname"].(string), " ")[0]
	return firstName
}

func getCashPortfolios(user string) []bson.M {
	filter := bson.M{"email": user, "type": "Cash & Savings"}
	data := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)

	var results []bson.M
	for _, item := range data {
		value := bson.M{
			"id":       item.ID,
			"name":     item.Name,
			"currency": item.Currency,
			"type":     item.Type,
			"email":    item.Email,
			"category": item.Category,
		}
		results = append(results, value)
	}

	return results
}

func getInvestmentPortfolios(user string) []bson.M {
	filter := bson.M{"email": user, "type": "Investment"}
	data := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)

	var results []bson.M
	for _, item := range data {
		value := bson.M{
			"id":    item.ID,
			"name":  item.Name,
			"type":  item.Type,
			"email": item.Email,
		}
		results = append(results, value)
	}
	return results
}

func IndividualCashHoldingsRaw(user string) (map[string]float64, map[string]string, map[string]string) {
	// Try to use cache first
	if value, found := state.Cache.Get(user); found {
		data, ok := value.(state.CacheData)
		if ok && !data.CashModified {
			fmt.Println("Using cached data, CashModified =", data.CashModified)
			// Optionally: return cached data here
		}
	}

	// Result maps
	cashHoldings := make(map[string]float64)
	currencyTypes := make(map[string]string)
	categoryTypes := make(map[string]string)

	// Find all Cash & Savings portfolios for the user
	filter := bson.M{"email": user, "type": "Cash & Savings"}
	portfolios := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)

	for _, portfolio := range portfolios {
		portfolioID := portfolio.ID
		filterPortfolio := bson.M{"email": user, "portfolioid": portfolioID}

		allCashEntries, err := mongo.GetAllFromMongoWithFilter(state.Database, state.EntriesCollection, filterPortfolio)
		if err != nil {
			fmt.Printf("No entries for cash found for portfolio %s: %v\n", portfolioID, err)
			continue // Skip this portfolio if entries not found
		}

		var totalAmount float64
		for _, entry := range allCashEntries {
			// Extract amount safely
			var entryAmount float64
			switch v := entry["amount"].(type) {
			case string:
				entryAmount = state.BsonStringToFloat(v)
			case float64:
				entryAmount = v
			default:
				fmt.Printf("Unexpected type for amount in portfolio %s: %T\n", portfolioID, v)
				continue
			}

			// Get transaction type safely
			entryType, ok := entry["type"].(string)
			if !ok {
				fmt.Printf("Invalid or missing entry type in portfolio %s: %v\n", portfolioID, entry)
				continue
			}

			// Apply deposit/withdraw logic
			switch entryType {
			case "deposit":
				totalAmount += entryAmount
			case "withdraw":
				totalAmount -= entryAmount
			}
		}

		// Save results for this portfolio
		cashHoldings[portfolioID] = totalAmount
		currencyTypes[portfolioID] = portfolio.Currency
		categoryTypes[portfolioID] = portfolio.Category
	}

	return cashHoldings, currencyTypes, categoryTypes
}

// 2. Convert those holdings to INR using currency info from portfolios
func ConvertHoldingsToINR(rawHoldings map[string]float64, portfolios []map[string]any) map[string]float64 {
	inrHoldings := make(map[string]float64)

	// Fetch rates once
	currencyRates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error getting currency rates, using fallback")
		currencyRates = map[string]float64{
			"INR": 1,
			"USD": 0.012,
			"EUR": 0.011,
		}
	}

	for _, portfolio := range portfolios {
		if len(portfolio) == 0 {
			continue
		}

		id := portfolio["id"].(string)
		currency := portfolio["currency"].(string)
		value, exists := rawHoldings[id]
		if !exists {
			continue
		}

		rate, ok := currencyRates[currency]
		if !ok || rate == 0 {
			fmt.Printf("Missing or zero rate for %s, skipping...\n", currency)
			continue
		}

		inrValue := value / rate
		inrHoldings[id] = inrValue
	}

	return inrHoldings
}

func calculateTotalWorth(cash map[string]float64, cashCurrency map[string]string) float64 {
	rates := getRatesWithFallback()
	return calculateTotalWorthWithRates(cash, cashCurrency, rates)
}

func calculateTotalWorthWithRates(cash map[string]float64, cashCurrency map[string]string, rates map[string]float64) float64 {
	var total float64
	for portfolio, balance := range cash {
		total += convertToINR(balance, cashCurrency[portfolio], rates)
	}
	return total
}

func calculateEmergencyFundWorth(cash map[string]float64, cashCurrency map[string]string, cashCategory map[string]string, rates map[string]float64) float64 {
	var total float64
	for portfolio, balance := range cash {
		if !strings.EqualFold(cashCategory[portfolio], "Emergency Fund") {
			continue
		}
		total += convertToINR(balance, cashCurrency[portfolio], rates)
	}
	return total
}

func convertToINR(balance float64, currency string, rates map[string]float64) float64 {
	switch currency {
	case "INR":
		return balance
	default:
		rate, ok := rates[currency]
		if !ok || rate == 0 {
			return 0
		}
		return balance / rate
	}
}

func getRatesWithFallback() map[string]float64 {
	currencyRates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates, using fallback rates")
		currencyRates = map[string]float64{
			"INR": 1,
			"USD": 0.012,
			"EUR": 0.011,
		}
	}
	// Ensure baseline currencies exist for conversion lookups
	if _, ok := currencyRates["INR"]; !ok {
		currencyRates["INR"] = 1
	}
	return currencyRates
}

func getCachedSchemes() []state.MutualFundScheme {
	if cached, found := state.Cache.Get("mutualFunds"); found {
		if schemes, ok := cached.([]state.MutualFundScheme); ok {
			return schemes
		}
	}
	return nil
}

func GetSchemeCodeByName(name string) (float64, bool) {
	schemes := getCachedSchemes()
	if len(schemes) == 0 {
		_ = state.GetFundNamesFromMFAPI()
		schemes = getCachedSchemes()
	}

	for _, scheme := range schemes {
		if strings.EqualFold(scheme.SchemeName, name) {
			return scheme.SchemeCode, true
		}
	}
	return 0, false
}

func GetLatestNAV(code float64) (string, float64, error) {
	if code <= 0 {
		col, err := mongo.GetMongoCollection(state.Database, state.NavCollection)
		if err != nil {
			return "", 0, err
		}

		var res bson.M
		err = col.FindOne(context.Background(), bson.M{"code": code}, options.FindOne().SetSort(bson.M{"date": -1})).Decode(&res)
		if err != nil {
			return "", 0, err
		}
		dt, _ := res["date"].(time.Time)
		nav, _ := res["nav"].(float64)
		return dt.Format("2006-01-02"), nav, nil
	}

	cacheKey := fmt.Sprintf("nav_%d", int(code))
	if val, found := state.Cache.Get(cacheKey); found {
		if cached, ok := val.(struct {
			Date string
			Nav  float64
		}); ok {
			return cached.Date, cached.Nav, nil
		}
	}

	col, err := mongo.GetMongoCollection(state.Database, state.NavCollection)
	if err == nil {
		var res bson.M
		errDB := col.FindOne(context.Background(), bson.M{"code": int64(code)}, options.FindOne().SetSort(bson.M{"date": -1})).Decode(&res)
		if errDB == nil {
			dt, _ := res["date"].(time.Time)
			nav, _ := res["nav"].(float64)
			if time.Since(dt) < 24*time.Hour {
				state.Cache.Set(cacheKey, struct {
					Date string
					Nav  float64
				}{dt.Format("2006-01-02"), nav}, 24*time.Hour)
				return dt.Format("2006-01-02"), nav, nil
			}
		}
	}

	url := fmt.Sprintf("https://api.mfapi.in/mf/%d", int(code))
	clientHTTP := http.Client{Timeout: 10 * time.Second}

	resp, err := clientHTTP.Get(url)
	if err != nil {
		return "", 0, fmt.Errorf("request error: %v", err)
	}
	defer resp.Body.Close()

	var scheme state.SchemeResponse
	if err := json.NewDecoder(resp.Body).Decode(&scheme); err != nil {
		return "", 0, fmt.Errorf("failed to parse JSON: %v", err)
	}

	if len(scheme.Data) == 0 {
		return "", 0, fmt.Errorf("no NAV data available")
	}

	latest := scheme.Data[0]
	navFloat, err := strconv.ParseFloat(latest.NAV, 64)
	if err != nil {
		return "", 0, fmt.Errorf("failed to convert NAV to float: %v", err)
	}

	dt, err := time.Parse("02-01-2006", latest.Date)
	if err == nil {
		col, errDB := mongo.GetMongoCollection(state.Database, state.NavCollection)
		if errDB == nil {
			filter := bson.M{"code": int64(code), "date": dt}
			update := bson.M{"$set": bson.M{"code": int64(code), "date": dt, "nav": navFloat}}
			_, _ = col.UpdateOne(context.Background(), filter, update, options.Update().SetUpsert(true))
		}
	}

	state.Cache.Set(cacheKey, struct {
		Date string
		Nav  float64
	}{latest.Date, navFloat}, 24*time.Hour)

	return latest.Date, navFloat, nil
}

func GetNAVChange(code float64) (float64, float64, error) {
	cacheKey := fmt.Sprintf("nav_change_%d", int(code))
	if val, found := state.Cache.Get(cacheKey); found {
		if cached, ok := val.(struct{ Delta, Pct float64 }); ok {
			return cached.Delta, cached.Pct, nil
		}
	}

	col, err := mongo.GetMongoCollection(state.Database, state.NavCollection)
	if err != nil {
		return 0, 0, err
	}

	cursor, err := col.Find(context.Background(), bson.M{"code": int64(code)}, options.Find().SetSort(bson.M{"date": -1}).SetLimit(2))
	if err != nil {
		return 0, 0, err
	}
	defer cursor.Close(context.Background())

	var docs []bson.M
	if err := cursor.All(context.Background(), &docs); err != nil {
		return 0, 0, err
	}
	if len(docs) == 0 {
		return 0, 0, nil
	}
	latest, _ := docs[0]["nav"].(float64)
	prev := latest
	if len(docs) > 1 {
		prev, _ = docs[1]["nav"].(float64)
	}
	delta := latest - prev
	pct := 0.0
	if prev != 0 {
		pct = (delta / prev) * 100
	}

	state.Cache.Set(cacheKey, struct{ Delta, Pct float64 }{delta, pct}, 24*time.Hour)
	return delta, pct, nil
}

func IndividualInvestHoldingsRaw(user string) (map[string]float64, map[string]string) {
	filter := bson.M{"email": user, "investment": true}
	investHoldings := make(map[string]float64)
	currencyTypes := make(map[string]string)
	portfolios := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)
	for _, portfolio := range portfolios {
		var totalUnits float64
		entryFilter := bson.M{"email": user, "investmentid": portfolio.ID}
		entries, err := mongo.GetAllFromMongoWithFilter(state.Database, state.EntriesCollection, entryFilter)
		if err != nil {
			fmt.Println("No entries for the specific scheme is found")
			continue
		}
		for _, entry := range entries {
			if entry["type"] == "buy" {
				totalUnits += entry["units"].(float64)
			}
			if entry["type"] == "sell" {
				totalUnits -= entry["units"].(float64)
			}
		}
		_, currentNav, err := GetLatestNAV(float64(portfolio.Code))
		if err != nil {
			fmt.Println(err)
		}
		currentValue := totalUnits * currentNav
		key := portfolio.Name
		if portfolio.Alias != "" {
			key = portfolio.Alias
		}
		investHoldings[key] = currentValue
		currencyTypes[key] = portfolio.Currency
	}
	return investHoldings, currencyTypes
}

// PrecomputeNetWorthForAllUsers calculates and caches net worth for all users.
func PrecomputeNetWorthForAllUsers() {
	users, err := mongo.GetAllFromMongoWithFilter(state.Database, state.UsersCollection, bson.M{})
	if err != nil {
		fmt.Println("failed to fetch users:", err)
		return
	}
	for _, u := range users {
		email, ok := u["email"].(string)
		if !ok || email == "" {
			continue
		}
		PrecomputeNetWorthForUser(email)
	}
}

// PrecomputeNetWorthForUser calculates and caches net worth and home data for a single user.
func PrecomputeNetWorthForUser(user string) {
	cashHoldings, cashCurrency, cashCategory := IndividualCashHoldingsRaw(user)
	investHoldings, investCurrency := IndividualInvestHoldingsRaw(user)

	nw := assembleNetWorthPayload(cashHoldings, cashCurrency, cashCategory, investHoldings, investCurrency)
	state.Cache.Set(state.NetWorthKey(user), nw, 12*time.Hour)

	home := map[string]any{
		"welcome":      getWelComeName(user),
		"portfolios":   getCashPortfolios(user),
		"investfolios": getInvestmentPortfolios(user),
	}
	state.Cache.Set(state.HomeKey(user), home, 12*time.Hour)

	go PrecomputeUserCharts(user)
}

// PrecomputeUserCharts precomputes growth and allocation charts for a user.
func PrecomputeUserCharts(user string) {
	ranges := []string{"1M", "6M", "YTD", "1Y", "2Y", "5Y", "MAX"}
	for _, r := range ranges {
		series, err := computeAllInvestmentGrowthRange(user, r)
		if err == nil {
			state.Cache.Set(state.InvestmentGrowthKey(user, r), series, 12*time.Hour)
		}
	}

	if alloc, err := computeInvestmentAllocation(user); err == nil {
		state.Cache.Set(state.InvestmentAllocationKey(user), alloc, 12*time.Hour)
	}

	if cat, err := computeInvestmentCategoryAllocation(user); err == nil {
		state.Cache.Set(state.CategoryAllocationKey(user), cat, 12*time.Hour)
	}
}

func assembleNetWorthPayload(
	cashHoldings map[string]float64,
	cashCurrency map[string]string,
	cashCategory map[string]string,
	investHoldings map[string]float64,
	investCurrency map[string]string,
) map[string]any {
	rates := getRatesWithFallback()
	cashWorth := calculateTotalWorthWithRates(cashHoldings, cashCurrency, rates)
	investWorth := calculateTotalWorthWithRates(investHoldings, investCurrency, rates)
	emergencyWorth := calculateEmergencyFundWorth(cashHoldings, cashCurrency, cashCategory, rates)

	total := cashWorth + investWorth
	assets := total - emergencyWorth
	if assets < 0 {
		assets = 0
	}

	return map[string]any{
		"networth":      total,
		"assets":        assets,
		"emergencyfund": emergencyWorth,
		"cashholdings":  cashHoldings,
	}
}

func computeAllInvestmentGrowthRange(user, rangeParam string) ([]GrowthPoint, error) {
	fromDate := GetStartDateFromRange(rangeParam)
	earliest, err := getGlobalEarliestDate(user)
	if err == nil {
		if rangeParam == "MAX" {
			fromDate = earliest
		} else if earliest.After(fromDate) {
			fromDate = earliest
		}
	} else if rangeParam == "MAX" {
		return nil, err
	}

	skipDays := 1
	if rangeParam == "2Y" || rangeParam == "5Y" || rangeParam == "MAX" {
		skipDays = 30
	}
	return GetAllInvestmentGrowth(fromDate, user, skipDays)
}

func computeInvestmentAllocation(user string) ([]map[string]any, error) {
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
	sort.Slice(result, func(i, j int) bool {
		vi := result[i]["value"].(float64)
		vj := result[j]["value"].(float64)
		return vi > vj
	})
	return result, nil
}

type categoryAllocationEntry struct {
	Category string  `json:"category"`
	Value    float64 `json:"value"`
	Percent  float64 `json:"percent"`
}

type categoryAllocationPayload struct {
	NetWorth []categoryAllocationEntry `json:"networth"`
	Assets   []categoryAllocationEntry `json:"assets"`
}

func computeInvestmentCategoryAllocation(user string) (categoryAllocationPayload, error) {
	filter := bson.M{"email": user, "investment": true}
	portfolios := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)

	networthTotals := make(map[string]float64)
	assetsTotals := make(map[string]float64)

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
		cat := p.Category
		if cat == "" {
			cat = "Other"
		}
		networthTotals[cat] += val
		assetsTotals[cat] += val
	}

	if cashTotals, err := computeCashCategoryTotals(user); err == nil {
		for category, val := range cashTotals {
			if val <= 0 {
				continue
			}
			networthTotals[category] += val
			if !isEmergencyCategory(category) {
				assetsTotals[category] += val
			}
		}
	}

	payload := categoryAllocationPayload{
		NetWorth: buildCategorySeries(networthTotals),
		Assets:   buildCategorySeries(assetsTotals),
	}

	return payload, nil
}

func buildCategorySeries(totals map[string]float64) []categoryAllocationEntry {
	if len(totals) == 0 {
		return []categoryAllocationEntry{}
	}

	series := make([]categoryAllocationEntry, 0, len(totals))

	var total float64
	for _, v := range totals {
		if v > 0 {
			total += v
		}
	}

	if total <= 0 {
		return []categoryAllocationEntry{}
	}

	for cat, val := range totals {
		if val <= 0 {
			continue
		}
		percent := (val / total) * 100
		series = append(series, categoryAllocationEntry{Category: cat, Value: val, Percent: percent})
	}

	sort.Slice(series, func(i, j int) bool {
		return series[i].Value > series[j].Value
	})

	return series
}

func isEmergencyCategory(name string) bool {
	lowered := strings.ToLower(name)
	return strings.Contains(lowered, "emergency fund")
}
