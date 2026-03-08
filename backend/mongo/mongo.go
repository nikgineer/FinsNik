package mongo

import (
	"context"
	"finsnik.com/state"
	"fmt"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

type MongoCreds struct {
	url      string
	username string
	password string
}

type PortfoliosData struct {
	Name       string `bson:"name"`
	Type       string `bson:"type"`
	Email      string `bson:"email"`
	Currency   string `bson:"currency"`
	Category   string `bson:"category"`
	EquityType string `bson:"equitytype"`
	ID         string `bson:"id"`
	Code       int64  `bson:"code"`
	Alias      string `bson:"alias"`
}

type InvestWorthRequiredData struct {
	Date   time.Time `bson:"date"`
	Amount float64   `bson:"amount"`
	Units  float64   `bson:"units"`
	Type   string    `bson:"type"`
}

type InvestFolioWorthRequiredData struct {
	Date       time.Time `bson:"date"`
	Amount     float64   `bson:"amount"`
	Units      float64   `bson:"units"`
	Type       string    `bson:"type"`
	Investment string    `bson:"investmentid"`
}

var Mongo = readMongoCreds()

var (
	client     *mongo.Client
	clientLock sync.Mutex
)

func readMongoCreds() MongoCreds {
	return MongoCreds{
		url:      os.Getenv("MONGODB_URL"),
		username: os.Getenv("MONGODB_USERNAME"),
		password: os.Getenv("MONGODB_PASSWORD"),
	}
}

func MongoClient() (*mongo.Client, error) {
	clientLock.Lock()
	defer clientLock.Unlock()

	if client != nil {
		return client, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cred := options.Credential{
		AuthSource: "admin",
		Username:   Mongo.username,
		Password:   Mongo.password,
	}
	clientOpts := options.Client().ApplyURI(Mongo.url).SetAuth(cred)

	c, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, err
	}

	if err := c.Ping(ctx, nil); err != nil {
		return nil, err
	}
	client = c
	return client, nil
}

func GetMongoCollection(databaseName, collectionName string) (*mongo.Collection, error) {
	c, err := MongoClient()
	if err != nil {
		return nil, err
	}
	return c.Database(databaseName).Collection(collectionName), nil
}

func SendToMongo(database, collection, id string, data bson.M) error {
	client, err := MongoClient()
	if err != nil {
		return fmt.Errorf("MongoDB connection error: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := client.Database(database).Collection(collection)

	data["_id"] = id

	filter := bson.M{"_id": id}
	opts := options.Replace().SetUpsert(true)

	res, err := col.ReplaceOne(ctx, filter, data, opts)
	if err != nil {
		return fmt.Errorf("save failed: %w", err)
	}

	if res.MatchedCount > 0 {
		fmt.Println("✅ Existing document updated")
	} else {
		fmt.Println("✅ New document inserted")
	}

	return nil
}

func GetFromMongoFiltered(database, collection, field, value string) (bson.M, error) {
	client, err := MongoClient()
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection error: %w", err)
	}

	var results bson.M

	filter := bson.M{field: value}
	if field == "email" {
		pattern := "^" + regexp.QuoteMeta(strings.ToLower(value)) + "$"
		filter = bson.M{field: primitive.Regex{Pattern: pattern, Options: "i"}}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	err = coll.FindOne(ctx, filter).Decode(&results)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}

	return results, nil
}

func GetAllFromMongoWithFilter(database, collection string, filter bson.M) ([]bson.M, error) {
	client, err := MongoClient()
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection error: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []bson.M
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

func GetFromMongoFilteredMany(database, collection, field, value string) ([]bson.M, error) {
	client, err := MongoClient()
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection error: %w", err)
	}

	filter := bson.M{field: value}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

func GetFromMongoFilteredAllPortfolios(database, collection string, filter bson.M) []PortfoliosData {
	client, err := MongoClient()
	if err != nil {
		log.Println("MongoDB connection error:", err)
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		log.Println("Error finding documents:", err)
	}
	defer cursor.Close(ctx)

	var results []PortfoliosData
	for cursor.Next(ctx) {
		var data PortfoliosData
		if err := cursor.Decode(&data); err != nil { // ✅ fixed here
			log.Println("Error decoding document:", err)
		}
		results = append(results, data)
	}

	if err := cursor.Err(); err != nil {
		log.Println("Cursor iteration error:", err)
	}

	return results
}

func DeleteMongoFiltered(database, collection string, filter bson.M) (bool, error) {
	client, err := MongoClient()
	if err != nil {
		return false, fmt.Errorf("MongoDB connection error: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	result, err := coll.DeleteOne(ctx, filter)

	if err != nil {
		return false, err
	}

	if result.DeletedCount == 0 {
		return false, nil
	}

	return true, nil
}

func DeleteMongoFilteredMany(database, collection string, filter bson.M) (int64, error) {
	client, err := MongoClient()
	if err != nil {
		return 0, fmt.Errorf("MongoDB connection error: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	result, err := coll.DeleteMany(ctx, filter)

	if err != nil {
		return 0, err
	}

	return result.DeletedCount, nil
}

func NormalizeCashEntries(entries []state.CashGrowthPoint, currencyRates map[string]float64) []state.CashGrowthPoint {
	for i, entry := range entries {
		currency := entry.Currency
		if currency == "" {
			currency = "INR"
		}
		rate, ok := currencyRates[currency]
		if !ok || rate == 0 {
			fmt.Printf("Missing rate for %s, defaulting to 1\n", currency)
			rate = 1
		}
		if entry.Type == "deposit" {
			entries[i].Amount = entry.Amount / rate
		}
		if entry.Type == "withdraw" {
			entries[i].Amount = -entry.Amount / rate
		}
		entries[i].Currency = "INR"
	}
	return entries
}

func GetFilteredDataBefore(toDate time.Time, database, collection, user string) []state.CashGrowthPoint {
	currencyRates, _ := state.FetchRatesFromAPI()

	client, err := MongoClient()
	if err != nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	filter := bson.M{
		"date":  bson.M{"$lt": toDate},
		"email": user,
	}
	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		return nil
	}

	var results []state.CashGrowthPoint
	if err := cursor.All(ctx, &results); err != nil {
		return nil
	}

	results = NormalizeCashEntries(results, currencyRates)
	return results
}

func GetFilteredData(fromDate time.Time, database, collection, user string) []state.CashGrowthPoint {
	currencyRates, err := state.FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error fetching currency rates, using fallback rates")
		currencyRates = map[string]float64{
			"INR": 1,
			"USD": 0.012,
			"EUR": 0.011,
		}
	}

	client, err := MongoClient()
	if err != nil {
		fmt.Println("Mongo connection error:", err)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collection)
	filter := bson.M{
		"date":  bson.M{"$gte": fromDate},
		"email": user,
	}
	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		fmt.Println("Mongo query error:", err)
		return nil
	}

	var results []state.CashGrowthPoint
	if err := cursor.All(ctx, &results); err != nil {
		fmt.Println("Cursor decode error:", err)
		return nil
	}

	results = NormalizeCashEntries(results, currencyRates)
	return results
}

func GetInvestData(database string, collections string, filter bson.M) []InvestWorthRequiredData {
	client, err := MongoClient()
	if err != nil {
		log.Println("MongoDB connection error:", err)
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collections)

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		log.Println("Error finding documents:", err)
	}
	defer cursor.Close(ctx)

	var results []InvestWorthRequiredData
	for cursor.Next(ctx) {
		var data InvestWorthRequiredData
		if err := cursor.Decode(&data); err != nil {
			log.Println("Error decoding document:", err)
		}
		results = append(results, data)
	}

	if err := cursor.Err(); err != nil {
		log.Println("Cursor iteration error:", err)
	}
	return results
}

func GetInvestfolioData(database string, collections string, filter bson.M) []InvestFolioWorthRequiredData {
	client, err := MongoClient()
	if err != nil {
		log.Println("MongoDB connection error:", err)
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(database).Collection(collections)

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		log.Println("Error finding documents:", err)
	}
	defer cursor.Close(ctx)

	var results []InvestFolioWorthRequiredData
	for cursor.Next(ctx) {
		var data InvestFolioWorthRequiredData
		if err := cursor.Decode(&data); err != nil {
			log.Println("Error decoding document:", err)
		}
		results = append(results, data)
	}

	if err := cursor.Err(); err != nil {
		log.Println("Cursor iteration error:", err)
	}
	return results
}

func GetInvestmentCode(filter bson.M) (float64, error) {
	data, err := GetAllFromMongoWithFilter(state.Database, state.PortfoliosCollection, filter)
	if err != nil {
		return 0, fmt.Errorf("error while getting portfolio investment code")
	}
	if len(data) != 0 {
		return data[0]["code"].(float64), err
	}
	return 0, fmt.Errorf("error no code found in the database entry")
}

func GetAllFromMongoWithFilterNoID(database, collection string, filter bson.M) []map[string]any {
	coll, err := GetMongoCollection(database, collection)
	if err != nil {
		fmt.Println("MongoDB connection error:", err)
		return nil
	}

	// Exclude the _id field
	projection := bson.M{"_id": 0}
	findOptions := options.Find().SetProjection(projection)

	cursor, err := coll.Find(context.TODO(), filter, findOptions)
	if err != nil {
		fmt.Println("MongoDB find error:", err)
		return nil
	}
	defer cursor.Close(context.TODO())

	var results []map[string]any
	if err := cursor.All(context.TODO(), &results); err != nil {
		fmt.Println("MongoDB decode error:", err)
		return nil
	}

	return results
}

func GetOneFromMongoWithFilterSorted(
	dbName string,
	collName string,
	filter interface{},
	findOpts *options.FindOneOptions,
) (bson.M, error) {
	client, err := MongoClient()
	if err != nil {
		return nil, fmt.Errorf("MongoDB connection error: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	var result bson.M
	if err := coll.FindOne(ctx, filter, findOpts).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}
