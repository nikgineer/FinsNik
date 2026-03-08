package authorisation

import (
	"strings"

	"finsnik.com/mongo"
	"finsnik.com/state"
	"github.com/gofiber/fiber/v2"
)

func ForgotPassword(c *fiber.Ctx) error {
	var forgotpass state.ForgotPassword
	if err := c.BodyParser(&forgotpass); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Failed to parse request body",
		})
	}

	database := state.Database

	email := strings.ToLower(forgotpass.Email)
	userData, err := mongo.GetFromMongoFiltered(database, state.UsersCollection, "email", email)
	if err != nil || userData == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Error while retrieving user data...",
		})
	}
	if forgotpass.SecurityWord == userData["secretkey"] {
		hashedPassword, hashErr := state.HashPassword(forgotpass.Password)
		if hashErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"message": "Error while securing new password",
			})
		}
		userData["password"] = hashedPassword
		err = mongo.SendToMongo(database, state.UsersCollection, userData["_id"].(string), userData)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"message": "Error while writing user data to MongoDB",
			})
		}
		return c.JSON(fiber.Map{"message": "Password reset successful. Redirecting to login..."})
	} else {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"message": "Secret word does not match. Retry...",
		})
	}
}
