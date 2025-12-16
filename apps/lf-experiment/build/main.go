package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"lf-experiment/build/tasks"

	"github.com/evanw/esbuild/pkg/api"
)

func main() {
	env := flag.String("env", "production", "environment mode: development or production")
	flag.Parse()
	isDev := *env == "dev" || *env == "development"

	absWorkDir, err := filepath.Abs(".")
	if err != nil {
		log.Fatalf("failed to get working directory: %w", err)
	}

	buildAllCtx := newBuildAllCtx(absWorkDir, isDev)

	//  Run tasks
	//  ------------------------------------------------------------------------
	if *env == "dev" || *env == "development" {
		clearDist(absWorkDir)
		buildAll(buildAllCtx)
		watchAll(absWorkDir, isDev, buildAllCtx)
		startServer()
	} else {
		clearDist(absWorkDir)
		buildAll(buildAllCtx)
	}
}

type BuildAllCtx struct {
	fontsTask tasks.BuildTask
	htmlTask  tasks.BuildTask
	cssTask   tasks.BuildTask
	jsTask    tasks.BuildTask
}

func newBuildAllCtx(absWorkDir string, isDev bool) BuildAllCtx {
	buildCtx := BuildAllCtx{}
	fontsTask, err := tasks.NewFontsBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create fontsTask: %v", err)
	}
	buildCtx.fontsTask = fontsTask

	cssTask, err := tasks.NewCssBuildStep(absWorkDir, isDev).Create()
	if err != nil {
		log.Fatalf("failed to create cssTask: %v", err)
	}
	buildCtx.cssTask = cssTask

	jsTask, err := tasks.NewJsBuildStep(absWorkDir, isDev).Create()
	if err != nil {
		log.Fatalf("failed to create jsTask: %v", err)
	}
	buildCtx.jsTask = jsTask

	htmlTask, err := tasks.NewHtmlBuildStep(absWorkDir, isDev)
	if err != nil {
		log.Fatalf("failed to create htmlTask: %v", err)
	}
	buildCtx.htmlTask = htmlTask

	return buildCtx
}

func clearDist(absWorkDir string) {
	distPath := filepath.Join(absWorkDir, "dist")
	if err := os.RemoveAll(distPath); err != nil {
		log.Printf("Warning: failed to remove dist directory: %v", err)
	}
}

func buildAll(buildCtx BuildAllCtx) {
	log.Println("Building assets...")

	// Fonts
	fontsRes := buildCtx.fontsTask.Build()
	if len(fontsRes.Errors) != 0 {
		log.Fatalf("Fonts build failed with %d errors", len(fontsRes.Errors))
	}

	// Css
	cssRes := buildCtx.cssTask.Build()
	if len(cssRes.Errors) != 0 {
		log.Fatalf("CSS build failed with %d errors", len(cssRes.Errors))
	}
	log.Println("✓ CSS built")

	// Js
	jsRes := buildCtx.jsTask.Build()
	if len(jsRes.Errors) != 0 {
		log.Fatalf("JS build failed with %d errors", len(jsRes.Errors))
	}
	log.Println("✓ JS built")

	// Html
	htmlRes := buildCtx.htmlTask.Build()
	if len(htmlRes.Errors) != 0 {
		log.Fatalf("HTML build failed with %d errors", len(htmlRes.Errors))
	}

	log.Println("✓ Build complete")
}

func watchAll(absWorkDir string, isDev bool, buildAllCtx BuildAllCtx) {
	log.Println("Starting watch...")

	// Poll workspace package dist directories for changes
	watchPaths := []string{
		"../../packages/components/dist",
		"../../packages/css/dist",
		"./templates",
		"./pages",
	}

	go tasks.PollPaths(watchPaths, func() {
		log.Println("Workspace packages changed, rebuilding JS...")

		jsRes := buildAllCtx.jsTask.Build()
		if len(jsRes.Errors) > 0 {
			log.Printf("JS rebuild failed: %v", jsRes.Errors)
		}

		cssRes := buildAllCtx.cssTask.Build()
		if len(cssRes.Errors) > 0 {
			log.Printf("Css rebuild failed: %v", cssRes.Errors)
		}

		htmlTask := buildAllCtx.htmlTask.Build()
		if len(htmlTask.Errors) > 0 {
			log.Printf("Html rebuild failed: %v", cssRes.Errors)
		}

		postBuild(absWorkDir)
	})

	// Start watching local files (CSS and JS)
	go func() {
		cssTask, err := tasks.NewCssBuildStep(absWorkDir, isDev).WithOnEndCallback(func(br api.BuildResult) {
			postBuild(absWorkDir)
		}).Create()
		if err != nil {
			log.Fatalf("failed to create watch cssTask: %v", err)
		}
		cssTask.Watch()
	}()

	go func() {
		jsTask, err := tasks.NewJsBuildStep(absWorkDir, isDev).WithOnEndCallback(func(br api.BuildResult) {
			postBuild(absWorkDir)
		}).Create()
		if err != nil {
			log.Fatalf("failed to create watch jsTask: %v", err)
		}
		jsTask.Watch()
	}()

}

func postBuild(absWorkDir string) {
	filesToCache := make([]string, 0, 100)

	distPath := filepath.Join(absWorkDir, "dist")
	fmt.Println("Current files:")
	filepath.Walk(distPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() {
			name := filepath.Join("/", info.Name())
			filesToCache = append(filesToCache, strings.TrimSuffix(name, "index.html"))
		}
		return nil
	})

	res, err := json.Marshal(filesToCache)
	if err != nil {
		log.Fatalf("Could not convert files to cache to json string")
	}
	fmt.Printf("res: %s", res)
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
