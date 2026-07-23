package config

import (
	"os"
	"strings"
)

type Config struct {
	Cluster           string
	Source            string
	ShadowMode        string
	LaserStreamURL    string
	HeliusAPIKey      string
	ProgramIDs        []string
	LaunchpadDBURL    string
	RedisURL          string
	RedisPublish      bool
	ChViaRedisStream  bool
	SkipPgCandles     bool
	IncrementalCandles bool
	TokenDecimals     int
	ChainID           int
	StateKey          string
	MetricsIntervalMs int
	UseRedisWeeklyXp  bool
}

func Load() Config {
	redisURL := env("REDIS_URL", "")
	return Config{
		Cluster:            env("SOLANA_CLUSTER", "devnet"),
		Source:             env("SOLANA_INDEXER_SOURCE", "laserstream"),
		ShadowMode:         env("GO_SHADOW_MODE", "read_only"),
		LaserStreamURL:     env("SOLANA_GEYSER_ENDPOINT", "https://laserstream-devnet-ewr.helius-rpc.com"),
		HeliusAPIKey:       firstNonEmpty(env("HELIUS_API_KEY", ""), env("SOLANA_GEYSER_API_KEY", ""), env("SOLANA_GEYSER_TOKEN", "")),
		ProgramIDs:         splitCSV(env("SOLANA_GEYSER_PROGRAM_IDS", "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus")),
		LaunchpadDBURL:     env("LAUNCHPAD_DATABASE_URL", ""),
		RedisURL:           redisURL,
		RedisPublish:       env("REDIS_PUBLISH_ENABLED", "") == "true" && redisURL != "",
		ChViaRedisStream:   chViaRedisStream(),
		SkipPgCandles:      env("SKIP_PG_TOKEN_CANDLES", "") == "true",
		IncrementalCandles: env("INCREMENTAL_CANDLES", "") != "false",
		TokenDecimals:      envInt("SOLANA_TOKEN_DECIMALS", 6),
		ChainID:            envInt("SOLANA_CHAIN_ID", 901103),
		StateKey:           env("SOLANA_INDEXER_STATE_KEY", "solana_indexer_go"),
		MetricsIntervalMs:  envInt("SOLANA_INDEXER_POLL_MS", 5000),
		UseRedisWeeklyXp:   envBoolDefault("USE_REDIS_WEEKLY_XP", redisURL != ""),
	}
}

func (c Config) WritesEnabled() bool {
	return c.ShadowMode == "primary" || c.ShadowMode == "redis_only"
}

func (c Config) PgWritesEnabled() bool {
	return c.ShadowMode == "primary" && c.LaunchpadDBURL != ""
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

func chViaRedisStream() bool {
	v := strings.TrimSpace(os.Getenv("CLICKHOUSE_VIA_REDIS_STREAM"))
	if v == "false" {
		return false
	}
	if v == "true" {
		return true
	}
	return false
}

func envBoolDefault(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	if v == "true" || v == "1" {
		return true
	}
	if v == "false" || v == "0" {
		return false
	}
	return fallback
}
