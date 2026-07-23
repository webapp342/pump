package units

import (
	"fmt"
	"math/big"
	"strings"
)

const LamportsPerSol = 1_000_000_000

// On-chain spot uses TOKEN_UNIT_9 base (see @pump/solana-sdk SPOT_PRICE_TOKEN_UNIT).
const SpotPriceTokenUnit = 1_000_000_000

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
	den := new(big.Rat).SetInt(exp10(decimals))
	out := new(big.Rat).Quo(num, den)
	return out.FloatString(decimals)
}

// SpotPriceSolPerToken converts on-chain spot (lamports per TOKEN_UNIT_9 base units)
// to SOL per whole token — must match apps/indexer-sol/src/units.ts spotPriceSolPerToken.
func SpotPriceSolPerToken(spotRaw uint64, decimals int) string {
	if spotRaw == 0 {
		return "0"
	}
	if decimals < 0 {
		decimals = 6
	}
	const scale = 18
	num := new(big.Int).SetUint64(spotRaw)
	num.Mul(num, exp10(decimals))
	num.Mul(num, exp10(scale))
	den := new(big.Int).SetUint64(SpotPriceTokenUnit)
	den.Mul(den, exp10(9))
	scaled := new(big.Int).Quo(num, den)
	return formatScaledInt(scaled, scale)
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

func exp10(n int) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
}

func formatScaledInt(v *big.Int, decimals int) string {
	if v.Sign() == 0 {
		return "0"
	}
	neg := v.Sign() < 0
	abs := new(big.Int).Abs(v)
	base := exp10(decimals)
	whole := new(big.Int).Quo(abs, base)
	frac := new(big.Int).Mod(abs, base)
	fracStr := fmt.Sprintf("%0*s", decimals, frac.String())
	fracStr = strings.TrimRight(fracStr, "0")
	if fracStr == "" {
		if neg {
			return "-" + whole.String()
		}
		return whole.String()
	}
	body := whole.String() + "." + fracStr
	if neg {
		return "-" + body
	}
	return body
}
