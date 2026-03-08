package state

import (
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/patrickmn/go-cache"
	"io"
	"net/http"
	"time"
)

type RatesResponse struct {
	Rates map[string]float64 `json:"rates"`
}

func Rates(c *fiber.Ctx) error {
	rates, err := FetchRatesFromAPI()
	if err != nil {
		fmt.Println("Error while fetching currency rates")
	}
	return c.JSON(rates)
}

func FetchRatesFromAPI() (map[string]float64, error) {
	if cached, found := Cache.Get("rates"); found {
		if r, ok := cached.(map[string]float64); ok {
			return r, nil
		}
	}

	var ratesAPI = RatesAPI
	client := http.Client{
		Timeout: 10 * time.Second,
	}
	resp, err := client.Get(ratesAPI)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var result RatesResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return nil, err
	}

	allRates := map[string]float64{
		"INR": result.Rates["INR"],
		"USD": result.Rates["USD"],
		"EUR": result.Rates["EUR"],
	}
	Cache.Set("rates", allRates, 12*time.Hour)
	return allRates, nil
}

func GetFundNamesFromMFAPI() []string {
	if cached, found := Cache.Get("mutualFunds"); found {
		if schemes, ok := cached.([]MutualFundScheme); ok {
			var names []string
			for _, scheme := range schemes {
				names = append(names, scheme.SchemeName)
			}
			return names
		}
	}
	var url = MutualFundsListAPI
	client := http.Client{Timeout: 10 * time.Second}

	resp, err := client.Get(url)
	if err != nil {
		fmt.Println("Request error:", err)
		return []string{}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		fmt.Printf("Non-OK response (%d): %s\n", resp.StatusCode, string(body))
		return []string{}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Failed to read response body:", err)
		return []string{}
	}

	var schemes []MutualFundScheme
	err = json.Unmarshal(body, &schemes)
	if err != nil {
		fmt.Println("Failed to decode JSON:", err)
		return []string{}
	}

	var names []string
	for _, scheme := range schemes {
		names = append(names, scheme.SchemeName)
	}
	Cache.Set("mutualFunds", schemes, cache.DefaultExpiration)
	return names
}
