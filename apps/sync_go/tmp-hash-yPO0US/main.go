package main

import (
  "encoding/json"
  "fmt"
  se "sync_go/internal/sync_engine"
)

func main() {
  raws := []string{
    `{"clientId":"client-1","operations":[],"lastSeenServerVersion":0,"requestHash":"ignored"}`,
    `{"clientId":"client-1","operations":[{"type":"set","table":"todos","rowKey":"r1","field":"title","value":"Buy milk","dot":{"clientId":"client-1","version":1}}],"lastSeenServerVersion":0,"requestHash":"ignored"}`,
    `{"clientId":"client-1","operations":[{"type":"setRow","table":"todos","rowKey":"r1","value":{"title":"Buy milk"},"dot":{"clientId":"client-1","version":1}}],"lastSeenServerVersion":0,"requestHash":"ignored"}`,
    `{"clientId":"client-1","operations":[{"type":"remove","table":"todos","rowKey":"r1","context":{"client-1":1,"client-2":3},"dot":{"clientId":"client-1","version":2}}],"lastSeenServerVersion":0,"requestHash":"ignored"}`,
  }
  for _, raw := range raws {
    var req se.SyncRequest
    if err := json.Unmarshal([]byte(raw), &req); err != nil { panic(err) }
    hash, err := se.HashSyncRequest(req)
    if err != nil { panic(err) }
    fmt.Println(hash)
  }
}
