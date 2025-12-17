package main

import (
	"flag"
	"fmt"
	"log"
	"path/filepath"

	"lf-experiment/build/tasks"
)

const (
	// Environment modes
	envDev         = "dev"
	envDevelopment = "development"
	envProduction  = "production"

	// Directories
	distDir      = "dist"
	srcDir       = "./src"
	templatesDir = "./templates"
	pagesDir     = "./pages"

	// Watch paths
	watchPathComponents = "../../packages/components/dist"
	watchPathCSS        = "../../packages/css/dist"

	// Server config
	serverPort    = "8080"
	serverDistDir = "./dist"
)

func main() {
	env := flag.String("env", envProduction, "environment mode: development or production")
	flag.Parse()
	isDev := *env == envDev || *env == envDevelopment

	absWorkDir, err := filepath.Abs(".")
	if err != nil {
		log.Fatalf("failed to get working directory: %s", err)
	}

	buildAllCtx := newBuildAllCtx(absWorkDir, isDev)

	//  Run tasks
	//  ------------------------------------------------------------------------
	if isDev {
		tasks.ClearDist(absWorkDir, distDir)
		if err := buildAll(buildAllCtx); err != nil {
			log.Printf("Initial build failed: %v", err)
			log.Println("Continuing in dev mode with watch...")
		}
		watchAll(buildAllCtx)
		startServer()
	} else {
		tasks.ClearDist(absWorkDir, distDir)
		if err := buildAll(buildAllCtx); err != nil {
			log.Fatalf("Build failed: %v", err)
		}
	}
}

type BuildAllCtx struct {
	tasks []tasks.BuildTask
}

func newBuildAllCtx(absWorkDir string, isDev bool) BuildAllCtx {
	buildTasks := []tasks.BuildTask{}

	// Define all build steps in order
	taskBuilders := []struct {
		name    string
		builder func(string, bool) (tasks.BuildTask, error)
	}{
		{"fonts", tasks.NewFontsBuildStep},
		{"css", tasks.NewCssBuildStep},
		{"js", tasks.NewJsBuildStep},
		{"html", tasks.NewHtmlBuildStep},
		{"serviceworker", tasks.NewServiceWorkerBuildStep},
	}

	// Create each task
	for _, tb := range taskBuilders {
		task, err := tb.builder(absWorkDir, isDev)
		if err != nil {
			log.Fatalf("failed to create %s task: %v", tb.name, err)
		}
		buildTasks = append(buildTasks, task)
	}

	return BuildAllCtx{tasks: buildTasks}
}

func buildAll(buildCtx BuildAllCtx) error {
	log.Println("Building assets...")

	for _, task := range buildCtx.tasks {
		result := task.Build()
		if len(result.Errors) != 0 {
			return fmt.Errorf("build failed with %d errors: %v", len(result.Errors), result.Errors)
		}
	}

	log.Println("✓ Build complete")
	return nil
}

func watchAll(buildAllCtx BuildAllCtx) {
	log.Println("Starting watch...")

	watchPaths := []string{
		watchPathComponents,
		watchPathCSS,
		templatesDir,
		pagesDir,
		srcDir,
	}

	go tasks.PollPaths(watchPaths, func() {
		log.Println("Files changed, rebuilding...")

		// Rebuild everything using the same buildAll function
		if err := buildAll(buildAllCtx); err != nil {
			log.Printf("Rebuild failed: %v", err)
			return
		}
	})
}
