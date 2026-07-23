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
	MetricsIntervalMs  int
}

func Load() Config {
	return Config{
		Cluster:           env("SOLANA_CLUSTER", "devnet"),
		Source:            env("SOLANA_INDEXER_SOURCE", "laserstream"),
		ShadowMode:        env("GO_SHADOW_MODE", "read_only"),
		LaserStreamURL:    env("SOLANA_GEYSER_ENDPOINT", "https://laserstream-devnet-ewr.helius-rpc.com"),
		HeliusAPIKey:      firstNonEmpty(env("HELIUS_API_KEY", ""), env("SOLANA_GEYSER_API_KEY", ""), env("SOLANA_GEYSER_TOKEN", "")),
		ProgramIDs:        splitCSV(env("SOLANA_GEYSER_PROGRAM_IDS", "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus")),
		RedisURL:          env("REDIS_URL", ""),
		LaunchpadDBURL:    env("LAUNCHPAD_DATABASE_URL", ""),
		MetricsIntervalMs: envInt("SOLANA_INDEXER_POLL_MS", 5000),
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
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
