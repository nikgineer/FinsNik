package process

import (
	"fmt"
	"math"
	"time"
)

func XIRR(cashflows []CashFlow) (float64, error) {
	if len(cashflows) == 0 {
		return 0, nil
	}
	const maxIterations = 100
	const precision = 1.0e-7
	guess := 0.1

	days := func(d1, d2 time.Time) float64 {
		return d2.Sub(d1).Hours() / 24
	}

	xnpv := func(rate float64) float64 {
		result := 0.0
		start := cashflows[0].Date
		for _, cf := range cashflows {
			result += cf.Amount / math.Pow(1+rate, days(start, cf.Date)/365)
		}
		return result
	}

	dxnpv := func(rate float64) float64 {
		result := 0.0
		start := cashflows[0].Date
		for _, cf := range cashflows {
			t := days(start, cf.Date) / 365
			result += -t * cf.Amount / math.Pow(1+rate, t+1)
		}
		return result
	}

	rate := guess
	for i := 0; i < maxIterations; i++ {
		f := xnpv(rate)
		df := dxnpv(rate)
		if df == 0 {
			break
		}
		newRate := rate - f/df
		if math.Abs(newRate-rate) < precision {
			return newRate, nil
		}
		rate = newRate
	}

	return 0, fmt.Errorf("XIRR did not converge")
}
