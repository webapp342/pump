package geyser

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/pump-tma/indexer-sol-go/internal/config"
)

// Client connects to Helius LaserStream (yellowstone-compatible gRPC).
// Full SDK wiring lands in F5b; this scaffold validates env + reconnect loop.
type Client struct {
	cfg config.Config
}

func NewClient(cfg config.Config) (*Client, error) {
	if cfg.Source != "geyser" && cfg.Source != "laserstream" {
		return nil, fmt.Errorf("unsupported source %q (use geyser)", cfg.Source)
	}
	if cfg.HeliusAPIKey == "" && cfg.ShadowMode == "" {
		log.Println("[geyser] warn: HELIUS_API_KEY empty — use GO_SHADOW_MODE=read_only for local stub")
	}
	return &Client{cfg: cfg}, nil
}

func (c *Client) Run(ctx context.Context) error {
	ticker := time.NewTicker(time.Duration(c.cfg.PollIntervalMs) * time.Millisecond)
	defer ticker.Stop()

	log.Printf("[geyser] subscribe programs=%v endpoint=%s", c.cfg.ProgramIDs, c.cfg.LaserStreamURL)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// TODO F5b: laserstream-sdk SubscribeTransactions + decode pump events
			if c.cfg.ShadowMode == "read_only" {
				log.Printf("[geyser] heartbeat shadow=read_only slot=stub")
			}
		}
	}
}
