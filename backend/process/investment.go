package process

import (
	"context"
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
	"strconv"
	"strings"
	"time"
)

type schemeSearchIndex struct {
	Raw   []string
	Lower []string
}

const searchIndexCacheKey = "mutualFundsSearchIndex"

func getSchemeSearchIndex() schemeSearchIndex {
	if cached, ok := state.Cache.Get(searchIndexCacheKey); ok {
		if index, ok := cached.(schemeSearchIndex); ok && len(index.Raw) == len(index.Lower) {
			return index
		}
	}

	names := state.GetFundNamesFromMFAPI()
	lowered := make([]string, len(names))
	for i, name := range names {
		lowered[i] = strings.ToLower(name)
	}

	index := schemeSearchIndex{Raw: names, Lower: lowered}
	state.Cache.Set(searchIndexCacheKey, index, 30*time.Minute)
	return index
}

func Investments(c *fiber.Ctx) error {
	var investment state.InvestmentData
	if err := c.BodyParser(&investment); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}
	data := map[string]any{
		"id":          investment.InvestmentID,
		"currency":    investment.Currency,
		"type":        investment.Type,
		"name":        investment.Name,
		"category":    investment.Category,
		"equitytype":  investment.EquityType,
		"portfolioid": investment.PortfolioID,
	}
	tokenString := state.AuthToken(c)
	if tokenString == "" {
		tokenString = investment.Token
	}
	email := state.AuthToEmail(tokenString)
	if email == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	data["email"] = email
	data["investment"] = true
	code, exists := GetSchemeCodeByName(investment.Name)
	if !exists || code == 0 {
		code = generateCustomCode(investment.InvestmentID)
	}
	data["code"] = code
	id := data["id"].(string)
	if err := mongo.SendToMongo(state.Database, state.PortfoliosCollection, id, bson.M(data)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing type or query",
		})
	}
	if data["type"] != "custom" {
		go SyncAllNAVsFromPortfolios()
	}
	state.InvalidateUserCache(email)
	go PrecomputeNetWorthForUser(email)
	return c.JSON(fiber.Map{"messgae": "Investment updated to the database successfully"})
}

func GetInvestments(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	cacheKey := state.InvestmentListKey(user, idParams)
	if val, found := state.Cache.Get(cacheKey); found {
		if cached, ok := val.([]bson.M); ok {
			return c.JSON(fiber.Map{"investments": map[string]any{idParams: cached}})
		}
	}

	filter := bson.M{"email": user, "id": idParams, "investment": true}
	data, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"message":     "No investments found",
			"investments": []interface{}{},
		})
	}
	for i, doc := range data {
		if alias, ok := doc["alias"].(string); ok && alias != "" {
			data[i]["name"] = alias // override only for response
		}
	}

	result := map[string]interface{}{
		idParams: data,
	}
	state.Cache.Set(cacheKey, data, 12*time.Hour)
	return c.JSON(fiber.Map{
		"investments": result,
	})

}

func HandleInvestmentSearch(c *fiber.Ctx) error {
	invType := strings.ToLower(strings.TrimSpace(c.Query("type")))
	query := strings.ToLower(strings.TrimSpace(c.Query("query")))

	if invType == "" || query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing type or query",
		})
	}

	if len(query) < 2 {
		return c.JSON([]string{})
	}

	index := getSchemeSearchIndex()

	results := make([]string, 0, 20)
	for i, lowered := range index.Lower {
		if strings.Contains(lowered, query) {
			results = append(results, index.Raw[i])
			if len(results) >= 25 {
				break
			}
		}
	}

	return c.JSON(results)
}

func AddTransactions(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	var transactions state.InvestmentTransactions
	if err := c.BodyParser(&transactions); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}
	data := map[string]any{
		"email":        user,
		"investmentid": transactions.InvestmentID,
		"units":        transactions.Units,
		"price":        transactions.Price,
		"amount":       transactions.Amount,
		"date":         transactions.Date,
		"type":         transactions.Type,
		"portfolioid":  transactions.PortfolioID,
		"id":           transactions.ID,
	}
	if err := mongo.SendToMongo(state.Database, state.EntriesCollection, transactions.ID, bson.M(data)); err != nil {
		return fmt.Errorf("error while writing portfolio data to the database")
	}
	state.InvalidateInvestmentTransactions(user, transactions.InvestmentID, transactions.PortfolioID)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.JSON(fiber.Map{"message": "Transactions updated to the Database for the Investment"})
}

func GetIndividualInvestmentTransactions(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	portfolio := c.Get("portfolioid")
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

	filter := bson.M{"investmentid": idParams, "email": user}
	if portfolio != "" {
		filter["portfolioid"] = portfolio
	}
	cacheKey := state.InvestmentTransactionsPageKey(user, idParams, portfolio, page, limit)
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
		"entries":      entries,
		"investmentid": idParams,
		"portfolioid":  portfolio,
		"total":        total,
		"page":         page,
		"limit":        limit,
	}
	state.Cache.Set(cacheKey, response, 15*time.Minute)
	return c.Status(fiber.StatusOK).JSON(response)
}

func DeleteInvestments(c *fiber.Ctx) error {
	tokenStr := state.AuthToken(c)
	idParams := c.Params("id")
	portfolio := c.Get("portfolioid")
	user := state.AuthToEmail(tokenStr)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	filter := bson.M{"email": user, "id": idParams, "portfolioid": portfolio, "investment": true}
	delete, err := mongo.DeleteMongoFiltered(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "Unable to delete investment related info from the database",
		})
	}
	if delete {
		fmt.Println("Investment removed successfully")
	}
	filter = bson.M{"email": user, "investmentid": idParams, "portfolioid": portfolio}
	entryDelete, err := mongo.DeleteMongoFilteredMany(state.Database, state.EntriesCollection, filter)
	if err != nil {
		fmt.Println("Error in deleting the transactions of the investment")
	}
	fmt.Printf("Total Transactions DELETED from the Investment: %v is %v\n", idParams, entryDelete)
	state.InvalidateInvestmentTransactions(user, idParams, portfolio)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.JSON(fiber.Map{
		"message": "Investment and its transactions removed successfully",
	})
}

func UpdateTransactions(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	idParams := c.Params("id")
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	var transactions state.InvestmentTransactions
	if err := c.BodyParser(&transactions); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}
	data := map[string]any{
		"email":        user,
		"investmentid": transactions.InvestmentID,
		"units":        transactions.Units,
		"price":        transactions.Price,
		"amount":       transactions.Amount,
		"date":         transactions.Date,
		"type":         transactions.Type,
		"portfolioid":  transactions.PortfolioID,
		"id":           transactions.ID,
	}
	if err := mongo.SendToMongo(state.Database, state.EntriesCollection, idParams, bson.M(data)); err != nil {
		return fmt.Errorf("error while writing portfolio data to the database")
	}
	state.InvalidateInvestmentTransactions(user, transactions.InvestmentID, transactions.PortfolioID)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.JSON(fiber.Map{"message": "Transactions updated to the Database for the Investment"})
}

func DeleteTransactions(c *fiber.Ctx) error {
	idParams := c.Params("id")
	investmentID := c.Get("investmentid")
	portfolioID := c.Get("portfolioid")
	tokernString := state.AuthToken(c)
	user := state.AuthToEmail(tokernString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	filter := bson.M{"_id": idParams, "email": user}
	if investmentID != "" {
		filter["investmentid"] = investmentID
	}
	deleted, err := mongo.DeleteMongoFiltered(state.Database, state.EntriesCollection, filter)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to delete cash entry data from database",
		})
	}
	if deleted {
		state.InvalidateInvestmentTransactions(user, investmentID, portfolioID)
		state.InvalidateUserCache(user)
		go PrecomputeNetWorthForUser(user)
		return c.JSON(fiber.Map{"message": "Entry deleted successfully..."})
	}
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"message": "Unable to delete cash entry data",
	})
}

func UpdateInvestments(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenStr := state.AuthToken(c)
	var investment state.InvestmentData
	if err := c.BodyParser(&investment); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}
	data := map[string]any{
		"id":          investment.InvestmentID,
		"currency":    investment.Currency,
		"type":        investment.Type,
		"name":        investment.Name,
		"category":    investment.Category,
		"equitytype":  investment.EquityType,
		"portfolioid": investment.PortfolioID,
	}
	email := state.AuthToEmail(tokenStr)
	if email == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	data["email"] = email
	data["investment"] = true
	existingCode, err := mongo.GetInvestmentCode(bson.M{"email": email, "id": idParams})
	if err == nil && existingCode != 0 {
		// keep previously stored scheme code
		data["code"] = existingCode
	} else {
		// fall back to deriving the code from the fund name or generate a custom one
		code, exists := GetSchemeCodeByName(investment.Name)
		if !exists || code == 0 {
			code = generateCustomCode(investment.InvestmentID)
		}
		data["code"] = code
	}
	if data["type"] != "custom" {
		go SyncAllNAVsFromPortfolios()
	}
	if err := mongo.SendToMongo(state.Database, state.PortfoliosCollection, idParams, bson.M(data)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing type or query",
		})
	}
	state.InvalidateUserCache(email)
	go PrecomputeNetWorthForUser(email)
	return c.JSON(fiber.Map{"messgae": "Investment updated to the database successfully"})
}

func InvestmentCustom(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)

	var custom state.InvestmentCustomUpdate
	if err := c.BodyParser(&custom); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}

	// Build filter
	filter := bson.M{
		"email":       user,
		"id":          custom.InvestmentID,
		"portfolioid": custom.PortfolioID,
	}
	// Get portfolio document
	collection, err := mongo.GetMongoCollection(state.Database, state.PortfoliosCollection)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Database connection failed",
		})
	}

	var result bson.M
	err = collection.FindOne(context.Background(), filter).Decode(&result)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"message": "Investment not found",
		})
	}

	// Extract code from the result
	code, ok := result["code"].(float64)
	update := bson.M{"alias": custom.Alias}
	if !ok || code == 0 {
		code = generateCustomCode(custom.InvestmentID)
		update["code"] = code
	}
	_, err = collection.UpdateOne(context.Background(), filter, bson.M{"$set": update})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to update alias",
		})
	}

	// Upsert NAV entry for today using the fetched code
	navCol, err := mongo.GetMongoCollection(state.Database, state.NavCollection)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Database connection failed"})
	}

	var navDate time.Time
	if custom.Date != "" {
		parsed, err := time.Parse("02-01-2006", custom.Date)
		if err == nil {
			navDate = parsed.UTC()
		} else {
			navDate = time.Now().Truncate(24 * time.Hour)
		}
	} else {
		navDate = time.Now().Truncate(24 * time.Hour)
	}
	filterNav := bson.M{"code": code, "date": navDate}
	updateNav := bson.M{"$set": bson.M{"code": code, "date": navDate, "nav": custom.CustomNav}}
	_, err = navCol.UpdateOne(context.Background(), filterNav, updateNav, options.Update().SetUpsert(true))
	if err != nil {
		fmt.Println("Error while updating the custom nav")
	}

	yesterday := navDate.AddDate(0, 0, -1)
	count, err := navCol.CountDocuments(context.Background(), bson.M{"code": code, "date": yesterday})
	if err == nil && count == 0 {
		var last bson.M
		if err = navCol.FindOne(context.Background(), bson.M{"code": code}, options.FindOne().SetSort(bson.M{"date": -1})).Decode(&last); err == nil {
			lastNav, _ := last["nav"].(float64)
			_, _ = navCol.UpdateOne(context.Background(), bson.M{"code": code, "date": yesterday}, bson.M{"$set": bson.M{"code": code, "date": yesterday, "nav": lastNav}}, options.Update().SetUpsert(true))
		}
	}

	state.Cache.Delete(fmt.Sprintf("nav_%d", int(code)))
	state.Cache.Delete(fmt.Sprintf("nav_change_%d", int(code)))
	GetNAVChange(code)
	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)

	return c.JSON(fiber.Map{
		"message": "Alias and NAV updated successfully",
	})
}

func generateCustomCode(id string) float64 {
	cleaned := strings.ReplaceAll(id, "-", "")
	if len(cleaned) > 12 {
		cleaned = cleaned[:12]
	}
	i, err := strconv.ParseInt(cleaned, 16, 64)
	if err != nil {
		i = time.Now().Unix()
	}
	return -float64(i)
}
