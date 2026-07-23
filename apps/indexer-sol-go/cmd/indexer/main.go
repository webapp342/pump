package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/pump-tma/indexer-sol-go/internal/config"
	"github.com/pump-tma/indexer-sol-go/internal/runner"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	log.Printf("[indexer-sol-go] start cluster=%s source=%s shadow=%s endpoint=%s",
		cfg.Cluster, cfg.Source, cfg.ShadowMode, cfg.LaserStreamURL)

	if err := runner.Run(ctx, cfg); err != nil && ctx.Err() == nil {
		log.Fatalf("runner: %v", err)
	}

	log.Println("[indexer-sol-go] stopped")
	os.Exit(0)
}
