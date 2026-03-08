package process

import (
	"context"
	"encoding/json"
	"finsnik.com/mongo"
	"finsnik.com/state"
	"fmt"
	"go.mongodb.org/mongo-driver/bson"
	mongoDriver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"net/http"
	"strconv"
	"time"
)

func SyncNAVForCode(code string) error {
	codeInt, err := strconv.ParseInt(code, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid code format: %v", err)
	}

	navCol, err := mongo.GetMongoCollection(state.Database, state.NavCollection)
	if err != nil {
		return err
	}

	// Handle custom codes (<=0) by ensuring recent NAV continuity
	if codeInt <= 0 {
		if err := ensureRecentDaysNAV(context.Background(), navCol, codeInt); err != nil {
			if err == mongoDriver.ErrNoDocuments {
				return nil
			}
			return err
		}

		state.Cache.Delete(fmt.Sprintf("nav_%d", codeInt))
		state.Cache.Delete(fmt.Sprintf("nav_change_%d", codeInt))
		GetNAVChange(float64(codeInt))
		return nil
	}

	// Step 1: Check if historical NAV exists
	historyExists, err := navCol.CountDocuments(context.Background(), bson.M{"code": codeInt})
	if err != nil {
		return err
	}

	// Step 2: If no history, fetch and insert all available NAVs
	if historyExists == 0 {
		fmt.Println("No history found. Fetching full NAV history for code:", codeInt)

		url := fmt.Sprintf("https://api.mfapi.in/mf/%d", codeInt)
		resp, err := http.Get(url)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var navData struct {
			Data []struct {
				Date string `json:"date"`
				NAV  string `json:"nav"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&navData); err != nil {
			return err
		}

		for _, entry := range navData.Data {
			parsedDate, err := time.Parse("02-01-2006", entry.Date)
			if err != nil {
				continue
			}
			parsedDate = parsedDate.UTC()
			parsedNav, err := strconv.ParseFloat(entry.NAV, 64)
			if err != nil {
				continue
			}

			doc := bson.M{
				"code": codeInt,
				"date": parsedDate,
				"nav":  parsedNav,
			}
			filter := bson.M{"code": codeInt, "date": parsedDate}
			update := bson.M{"$set": doc}

			_, _ = navCol.UpdateOne(context.Background(), filter, update, options.Update().SetUpsert(true))
		}
	}

	// Step 3: Always fetch the latest NAV from the API and upsert it
	url := fmt.Sprintf("https://api.mfapi.in/mf/%d", codeInt)
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var navData struct {
		Data []struct {
			Date string `json:"date"`
			NAV  string `json:"nav"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&navData); err != nil {
		return err
	}

	if len(navData.Data) > 0 {
		latest := navData.Data[0]
		parsedDate, err := time.Parse("02-01-2006", latest.Date)
		if err == nil {
			parsedDate = parsedDate.UTC()
			parsedNav, err := strconv.ParseFloat(latest.NAV, 64)
			if err == nil {
				doc := bson.M{
					"code": codeInt,
					"date": parsedDate,
					"nav":  parsedNav,
				}
				filter := bson.M{"code": codeInt, "date": parsedDate}
				update := bson.M{"$set": doc}
				_, _ = navCol.UpdateOne(context.Background(), filter, update, options.Update().SetUpsert(true))
			}
		}
	}

	if err := ensureRecentDaysNAV(context.Background(), navCol, codeInt); err != nil && err != mongoDriver.ErrNoDocuments {
		return err
	}

	state.Cache.Delete(fmt.Sprintf("nav_%d", codeInt))
	state.Cache.Delete(fmt.Sprintf("nav_change_%d", codeInt))
	GetNAVChange(float64(codeInt))
	state.InvalidateAllNetWorth()
	PrecomputeNetWorthForAllUsers()

	return nil
}

func SyncAllNAVsFromPortfolios() error {
	portfolioCol, err := mongo.GetMongoCollection(state.Database, state.PortfoliosCollection)
	if err != nil {
		return fmt.Errorf("failed to connect to DB: %v", err)
	}

	cursor, err := portfolioCol.Find(context.Background(), bson.M{"investment": true})
	if err != nil {
		return fmt.Errorf("failed to query portfolios: %v", err)
	}
	defer cursor.Close(context.Background())

	var codes []string
	for cursor.Next(context.Background()) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		if codeFloat, ok := doc["code"].(float64); ok {
			codes = append(codes, fmt.Sprintf("%.0f", codeFloat)) // still passing as string
		}
	}

	for _, code := range codes {
		if err := SyncNAVForCode(code); err != nil {
			fmt.Println("Failed to sync NAV for code:", code, err)
		}
	}
	state.InvalidateAllNetWorth()
	PrecomputeNetWorthForAllUsers()
	return nil
}

// ensureRecentDaysNAV guarantees the NAV collection includes a row for the
// second-most-recent calendar day ("day before yesterday"). When that day is
// missing, the helper reuses the NAV from the prior calendar day ("three days
// ago" relative to "today") and inserts a single backfill row. Running this on
// every sync prevents short gaps when providers delay updates while avoiding
// duplicate rows when the data already exists.
func ensureRecentDaysNAV(ctx context.Context, navCol *mongoDriver.Collection, codeInt int64) error {
	today := time.Now().UTC().Truncate(24 * time.Hour)
	targetDate := today.AddDate(0, 0, -2)

	count, err := navCol.CountDocuments(ctx, bson.M{"code": codeInt, "date": targetDate})
	if err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	// Look up the NAV from the calendar day before the target. If that
	// exact date is missing, fall back to the most recent NAV prior to the
	// target date.
	sourceDate := targetDate.AddDate(0, 0, -1)

	type navRecord struct {
		Date time.Time `bson:"date"`
		NAV  float64   `bson:"nav"`
	}

	var source navRecord
	err = navCol.FindOne(
		ctx,
		bson.M{"code": codeInt, "date": bson.M{"$lte": sourceDate}},
		options.FindOne().SetSort(bson.M{"date": -1}),
	).Decode(&source)
	if err != nil {
		return err
	}

	filter := bson.M{"code": codeInt, "date": targetDate.UTC().Truncate(24 * time.Hour)}
	update := bson.M{"$set": bson.M{"code": codeInt, "date": targetDate.UTC().Truncate(24 * time.Hour), "nav": source.NAV}}
	if _, err := navCol.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true)); err != nil {
		return err
	}

	return nil
}
