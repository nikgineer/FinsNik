package process

import (
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"math"
	"sort"
	"strings"
	"time"
)

type GrowthPoint struct {
	Date     string  `json:"date"`
	Value    float64 `json:"value"`
	Invested float64 `json:"invested"`
}

func GetInvestmentGrowth(c *fiber.Ctx) error {
	// ———————————— Boilerplate auth & params ————————————
	id := c.Params("id")
	rangeParam := strings.ToUpper(c.Query("range", "1M"))
	token := state.AuthToken(c)
	portfolio := c.Get("portfolioid")
	user := state.AuthToEmail(token)

	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "Unauthorized"})
	}

	cacheKey := state.SingleInvestmentGrowthKey(user, id, rangeParam, portfolio)
	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.([]GrowthPoint); ok {
			return c.JSON(data)
		}
	}

	startDate := GetStartDateFromRange(rangeParam)
	if rangeParam == "MAX" {
		var err error
		startDate, err = getGlobalEarliestDate(user)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"message": "Failed to determine MAX range",
				"error":   err.Error(),
			})
		}
	}

	// ———————————— Load & sort transactions ————————————
	rawEntries := mongo.GetAllFromMongoWithFilterNoID(
		state.Database, state.EntriesCollection,
		bson.M{"investmentid": id, "email": user, "portfolioid": portfolio},
	)

	type txn struct {
		Date   time.Time
		Units  float64
		Type   string
		Amount float64
	}
	var txns []txn
	for _, e := range rawEntries {
		d := extractTime(e["date"])
		if d.IsZero() {
			continue
		}
		txns = append(txns, txn{
			Date:   d.UTC(),
			Units:  toFloat(e["units"]),
			Type:   strings.ToLower(e["type"].(string)),
			Amount: toFloat(e["amount"]),
		})
	}
	sort.Slice(txns, func(i, j int) bool {
		return txns[i].Date.Before(txns[j].Date)
	})

	// ———————————— Fetch NAV history ————————————
	invData, err := mongo.GetAllFromMongoWithFilter(
		state.Database, state.PortfoliosCollection,
		bson.M{"email": user, "portfolioid": portfolio, "id": id},
	)
	if err != nil || len(invData) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Investment not found"})
	}
	codeFloat, ok := invData[0]["code"].(float64)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Invalid scheme code"})
	}
	code := int(codeFloat)

	navDocs, err := mongo.GetAllFromMongoWithFilter(
		state.Database, state.NavCollection,
		bson.M{"code": float64(code), "date": bson.M{"$gte": startDate}},
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"message": "Failed to fetch NAV data"})
	}

	type navEntry struct {
		Date time.Time
		Nav  float64
	}
	var navs []navEntry
	for _, d := range navDocs {
		dt := extractTime(d["date"])
		n := toFloat(d["nav"])
		if dt.IsZero() || n <= 0 {
			continue
		}
		navs = append(navs, navEntry{Date: dt.UTC(), Nav: n})
	}
	sort.Slice(navs, func(i, j int) bool {
		return navs[i].Date.Before(navs[j].Date)
	})
	if len(navs) == 0 {
		return c.Status(400).JSON(fiber.Map{"message": "No NAV data in this range"})
	}

	// ———————————— Adjust startDate to first real data point ————————————
	if len(txns) > 0 && txns[0].Date.After(startDate) {
		startDate = txns[0].Date
	}
	if navs[0].Date.After(startDate) {
		startDate = navs[0].Date
	}

	// ———————————— Choose sampling step ————————————
	// daily for up to 1Y, ~monthly for 2Y/5Y/MAX
	skipDays := 1
	if rangeParam == "2Y" || rangeParam == "5Y" || rangeParam == "MAX" {
		skipDays = 30
	}

	// ———————————— Merge‑style pass over txns & navs ————————————
	var (
		totalUnits    float64
		investedSoFar float64
		iTx           int
		result        []GrowthPoint
		navCount      int
	)

	// Pre-apply any transactions before our adjusted startDate
	for iTx < len(txns) && txns[iTx].Date.Before(startDate) {
		if txns[iTx].Type == "buy" {
			totalUnits += txns[iTx].Units
			investedSoFar += txns[iTx].Amount
		} else {
			totalUnits -= txns[iTx].Units
			investedSoFar -= txns[iTx].Amount
		}
		iTx++
	}

	// Walk through each NAV record, applying transactions up to that date,
	// then sampling every skipDays-th NAV entry (and always first/last).
	for i, n := range navs {
		if n.Date.Before(startDate) {
			continue
		}

		cashChange := 0.0
		for iTx < len(txns) && !txns[iTx].Date.After(n.Date) {
			if txns[iTx].Type == "buy" {
				totalUnits += txns[iTx].Units
				investedSoFar += txns[iTx].Amount
				cashChange += txns[iTx].Amount
			} else {
				totalUnits -= txns[iTx].Units
				investedSoFar -= txns[iTx].Amount
				cashChange -= txns[iTx].Amount
			}
			iTx++
		}

		include := false
		if skipDays == 1 {
			include = true
		} else if navCount%skipDays == 0 {
			include = true
		} else if i == len(navs)-1 {
			include = true
		}

		if include {
			investedVal := cashChange
			if len(result) == 0 {
				investedVal = investedSoFar
			}
			result = append(result, GrowthPoint{
				Date:     n.Date.Format("2006-01-02"),
				Value:    totalUnits * n.Nav,
				Invested: investedVal,
			})
		}
		navCount++
	}

	state.Cache.Set(cacheKey, result, 12*time.Hour)
	return c.JSON(result)
}

// ———————————— Helpers ————————————

func GetStartDateFromRange(r string) time.Time {
	now := time.Now().UTC()
	switch r {
	case "MTD":
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	case "1M":
		return now.AddDate(0, -1, 0)
	case "6M":
		return now.AddDate(0, -6, 0)
	case "YTD":
		return time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	case "1Y":
		return now.AddDate(-1, 0, 0)
	case "2Y":
		return now.AddDate(-2, 0, 0)
	case "5Y":
		return now.AddDate(-5, 0, 0)
	default:
		return now.AddDate(-30, 0, 0)
	}
}

func extractTime(v interface{}) time.Time {
	switch t := v.(type) {
	case primitive.DateTime:
		return t.Time()
	case time.Time:
		return t
	default:
		return time.Time{}
	}
}

func toFloat(val interface{}) float64 {
	switch v := val.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int32:
		return float64(v)
	case int64:
		return float64(v)
	default:
		return 0
	}
}

func AllInvestmentGrowth(c *fiber.Ctx) error {
	user := state.AuthToEmail(state.AuthToken(c))
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "Unauthorized"})
	}

	rangeParam := strings.ToUpper(c.Query("range", "1M"))
	cacheKey := state.InvestmentGrowthKey(user, rangeParam)
	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.([]GrowthPoint); ok {
			return c.JSON(data)
		}
	}

	fromDate := GetStartDateFromRange(rangeParam)

	earliest, err := getGlobalEarliestDate(user)
	if err == nil {
		if rangeParam == "MAX" {
			fromDate = earliest
		} else if earliest.After(fromDate) {
			fromDate = earliest
		}
	} else if rangeParam == "MAX" {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to determine MAX range",
			"error":   err.Error(),
		})
	}

	// FIXED: Compute duration before deciding skipDays
	totalDuration := time.Since(fromDate)
	skipDays := 1
	if totalDuration.Hours() > 365*24 {
		skipDays = 30
	}

	series, err := GetAllInvestmentGrowth(fromDate, user, skipDays)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to compute growth",
			"error":   err.Error(),
		})
	}

	state.Cache.Set(cacheKey, series, 12*time.Hour)
	return c.JSON(series)
}

const maxChartPoints = 30

// ————————————————
// Helper: find the true earliest BUY date
// ————————————————
func getGlobalEarliestEntryDate(user string) (time.Time, error) {
	rawEntries := mongo.GetAllFromMongoWithFilterNoID(
		state.Database, state.EntriesCollection,
		bson.M{"email": user},
	)

	var earliest time.Time
	for _, e := range rawEntries {
		dt := extractTime(e["date"]).UTC()
		typ, ok := e["type"].(string)
		if !ok || strings.ToLower(typ) != "buy" || dt.IsZero() {
			continue
		}
		if earliest.IsZero() || dt.Before(earliest) {
			earliest = dt
		}
	}

	if earliest.IsZero() {
		return time.Time{}, fmt.Errorf("no purchase entries found")
	}
	return earliest, nil
}

// ————————————————————————————————————————————————————————————————
// Build a single, all-investments series that always starts at the first buy
// ————————————————————————————————————————————————————————————————
func GetAllInvestmentGrowth(fromDate time.Time, user string, skipDays int) ([]GrowthPoint, error) {
	filter := bson.M{"email": user, "investment": true}
	rawInvs, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return nil, err
	}

	var globalEnd time.Time
	for _, invMap := range rawInvs {
		codeF, ok := invMap["code"].(float64)
		if !ok {
			continue
		}
		lastNav, err := mongo.GetOneFromMongoWithFilterSorted(
			state.Database, state.NavCollection,
			bson.M{"code": codeF, "date": bson.M{"$gte": fromDate}},
			options.FindOne().SetSort(bson.M{"date": -1}),
		)
		if err != nil {
			continue
		}
		dt := extractTime(lastNav["date"]).UTC()
		if dt.After(globalEnd) {
			globalEnd = dt
		}
	}
	if globalEnd.IsZero() {
		return nil, fmt.Errorf("no NAV data found")
	}

	// 3) determine the true origin: the later of your requested fromDate and the first-ever BUY
	origin := fromDate.UTC()
	if firstBuy, err := getGlobalEarliestEntryDate(user); err == nil && firstBuy.After(origin) {
		origin = firstBuy
	}

	// 4) build your sampling grid from that origin → globalEnd
	var sampleDates []time.Time
	for d := origin; !d.After(globalEnd); d = d.AddDate(0, 0, skipDays) {
		sampleDates = append(sampleDates, d)
	}
	// always include final NAV
	if !sampleDates[len(sampleDates)-1].Equal(globalEnd) {
		sampleDates = append(sampleDates, globalEnd)
	}

	// 5) aggregate each investment's value at those dates
	aggregate := make(map[string]float64)
	for _, invMap := range rawInvs {
		codeF, ok1 := invMap["code"].(float64)
		idStr, ok2 := invMap["id"].(string)
		if !ok1 || !ok2 {
			continue
		}
		// pass in `origin` so we never get points before the first buy
		seriesMap, _, err := singleInvestmentSeries(origin, sampleDates, user, int(codeF), idStr)
		if err != nil {
			continue
		}
		for dateStr, val := range seriesMap {
			aggregate[dateStr] += val
		}
	}

	// 6) build and down-sample the final slice
	var result []GrowthPoint
	for _, d := range sampleDates {
		ds := d.Format("2006-01-02")
		result = append(result, GrowthPoint{
			Date:  ds,
			Value: aggregate[ds],
		})
	}
	return downsample(result, maxChartPoints), nil
}

func singleInvestmentSeries(
	fromDate time.Time,
	sampleDates []time.Time,
	user string,
	code int,
	investmentID string,
) (map[string]float64, time.Time, error) {
	rawEntries := mongo.GetAllFromMongoWithFilterNoID(
		state.Database, state.EntriesCollection,
		bson.M{"investmentid": investmentID, "email": user},
	)

	type txn struct {
		Date  time.Time
		Units float64
		Type  string
	}

	var txns []txn
	var firstTxnDate time.Time
	for _, e := range rawEntries {
		d := extractTime(e["date"]).UTC()
		typ, _ := e["type"].(string)
		units := toFloat(e["units"])
		if d.IsZero() || typ == "" {
			continue
		}

		typ = strings.ToLower(typ)
		if typ == "buy" && firstTxnDate.IsZero() {
			firstTxnDate = d
		}

		if typ != "buy" && typ != "sell" {
			continue // FIXED: skip unknown types
		}

		txns = append(txns, txn{Date: d, Units: units, Type: typ})
	}

	sort.Slice(txns, func(i, j int) bool {
		return txns[i].Date.Before(txns[j].Date)
	})

	navDocs, err := mongo.GetAllFromMongoWithFilter(
		state.Database, state.NavCollection,
		bson.M{"code": float64(code), "date": bson.M{"$gte": fromDate}},
	)
	if err != nil {
		return nil, time.Time{}, err
	}

	type navEntry struct {
		Date time.Time
		Nav  float64
	}
	var navs []navEntry
	for _, d := range navDocs {
		dt := extractTime(d["date"]).UTC()
		nav := toFloat(d["nav"])
		if dt.IsZero() || nav <= 0 {
			continue
		}
		navs = append(navs, navEntry{Date: dt, Nav: nav})
	}

	sort.Slice(navs, func(i, j int) bool {
		return navs[i].Date.Before(navs[j].Date)
	})

	if len(navs) == 0 {
		return nil, time.Time{}, fmt.Errorf("no NAV data for investment %s", investmentID)
	}

	seriesMap := make(map[string]float64)
	totalUnits := 0.0
	iTx, iNav := 0, 0
	lastNav := navs[0].Nav

	for _, d := range sampleDates {
		for iTx < len(txns) && !txns[iTx].Date.After(d) {
			if txns[iTx].Type == "buy" {
				totalUnits += txns[iTx].Units
			} else {
				totalUnits -= txns[iTx].Units
			}
			iTx++
		}

		for iNav < len(navs) && !navs[iNav].Date.After(d) {
			lastNav = navs[iNav].Nav
			iNav++
		}

		if !firstTxnDate.IsZero() && d.Before(firstTxnDate) {
			continue
		}

		dateStr := d.Format("2006-01-02")
		seriesMap[dateStr] = totalUnits * lastNav
	}

	return seriesMap, firstTxnDate, nil
}

func downsample(data []GrowthPoint, maxPoints int) []GrowthPoint {
	if len(data) <= maxPoints {
		return data
	}

	step := float64(len(data)) / float64(maxPoints)
	result := make([]GrowthPoint, 0, maxPoints)

	for i := 0; i < maxPoints; i++ {
		index := int(math.Floor(float64(i) * step))
		if index >= len(data) {
			index = len(data) - 1
		}
		result = append(result, data[index])
	}

	// Ensure last point is always included
	if result[len(result)-1].Date != data[len(data)-1].Date {
		result = append(result, data[len(data)-1])
	}

	return result
}

func getGlobalEarliestDate(user string) (time.Time, error) {
	filter := bson.M{"email": user, "investment": true}
	rawInvs, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return time.Time{}, err
	}

	var globalMin time.Time

	for _, invMap := range rawInvs {
		codeF, ok1 := invMap["code"].(float64)
		idStr, ok2 := invMap["id"].(string)
		if !ok1 || !ok2 {
			continue
		}

		code := int(codeF)

		// Get earliest NAV date
		navDoc, err := mongo.GetOneFromMongoWithFilterSorted(
			state.Database, state.NavCollection,
			bson.M{"code": float64(code)},
			options.FindOne().SetSort(bson.M{"date": 1}),
		)
		if err == nil {
			if dt := extractTime(navDoc["date"]).UTC(); !dt.IsZero() && (globalMin.IsZero() || dt.Before(globalMin)) {
				globalMin = dt
			}
		}

		// Get earliest entry date
		txDoc, err := mongo.GetOneFromMongoWithFilterSorted(
			state.Database, state.EntriesCollection,
			bson.M{"investmentid": idStr, "email": user},
			options.FindOne().SetSort(bson.M{"date": 1}),
		)
		if err == nil {
			if dt := extractTime(txDoc["date"]).UTC(); !dt.IsZero() && (globalMin.IsZero() || dt.Before(globalMin)) {
				globalMin = dt
			}
		}
	}

	if globalMin.IsZero() {
		return time.Time{}, fmt.Errorf("no historical data found for MAX range")
	}

	return globalMin, nil
}
