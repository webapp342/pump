package geyser

import (
	"context"
	"fmt"
	"log"
	"strings"

	laserstream "github.com/helius-labs/laserstream-sdk/go"
	"github.com/mr-tron/base58"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/ingest"
)

// Client streams launchpad txs via Helius LaserStream gRPC (quota-optimized filters).
type Client struct {
	cfg       config.Config
	handler   ingest.BatchHandler
	programID string
}

func NewClient(cfg config.Config) (*Client, error) {
	if strings.TrimSpace(cfg.HeliusAPIKey) == "" {
		return nil, fmt.Errorf("HELIUS_API_KEY required (LaserStream gRPC)")
	}
	if strings.TrimSpace(cfg.LaserStreamURL) == "" {
		return nil, fmt.Errorf("SOLANA_GEYSER_ENDPOINT required")
	}
	programs := uniquePrograms(cfg.ProgramIDs)
	if len(programs) == 0 {
		return nil, fmt.Errorf("SOLANA_GEYSER_PROGRAM_IDS required")
	}
	return &Client{
		cfg:       cfg,
		programID: programs[0],
	}, nil
}

func (c *Client) SetHandler(h ingest.BatchHandler) {
	c.handler = h
}

func (c *Client) Run(ctx context.Context) error {
	programs := uniquePrograms(c.cfg.ProgramIDs)
	vote := false
	failed := false
	commitment := laserstream.CommitmentLevel_CONFIRMED

	// Single transaction filter — minimal stream surface (no slots/blocks/accounts).
	req := &laserstream.SubscribeRequest{
		Transactions: map[string]*laserstream.SubscribeRequestFilterTransactions{
			"pump-launchpad": {
				AccountInclude: programs,
				Vote:           &vote,
				Failed:         &failed,
			},
		},
		Commitment: &commitment,
	}

	ls := laserstream.NewClient(laserstream.LaserstreamConfig{
		Endpoint: c.cfg.LaserStreamURL,
		APIKey:   c.cfg.HeliusAPIKey,
		// Replay nil => default true (slot resume on reconnect — no duplicate manual RPC)
	})

	log.Printf("[geyser/laserstream] subscribe endpoint=%s programs=%v commitment=confirmed vote=false failed=false",
		c.cfg.LaserStreamURL, programs)

	if err := ls.Subscribe(req, c.onUpdate, func(err error) {
		if ctx.Err() == nil {
			log.Printf("[geyser/laserstream] stream error: %v", err)
		}
	}); err != nil {
		return fmt.Errorf("laserstream subscribe: %w", err)
	}

	<-ctx.Done()
	ls.Close()
	return ctx.Err()
}

func (c *Client) onUpdate(update *laserstream.SubscribeUpdate) {
	if c.handler == nil || update == nil {
		return
	}
	txWrap, ok := update.UpdateOneof.(*laserstream.SubscribeUpdate_Transaction)
	if !ok || txWrap.Transaction == nil {
		return
	}
	info := txWrap.Transaction.Transaction
	if info == nil || info.Meta == nil {
		return
	}
	if info.Meta.Err != nil && len(info.Meta.Err.Err) > 0 {
		return
	}
	if info.Meta.LogMessagesNone || len(info.Meta.LogMessages) == 0 {
		return
	}
	if len(info.Signature) == 0 {
		return
	}

	c.handler(ingest.LogBatch{
		Signature: base58.Encode(info.Signature),
		Slot:      txWrap.Transaction.Slot,
		Logs:      info.Meta.LogMessages,
		ProgramID: c.programID,
	})
}

func uniquePrograms(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
