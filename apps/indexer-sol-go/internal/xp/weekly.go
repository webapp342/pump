package xp

import (
	"context"
	"log"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	weeklyUserXpKey = "weekly_user_xp"
	weeklyClanXpKey = "weekly_clan_xp"
	xpPerSol        = 100
)

func ComputeTradeXp(volumeSolNet float64) int {
	if math.IsNaN(volumeSolNet) || math.IsInf(volumeSolNet, 0) || volumeSolNet <= 0 {
		return 0
	}
	return int(math.Floor(volumeSolNet * xpPerSol))
}

func LookupClanID(ctx context.Context, pool *pgxpool.Pool, wallet string) *string {
	if pool == nil {
		return nil
	}
	var clanID string
	err := pool.QueryRow(ctx,
		`SELECT clan_id::text FROM clan_members WHERE wallet_address = $1 LIMIT 1`,
		wallet,
	).Scan(&clanID)
	if err != nil {
		return nil
	}
	return &clanID
}

func AwardWeeklyXp(ctx context.Context, rdb *redis.Client, wallet string, volumeSolNet float64, clanID *string) {
	if rdb == nil {
		return
	}
	xp := ComputeTradeXp(volumeSolNet)
	if xp <= 0 {
		return
	}
	go func() {
		if err := rdb.ZIncrBy(ctx, weeklyUserXpKey, float64(xp), wallet).Err(); err != nil {
			log.Printf("[xp] weekly user ZINCRBY: %v", err)
			return
		}
		if clanID != nil && *clanID != "" {
			if err := rdb.ZIncrBy(ctx, weeklyClanXpKey, float64(xp), *clanID).Err(); err != nil {
				log.Printf("[xp] weekly clan ZINCRBY: %v", err)
			}
		}
	}()
}
