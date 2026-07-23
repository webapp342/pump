package units

import (
	"fmt"
	"math/big"
)

const LamportsPerSol = 1_000_000_000

func LamportsToSol(lamports uint64) string {
	if lamports == 0 {
		return "0"
	}
	num := new(big.Rat).SetUint64(lamports)
	den := new(big.Rat).SetUint64(LamportsPerSol)
	out := new(big.Rat).Quo(num, den)
	return out.FloatString(9)
}

func TokenAmountToDecimal(amount uint64, decimals int) string {
	if amount == 0 {
		return "0"
	}
	if decimals <= 0 {
		return fmt.Sprintf("%d", amount)
	}
	num := new(big.Rat).SetUint64(amount)
	den := new(big.Rat).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil))
	out := new(big.Rat).Quo(num, den)
	return out.FloatString(decimals)
}

func SpotPriceSolPerToken(spotRaw uint64, decimals int) string {
	if spotRaw == 0 {
		return "0"
	}
	// spotPrice from chain is lamports per whole token (same as TS spotPriceSolPerToken)
	return LamportsToSol(spotRaw)
}

func ExecutionPriceSol(solAmount, tokenAmount uint64, decimals int) string {
	tokens := TokenAmountToDecimal(tokenAmount, decimals)
	if tokenAmount == 0 {
		return "0"
	}
	sol := LamportsToSol(solAmount)
	solRat, _ := new(big.Rat).SetString(sol)
	tokRat, _ := new(big.Rat).SetString(tokens)
	if tokRat.Sign() == 0 {
		return "0"
	}
	out := new(big.Rat).Quo(solRat, tokRat)
	return out.FloatString(12)
}

func MarketCapSolFromSpot(spotPrice string) string {
	const totalSupply = 1_000_000_000
	spot, ok := new(big.Rat).SetString(spotPrice)
	if !ok || spot.Sign() <= 0 {
		return "0"
	}
	out := new(big.Rat).Mul(spot, new(big.Rat).SetInt64(totalSupply))
	return out.FloatString(6)
}

func EventID(signature string, logIndex int) string {
	return fmt.Sprintf("%s:%d", signature, logIndex)
}

func FeeSplitKey(signature, mint string) string {
	return signature + ":" + mint
}
