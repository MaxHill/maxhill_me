package main

import (
  "fmt"
  se "sync_go/internal/sync_engine"
  "encoding/json"
)

func strptr(s string) *string { return &s }

func main() {
  req := se.SyncRequest{
    ClientID: "client-abc",
    LastSeenServerVersion: 5,
    Operations: []se.CRDTOperation{
      {
        Type: "set",
        Table: "posts",
        RowKey: "p1",
        Field: strptr("title"),
        Value: json.RawMessage(`"Hello"`),
        Dot: se.Dot{ClientID: "client-abc", Version: 6},
      },
      {
        Type: "remove",
        Table: "posts",
        RowKey: "p2",
        Dot: se.Dot{ClientID: "client-abc", Version: 7},
        Context: map[string]int64{"client-abc": 7},
      },
    },
  }
  h, err := se.HashSyncRequest(req)
  if err != nil { panic(err) }
  fmt.Println(h)
}
