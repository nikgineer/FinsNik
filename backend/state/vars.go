package state

import (
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/patrickmn/go-cache"
	"golang.org/x/crypto/bcrypt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

var Cache = cache.New(5*24*time.Hour, 1*time.Hour)
var Database = "finstanik"
var UsersCollection = "users"
var PortfoliosCollection = "portfolios"
var EntriesCollection = "entries"
var NavCollection = "nav"

var JwtKey []byte

var RatesAPI = "https://api.exchangerate-api.com/v4/latest/inr"
var MutualFundsListAPI = "https://api.mfapi.in/mf"
var MutualFundsNav = "https://api.mfapi.in/mf/%s"

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CacheData struct {
	CashHoldings map[string]float64
	CashModified bool
	Portfolio    string
}

type CreateAccount struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	SecretKey string `json:"securityword"`
	FullName  string `json:"fullname"`
}

type ForgotPassword struct {
	Email        string `json:"email"`
	SecurityWord string `json:"securityword"`
	Password     string `json:"password"`
}

type PortfolioType struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Category string `json:"category"`
	Currency string `json:"currency"`
	Token    string `json:"token"`
}

type CashEntries struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Amount      float64   `json:"amount"`
	Date        time.Time `json:"date"`
	PortfolioID string    `json:"portfolioid"`
	Currency    string    `json:"currency"`
}

type CashGrowthPoint struct {
	ID          string    `bson:"id"`
	Type        string    `bson:"type"`
	Amount      float64   `bson:"amount"`
	Date        time.Time `bson:"date"`
	PortfolioID string    `bson:"portfolioid"`
	Currency    string    `bson:"currency"`
}

type MutualFundScheme struct {
	SchemeCode float64 `json:"schemeCode"`
	SchemeName string  `json:"schemeName"`
}

type NavEntry struct {
	Date string `json:"date"`
	NAV  string `json:"nav"`
}

type SchemeResponse struct {
	Meta map[string]interface{} `json:"meta"`
	Data []NavEntry             `json:"data"`
}

type InvestmentData struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Category     string `json:"category"`
	EquityType   string `json:"equitytype"`
	Currency     string `json:"currency"`
	PortfolioID  string `json:"portfolioid"`
	Token        string `json:"token"`
	InvestmentID string `json:"investmentid"`
	Alias        string `json:"alias"`
}

type InvestmentCustomUpdate struct {
	PortfolioID  string  `json:"portfolioid"`
	InvestmentID string  `json:"investmentid"`
	Alias        string  `json:"alias"`
	CustomNav    float64 `json:"customnav"`
	Date         string  `json:"date"`
}

type InvestmentTransactions struct {
	ID           string    `json:"id"`
	InvestmentID string    `json:"investmentid"`
	Units        float64   `json:"units"`
	Price        float64   `json:"price"`
	Amount       float64   `json:"amount"`
	Date         time.Time `json:"date"`
	Type         string    `json:"type"`
	PortfolioID  string    `json:"portfolioid"`
}

type WorthSnapshot struct {
	Date  time.Time `bson:"date" json:"date"`
	Total float64   `bson:"total" json:"total"`
	Email string    `bson:"email" json:"-"`
}

type AllocationItem struct {
	Name  string  `json:"name" bson:"name"`
	Value float64 `json:"value" bson:"value"`
}

type NetworthAllocationGoal struct {
	Networth []AllocationItem `json:"networth" bson:"networth"`
	Indian   []AllocationItem `json:"indian" bson:"indian"`
}

func SanitizeEmail(email string) string {
	clean := strings.ToLower(email)
	clean = strings.ReplaceAll(clean, ".", "_")
	clean = strings.ReplaceAll(clean, "@", "_at_")
	return clean
}

func AuthToEmail(tokenString string) string {
	if tokenString == "" {
		return ""
	}
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return JwtKey, nil
	})
	if err != nil || !token.Valid {
		return ""
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if email, ok := claims["email"].(string); ok {
			return email
		}
	}
	return ""
}

func AuthToken(c *fiber.Ctx) string {
	authHeader := strings.TrimSpace(c.Get("Authorization"))
	if authHeader != "" {
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			return strings.TrimSpace(authHeader[7:])
		}
		return authHeader
	}

	legacyHeader := strings.TrimSpace(c.Get("Authorisation"))
	if legacyHeader != "" {
		return legacyHeader
	}

	return strings.TrimSpace(c.Get("token"))
}

func HashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func ComparePassword(storedPassword, providedPassword string) bool {
	if storedPassword == "" || providedPassword == "" {
		return false
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(providedPassword)); err == nil {
		return true
	}

	// Backward compatibility for legacy plaintext passwords already stored in MongoDB.
	return storedPassword == providedPassword
}

func BsonStringToFloat(data string) float64 {
	amountFloat, err := strconv.ParseFloat(data, 64)
	if err != nil {
		fmt.Printf("Invalid amount '%s', skipping\n", data)
		return 0.0
	}
	return amountFloat
}

func FormatToISO(dateStr string) string {
	parsedTime, err := time.Parse("02-01-2006", dateStr)
	if err != nil {
		return ""
	}
	return parsedTime.Format(time.RFC3339)
}

func init() {
	key := os.Getenv("JWT_KEY")
	if key == "" {
		log.Fatal("JWT_KEY environment variable not set")
	}
	JwtKey = []byte(key)
}
