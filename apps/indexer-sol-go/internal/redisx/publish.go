package redisx

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

const streamMaxLen = 200

type CandleUpdate struct {
	Interval    string `json:"interval"`
	Time        int64  `json:"time"`
	Open        string `json:"open"`
	High        string `json:"high"`
	Low         string `json:"low"`
	Close       string `json:"close"`
	Volume      string `json:"volume"`
	BuyVolume   string `json:"buyVolume"`
	TradeCount  int    `json:"tradeCount"`
	IsNewBucket bool   `json:"isNewBucket"`
}

type TradePayload struct {
	Type          string         `json:"type"`
	Seq           *int64         `json:"seq,omitempty"`
	TokenAddress  string         `json:"tokenAddress"`
	CandleUpdates []CandleUpdate `json:"candleUpdates,omitempty"`
	Trade         TradeLeg       `json:"trade"`
	Bonding       BondingLeg     `json:"bonding"`
}

type TradeLeg struct {
	ID             string  `json:"id"`
	Side           string  `json:"side"`
	TraderAddress  string  `json:"traderAddress"`
	ZugAmount      string  `json:"zugAmount"`
	FeeZug         string  `json:"feeZug,omitempty"`
	TokenAmount    string  `json:"tokenAmount"`
	PriceZug       string  `json:"priceZug"`
	TxHash         string  `json:"txHash"`
	LogIndex       int     `json:"logIndex"`
	BlockTime      string  `json:"blockTime"`
	NativeUsdRate  *string `json:"nativeUsdRate,omitempty"`
}

type BondingLeg struct {
	ReserveZug        string  `json:"reserveZug"`
	TokenSold         string  `json:"tokenSold,omitempty"`
	MarketCapZug      string  `json:"marketCapZug"`
	SpotPriceZug      string  `json:"spotPriceZug,omitempty"`
	LastPriceZug      string  `json:"lastPriceZug"`
	ProgressBps       int     `json:"progressBps"`
	Graduated         bool    `json:"graduated,omitempty"`
	CurveComplete     bool    `json:"curveComplete,omitempty"`
	VaultTokenReserve *string `json:"vaultTokenReserve,omitempty"`
	TradeCount        int     `json:"tradeCount"`
	HolderCount       int     `json:"holderCount"`
}

func roomKey(address string) string {
	if len(address) >= 2 && (address[0] == '0' && address[1] == 'x') {
		// EVM lower — Solana keeps case
		b := []byte(address)
		for i := range b {
			if b[i] >= 'A' && b[i] <= 'F' {
				b[i] += 'a' - 'A'
			}
		}
		return string(b)
	}
	return address
}

func PublishTrade(ctx context.Context, rdb *redis.Client, payload TradePayload) {
	if rdb == nil {
		return
	}
	token := roomKey(payload.TokenAddress)
	seq, _ := rdb.Incr(ctx, "pump:seq:trade:"+token).Result()
	payload.Seq = &seq
	if payload.Bonding.SpotPriceZug == "" {
		payload.Bonding.SpotPriceZug = payload.Bonding.LastPriceZug
	}
	msg, err := json.Marshal(payload)
	if err != nil {
		return
	}
	s := string(msg)
	channel := "pump:trade:" + token
	if err := rdb.Publish(ctx, channel, s).Err(); err != nil {
		log.Printf("[redis] publish trade: %v", err)
		return
	}
	for _, room := range []string{"token:" + token, "arena"} {
		_ = rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: "pump:stream:" + room,
			MaxLen: streamMaxLen,
			Approx: true,
			Values: map[string]interface{}{"p": s},
		}).Err()
	}
}

func PushHotTape(ctx context.Context, rdb *redis.Client, token string, trade TradeLeg) {
	if rdb == nil {
		return
	}
	key := "pump:hot:tape:" + roomKey(token)
	b, _ := json.Marshal(trade)
	pipe := rdb.Pipeline()
	pipe.LPush(ctx, key, string(b))
	pipe.LTrim(ctx, key, 0, 49)
	pipe.Expire(ctx, key, 300)
	_, _ = pipe.Exec(ctx)
}

func WriteHotCandles(ctx context.Context, rdb *redis.Client, token string, updates []CandleUpdate) {
	if rdb == nil || len(updates) == 0 {
		return
	}
	pipe := rdb.Pipeline()
	for _, u := range updates {
		b, _ := json.Marshal(u)
		key := "pump:hot:candle:" + roomKey(token) + ":" + u.Interval
		pipe.Set(ctx, key, string(b), 600)
	}
	_, _ = pipe.Exec(ctx)
}

func ReadHotCandle(ctx context.Context, rdb *redis.Client, token, interval string) (*CandleUpdate, error) {
	if rdb == nil {
		return nil, nil
	}
	key := "pump:hot:candle:" + roomKey(token) + ":" + interval
	raw, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	var u CandleUpdate
	if err := json.Unmarshal([]byte(raw), &u); err != nil {
		return nil, err
	}
	return &u, nil
}

func FetchNativeUsdRate(ctx context.Context, rdb *redis.Client) *float64 {
	if rdb == nil {
		return nil
	}
	raw, err := rdb.Get(ctx, "price:native:sol:usd").Result()
	if err != nil || raw == "" {
		return nil
	}
	var doc struct {
		Usd float64 `json:"usd"`
	}
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return nil
	}
	if doc.Usd <= 0 {
		return nil
	}
	return &doc.Usd
}
