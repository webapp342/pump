package handlers

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pump-tma/indexer-sol-go/internal/candles"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/decode"
	"github.com/pump-tma/indexer-sol-go/internal/position"
	"github.com/pump-tma/indexer-sol-go/internal/redisx"
	"github.com/pump-tma/indexer-sol-go/internal/units"
	"github.com/pump-tma/indexer-sol-go/internal/xp"
	"github.com/redis/go-redis/v9"
)

type feeSplit struct {
	creatorFee  uint64
	referrerFee uint64
	treasuryFee uint64
}

type bondingRow struct {
	reserveZug        string
	tokenSold         string
	tradeCount        int
	holderCount       int
	progressBps       int
	curveComplete     bool
	vaultTokenReserve *string
}

type tradeInsertResult struct {
	tradeID       string
	bonding       bondingRow
	nativeUsdRate *float64
	volumeZug     float64
	spotAfter     float64
}

type Handlers struct {
	cfg              config.Config
	pool             *pgxpool.Pool
	rdb              *redis.Client
	pendingFeeSplits map[string]feeSplit
}

func New(cfg config.Config, pool *pgxpool.Pool, rdb *redis.Client) *Handlers {
	return &Handlers{
		cfg:              cfg,
		pool:             pool,
		rdb:              rdb,
		pendingFeeSplits: make(map[string]feeSplit),
	}
}

func (h *Handlers) Dispatch(ctx context.Context, ev decode.Event) {
	if ev.Fields == nil {
		return
	}
	switch ev.Name {
	case decode.EventTradeEvent:
		if err := h.onTrade(ctx, ev); err != nil {
			log.Printf("[handlers] trade err sig=%s: %v", ev.Signature, err)
		}
	case decode.EventFeeSplitEvent:
		h.onFeeSplit(ev)
	case decode.EventFeeSplitV2Event:
		h.onFeeSplitV2(ev)
	default:
		if h.cfg.ShadowMode == "read_only" || h.cfg.ShadowMode == "" {
			log.Printf("[decode] %s sig=%s slot=%d", ev.Name, ev.Signature, ev.Slot)
		}
	}
}

func (h *Handlers) onFeeSplit(ev decode.Event) {
	mint := asString(ev.Fields["mint"])
	h.pendingFeeSplits[units.FeeSplitKey(ev.Signature, mint)] = feeSplit{
		creatorFee:  asU64(ev.Fields["creatorFee"]),
		referrerFee: asU64(ev.Fields["referrerFee"]),
		treasuryFee: asU64(ev.Fields["treasuryFee"]),
	}
}

func (h *Handlers) onFeeSplitV2(ev decode.Event) {
	mint := asString(ev.Fields["mint"])
	platform := asU64(ev.Fields["platformFee"])
	season := asU64(ev.Fields["seasonPoolFee"])
	clan := asU64(ev.Fields["clanPoolFee"])
	h.pendingFeeSplits[units.FeeSplitKey(ev.Signature, mint)] = feeSplit{
		creatorFee:  asU64(ev.Fields["creatorFee"]),
		referrerFee: asU64(ev.Fields["referrerFee"]),
		treasuryFee: platform + season + clan,
	}
}

func (h *Handlers) onTrade(ctx context.Context, ev decode.Event) error {
	f := ev.Fields
	mint := asString(f["mint"])
	trader := asString(f["trader"])
	isBuy := asBool(f["isBuy"])
	solAmount := asU64(f["solAmount"])
	tokenAmount := asU64(f["tokenAmount"])
	feeLamports := asU64(f["feeLamports"])
	reserveSol := asU64(f["reserveSol"])
	soldTokens := asU64(f["soldTokens"])
	spotRaw := asU64(f["spotPrice"])
	decimals := h.cfg.TokenDecimals

	if !h.cfg.PgWritesEnabled() {
		return h.onTradeRedisOnly(ctx, ev, mint, trader, isBuy, solAmount, tokenAmount, feeLamports, spotRaw, decimals)
	}

	var exists int
	if err := h.pool.QueryRow(ctx, `SELECT 1 FROM tokens WHERE address = $1 LIMIT 1`, mint).Scan(&exists); err != nil {
		log.Printf("[handlers] skip trade: token %s missing sig=%s", mint, ev.Signature)
		return nil
	}

	fsKey := units.FeeSplitKey(ev.Signature, mint)
	fs := h.pendingFeeSplits[fsKey]
	delete(h.pendingFeeSplits, fsKey)

	side := "SELL"
	if isBuy {
		side = "BUY"
	}
	executionPrice := units.ExecutionPriceSol(solAmount, tokenAmount, decimals)
	spotFromChain := units.SpotPriceSolPerToken(spotRaw, decimals)
	markPrice := spotFromChain
	if v, err := strconv.ParseFloat(spotFromChain, 64); err != nil || v <= 0 {
		markPrice = executionPrice
	}
	tradeEventID := units.EventID(ev.Signature, ev.LogIndex)
	blockTime := time.Now().UTC()
	mcap := units.MarketCapSolFromSpot(markPrice)

	var nativeUsdRate *float64
	if h.rdb != nil {
		nativeUsdRate = redisx.FetchNativeUsdRate(ctx, h.rdb)
	}

	var priorSpotStr *string
	_ = h.pool.QueryRow(ctx,
		`SELECT last_price_zug::text FROM bonding_states WHERE token_address = $1`, mint,
	).Scan(&priorSpotStr)

	spotBefore := parseFloatOr(markPrice, 0)
	if priorSpotStr != nil {
		if p := parseFloatOr(*priorSpotStr, 0); p > 0 {
			spotBefore = p
		}
	}

	inserted, err := h.insertTradeTx(ctx, tradeInsertParams{
		tradeEventID:    tradeEventID,
		mint:            mint,
		trader:          trader,
		side:            side,
		solAmount:       solAmount,
		tokenAmount:     tokenAmount,
		feeLamports:     feeLamports,
		fs:              fs,
		executionPrice:  executionPrice,
		markPrice:       markPrice,
		mcap:            mcap,
		ev:              ev,
		blockTime:       blockTime,
		nativeUsdRate:   nativeUsdRate,
		reserveSol:      reserveSol,
		soldTokens:      soldTokens,
		isBuy:           isBuy,
		decimals:        decimals,
	})
	if err != nil {
		return err
	}
	if inserted == nil {
		return nil
	}

	h.publishLivePath(ctx, publishParams{
		mint:          mint,
		trader:        trader,
		side:          side,
		solAmount:     solAmount,
		tokenAmount:   tokenAmount,
		feeLamports:   feeLamports,
		executionPrice: executionPrice,
		markPrice:     markPrice,
		mcap:          mcap,
		ev:            ev,
		blockTime:     blockTime,
		spotBefore:    spotBefore,
		inserted:      *inserted,
		decimals:      decimals,
	})
	return nil
}

type tradeInsertParams struct {
	tradeEventID   string
	mint           string
	trader         string
	side           string
	solAmount      uint64
	tokenAmount    uint64
	feeLamports    uint64
	fs             feeSplit
	executionPrice string
	markPrice      string
	mcap           string
	ev             decode.Event
	blockTime      time.Time
	nativeUsdRate  *float64
	reserveSol     uint64
	soldTokens     uint64
	isBuy          bool
	decimals       int
}

func (h *Handlers) insertTradeTx(ctx context.Context, p tradeInsertParams) (*tradeInsertResult, error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var tradeID string
	err = tx.QueryRow(ctx, `
		INSERT INTO trades (
			event_id, token_address, trader_address, side,
			zug_amount, token_amount, price_zug, spot_price_zug, fee_zug,
			creator_fee_zug, treasury_fee_zug, referrer_fee_zug,
			tx_hash, log_index, block_number, block_time, native_usd_rate
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		ON CONFLICT (tx_hash, log_index) DO NOTHING
		RETURNING id
	`,
		p.tradeEventID, p.mint, p.trader, p.side,
		units.LamportsToSol(p.solAmount),
		units.TokenAmountToDecimal(p.tokenAmount, p.decimals),
		p.executionPrice, p.markPrice, units.LamportsToSol(p.feeLamports),
		units.LamportsToSol(p.fs.creatorFee),
		units.LamportsToSol(p.fs.treasuryFee),
		units.LamportsToSol(p.fs.referrerFee),
		p.ev.Signature, p.ev.LogIndex, fmt.Sprintf("%d", p.ev.Slot), p.blockTime, p.nativeUsdRate,
	).Scan(&tradeID)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	tokenSoldHuman := units.TokenAmountToDecimal(p.soldTokens, p.decimals)
	tokenDeltaHuman := units.TokenAmountToDecimal(p.tokenAmount, p.decimals)
	tokenSoldNum := parseFloatOr(tokenSoldHuman, 0)

	_, err = tx.Exec(ctx, `
		UPDATE bonding_states
		SET reserve_zug = $2,
			token_sold = $3,
			progress_bps = LEAST(10000, CASE WHEN $3::numeric >= 793100000 THEN 10000 ELSE floor(($3::numeric / 793100000) * 10000)::integer END),
			curve_complete = CASE WHEN $3::numeric >= 793100000 THEN true ELSE curve_complete END,
			vault_token_reserve = GREATEST(0, COALESCE(vault_token_reserve, 1000000000) + CASE WHEN $4 THEN -$5::numeric ELSE $5::numeric END),
			last_price_zug = $6,
			market_cap_zug = $7,
			trade_count = trade_count + 1,
			updated_at = now()
		WHERE token_address = $1
	`, p.mint, units.LamportsToSol(p.reserveSol), tokenSoldHuman, p.isBuy, tokenDeltaHuman, p.markPrice, p.mcap)
	if err != nil {
		return nil, err
	}

	progressBps := 10000
	if tokenSoldNum < 793_100_000 {
		progressBps = int(math.Min(10000, math.Floor(tokenSoldNum/793_100_000*10000)))
	}
	if progressBps >= 10000 {
		_, _ = tx.Exec(ctx, `
			UPDATE tokens SET status = 'GRADUATED', updated_at = now()
			WHERE address = $1 AND status = 'BONDING'
		`, p.mint)
	}

	if err := h.updatePosition(ctx, tx, p.mint, p.trader, p.isBuy, p.solAmount, p.feeLamports, p.tokenAmount, p.decimals, p.nativeUsdRate); err != nil {
		return nil, err
	}
	if err := h.upsertUserVolume(ctx, tx, p.trader, p.solAmount, p.isBuy); err != nil {
		return nil, err
	}

	var b bondingRow
	var vault *string
	err = tx.QueryRow(ctx, `
		SELECT
			COALESCE(reserve_zug, 0)::text,
			COALESCE(token_sold, 0)::text,
			COALESCE(trade_count, 0),
			COALESCE(holder_count, 0),
			COALESCE(progress_bps, 0),
			COALESCE(curve_complete, false),
			vault_token_reserve::text
		FROM bonding_states WHERE token_address = $1
	`, p.mint).Scan(&b.reserveZug, &b.tokenSold, &b.tradeCount, &b.holderCount, &b.progressBps, &b.curveComplete, &vault)
	if err != nil {
		b = bondingRow{
			reserveZug:    units.LamportsToSol(p.reserveSol),
			tokenSold:     tokenSoldHuman,
			tradeCount:    1,
			progressBps:   progressBps,
			curveComplete: progressBps >= 10000,
		}
	} else {
		b.vaultTokenReserve = vault
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	grossSol := parseFloatOr(units.LamportsToSol(p.solAmount), 0)
	feeSol := parseFloatOr(units.LamportsToSol(p.feeLamports), 0)
	volumeZug := math.Max(0, grossSol-feeSol)
	spotAfter := parseFloatOr(p.markPrice, 0)

	return &tradeInsertResult{
		tradeID:       tradeID,
		bonding:       b,
		nativeUsdRate: p.nativeUsdRate,
		volumeZug:     volumeZug,
		spotAfter:     spotAfter,
	}, nil
}

func (h *Handlers) updatePosition(ctx context.Context, tx pgx.Tx, mint, trader string, isBuy bool, solAmount, feeLamports, tokenAmount uint64, decimals int, nativeUsdRate *float64) error {
	grossSol := parseFloatOr(units.LamportsToSol(solAmount), 0)
	fee := parseFloatOr(units.LamportsToSol(feeLamports), 0)
	tokens := parseFloatOr(units.TokenAmountToDecimal(tokenAmount, decimals), 0)

	var prior position.State
	var bal, bought, sold, rcb, rpnl, rcu, rpu string
	err := tx.QueryRow(ctx, `
		SELECT token_balance::text, total_bought_zug::text, total_sold_zug::text,
			COALESCE(remaining_cost_basis_zug, 0)::text, realized_pnl_zug::text,
			COALESCE(remaining_cost_basis_usd, 0)::text, COALESCE(realized_pnl_usd, 0)::text
		FROM user_positions WHERE token_address = $1 AND address = $2
	`, mint, trader).Scan(&bal, &bought, &sold, &rcb, &rpnl, &rcu, &rpu)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	prior = position.State{
		TokenBalance:          parseFloatOr(bal, 0),
		TotalBought:           parseFloatOr(bought, 0),
		TotalSold:             parseFloatOr(sold, 0),
		RemainingCostBasis:    parseFloatOr(rcb, 0),
		RealizedPnl:           parseFloatOr(rpnl, 0),
		RemainingCostBasisUsd: parseFloatOr(rcu, 0),
		RealizedPnlUsd:        parseFloatOr(rpu, 0),
	}
	oldBalance := prior.TokenBalance
	next := position.ApplyTrade(prior, isBuy, grossSol, fee, tokens, nativeUsdRate)

	_, err = tx.Exec(ctx, `
		INSERT INTO user_positions (
			token_address, address, token_balance, total_bought_zug, total_sold_zug,
			remaining_cost_basis_zug, realized_pnl_zug, remaining_cost_basis_usd, realized_pnl_usd, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
		ON CONFLICT (token_address, address) DO UPDATE SET
			token_balance = EXCLUDED.token_balance,
			total_bought_zug = EXCLUDED.total_bought_zug,
			total_sold_zug = EXCLUDED.total_sold_zug,
			remaining_cost_basis_zug = EXCLUDED.remaining_cost_basis_zug,
			realized_pnl_zug = EXCLUDED.realized_pnl_zug,
			remaining_cost_basis_usd = EXCLUDED.remaining_cost_basis_usd,
			realized_pnl_usd = EXCLUDED.realized_pnl_usd,
			updated_at = now()
	`, mint, trader,
		fmt.Sprintf("%g", next.TokenBalance),
		fmt.Sprintf("%g", next.TotalBought),
		fmt.Sprintf("%g", next.TotalSold),
		fmt.Sprintf("%g", next.RemainingCostBasis),
		fmt.Sprintf("%g", next.RealizedPnl),
		fmt.Sprintf("%g", next.RemainingCostBasisUsd),
		fmt.Sprintf("%g", next.RealizedPnlUsd),
	)
	if err != nil {
		return err
	}
	return h.updateHolderCount(ctx, tx, mint, oldBalance, next.TokenBalance)
}

func (h *Handlers) updateHolderCount(ctx context.Context, tx pgx.Tx, token string, oldBalance, newBalance float64) error {
	if oldBalance <= 0 && newBalance > 0 {
		_, err := tx.Exec(ctx, `UPDATE bonding_states SET holder_count = holder_count + 1, updated_at = now() WHERE token_address = $1`, token)
		return err
	}
	if oldBalance > 0 && newBalance <= 0 {
		_, err := tx.Exec(ctx, `UPDATE bonding_states SET holder_count = GREATEST(holder_count - 1, 0), updated_at = now() WHERE token_address = $1`, token)
		return err
	}
	return nil
}

func (h *Handlers) upsertUserVolume(ctx context.Context, tx pgx.Tx, trader string, solAmount uint64, isBuy bool) error {
	vol := units.LamportsToSol(solAmount)
	_, err := tx.Exec(ctx, `
		INSERT INTO user_volumes (address, total_volume_zug, buy_volume_zug, sell_volume_zug, last_trade_at, updated_at)
		VALUES ($1, $2, CASE WHEN $3 THEN $2::numeric ELSE 0 END, CASE WHEN $3 THEN 0 ELSE $2::numeric END, now(), now())
		ON CONFLICT (address) DO UPDATE SET
			total_volume_zug = user_volumes.total_volume_zug + EXCLUDED.total_volume_zug,
			buy_volume_zug = user_volumes.buy_volume_zug + EXCLUDED.buy_volume_zug,
			sell_volume_zug = user_volumes.sell_volume_zug + EXCLUDED.sell_volume_zug,
			last_trade_at = now(), updated_at = now()
	`, trader, vol, isBuy)
	return err
}

type publishParams struct {
	mint           string
	trader         string
	side           string
	solAmount      uint64
	tokenAmount    uint64
	feeLamports    uint64
	executionPrice string
	markPrice      string
	mcap           string
	ev             decode.Event
	blockTime      time.Time
	spotBefore     float64
	inserted       tradeInsertResult
	decimals       int
}

func (h *Handlers) publishLivePath(ctx context.Context, p publishParams) {
	if !h.cfg.WritesEnabled() || !h.cfg.RedisPublish || h.rdb == nil {
		return
	}

	buyVol := 0.0
	if p.side == "BUY" {
		buyVol = p.inserted.volumeZug
	}
	candleInput := candles.TradeInput{
		TokenAddress: p.mint,
		BlockTime:    p.blockTime,
		IsBuy:        p.side == "BUY",
		SpotBefore:   p.spotBefore,
		SpotAfter:    p.inserted.spotAfter,
		VolumeZug:    p.inserted.volumeZug,
		BuyVolumeZug: buyVol,
	}
	candleUpdates := candles.ComputeLiveUpdates(ctx, h.rdb, candleInput)
	candles.CommitLiveUpdatesRedis(ctx, h.rdb, p.mint, candleUpdates)

	var nativeUsdStr *string
	if p.inserted.nativeUsdRate != nil && *p.inserted.nativeUsdRate > 0 {
		s := fmt.Sprintf("%g", *p.inserted.nativeUsdRate)
		nativeUsdStr = &s
	}

	payload := redisx.TradePayload{
		Type:          "trade",
		TokenAddress:  p.mint,
		CandleUpdates: candleUpdates,
		Trade: redisx.TradeLeg{
			ID:            p.inserted.tradeID,
			Side:          p.side,
			TraderAddress: p.trader,
			ZugAmount:     units.LamportsToSol(p.solAmount),
			FeeZug:        units.LamportsToSol(p.feeLamports),
			TokenAmount:   units.TokenAmountToDecimal(p.tokenAmount, p.decimals),
			PriceZug:      p.executionPrice,
			TxHash:        p.ev.Signature,
			LogIndex:      p.ev.LogIndex,
			BlockTime:     p.blockTime.Format(time.RFC3339),
			NativeUsdRate: nativeUsdStr,
		},
		Bonding: redisx.BondingLeg{
			ReserveZug:    p.inserted.bonding.reserveZug,
			TokenSold:     p.inserted.bonding.tokenSold,
			MarketCapZug:  p.mcap,
			SpotPriceZug:  p.markPrice,
			LastPriceZug:  p.markPrice,
			ProgressBps:   p.inserted.bonding.progressBps,
			Graduated:     p.inserted.bonding.curveComplete,
			CurveComplete: p.inserted.bonding.curveComplete,
			TradeCount:    p.inserted.bonding.tradeCount,
			HolderCount:   p.inserted.bonding.holderCount,
		},
	}
	if p.inserted.bonding.vaultTokenReserve != nil {
		payload.Bonding.VaultTokenReserve = p.inserted.bonding.vaultTokenReserve
	}

	redisx.PublishTrade(ctx, h.rdb, payload)
	redisx.PushHotTape(ctx, h.rdb, p.mint, payload.Trade)

	if h.cfg.ChViaRedisStream {
		redisx.EnqueueTradeChStream(ctx, h.rdb, redisx.TradeChRow{
			EventID:       units.EventID(p.ev.Signature, p.ev.LogIndex),
			TokenAddress:  p.mint,
			TraderAddress: p.trader,
			Side:          p.side,
			SolAmount:     parseFloatOr(units.LamportsToSol(p.solAmount), 0),
			TokenAmount:   parseFloatOr(units.TokenAmountToDecimal(p.tokenAmount, p.decimals), 0),
			PriceSol:      parseFloatOr(p.executionPrice, 0),
			SpotPriceSol:  parseFloatOr(p.markPrice, 0),
			SpotBeforeSol: p.spotBefore,
			FeeSol:        parseFloatOr(units.LamportsToSol(p.feeLamports), 0),
			TxHash:        p.ev.Signature,
			LogIndex:      p.ev.LogIndex,
			Slot:          int64(p.ev.Slot),
			BlockTime:     p.blockTime,
			NativeUsdRate: p.inserted.nativeUsdRate,
		})
		chRows := make([]redisx.CandleChRow, 0, len(candleUpdates))
		for _, c := range candleUpdates {
			chRows = append(chRows, redisx.CandleChRow{
				TokenAddress:   p.mint,
				CandleInterval: c.Interval,
				BucketStart:    time.Unix(c.Time, 0).UTC().Format("2006-01-02 15:04:05"),
				OpenSol:        parseFloatOr(c.Open, 0),
				HighSol:        parseFloatOr(c.High, 0),
				LowSol:         parseFloatOr(c.Low, 0),
				CloseSol:       parseFloatOr(c.Close, 0),
				VolumeSol:      parseFloatOr(c.Volume, 0),
				BuyVolumeSol:   parseFloatOr(c.BuyVolume, 0),
				TradeCount:     c.TradeCount,
			})
		}
		redisx.EnqueueCandlesChStream(ctx, h.rdb, chRows)
	}

	if h.cfg.UseRedisWeeklyXp {
		clanID := xp.LookupClanID(ctx, h.pool, p.trader)
		xp.AwardWeeklyXp(ctx, h.rdb, p.trader, p.inserted.volumeZug, clanID)
	}

	log.Printf("[handlers] Trade %s mint=%s trader=%s sol=%s", p.side, p.mint, p.trader, units.LamportsToSol(p.solAmount))
}

func (h *Handlers) onTradeRedisOnly(ctx context.Context, ev decode.Event, mint, trader string, isBuy bool, solAmount, tokenAmount, feeLamports, spotRaw uint64, decimals int) error {
	if !h.cfg.RedisPublish || h.rdb == nil {
		log.Printf("[handlers] redis_only skip: no redis sig=%s", ev.Signature)
		return nil
	}
	side := "SELL"
	if isBuy {
		side = "BUY"
	}
	executionPrice := units.ExecutionPriceSol(solAmount, tokenAmount, decimals)
	spotFromChain := units.SpotPriceSolPerToken(spotRaw, decimals)
	markPrice := spotFromChain
	if v, err := strconv.ParseFloat(spotFromChain, 64); err != nil || v <= 0 {
		markPrice = executionPrice
	}
	mcap := units.MarketCapSolFromSpot(markPrice)
	blockTime := time.Now().UTC()
	grossSol := parseFloatOr(units.LamportsToSol(solAmount), 0)
	feeSol := parseFloatOr(units.LamportsToSol(feeLamports), 0)
	volumeZug := math.Max(0, grossSol-feeSol)
	spotAfter := parseFloatOr(markPrice, 0)

	h.publishLivePath(ctx, publishParams{
		mint: mint, trader: trader, side: side,
		solAmount: solAmount, tokenAmount: tokenAmount, feeLamports: feeLamports,
		executionPrice: executionPrice, markPrice: markPrice, mcap: mcap,
		ev: ev, blockTime: blockTime, spotBefore: spotAfter,
		inserted: tradeInsertResult{
			tradeID:   units.EventID(ev.Signature, ev.LogIndex),
			volumeZug: volumeZug, spotAfter: spotAfter,
			bonding: bondingRow{},
		},
		decimals: decimals,
	})
	return nil
}

func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func asU64(v any) uint64 {
	switch n := v.(type) {
	case uint64:
		return n
	case uint32:
		return uint64(n)
	case uint8:
		return uint64(n)
	case int:
		if n >= 0 {
			return uint64(n)
		}
	}
	return 0
}

func asBool(v any) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func parseFloatOr(s string, fallback float64) float64 {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return fallback
	}
	return v
}
