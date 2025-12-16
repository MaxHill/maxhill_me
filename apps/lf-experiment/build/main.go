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

const (
	// Environment modes
	envDev         = "dev"
	envDevelopment = "development"
	envProduction  = "production"

	// Directories
	distDir      = "dist"
	templatesDir = "./templates"
	pagesDir     = "./pages"

	// Watch paths
	watchPathComponents = "../../packages/components/dist"
	watchPathCSS        = "../../packages/css/dist"

	// Server config
	serverPort    = "8080"
	serverDistDir = "./dist"

	// Cache config
	fileCacheInitialCapacity = 100
)

func main() {
	env := flag.String("env", envProduction, "environment mode: development or production")
	flag.Parse()
	isDev := *env == envDev || *env == envDevelopment

	absWorkDir, err := filepath.Abs(".")
	if err != nil {
		log.Fatalf("failed to get working directory: %w", err)
	}

	buildAllCtx := newBuildAllCtx(absWorkDir, isDev)

	//  Run tasks
	//  ------------------------------------------------------------------------
	if *env == envDev || *env == envDevelopment {
		clearDist(absWorkDir)
		if err := buildAll(buildAllCtx); err != nil {
			log.Printf("Initial build failed: %v", err)
			log.Println("Continuing in dev mode with watch...")
		}
		watchAll(absWorkDir, isDev, buildAllCtx)
		startServer()
	} else {
		clearDist(absWorkDir)
		if err := buildAll(buildAllCtx); err != nil {
			log.Fatalf("Build failed: %v", err)
		}
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
	distPath := filepath.Join(absWorkDir, distDir)
	if err := os.RemoveAll(distPath); err != nil {
		log.Printf("Warning: failed to remove dist directory: %v", err)
	}
}

func buildAll(buildCtx BuildAllCtx) error {
	log.Println("Building assets...")

	// Fonts
	fontsRes := buildCtx.fontsTask.Build()
	if len(fontsRes.Errors) != 0 {
		return fmt.Errorf("fonts build failed with %d errors: %v", len(fontsRes.Errors), fontsRes.Errors)
	}

	// Css
	cssRes := buildCtx.cssTask.Build()
	if len(cssRes.Errors) != 0 {
		return fmt.Errorf("CSS build failed with %d errors: %v", len(cssRes.Errors), cssRes.Errors)
	}
	log.Println("✓ CSS built")

	// Js
	jsRes := buildCtx.jsTask.Build()
	if len(jsRes.Errors) != 0 {
		return fmt.Errorf("JS build failed with %d errors: %v", len(jsRes.Errors), jsRes.Errors)
	}
	log.Println("✓ JS built")

	// Html
	htmlRes := buildCtx.htmlTask.Build()
	if len(htmlRes.Errors) != 0 {
		return fmt.Errorf("HTML build failed with %d errors: %v", len(htmlRes.Errors), htmlRes.Errors)
	}

	log.Println("✓ Build complete")
	return nil
}

func watchAll(absWorkDir string, isDev bool, buildAllCtx BuildAllCtx) {
	log.Println("Starting watch...")

	// Poll workspace package dist directories for changes
	watchPaths := []string{
		watchPathComponents,
		watchPathCSS,
		templatesDir,
		pagesDir,
	}

	go tasks.PollPaths(watchPaths, func() {
		log.Println("Workspace packages changed, rebuilding...")

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
	filesToCache := make([]string, 0, fileCacheInitialCapacity)

	distPath := filepath.Join(absWorkDir, distDir)
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
	log.Printf("Starting server on http://localhost:%s", serverPort)
	log.Printf("Serving files from %s directory", serverDistDir)

	http.Handle("/", http.FileServer(http.Dir(serverDistDir)))

	if err := http.ListenAndServe(":"+serverPort, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
