package ingest

import "github.com/pump-tma/indexer-sol-go/internal/decode"

type LogBatch struct {
	Signature string
	Slot      uint64
	Logs      []string
	ProgramID string
	Err       error
}

type BatchHandler func(batch LogBatch)

func ProcessBatch(batch LogBatch) []decode.Event {
	if batch.Err != nil {
		return nil
	}
	return decode.ExtractEventsFromLogs(batch.Logs, batch.Signature, batch.ProgramID, batch.Slot)
}
