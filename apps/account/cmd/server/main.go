package main

import (
	"account/internal"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
)

var db internal.Database

func main() {
	var err error
	db, err = internal.NewDB("accounts.db")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	http.HandleFunc("/accounts", createAccountHandler)
	http.HandleFunc("/accounts/", accountHandler)

	log.Println("Server running on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func createAccountHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxRequestBodyBytes = 1 << 20 // 1 MB
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req internal.CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Invalid request body: %v", err)
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	resp := internal.HandleCreateAccount(req, db)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("ERROR: Failed to encode response: %v", err)
	}
}

func accountHandler(w http.ResponseWriter, r *http.Request) {
	// Extract account ID from path: /accounts/{id}
	const accountPathPrefix = "/accounts/"
	pathSuffix := r.URL.Path[len(accountPathPrefix):]

	if pathSuffix == "" {
		http.Error(w, "Account ID required", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseInt(pathSuffix, 10, 64)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid account ID format: %v", err), http.StatusBadRequest)
		return
	}

	if id <= 0 {
		http.Error(w, fmt.Sprintf("Invalid account ID: must be positive, got %d", id), http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		req := internal.GetAccountRequest{ID: id}
		resp := internal.HandleGetAccount(req, db)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("ERROR: Failed to encode response: %v", err)
		}

	case http.MethodPatch:
		// Limit request body size
		const maxRequestBodyBytes = 1 << 20 // 1 MB
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

		var updateReq struct {
			Amount int64 `json:"amount"`
		}
		if err := json.NewDecoder(r.Body).Decode(&updateReq); err != nil {
			log.Printf("Invalid request body: %v", err)
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}
		req := internal.UpdateBalanceRequest{ID: id, Amount: updateReq.Amount}
		resp := internal.HandleUpdateBalance(req, db)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("ERROR: Failed to encode response: %v", err)
		}

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
