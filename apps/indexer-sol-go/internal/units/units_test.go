package units

import (
	"math/big"
	"testing"
)

func TestSpotPriceSolPerToken_sixDecimals(t *testing.T) {
	got := SpotPriceSolPerToken(4659, 6)
	wantRat, _ := new(big.Rat).SetString("0.000000004659")
	gotRat, ok := new(big.Rat).SetString(got)
	if !ok {
		t.Fatalf("parse got %q", got)
	}
	diff := new(big.Rat).Sub(gotRat, wantRat)
	if diff.Abs(diff).Cmp(new(big.Rat).SetFloat64(1e-15)) > 0 {
		t.Fatalf("spot=%q want≈%s (old bug was 1000× higher)", got, wantRat.FloatString(18))
	}

	mcap := MarketCapSolFromSpot(got)
	mcapRat, ok := new(big.Rat).SetString(mcap)
	if !ok {
		t.Fatalf("parse mcap %q", mcap)
	}
	if mcapRat.Cmp(new(big.Rat).SetFloat64(5000)) > 0 {
		t.Fatalf("mcap=%s too high — decimal scaling regression", mcap)
	}
}

func TestSpotPriceSolPerToken_notEqualToLamportsOnly(t *testing.T) {
	raw := uint64(4_659_000_000)
	wrong := LamportsToSol(raw)
	got := SpotPriceSolPerToken(raw, 6)
	if got == wrong {
		t.Fatalf("spot must not equal lamports/1e9 for 6-decimal tokens")
	}
}
