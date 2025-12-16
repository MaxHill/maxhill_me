package main

import (
	"flag"
	"log"
	"net/http"
	"path/filepath"

	"lf-experiment/build/tasks"
)

func main() {
	env := flag.String("env", "production", "environment mode: development or production")
	flag.Parse()
	isDev := *env == "dev" || *env == "development"

	absWorkDir, err := filepath.Abs(".")
	if err != nil {
		log.Fatalf("failed to get working directory: %w", err)
	}

	//  Create tasks
	//  ------------------------------------------------------------------------
	cssTask, err := tasks.NewCssBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create cssTask: %v", err)
	}

	jsTask, err := tasks.NewJsBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create jsTask: %v", err)
	}

	htmlTask, err := tasks.NewHtmlBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create htmlTask: %v", err)
	}

	fontsTask, err := tasks.NewFontsBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create fontsTask: %v", err)
	}

	//  Run tasks
	//  ------------------------------------------------------------------------
	if *env == "dev" || *env == "development" {
		log.Println("Running in development mode...")

		// Poll workspace package dist directories for changes
		watchPaths := []string{
			"../../packages/components/dist",
			"../../packages/css/dist",
			"./templates",
			"./pages",
		}
		go tasks.PollPaths(watchPaths, func() {
			log.Println("Workspace packages changed, rebuilding JS...")

			jsRes := jsTask.Build()
			if len(jsRes.Errors) > 0 {
				log.Printf("JS rebuild failed: %v", jsRes.Errors)
			}

			cssRes := cssTask.Build()
			if len(cssRes.Errors) > 0 {
				log.Printf("Css rebuild failed: %v", cssRes.Errors)
			}

			htmlTask := htmlTask.Build()
			if len(htmlTask.Errors) > 0 {
				log.Printf("Html rebuild failed: %v", cssRes.Errors)
			}
		})

		// Start watching local files (CSS and JS)
		go func() {
			cssTask.Watch()
		}()
		go func() {
			jsTask.Watch()
		}()

		// Start the server
		startServer()
	} else {
		log.Println("Building assets...")

		fontsRes := fontsTask.Build()
		if len(fontsRes.Errors) != 0 {
			log.Fatalf("Fonts build failed with %d errors", len(fontsRes.Errors))
		}

		cssRes := cssTask.Build()
		if len(cssRes.Errors) != 0 {
			log.Fatalf("CSS build failed with %d errors", len(cssRes.Errors))
		}
		log.Println("✓ CSS built")

		jsRes := jsTask.Build()
		if len(jsRes.Errors) != 0 {
			log.Fatalf("JS build failed with %d errors", len(jsRes.Errors))
		}
		log.Println("✓ JS built")

		htmlRes := htmlTask.Build()
		if len(htmlRes.Errors) != 0 {
			log.Fatalf("HTML build failed with %d errors", len(htmlRes.Errors))
		}

		log.Println("✓ Build complete")
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
