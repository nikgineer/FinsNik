package process

import (
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"math"
	"strings"
	"time"
)

type CashFlow struct {
	Date   time.Time
	Amount float64
}

func InvestmentWorth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"message": "data"})
}

func IndividualInvestmentWorth(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenStr := state.AuthToken(c)
	portfolio := c.Get("portfolioid")
	user := state.AuthToEmail(tokenStr)

	cacheKey := state.InvestmentWorthKey(user, idParams)
	if val, found := state.Cache.Get(cacheKey); found {
		if data, ok := val.(map[string]any); ok {
			return c.JSON(data)
		}
	}

	filter := bson.M{"email": user, "investmentid": idParams, "portfolioid": portfolio}
	rawEntries := mongo.GetInvestData(state.Database, state.EntriesCollection, filter)

	var entries []mongo.InvestWorthRequiredData
	for _, raw := range rawEntries {
		var entry mongo.InvestWorthRequiredData
		bsonBytes, _ := bson.Marshal(raw)
		_ = bson.Unmarshal(bsonBytes, &entry)
		entries = append(entries, entry)
	}

	filter = bson.M{"email": user, "id": idParams, "portfolioid": portfolio}
	portfolioData, err := mongo.GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil || len(portfolioData) == 0 {
		fmt.Println("No portfolio for the given data")
		return c.Status(404).JSON(fiber.Map{"error": "Portfolio not found"})
	}

	if len(portfolioData) != 0 {
		code := toFloat(portfolioData[0]["code"])
		date, nav, err := GetLatestNAV(code)
		if err != nil {
			fmt.Println("Error while getting the latest NAV")
		}
		delta, pct, _ := GetNAVChange(code)

		var units float64
		var invested float64
		var costBasis float64
		var earliestDate time.Time
		for i, entry := range entries {
			entryDate := entry.Date
			if i == 0 || entryDate.Before(earliestDate) {
				earliestDate = entryDate
			}
			switch strings.ToLower(entry.Type) {
			case "buy":
				invested += entry.Amount
				units += entry.Units
				costBasis += entry.Amount
			case "sell":
				invested -= entry.Amount
				if units > 0 {
					avg := costBasis / units
					costBasis -= avg * entry.Units
				}
				units -= entry.Units
			}
		}
		var averagePrice float64
		if units > 0 {
			averagePrice = costBasis / units
		}

		var investedSince string
		if len(entries) == 0 {
			investedSince = "N/A"
		} else {
			now := time.Now()
			years := now.Year() - earliestDate.Year()
			months := int(now.Month()) - int(earliestDate.Month())
			days := now.Day() - earliestDate.Day()
			if days < 0 {
				months--
			}
			if months < 0 {
				years--
				months += 12
			}
			if years <= 0 {
				investedSince = fmt.Sprintf("%d months", months)
			} else {
				investedSince = fmt.Sprintf("%d years %d months", years, months)
			}
		}
		CashFlow := ConvertToCashFlows(rawEntries, units, nav)
		xirr, err := XIRR(CashFlow)
		if err != nil {
			fmt.Println("Error while calculating the XIRR")
			xirr = 0
		}
		current := units * nav
		dayChange := units * delta
		payload := map[string]any{
			"invested":      invested,
			"current":       current,
			"units":         units,
			"nav":           nav,
			"date":          state.FormatToISO(date),
			"xirr":          xirr,
			"investedsince": investedSince,
			"averageprice":  averagePrice,
			"daychange":     dayChange,
			"daychangepct":  pct,
		}
		state.Cache.Set(cacheKey, payload, 12*time.Hour)
		return c.JSON(payload)
	}
	return c.JSON(fiber.Map{"Message": "No previous entries"})

}

func ConvertToCashFlows(entries []mongo.InvestWorthRequiredData, currentUnits float64, currentNav float64) []CashFlow {
	var cashflows []CashFlow

	for _, entry := range entries {
		amount := entry.Amount
		if strings.ToLower(entry.Type) == "buy" {
			amount = -math.Abs(amount)
		} else if strings.ToLower(entry.Type) == "sell" {
			amount = math.Abs(amount)
		}
		cashflows = append(cashflows, CashFlow{
			Date:   entry.Date,
			Amount: amount,
		})
	}

	if currentUnits > 0 && currentNav > 0 {
		cashflows = append(cashflows, CashFlow{
			Date:   time.Now(),
			Amount: currentUnits * currentNav,
		})
	}

	return cashflows
}

func InvestFolioWorth(c *fiber.Ctx) error {
	idParams := c.Params("id")
	tokenStr := state.AuthToken(c)
	user := state.AuthToEmail(tokenStr)

	filter := bson.M{"email": user, "portfolioid": idParams, "investment": true}
	portfolios := mongo.GetFromMongoFilteredAllPortfolios(state.Database, state.PortfoliosCollection, filter)

	portfolioData := make(map[string]any)

	var totalInvested float64
	var totalCurrentValue float64
	var totalDayChange float64
	var combinedCashflows []CashFlow

	for _, portfolio := range portfolios {
		filter := bson.M{"email": user, "portfolioid": idParams, "investmentid": portfolio.ID}
		_, nav, _ := GetLatestNAV(float64(portfolio.Code))
		delta, pct, _ := GetNAVChange(float64(portfolio.Code))

		var units float64
		var invested float64
		var cashflows []CashFlow

		entries, err := mongo.GetAllFromMongoWithFilter(state.Database, state.EntriesCollection, filter)
		if err != nil {
			fmt.Println("No entries found for the given investment")
			continue
		}

		for _, entry := range entries {
			entryType := entry["type"].(string)
			amount := entry["amount"].(float64)
			unitsVal := entry["units"].(float64)

			// Parse date
			entryDateRaw := entry["date"]
			entryDate, ok := entryDateRaw.(primitive.DateTime)
			if !ok {
				fmt.Println("Invalid date format (not primitive.DateTime)")
				continue
			}
			entryTime := entryDate.Time()

			if entryType == "buy" {
				units += unitsVal
				invested += amount
				cashflows = append(cashflows, CashFlow{Date: entryTime, Amount: -amount})
			} else if entryType == "sell" {
				units -= unitsVal
				invested -= amount
				cashflows = append(cashflows, CashFlow{Date: entryTime, Amount: amount})
			}
		}

		currentVal := units * nav
		dayChange := units * delta
		today := time.Now()
		cashflows = append(cashflows, CashFlow{Date: today, Amount: currentVal})

		xirr, err := XIRR(cashflows)
		if err != nil {
			xirr = 0
		}

		// Append to combined
		combinedCashflows = append(combinedCashflows, cashflows[:len(cashflows)-1]...) // exclude currentVal for now
		totalInvested += invested
		totalCurrentValue += currentVal
		totalDayChange += dayChange

		payload := map[string]float64{
			"current":      currentVal,
			"invested":     invested,
			"xirr":         xirr,
			"daychange":    dayChange,
			"daychangepct": pct,
		}
		portfolioData[portfolio.ID] = payload
	}

	// Add final combined current value as inflow
	combinedCashflows = append(combinedCashflows, CashFlow{
		Date:   time.Now(),
		Amount: totalCurrentValue,
	})
	combinedXIRR, err := XIRR(combinedCashflows)
	if err != nil {
		combinedXIRR = 0
	}

	totalDayChangePct := 0.0
	if totalCurrentValue-totalDayChange != 0 {
		totalDayChangePct = (totalDayChange / (totalCurrentValue - totalDayChange)) * 100
	}
	allFolios := map[string]float64{
		"invested":     totalInvested,
		"current":      totalCurrentValue,
		"xirr":         combinedXIRR,
		"daychange":    totalDayChange,
		"daychangepct": totalDayChangePct,
	}

	return c.JSON(fiber.Map{
		"message":         "PortfolioData",
		"investfoliodata": portfolioData,
		"allfolios":       allFolios,
	})
}

func toFloat64(val interface{}) float64 {
	switch v := val.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
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
