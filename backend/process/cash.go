package process

import (
	"context"
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/patrickmn/go-cache"
	"go.mongodb.org/mongo-driver/bson"
	mongoDriver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"strconv"
	"strings"
	"time"
)

func ModifiedCashEntries(user, portfolio string) {
	if value, found := state.Cache.Get(user); found {
		data := value.(state.CacheData)
		data.CashModified = true
		data.Portfolio = portfolio
		state.Cache.Set(user, data, cache.NoExpiration)
	}
}

func HandleCashentryFetch(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil || limit < 1 {
		limit = 10
	}
	skip := (page - 1) * limit

	filter := bson.M{"portfolioid": idParams, "email": user}
	cacheKey := state.CashEntriesPageKey(user, idParams, page, limit)
	if val, found := state.Cache.Get(cacheKey); found {
		switch cached := val.(type) {
		case fiber.Map:
			return c.Status(fiber.StatusOK).JSON(cached)
		case map[string]any:
			return c.Status(fiber.StatusOK).JSON(cached)
		}
	}

	entries, total := GetCashEntriesPaginated(state.Database, state.EntriesCollection, skip, limit, filter)
	response := fiber.Map{
		"entries":     entries,
		"portfolioid": idParams,
		"total":       total,
		"page":        page,
		"limit":       limit,
	}
	state.Cache.Set(cacheKey, response, 15*time.Minute)
	return c.Status(fiber.StatusOK).JSON(response)
}

func HandleAllEntriesFetch(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil || limit < 1 {
		limit = 10
	}
	skip := (page - 1) * limit

	filter := bson.M{"email": user}

	entries, _ := GetCashEntriesPaginated(state.Database, state.EntriesCollection, skip, limit, filter)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"entries": entries,
	})
}

func GetCashEntriesPaginated(database, collection string, skip, limit int, filter bson.M) ([]map[string]any, int64) {
	coll, err := mongo.GetMongoCollection(database, collection)
	if err != nil {
		fmt.Println("MongoDB connection error:", err)
		return nil, 0
	}

	countCtx, countCancel := context.WithTimeout(context.Background(), 5*time.Second)
	totalCount, countErr := coll.CountDocuments(countCtx, filter)
	countCancel()
	if countErr != nil {
		fmt.Println("MongoDB count error:", countErr)
	}

	opts := options.Find().
		SetSkip(int64(skip)).
		SetLimit(int64(limit)).
		SetSort(bson.D{
			{Key: "date", Value: -1},
			{Key: "_id", Value: -1},
		})

	findCtx, findCancel := context.WithTimeout(context.Background(), 5*time.Second)
	cursor, err := coll.Find(findCtx, filter, opts)
	if err != nil {
		fmt.Println("MongoDB query error:", err)
		findCancel()
		return nil, totalCount
	}
	defer func() {
		cursor.Close(context.Background())
		findCancel()
	}()

	var results []map[string]any
	if err := cursor.All(findCtx, &results); err != nil {
		fmt.Println("MongoDB decode error:", err)
		return nil, totalCount
	}
	if countErr != nil {
		totalCount = int64(len(results))
	}
	return results, totalCount
}

func HandleCashEntries(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	var cashEntry state.CashEntries
	if err := c.BodyParser(&cashEntry); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to parse the JSON into struct",
		})
	}
	if cashEntry.ID == "" || cashEntry.Type == "" || cashEntry.PortfolioID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Missing required fields",
		})
	}
	entry := bson.M{
		"id":          cashEntry.ID,
		"amount":      cashEntry.Amount,
		"type":        cashEntry.Type,
		"date":        cashEntry.Date, // Must be time.Time
		"portfolioid": cashEntry.PortfolioID,
		"email":       user,
		"currency":    cashEntry.Currency,
	}

	if err := mongo.SendToMongo(state.Database, state.EntriesCollection, cashEntry.ID, entry); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Unable to add entry to the database",
		})
	}
	ModifiedCashEntries(user, cashEntry.PortfolioID)
	state.InvalidateCashEntries(user, cashEntry.PortfolioID)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "Cash entry saved successfully",
		"entry":   entry,
	})
}

func HandleEditCashEntries(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	var cashEntry state.CashEntries
	if err := c.BodyParser(&cashEntry); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to parse the json to structs",
		})
	}

	entry := bson.M{
		"id":          cashEntry.ID,
		"amount":      cashEntry.Amount,
		"type":        cashEntry.Type,
		"date":        cashEntry.Date,
		"portfolioid": cashEntry.PortfolioID,
		"email":       user,
		"currency":    cashEntry.Currency,
	}

	if err := mongo.SendToMongo(state.Database, state.EntriesCollection, idParams, entry); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to add entry to the database",
		})
	}
	state.InvalidateCashEntries(user, cashEntry.PortfolioID)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.JSON(fiber.Map{"message": "Cash entry updated to the database"})
}

func HandleCashDeleteEntries(c *fiber.Ctx) error {
	idParams := c.Params("id")
	portfolioID := c.Get("portfolioid")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	filter := bson.M{"_id": idParams, "portfolioid": portfolioID, "email": user}
	deleted, err := mongo.DeleteMongoFiltered(state.Database, state.EntriesCollection, filter)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to delete cash entry data from database",
		})
	}
	if deleted {
		state.InvalidateCashEntries(user, portfolioID)
		state.InvalidateUserCache(user)
		go PrecomputeNetWorthForUser(user)
		return c.JSON(fiber.Map{"message": "Entry deleted successfully..."})
	}
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"message": "Unable to delete cash entry data",
	})
}

func CashGrowth(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}

	rangeParam := strings.ToUpper(c.Query("range", "1M"))
	cacheKey := state.CashGrowthKey(user, rangeParam)

	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.([]any); ok {
			return c.JSON(data)
		}
	}

	fromDate := getFromDate(rangeParam)
	entries, startingBalance := getCashEntries(fromDate, state.Database, state.EntriesCollection, user)

	results := computeCashGrowthSeries(entries, startingBalance, fromDate)
	state.Cache.Set(cacheKey, results, 12*time.Hour)

	return c.JSON(results)
}

func getFromDate(rangeParam string) time.Time {
	now := time.Now().UTC()
	switch strings.ToUpper(rangeParam) {
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
	case "MAX":
		return time.Time{}
	default:
		return now.AddDate(-30, 0, 0)
	}
}

func getCashEntries(fromDate time.Time, db, collection, user string) ([]state.CashGrowthPoint, float64) {
	currencyRates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Failed to fetch currency rates; using fallback.")
		currencyRates = map[string]float64{
			"INR": 1, "USD": 0.012, "EUR": 0.011,
		}
	}

	coll, err := mongo.GetMongoCollection(db, collection)
	if err != nil {
		fmt.Println("Mongo connection error:", err)
		return nil, 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"email": user,
		"date":  bson.M{"$gte": fromDate},
		"type":  bson.M{"$in": []string{"deposit", "withdraw"}},
	}

	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		fmt.Println("Mongo query error:", err)
		return nil, 0
	}
	defer cursor.Close(ctx)

	var results []state.CashGrowthPoint
	if err := cursor.All(ctx, &results); err != nil {
		fmt.Println("Cursor decode error:", err)
		return nil, 0
	}

	normalized := normalizeEntries(results, currencyRates)
	startingBalance := computeStartingBalance(ctx, coll, fromDate, user, currencyRates)

	return normalized, startingBalance
}

func computeStartingBalance(ctx context.Context, coll *mongoDriver.Collection, fromDate time.Time, user string, rates map[string]float64) float64 {
	if fromDate.IsZero() {
		return 0
	}

	filter := bson.M{
		"email": user,
		"date":  bson.M{"$lt": fromDate},
		"type":  bson.M{"$in": []string{"deposit", "withdraw"}},
	}

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		fmt.Println("Mongo query error while computing starting balance:", err)
		return 0
	}
	defer cursor.Close(ctx)

	var previous []state.CashGrowthPoint
	if err := cursor.All(ctx, &previous); err != nil {
		fmt.Println("Cursor decode error while computing starting balance:", err)
		return 0
	}

	normalized := normalizeEntries(previous, rates)

	var balance float64
	for _, entry := range normalized {
		balance += entry.Amount
	}

	return balance
}

func normalizeEntries(entries []state.CashGrowthPoint, rates map[string]float64) []state.CashGrowthPoint {
	for i, entry := range entries {
		cur := entry.Currency
		if cur == "" {
			cur = "INR"
		}
		rate := rates[cur]
		if rate == 0 {
			fmt.Printf("Unknown currency %s, using fallback rate = 1\n", cur)
			rate = 1
		}

		amount := entry.Amount / rate
		if entry.Type == "withdraw" {
			amount = -amount
		}
		entries[i].Amount = amount
		entries[i].Currency = "INR"
	}
	return entries
}

func computeCashGrowthSeries(entries []state.CashGrowthPoint, startingBalance float64, fromDate time.Time) []any {
	var series []any
	cumulative := startingBalance

	initialDate := fromDate
	if initialDate.IsZero() && len(entries) > 0 {
		initialDate = entries[0].Date
	}

	if !initialDate.IsZero() && (startingBalance != 0 || len(entries) > 0) {
		series = append(series, map[string]any{
			"date":     initialDate,
			"value":    cumulative,
			"invested": 0,
		})
	}

	for _, e := range entries {
		cumulative += e.Amount
		point := map[string]any{
			"date":     e.Date,
			"value":    cumulative,
			"invested": e.Amount,
		}
		series = append(series, point)
	}

	if len(series) == 0 && startingBalance != 0 && !initialDate.IsZero() {
		series = append(series, map[string]any{
			"date":     initialDate,
			"value":    cumulative,
			"invested": 0,
		})
	}

	if len(series) > 0 {
		now := time.Now().UTC()
		lastPoint, ok := series[len(series)-1].(map[string]any)
		if ok {
			if lastDate, ok := lastPoint["date"].(time.Time); ok {
				if now.After(lastDate) {
					series = append(series, map[string]any{
						"date":     now,
						"value":    cumulative,
						"invested": 0,
					})
				}
			}
		}
	}

	return series
}

func GrowthFilter(fromDate time.Time, database string, collection, user string) []any {
	history := mongo.GetFilteredDataBefore(fromDate, database, collection, user)
	startingValue := 0.0
	for _, entry := range history {
		startingValue += entry.Amount
	}

	data := mongo.GetFilteredData(fromDate, database, collection, user)

	var result []any
	cumulative := startingValue
	for _, entry := range data {
		cumulative += entry.Amount
		val := map[string]any{
			"date":     entry.Date,
			"value":    cumulative,
			"invested": entry.Amount,
		}
		result = append(result, val)
	}

	return result
}
