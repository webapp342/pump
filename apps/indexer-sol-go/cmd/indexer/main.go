package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/geyser"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	log.Printf("[indexer-sol-go] start cluster=%s source=%s shadow=%s",
		cfg.Cluster, cfg.Source, cfg.ShadowMode)

	client, err := geyser.NewClient(cfg)
	if err != nil {
		log.Fatalf("geyser client: %v", err)
	}

	if err := client.Run(ctx); err != nil && ctx.Err() == nil {
		log.Fatalf("geyser run: %v", err)
	}

	log.Println("[indexer-sol-go] stopped")
	time.Sleep(100 * time.Millisecond)
	os.Exit(0)
}
