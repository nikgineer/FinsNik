package process

import (
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"strings"
	"time"
)

func Portfolios(c *fiber.Ctx) error {
	var portfolio state.PortfolioType
	if err := c.BodyParser(&portfolio); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}
	data := map[string]any{
		"id":       portfolio.ID,
		"currency": portfolio.Currency,
		"type":     portfolio.Type,
		"name":     portfolio.Name,
		"category": portfolio.Category,
	}
	tokenString := state.AuthToken(c)
	if tokenString == "" {
		tokenString = portfolio.Token
	}
	email := state.AuthToEmail(tokenString)
	if email == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	data["email"] = email
	if data["type"] == "Cash & Savings" {
		if err := CashType(data); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"message": "Unable to update the database for cash portfolio",
			})
		}
	} else if data["type"].(string) == "Investment" {
		if err := InvestmentType(data); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"message": "Unable to update the database for Investment portfolio",
			})
		}
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unsupported Portfolio format",
		})
	}
	state.InvalidateUserCache(email)
	go PrecomputeNetWorthForUser(email)
	return c.JSON(fiber.Map{"message": "Database updated for portfolio"})
}

func CashType(data map[string]any) error {
	id := data["id"].(string)
	if err := mongo.SendToMongo(state.Database, state.PortfoliosCollection, id, bson.M(data)); err != nil {
		return fmt.Errorf("error while writing portfolio data to the database")
	}
	return nil
}

func InvestmentType(data map[string]any) error {
	id := data["id"].(string)
	if err := mongo.SendToMongo(state.Database, state.PortfoliosCollection, id, bson.M(data)); err != nil {
		fmt.Println("why here")
		return fmt.Errorf("error while writing portfolio data to the database")
	}
	return nil
}

func DeletePortfolios(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokernString := state.AuthToken(c)
	user := state.AuthToEmail(tokernString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	filter := bson.M{"email": user, "id": idParams}
	deleted, err := mongo.DeleteMongoFiltered(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Unable to delete cash portfolio data",
		})
	}
	if deleted {
		fmt.Println("Portfolio deleted successfully...")
	}
	filterEntries := bson.M{"email": user, "portfolioid": idParams}
	_, err = mongo.DeleteMongoFilteredMany(state.Database, state.EntriesCollection, filterEntries)
	if err != nil {
		fmt.Println("Error deleting entries corresponding to a specific portfolio")
	}
	_, err = mongo.DeleteMongoFilteredMany(state.Database, state.PortfoliosCollection, filterEntries)
	if err != nil {
		fmt.Println("Error deleting entries corresponding to a specific portfolio")
	}

	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)
	return c.JSON(fiber.Map{"message": "Portfolio deleted successfully..."})
}

func UpdatePortfolio(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}

	var payload struct {
		Name     string `json:"name"`
		Category string `json:"category"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Portfolio name is required",
		})
	}

	category := strings.TrimSpace(payload.Category)
	switch strings.ToLower(category) {
	case "savings":
		category = "Savings"
	case "emergency fund":
		category = "Emergency Fund"
	case "others", "other":
		category = "Others"
	case "":
		category = "Others"
	default:
		category = "Others"
	}

	filter := bson.M{"email": user, "id": idParams}
	docs, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil || len(docs) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"message": "Portfolio not found",
		})
	}

	doc := docs[0]
	doc["name"] = name
	doc["category"] = category
	delete(doc, "_id")

	if err := mongo.SendToMongo(state.Database, state.PortfoliosCollection, idParams, doc); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Unable to update portfolio",
		})
	}

	state.InvalidateUserCache(user)
	go PrecomputeNetWorthForUser(user)

	return c.JSON(fiber.Map{"message": "Portfolio updated successfully"})
}

func GetIndividualPortfolios(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	filter := bson.M{"email": user, "id": idParams}
	data, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		fmt.Println("Error in getting the individual portfolio info")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Portfolio ID does not exists in the database"})
	}
	return c.JSON(data)
}

func GetIndividualInvestmentPortfolios(c *fiber.Ctx) error {
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
			for i, doc := range cached {
				if alias, ok := doc["alias"].(string); ok && alias != "" {
					cached[i]["name"] = alias
				}
			}
			return c.JSON(fiber.Map{"investments": cached})
		}
	}

	filter := bson.M{"email": user, "portfolioid": idParams}
	data, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		fmt.Println("Error in getting the individual portfolio info")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Portfolio ID does not exists in the database"})
	}
	for i, doc := range data {
		if alias, ok := doc["alias"].(string); ok && alias != "" {
			data[i]["name"] = alias // override name for display
		}
	}
	state.Cache.Set(cacheKey, data, 12*time.Hour)
	return c.JSON(fiber.Map{"investments": data})
}
