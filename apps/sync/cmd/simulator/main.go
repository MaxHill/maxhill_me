package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sync/internal/database"
	"sync/internal/server"
	"sync/internal/sync_engine"
	"time"
)

type TickResponse struct {
	WalEntries  []sync_engine.WALEntry   `json:"walEntries"`
	SyncRequest *sync_engine.SyncRequest `json:"syncRequest,omitempty"`
}

func main() {
	fileName := flag.String("file", "./cmd/simulator/client.ts", "Path to client file")
	seed := flag.String("seed", "A", "Random seed for client")
	hash := sha256.Sum256([]byte(*seed))
	seedInt64 := int64(binary.BigEndian.Uint64(hash[:8]))
	random := rand.New(rand.NewSource(seedInt64))

	flag.Parse()

	db := database.New(
		database.DBConfig{
			DBUrl:           ":memory:",
			BusyTimeout:     1000,
			MaxOpenConns:    1,
			MaxIdleConns:    1,
			ConnMaxLifetime: time.Duration(0),
		})
	syncService := sync_engine.NewSyncService(db)
	server := &server.Server{
		SyncService: syncService,
	}

	clientSeed := fmt.Sprintf("%s-client-%d", *seed, random.Int63())
	client, err := StartClient(*fileName, clientSeed)
	if err != nil {
		log.Fatal(err)
	}

	for range 10 {
		var tick json.RawMessage
		err = client.Call(map[string]int{"n": 0}, &tick)
		if err != nil {
			log.Fatal(err)
		}

		tickResponse := TickResponse{}
		if err := json.Unmarshal(tick, &tickResponse); err != nil {
			log.Fatal(err)
		}

		if tickResponse.SyncRequest != nil {

			requestBody, err := json.Marshal(tickResponse.SyncRequest)
			if err != nil {
				log.Fatal(err)
			}

			log.Printf("REQUEST: %s", requestBody)

			req := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
			req.Header.Set("Content-Type", "application/json")

			recorder := httptest.NewRecorder()

			server.HandleSync(recorder, req)

			log.Printf("RESPONSE %+v", recorder.Body)

		}
	}

	clientSeed = fmt.Sprintf("%s-client-%d", *seed, random.Int63())
	client2, err := StartClient(*fileName, clientSeed)
	if err != nil {
		log.Fatal(err)
	}

	for range 1 {
		fmt.Println("CLIENT 2")
		var tick json.RawMessage
		err = client2.Call(map[string]int{"n": 0}, &tick)
		if err != nil {
			log.Fatal(err)
		}

		tickResponse := TickResponse{}
		if err := json.Unmarshal(tick, &tickResponse); err != nil {
			log.Fatal(err)
		}

		if tickResponse.SyncRequest != nil {

			requestBody, err := json.Marshal(tickResponse.SyncRequest)
			if err != nil {
				log.Fatal(err)
			}

			log.Printf("REQUEST: %s", requestBody)

			req := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
			req.Header.Set("Content-Type", "application/json")

			recorder := httptest.NewRecorder()

			server.HandleSync(recorder, req)

			log.Printf("RESPONSE %+v", recorder.Body)

		}
	}

	// printWAL(tick.WalEntries)
}

func printWAL(entries []sync_engine.WALEntry) {
	for _, entry := range entries {
		b, _ := json.MarshalIndent(entry, "", "  ")
		fmt.Println(string(b))
	}
}
