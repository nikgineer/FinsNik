package process

import (
	"context"
	"finsnik.com/mongo"
	"finsnik.com/state"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	mongoDriver "go.mongodb.org/mongo-driver/mongo"
	"math"
	"strings"
	"time"
)

const networthGoalCollection = "networth_goals"

var defaultNetworthGoal = state.NetworthAllocationGoal{
	Networth: []state.AllocationItem{
		{Name: "International Equity", Value: 0},
		{Name: "Gold", Value: 0},
		{Name: "Debt/Liquid", Value: 0},
		{Name: "INR cash", Value: 0},
		{Name: "EUR cash", Value: 0},
		{Name: "Indian Equity", Value: 0},
	},
	Indian: []state.AllocationItem{
		{Name: "Flexi Cap", Value: 0},
		{Name: "Multi Asset", Value: 0},
		{Name: "Large Cap", Value: 0},
		{Name: "Mid Cap", Value: 0},
		{Name: "Small Cap", Value: 0},
		{Name: "Aggressive Hybrid", Value: 0},
		{Name: "Conservative Hybrid", Value: 0},
		{Name: "ELSS Tax Saver", Value: 0},
		{Name: "Others", Value: 0},
	},
}

func getNetworthGoalID(email string) string {
	return state.SanitizeEmail(email) + "_networth_goal"
}

func sanitizeAllocationItems(items []state.AllocationItem) []state.AllocationItem {
	normalized := make([]state.AllocationItem, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, exists := seen[key]; exists {
			continue
		}
		value := item.Value
		if math.IsNaN(value) || math.IsInf(value, 0) {
			value = 0
		}
		normalized = append(normalized, state.AllocationItem{Name: name, Value: value})
		seen[key] = struct{}{}
	}
	return normalized
}

func validateAllocationTotal(items []state.AllocationItem) (float64, bool) {
	const tolerance = 0.01
	var total float64
	for _, item := range items {
		total += item.Value
	}
	return total, math.Abs(total-100) <= tolerance
}

func GetNetworthAllocationGoal(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}

	collection, err := mongo.GetMongoCollection(state.Database, networthGoalCollection)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Database connection failed",
		})
	}

	docID := getNetworthGoalID(user)
	var doc struct {
		Networth []state.AllocationItem `bson:"networth"`
		Indian   []state.AllocationItem `bson:"indian"`
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = collection.FindOne(ctx, bson.M{"_id": docID}).Decode(&doc)
	if err != nil {
		if err == mongoDriver.ErrNoDocuments {
			return c.JSON(defaultNetworthGoal)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to fetch goal",
		})
	}

	goal := state.NetworthAllocationGoal{
		Networth: sanitizeAllocationItems(doc.Networth),
		Indian:   sanitizeAllocationItems(doc.Indian),
	}

	if len(goal.Networth) == 0 {
		goal.Networth = defaultNetworthGoal.Networth
	}
	if len(goal.Indian) == 0 {
		goal.Indian = defaultNetworthGoal.Indian
	}

	return c.JSON(goal)
}

func UpdateNetworthAllocationGoal(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	user := state.AuthToEmail(tokenString)
	if user == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}

	var payload state.NetworthAllocationGoal
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Invalid request body",
		})
	}

	networthItems := sanitizeAllocationItems(payload.Networth)
	indianItems := sanitizeAllocationItems(payload.Indian)

	if len(networthItems) == 0 || len(indianItems) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Allocation data is required",
		})
	}

	if total, ok := validateAllocationTotal(networthItems); !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message":  "Networth allocation must total 100",
			"received": total,
		})
	}

	if total, ok := validateAllocationTotal(indianItems); !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message":  "Indian equity allocation must total 100",
			"received": total,
		})
	}

	docID := getNetworthGoalID(user)
	data := bson.M{
		"email":     strings.ToLower(user),
		"networth":  networthItems,
		"indian":    indianItems,
		"updatedat": time.Now().UTC(),
	}

	if err := mongo.SendToMongo(state.Database, networthGoalCollection, docID, data); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to save allocation goal",
		})
	}

	goal := state.NetworthAllocationGoal{
		Networth: networthItems,
		Indian:   indianItems,
	}

	return c.JSON(goal)
}
