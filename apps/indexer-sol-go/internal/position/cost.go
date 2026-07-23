package position

import "math"

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

type State struct {
	TokenBalance          float64
	TotalBought           float64
	TotalSold             float64
	RemainingCostBasis    float64
	RealizedPnl           float64
	RemainingCostBasisUsd float64
	RealizedPnlUsd        float64
}

func TradeNetZug(gross, fee float64) float64 {
	return math.Max(0, gross-fee)
}

func ApplyTrade(state State, isBuy bool, grossZug, feeZug, tokenAmount float64, nativeUsdRate *float64) State {
	netZug := TradeNetZug(grossZug, feeZug)
	if !isFinite(tokenAmount) || tokenAmount <= 0 || netZug <= 0 {
		return state
	}

	var rate *float64
	if nativeUsdRate != nil && *nativeUsdRate > 0 {
		rate = nativeUsdRate
	} else if state.RemainingCostBasis > 0 && state.RemainingCostBasisUsd > 0 {
		implied := state.RemainingCostBasisUsd / state.RemainingCostBasis
		rate = &implied
	}

	if isBuy {
		netUsd := 0.0
		if rate != nil {
			netUsd = netZug * *rate
		}
		return State{
			TokenBalance:          state.TokenBalance + tokenAmount,
			TotalBought:           state.TotalBought + grossZug,
			TotalSold:             state.TotalSold,
			RemainingCostBasis:    state.RemainingCostBasis + netZug,
			RealizedPnl:           state.RealizedPnl,
			RemainingCostBasisUsd: state.RemainingCostBasisUsd + netUsd,
			RealizedPnlUsd:        state.RealizedPnlUsd,
		}
	}

	tracked := math.Max(state.TokenBalance, 0)
	sold := math.Min(tokenAmount, tracked)
	if sold <= 0 {
		return State{
			TokenBalance:          math.Max(0, state.TokenBalance-tokenAmount),
			TotalBought:           state.TotalBought,
			TotalSold:             state.TotalSold + grossZug,
			RemainingCostBasis:    state.RemainingCostBasis,
			RealizedPnl:           state.RealizedPnl,
			RemainingCostBasisUsd: state.RemainingCostBasisUsd,
			RealizedPnlUsd:        state.RealizedPnlUsd,
		}
	}

	avgCost := 0.0
	if state.TokenBalance > 0 {
		avgCost = state.RemainingCostBasis / state.TokenBalance
	}
	avgCostUsd := 0.0
	if state.TokenBalance > 0 {
		avgCostUsd = state.RemainingCostBasisUsd / state.TokenBalance
	}
	costSold := avgCost * sold
	costSoldUsd := avgCostUsd * sold
	proceeds := TradeNetZug(grossZug*sold/tokenAmount, feeZug*sold/tokenAmount)
	proceedsUsd := 0.0
	if rate != nil {
		proceedsUsd = proceeds * *rate
	}
	newBalance := state.TokenBalance - sold

	next := State{
		TokenBalance:          newBalance,
		TotalBought:           state.TotalBought,
		TotalSold:             state.TotalSold + grossZug,
		RemainingCostBasis:    state.RemainingCostBasis - costSold,
		RealizedPnl:           state.RealizedPnl + (proceeds - costSold),
		RemainingCostBasisUsd: state.RemainingCostBasisUsd - costSoldUsd,
		RealizedPnlUsd:        state.RealizedPnlUsd + (proceedsUsd - costSoldUsd),
	}
	if newBalance <= 0 {
		next.RemainingCostBasis = 0
		next.RemainingCostBasisUsd = 0
	}
	return next
}
