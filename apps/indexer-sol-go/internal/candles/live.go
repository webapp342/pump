package candles

import (
	"context"
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/pump-tma/indexer-sol-go/internal/redisx"
)

var intervals = []string{"5m", "15m", "1h", "4h"}

var intervalMS = map[string]int64{
	"5m":  5 * 60_000,
	"15m": 15 * 60_000,
	"1h":  60 * 60_000,
	"4h":  4 * 60 * 60_000,
}

var liveTip sync.Map // key token:interval -> redisx.CandleUpdate

type TradeInput struct {
	TokenAddress string
	BlockTime    time.Time
	IsBuy        bool
	SpotBefore   float64
	SpotAfter    float64
	VolumeZug    float64
	BuyVolumeZug float64
}

func bucketTimestamp(blockTime time.Time, interval string) time.Time {
	ms := intervalMS[interval]
	aligned := blockTime.UnixMilli() / ms * ms
	return time.UnixMilli(aligned).UTC()
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func isSpotRatioSane(a, b float64) bool {
	if !(a > 0) || !(b > 0) || !isFinite(a) || !isFinite(b) {
		return false
	}
	ratio := a / b
	return ratio <= 4 && ratio >= 1/4
}

func resolveSpotOpen(spotBefore, spotAfter float64) float64 {
	if spotBefore > 0 && isFinite(spotBefore) {
		return spotBefore
	}
	return spotAfter
}

func wickTouchPrice(spotBefore, spotAfter, spotOpen float64) float64 {
	if spotBefore > 0 && isFinite(spotBefore) && isSpotRatioSane(spotBefore, spotAfter) {
		return spotBefore
	}
	if spotOpen > 0 && isFinite(spotOpen) {
		return spotOpen
	}
	return spotAfter
}

func tradeBucketOhlc(spotBefore, spotAfter float64) (open, high, low, close float64) {
	spotOpen := resolveSpotOpen(spotBefore, spotAfter)
	open = spotOpen
	touch := wickTouchPrice(spotBefore, spotAfter, spotOpen)
	prices := []float64{open, touch, spotAfter}
	high = prices[0]
	low = prices[0]
	for _, p := range prices[1:] {
		if p > high {
			high = p
		}
		if p < low {
			low = p
		}
	}
	close = spotAfter
	return open, high, low, close
}

func tipKey(token, interval string) string {
	return token + ":" + interval
}

func computeIntervalLive(
	ctx context.Context,
	rdb *redis.Client,
	input TradeInput,
	interval string,
) *redisx.CandleUpdate {
	if input.SpotAfter <= 0 || !isFinite(input.SpotAfter) {
		return nil
	}
	bucketTs := bucketTimestamp(input.BlockTime, interval)
	bucketSec := bucketTs.Unix()
	key := tipKey(input.TokenAddress, interval)

	var existing *redisx.CandleUpdate
	if v, ok := liveTip.Load(key); ok {
		existing = v.(*redisx.CandleUpdate)
	} else if rdb != nil {
		existing, _ = redisx.ReadHotCandle(ctx, rdb, input.TokenAddress, interval)
	}

	isNewBucket := existing == nil || existing.Time != bucketSec

	var open, high, low, close, volume, buyVolume float64
	var tradeCount int

	if isNewBucket {
		open, high, low, close = tradeBucketOhlc(input.SpotBefore, input.SpotAfter)
		volume = input.VolumeZug
		buyVolume = input.BuyVolumeZug
		tradeCount = 1
	} else {
		spotOpen := resolveSpotOpen(input.SpotBefore, input.SpotAfter)
		touch := wickTouchPrice(input.SpotBefore, input.SpotAfter, spotOpen)
		open, _ = strconv.ParseFloat(existing.Open, 64)
		high, _ = strconv.ParseFloat(existing.High, 64)
		low, _ = strconv.ParseFloat(existing.Low, 64)
		high = math.Max(high, math.Max(touch, math.Max(input.SpotAfter, open)))
		low = math.Min(low, math.Min(touch, math.Min(input.SpotAfter, open)))
		close = input.SpotAfter
		vol, _ := strconv.ParseFloat(existing.Volume, 64)
		buy, _ := strconv.ParseFloat(existing.BuyVolume, 64)
		volume = vol + input.VolumeZug
		buyVolume = buy + input.BuyVolumeZug
		tradeCount = existing.TradeCount + 1
	}

	high = math.Max(high, math.Max(open, close))
	low = math.Min(low, math.Min(open, close))

	return &redisx.CandleUpdate{
		Interval:    interval,
		Time:        bucketSec,
		Open:        formatFloat(open),
		High:        formatFloat(high),
		Low:         formatFloat(low),
		Close:       formatFloat(close),
		Volume:      formatFloat(volume),
		BuyVolume:   formatFloat(buyVolume),
		TradeCount:  tradeCount,
		IsNewBucket: isNewBucket,
	}
}

func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func ComputeLiveUpdates(ctx context.Context, rdb *redis.Client, input TradeInput) []redisx.CandleUpdate {
	out := make([]redisx.CandleUpdate, 0, len(intervals))
	for _, interval := range intervals {
		u := computeIntervalLive(ctx, rdb, input, interval)
		if u != nil {
			out = append(out, *u)
		}
	}
	return out
}

func CommitLiveUpdates(token string, updates []redisx.CandleUpdate) {
	for _, u := range updates {
		c := u
		liveTip.Store(tipKey(token, u.Interval), &c)
	}
}

func CommitLiveUpdatesRedis(ctx context.Context, rdb *redis.Client, token string, updates []redisx.CandleUpdate) {
	CommitLiveUpdates(token, updates)
	if rdb != nil {
		redisx.WriteHotCandles(ctx, rdb, token, updates)
	}
}
