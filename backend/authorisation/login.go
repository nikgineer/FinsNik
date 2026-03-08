package authorisation

import (
	"strings"
	"time"

	"finsnik.com/mongo"
	"finsnik.com/state"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var JwtKey = state.JwtKey

func LoginHandler(c *fiber.Ctx) error {
	var login state.LoginRequest
	if err := c.BodyParser(&login); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "Failed to parse login request body",
		})
	}

	email := strings.ToLower(login.Email)
	data, err := mongo.GetFromMongoFiltered(state.Database, state.UsersCollection, "email", email)
	if err != nil || data == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"message": "User does not exist",
		})
	}

	storedPassword, _ := data["password"].(string)
	if state.ComparePassword(storedPassword, login.Password) {
		claims := jwt.MapClaims{
			"email": email,
			"exp":   time.Now().Add(time.Hour * 1).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString(JwtKey)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"message": "Failed to generate token",
			})
		}
		return c.JSON(fiber.Map{
			"message": "Login Successful",
			"token":   tokenString,
		})

	}
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"message": "Invalid Email or Password. Retry...",
	})
}

func TokenHandler(c *fiber.Ctx) error {
	tokenString := state.AuthToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "No Authorization header",
			"token":   false,
		})
	}
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return JwtKey, nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "Invalid token"})
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if email, ok := claims["email"].(string); ok {
			return c.JSON(fiber.Map{
				"message": "User email from JWT: " + email,
			})
		}
	}
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"message": "Email not found in token"})
}
