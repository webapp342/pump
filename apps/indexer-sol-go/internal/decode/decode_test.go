package decode

import (
	"encoding/base64"
	"encoding/hex"
	"testing"
)

func TestEventDiscMatchesTS(t *testing.T) {
	cases := map[string]string{
		EventTradeEvent:      "bddb7fd34ee661ee",
		EventFeeSplitV2Event: "7024226800798cda",
		EventTokenCreated:    "ec1329ff824e93ac",
	}
	for name, want := range cases {
		got := EventDiscHex(name)
		if got != want {
			t.Fatalf("%s disc: got %s want %s", name, got, want)
		}
	}
}

func TestDecodeSyntheticTradeEvent(t *testing.T) {
	disc, err := hex.DecodeString(EventDiscHex(EventTradeEvent))
	if err != nil {
		t.Fatal(err)
	}
	body := make([]byte, 8+32+32+1+8*6)
	copy(body[:8], disc)
	off := 8
	for i := 0; i < 64; i++ {
		body[off+i] = 0xAB
	}
	off += 64
	body[off] = 1
	off++
	for i := 0; i < 6; i++ {
		body[off+i*8+7] = byte(i + 1)
	}
	b64 := base64.StdEncoding.EncodeToString(body)
	name, fields, err := DecodeProgramData(b64)
	if err != nil {
		t.Fatal(err)
	}
	if name != EventTradeEvent {
		t.Fatalf("name=%s", name)
	}
	if fields["isBuy"] != true {
		t.Fatalf("isBuy=%v", fields["isBuy"])
	}
}

func TestExtractEventsFromLogs(t *testing.T) {
	disc, _ := hex.DecodeString(EventDiscHex(EventFeeSplitV2Event))
	body := make([]byte, 8+32+32+8*6+4)
	copy(body[:8], disc)
	b64 := base64.StdEncoding.EncodeToString(body)
	logs := []string{"Program data: " + b64}
	events := ExtractEventsFromLogs(logs, "sig1", "prog1", 123)
	if len(events) != 1 {
		t.Fatalf("events=%d", len(events))
	}
	if events[0].Name != EventFeeSplitV2Event {
		t.Fatalf("name=%s", events[0].Name)
	}
}
