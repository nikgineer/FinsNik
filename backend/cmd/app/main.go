package main

import (
	"context"
	"finsnik.com/authorisation"
	"finsnik.com/process"
	"finsnik.com/state"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/etag"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/robfig/cron/v3"
	"log"
	"math"
	"os"
	"runtime"
	"time"
)

func main() {
	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start cron job for NAV sync
	go startNAVScheduler()
	go startHealthMonitor()
	// Preload mutual fund schemes and schedule daily refresh
	startSchemeCacheScheduler()

	app := newFiberApp()

	app.Use(recover.New())
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))

	app.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:5173",
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "*",
		AllowCredentials: true,
	}))

	app.Use(etag.New(etag.Config{Weak: true}))

	// Define all your routes as before...
	app.Post("/login", authorisation.LoginHandler)
	app.Post("/sign-up", authorisation.CreateAccount)
	app.Post("/forgot-password", authorisation.ForgotPassword)
	app.Get("/token-authorisation", authorisation.TokenHandler)
	app.Get("/networth", process.NetWorth)
	app.Get("/home", process.HomeData)
	app.Get("/rates", state.Rates)
	app.Get("/networth/allocation-goal", process.GetNetworthAllocationGoal)
	app.Put("/networth/allocation-goal", process.UpdateNetworthAllocationGoal)
	app.Post("/portfolios", process.Portfolios)
	app.Put("/portfolios/:id", process.UpdatePortfolio)
	app.Delete("/portfolios/:id", process.DeletePortfolios)
	app.Get("/portfolios/:id", process.GetIndividualPortfolios)
	app.Get("/investfolio/worth/:id", process.InvestFolioWorth)
	app.Get("/invest/portfolios/:id", process.GetIndividualInvestmentPortfolios)
	app.Get("/entries/database/:id", process.HandleCashentryFetch)
	app.Post("/cash/entries", process.HandleCashEntries)
	app.Put("/cash/entries/:id", process.HandleEditCashEntries)
	app.Delete("/cash/entries/:id", process.HandleCashDeleteEntries)
	app.Get("/cash/growth", process.CashGrowth)
	app.Get("/entries/all", process.HandleAllEntriesFetch)
	app.Get("/investments/search", process.HandleInvestmentSearch)
	app.Post("/investments", process.Investments)
	app.Get("/investments/:id", process.GetInvestments)
	app.Put("/investments/:id", process.UpdateInvestments)
	app.Delete("/investments/:id", process.DeleteInvestments)
	app.Post("/transactions", process.AddTransactions)
	app.Get("/transactions/:id", process.GetIndividualInvestmentTransactions)
	app.Put("/transactions/:id", process.UpdateTransactions)
	app.Delete("/transactions/:id", process.DeleteTransactions)
	app.Get("/investment/worth", process.InvestmentWorth)
	app.Get("/investment/worth/:id", process.IndividualInvestmentWorth)
	app.Get("/investment/allocation", process.InvestmentAllocation)
	app.Get("/investment/category", process.InvestmentCategoryAllocation)
	app.Get("/investment/indianequity", process.IndianEquityAllocation)
	app.Post("/investment/custom", process.InvestmentCustom)
	app.Get("/cash/currency", process.CashCurrencyAllocation)
	app.Get("/cash/category-currency", process.CashCategoryCurrencyAllocation)
	app.Get("/investments/:id/growth", process.GetInvestmentGrowth)
	app.Get("/investment/growth", process.AllInvestmentGrowth)
	app.Get("/healthz", func(c *fiber.Ctx) error {
		var memStats runtime.MemStats
		runtime.ReadMemStats(&memStats)
		round := func(val float64) float64 {
			return math.Round(val*100) / 100
		}

		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":      "ok",
			"timestamp":   time.Now().Format(time.RFC3339),
			"goroutines":  runtime.NumGoroutine(),
			"alloc_mb":    round(float64(memStats.Alloc) / 1024 / 1024),
			"sys_mb":      round(float64(memStats.Sys) / 1024 / 1024),
			"num_gc":      memStats.NumGC,
			"cache_items": len(state.Cache.Items()),
			"cache_mb":    round(float64(state.CacheSize()) / 1024 / 1024),
		})
	})

	// Return JSON for unknown routes
	app.Use(func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	})

	// Start server
	if err := app.Listen(getListenAddr()); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}

func newFiberApp() *fiber.App {
	prefork := runtime.NumCPU() > 1

	return fiber.New(fiber.Config{
		Prefork:           prefork,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		BodyLimit:         10 * 1024 * 1024,
		ReduceMemoryUsage: true,
	})
}

func getListenAddr() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	return fmt.Sprintf(":%s", port)
}

// 🔁 Background job scheduler
func startNAVScheduler() {
	loc := time.Local

	c := cron.New(cron.WithLocation(loc))

	_, err := c.AddFunc("0 3,6,9,12,15,18,21 * * *", func() {
		fmt.Println("[NAV SYNC] Running at", time.Now().In(loc).Format("2006-01-02 15:04:05"))
		if err := process.SyncAllNAVsFromPortfolios(); err != nil {
			fmt.Println("NAV Sync Error:", err)
		} else {
			fmt.Println("[NAV SYNC] Completed successfully")
		}
	})
	if err != nil {
		fmt.Println("Failed to schedule NAV sync job:", err)
		return
	}

	c.Start()
}

func startHealthMonitor() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		var memStats runtime.MemStats
		runtime.ReadMemStats(&memStats)

		fmt.Printf(
			"[HEALTH] %s | Goroutines: %d | Alloc: %.2f MB | Sys: %.2f MB | GC: %d\n",
			time.Now().Format("15:04:05"),
			runtime.NumGoroutine(),
			float64(memStats.Alloc)/1024/1024,
			float64(memStats.Sys)/1024/1024,
			memStats.NumGC,
		)
	}
}

// Refresh mutual fund scheme cache daily and on startup
func startSchemeCacheScheduler() {
	refresh := func() {
		fmt.Println("[SCHEME CACHE] Refreshing mutual fund schemes")
		state.Cache.Delete("mutualFunds")
		state.GetFundNamesFromMFAPI()
	}

	// Run once at startup
	refresh()

	loc := time.Local
	c := cron.New(cron.WithLocation(loc))
	if _, err := c.AddFunc("0 0 * * *", refresh); err != nil {
		fmt.Println("Failed to schedule scheme cache refresh:", err)
		return
	}
	c.Start()
}
