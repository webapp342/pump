package ingest

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/decode"
)

type LogBatch struct {
	Signature string
	Slot      uint64
	Logs      []string
	ProgramID string
	Err       error
}

type BatchHandler func(batch LogBatch)

// RpcPoll polls recent signatures for program IDs (F5a — no LaserStream required).
type RpcPoll struct {
	cfg     config.Config
	handler BatchHandler
	client  *rpc.Client
	seen    map[string]struct{}
}

func NewRpcPoll(cfg config.Config) *RpcPoll {
	return &RpcPoll{
		cfg:    cfg,
		client: rpc.New(cfg.RpcURL),
		seen:   make(map[string]struct{}, 4096),
	}
}

func (r *RpcPoll) SetHandler(h BatchHandler) {
	r.handler = h
}

func (r *RpcPoll) Run(ctx context.Context) error {
	interval := time.Duration(r.cfg.PollIntervalMs) * time.Millisecond
	if interval < time.Second {
		interval = time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[ingest/rpc-poll] rpc=%s programs=%v interval=%s", r.cfg.RpcURL, r.cfg.ProgramIDs, interval)

	for {
		if err := r.pollOnce(ctx); err != nil && ctx.Err() == nil {
			log.Printf("[ingest/rpc-poll] poll error: %v", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (r *RpcPoll) pollOnce(ctx context.Context) error {
	for _, pid := range r.cfg.ProgramIDs {
		pid = trim(pid)
		if pid == "" {
			continue
		}
		pk, err := solana.PublicKeyFromBase58(pid)
		if err != nil {
			return fmt.Errorf("program id %q: %w", pid, err)
		}
		limit := 25
		sigs, err := r.client.GetSignaturesForAddressWithOpts(ctx, pk, &rpc.GetSignaturesForAddressOpts{
			Limit: &limit,
		})
		if err != nil {
			return err
		}
		for i := len(sigs) - 1; i >= 0; i-- {
			entry := sigs[i]
			sig := entry.Signature.String()
			if _, ok := r.seen[sig]; ok {
				continue
			}
			r.seen[sig] = struct{}{}
			if len(r.seen) > 8192 {
				r.seen = make(map[string]struct{}, 4096)
			}
			if entry.Err != nil {
				continue
			}
			maxVer := uint64(0)
			tx, err := r.client.GetTransaction(ctx, entry.Signature, &rpc.GetTransactionOpts{
				Encoding:                       solana.EncodingJSON,
				MaxSupportedTransactionVersion: &maxVer,
			})
			if err != nil || tx == nil || tx.Meta == nil {
				continue
			}
			if r.handler == nil {
				continue
			}
			r.handler(LogBatch{
				Signature: sig,
				Slot:      tx.Slot,
				Logs:      tx.Meta.LogMessages,
				ProgramID: pid,
			})
		}
	}
	return nil
}

func trim(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

func ProcessBatch(batch LogBatch) []decode.Event {
	if batch.Err != nil {
		return nil
	}
	return decode.ExtractEventsFromLogs(batch.Logs, batch.Signature, batch.ProgramID, batch.Slot)
}
