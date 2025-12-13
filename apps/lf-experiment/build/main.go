package main

import (
	"flag"
	"log"
	"net/http"

	"lf-experiment/build/tasks"
)

func main() {
	env := flag.String("env", "production", "environment mode: development or production")
	flag.Parse()

	// Build assets (JavaScript + CSS)
	if err := tasks.BuildAssets(*env); err != nil {
		log.Fatalf("Asset build failed: %v", err)
	}

	tasks.GenerateSite()

	if *env == "dev" || *env == "development" {
		log.Println("Running in development mode - starting server...")
		startServer()
	} else {
		log.Println("Running in production mode - build complete, no server started")
	}
}

func startServer() {
	port := "8080"
	log.Printf("Starting server on http://localhost:%s", port)
	log.Printf("Serving files from ./dist directory")

	http.Handle("/", http.FileServer(http.Dir("./dist")))

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
