package runner

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/db"
	"github.com/pump-tma/indexer-sol-go/internal/decode"
	"github.com/pump-tma/indexer-sol-go/internal/geyser"
	"github.com/pump-tma/indexer-sol-go/internal/handlers"
	"github.com/pump-tma/indexer-sol-go/internal/ingest"
	"github.com/pump-tma/indexer-sol-go/internal/metrics"
	"github.com/pump-tma/indexer-sol-go/internal/redisx"
)

const recentCap = 5000

// Run starts LaserStream gRPC ingest → decode → handlers (F5c writes when primary).
func Run(ctx context.Context, cfg config.Config) error {
	stats := &metrics.Stats{}
	seen := make(map[string]struct{}, recentCap)
	order := make([]string, 0, recentCap)

	var h *handlers.Handlers
	if cfg.WritesEnabled() {
		var pool *pgxpool.Pool
		if cfg.PgWritesEnabled() {
			p, err := db.NewPool(ctx, cfg.LaunchpadDBURL)
			if err != nil {
				return err
			}
			pool = p
			defer pool.Close()
			log.Printf("[runner] PG pool ready")
		}
		rdb := redisx.Client(cfg.RedisURL)
		if rdb != nil {
			if err := redisx.Ping(ctx, cfg.RedisURL); err != nil {
				log.Printf("[runner] redis ping: %v", err)
			} else {
				log.Printf("[runner] redis ready publish=%v ch_stream=%v", cfg.RedisPublish, cfg.ChViaRedisStream)
			}
		}
		h = handlers.New(cfg, pool, rdb)
		log.Printf("[runner] write path shadow=%s pg=%v redis=%v", cfg.ShadowMode, cfg.PgWritesEnabled(), cfg.RedisPublish)
	}

	remember := func(id string) bool {
		if _, ok := seen[id]; ok {
			stats.DedupSkip.Add(1)
			return false
		}
		seen[id] = struct{}{}
		order = append(order, id)
		if len(order) > recentCap {
			old := order[0]
			order = order[1:]
			delete(seen, old)
		}
		return true
	}

	onBatch := func(batch ingest.LogBatch) {
		stats.Batches.Add(1)
		events := ingest.ProcessBatch(batch)
		for _, ev := range events {
			id := batch.Signature + ":" + itoa(ev.LogIndex)
			if !remember(id) {
				continue
			}
			stats.Events.Add(1)
			switch ev.Name {
			case decode.EventTradeEvent:
				stats.Trades.Add(1)
			case decode.EventFeeSplitV2Event:
				stats.FeeSplitV2.Add(1)
			}

			if h != nil {
				h.Dispatch(ctx, ev)
			} else if cfg.ShadowMode == "read_only" || cfg.ShadowMode == "" {
				log.Printf("[decode] %s sig=%s slot=%d", ev.Name, ev.Signature, ev.Slot)
			}
		}
	}

	heartbeat := time.NewTicker(time.Duration(max(cfg.MetricsIntervalMs, 1000)) * time.Millisecond)
	defer heartbeat.Stop()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-heartbeat.C:
				stats.LogHeartbeat(cfg.ShadowMode)
			}
		}
	}()

	client, err := geyser.NewClient(cfg)
	if err != nil {
		return err
	}
	client.SetHandler(onBatch)

	mode := cfg.ShadowMode
	if mode == "" {
		mode = "read_only"
	}
	log.Printf("[runner] LaserStream-only ingest shadow=%s endpoint=%s", mode, cfg.LaserStreamURL)

	return client.Run(ctx)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
