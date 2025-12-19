package main

import (
	"log"
	"net/http"
)

func startServer() {
	log.Printf("Starting server on http://localhost:%s", serverPort)
	log.Printf("Serving files from %s directory", serverDistDir)

	http.Handle("/", http.FileServer(http.Dir(serverDistDir)))

	if err := http.ListenAndServe(":"+serverPort, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
