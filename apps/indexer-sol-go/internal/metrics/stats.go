package metrics

import (
	"log"
	"sync/atomic"
)

type Stats struct {
	Batches   atomic.Uint64
	Events    atomic.Uint64
	Trades    atomic.Uint64
	FeeSplitV2 atomic.Uint64
	DedupSkip atomic.Uint64
}

func (s *Stats) LogHeartbeat(mode string) {
	log.Printf("[metrics] mode=%s batches=%d events=%d trades=%d fee_v2=%d dedup_skip=%d",
		mode,
		s.Batches.Load(),
		s.Events.Load(),
		s.Trades.Load(),
		s.FeeSplitV2.Load(),
		s.DedupSkip.Load(),
	)
}
