package authorisation

import (
	"fmt"
	"strings"

	"finsnik.com/mongo"
	"finsnik.com/state"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/patrickmn/go-cache"
	"go.mongodb.org/mongo-driver/bson"
)

func CreateAccount(c *fiber.Ctx) error {
	var signup state.CreateAccount

	if err := c.BodyParser(&signup); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Failed to parse request body",
		})
	}

	database := state.Database
	id := uuid.New().String()

	email := strings.ToLower(signup.Email)
	hashedPassword, err := state.HashPassword(signup.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to secure account credentials",
		})
	}

	data := bson.M{
		"email":     email,
		"password":  hashedPassword,
		"secretkey": signup.SecretKey,
		"fullname":  signup.FullName,
	}

	err = mongo.SendToMongo(database, state.UsersCollection, id, bson.M(data))
	if err != nil {
		fmt.Println(err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Failed to create database for user",
		})
	}

	state.Cache.Set(email, state.CacheData{}, cache.NoExpiration)

	return c.JSON(fiber.Map{
		"message": "Signup successful! Redirecting to login...",
	})
}
