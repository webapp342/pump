package redisx

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const chGroup = "ch-flusher"

type TradeChRow struct {
	EventID       string     `json:"event_id"`
	TokenAddress  string     `json:"token_address"`
	TraderAddress string     `json:"trader_address"`
	Side          string     `json:"side"`
	SolAmount     float64    `json:"sol_amount"`
	TokenAmount   float64    `json:"token_amount"`
	PriceSol      float64    `json:"price_sol"`
	SpotPriceSol  float64    `json:"spot_price_sol"`
	SpotBeforeSol float64    `json:"spot_before_sol"`
	FeeSol        float64    `json:"fee_sol"`
	TxHash        string     `json:"tx_hash"`
	LogIndex      int        `json:"log_index"`
	Slot          int64      `json:"slot"`
	BlockTime     time.Time  `json:"block_time"`
	NativeUsdRate *float64   `json:"native_usd_rate,omitempty"`
}

type CandleChRow struct {
	TokenAddress   string `json:"token_address"`
	CandleInterval string `json:"candle_interval"`
	BucketStart    string `json:"bucket_start"`
	OpenSol        float64 `json:"open_sol"`
	HighSol        float64 `json:"high_sol"`
	LowSol         float64 `json:"low_sol"`
	CloseSol       float64 `json:"close_sol"`
	VolumeSol      float64 `json:"volume_sol"`
	BuyVolumeSol   float64 `json:"buy_volume_sol"`
	TradeCount     int     `json:"trade_count"`
}

func ensureGroup(ctx context.Context, rdb *redis.Client, stream string) {
	_ = rdb.XGroupCreateMkStream(ctx, stream, chGroup, "0").Err()
}

func EnqueueTradeChStream(ctx context.Context, rdb *redis.Client, row TradeChRow) {
	if rdb == nil {
		return
	}
	go func() {
		ensureGroup(ctx, rdb, "pump:ch:trades")
		b, err := json.Marshal(row)
		if err != nil {
			return
		}
		if err := rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: "pump:ch:trades",
			Values: map[string]interface{}{"payload": string(b)},
		}).Err(); err != nil {
			log.Printf("[redis] ch trade XADD: %v", err)
		}
	}()
}

func EnqueueCandlesChStream(ctx context.Context, rdb *redis.Client, rows []CandleChRow) {
	if rdb == nil || len(rows) == 0 {
		return
	}
	go func() {
		ensureGroup(ctx, rdb, "pump:ch:candles")
		for _, row := range rows {
			b, err := json.Marshal(row)
			if err != nil {
				continue
			}
			if err := rdb.XAdd(ctx, &redis.XAddArgs{
				Stream: "pump:ch:candles",
				Values: map[string]interface{}{"payload": string(b)},
			}).Err(); err != nil {
				log.Printf("[redis] ch candle XADD: %v", err)
			}
		}
	}()
}
