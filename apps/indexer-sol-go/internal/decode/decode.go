package decode

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"

	"github.com/mr-tron/base58"
)

var programDataRe = regexp.MustCompile(`^Program data:\s*(\S+)$`)

// Event names — must match @pump/solana-sdk CURVE_EVENTS / FACTORY_EVENTS.
const (
	EventTokenCreated        = "TokenCreated"
	EventTokenRegistered     = "TokenRegistered"
	EventTradeEvent          = "TradeEvent"
	EventFeeSplitEvent       = "FeeSplitEvent"
	EventFeeSplitV2Event     = "FeeSplitV2Event"
	EventReferrerSetEvent    = "ReferrerSetEvent"
	EventCreatorFeeClaimed   = "CreatorFeeClaimed"
	EventReferrerFeeClaimed  = "ReferrerFeeClaimed"
	EventEmergencyEthSwept   = "EmergencyEthSwept"
	EventTreasuryWithdraw    = "TreasuryWithdraw"
)

var discToName map[string]string

func init() {
	names := []string{
		EventTokenCreated,
		EventTokenRegistered,
		EventTradeEvent,
		EventFeeSplitEvent,
		EventFeeSplitV2Event,
		EventReferrerSetEvent,
		EventCreatorFeeClaimed,
		EventReferrerFeeClaimed,
		EventEmergencyEthSwept,
		EventTreasuryWithdraw,
	}
	discToName = make(map[string]string, len(names))
	for _, name := range names {
		discToName[eventDiscHex(name)] = name
	}
}

func eventDiscHex(name string) string {
	sum := sha256.Sum256([]byte("event:" + name))
	return hex.EncodeToString(sum[:8])
}

// EventDiscHex exports discriminator for parity tests.
func EventDiscHex(name string) string {
	return eventDiscHex(name)
}

type Event struct {
	Name      string
	Signature string
	Slot      uint64
	ProgramID string
	LogIndex  int
	Fields    map[string]any
}

type reader struct {
	buf []byte
	off int
}

func (r *reader) readPubkey() string {
	if r.off+32 > len(r.buf) {
		panic("short pubkey")
	}
	out := base58.Encode(r.buf[r.off : r.off+32])
	r.off += 32
	return out
}

func (r *reader) readU64() uint64 {
	if r.off+8 > len(r.buf) {
		panic("short u64")
	}
	v := binary.LittleEndian.Uint64(r.buf[r.off:])
	r.off += 8
	return v
}

func (r *reader) readU32() uint32 {
	if r.off+4 > len(r.buf) {
		panic("short u32")
	}
	v := binary.LittleEndian.Uint32(r.buf[r.off:])
	r.off += 4
	return v
}

func (r *reader) readU8() uint8 {
	if r.off+1 > len(r.buf) {
		panic("short u8")
	}
	v := r.buf[r.off]
	r.off++
	return v
}

func (r *reader) readString() string {
	length := int(r.readU32())
	if r.off+length > len(r.buf) {
		panic("short string")
	}
	s := string(r.buf[r.off : r.off+length])
	r.off += length
	return s
}

func decodeFields(name string, body []byte) (map[string]any, error) {
	r := reader{buf: body}
	switch name {
	case EventTokenCreated:
		return map[string]any{
			"mint":              r.readPubkey(),
			"creator":           r.readPubkey(),
			"name":              r.readString(),
			"symbol":            r.readString(),
			"uri":               r.readString(),
			"totalSupply":       r.readU64(),
			"virtualSolReserve": r.readU64(),
			"decimals":          r.readU8(),
		}, nil
	case EventTokenRegistered:
		return map[string]any{
			"mint":                r.readPubkey(),
			"creator":             r.readPubkey(),
			"totalSupply":         r.readU64(),
			"virtualSolReserve":   r.readU64(),
			"virtualTokenReserve": r.readU64(),
		}, nil
	case EventTradeEvent:
		return map[string]any{
			"mint":         r.readPubkey(),
			"trader":       r.readPubkey(),
			"isBuy":        r.readU8() != 0,
			"solAmount":    r.readU64(),
			"tokenAmount":  r.readU64(),
			"feeLamports":  r.readU64(),
			"reserveSol":   r.readU64(),
			"soldTokens":   r.readU64(),
			"spotPrice":    r.readU64(),
		}, nil
	case EventFeeSplitEvent:
		return map[string]any{
			"mint":         r.readPubkey(),
			"creator":      r.readPubkey(),
			"creatorFee":   r.readU64(),
			"referrerFee":  r.readU64(),
			"treasuryFee":  r.readU64(),
		}, nil
	case EventFeeSplitV2Event:
		return map[string]any{
			"mint":          r.readPubkey(),
			"creator":       r.readPubkey(),
			"creatorFee":    r.readU64(),
			"referrerFee":   r.readU64(),
			"cashbackFee":   r.readU64(),
			"clanPoolFee":   r.readU64(),
			"seasonPoolFee": r.readU64(),
			"platformFee":   r.readU64(),
			"userXp":        r.readU32(),
		}, nil
	case EventReferrerSetEvent:
		return map[string]any{
			"trader":   r.readPubkey(),
			"referrer": r.readPubkey(),
		}, nil
	case EventCreatorFeeClaimed:
		return map[string]any{
			"creator": r.readPubkey(),
			"amount":  r.readU64(),
		}, nil
	case EventReferrerFeeClaimed:
		return map[string]any{
			"referrer": r.readPubkey(),
			"amount":   r.readU64(),
		}, nil
	case EventEmergencyEthSwept:
		return map[string]any{
			"to":     r.readPubkey(),
			"amount": r.readU64(),
		}, nil
	case EventTreasuryWithdraw:
		return map[string]any{
			"to":     r.readPubkey(),
			"amount": r.readU64(),
		}, nil
	default:
		return map[string]any{}, nil
	}
}

func DecodeProgramData(dataBase64 string) (string, map[string]any, error) {
	raw, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return "", nil, err
	}
	if len(raw) < 8 {
		return "", nil, fmt.Errorf("too short")
	}
	name, ok := discToName[hex.EncodeToString(raw[:8])]
	if !ok {
		return "", nil, fmt.Errorf("unknown discriminator")
	}
	fields, err := decodeFields(name, raw[8:])
	if err != nil {
		return "", nil, err
	}
	return name, fields, nil
}

func ExtractEventsFromLogs(logs []string, signature, programID string, slot uint64) []Event {
	out := make([]Event, 0, 2)
	logIndex := 0
	for _, line := range logs {
		m := programDataRe.FindStringSubmatch(strings.TrimSpace(line))
		if len(m) != 2 {
			continue
		}
		name, fields, err := DecodeProgramData(m[1])
		if err != nil {
			continue
		}
		out = append(out, Event{
			Name:      name,
			Signature: signature,
			Slot:      slot,
			ProgramID: programID,
			LogIndex:  logIndex,
			Fields:    fields,
		})
		logIndex++
	}
	return out
}
