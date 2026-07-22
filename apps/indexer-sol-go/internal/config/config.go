package config

import (
	"os"
	"strings"
)

type Config struct {
	Cluster            string
	Source             string
	ShadowMode         string
	LaserStreamURL     string
	HeliusAPIKey       string
	ProgramIDs         []string
	RedisURL           string
	LaunchpadDBURL     string
	PollIntervalMs     int
}

func Load() Config {
	return Config{
		Cluster:        env("SOLANA_CLUSTER", "devnet"),
		Source:         env("SOLANA_INDEXER_SOURCE", "geyser"),
		ShadowMode:     env("GO_SHADOW_MODE", ""),
		LaserStreamURL: env("SOLANA_GEYSER_ENDPOINT", "https://laserstream-devnet-ewr.helius-rpc.com"),
		HeliusAPIKey:   env("HELIUS_API_KEY", ""),
		ProgramIDs:     strings.Split(env("SOLANA_GEYSER_PROGRAM_IDS", "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus"), ","),
		RedisURL:       env("REDIS_URL", ""),
		LaunchpadDBURL: env("LAUNCHPAD_DATABASE_URL", ""),
		PollIntervalMs: envInt("SOLANA_INDEXER_POLL_MS", 2000),
	}
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	var n int
	for _, c := range v {
		if c < '0' || c > '9' {
			return fallback
		}
		n = n*10 + int(c-'0')
	}
	if n <= 0 {
		return fallback
	}
	return n
}
