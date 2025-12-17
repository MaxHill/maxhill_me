package tasks

import (
	"fmt"
	"log"

	"github.com/evanw/esbuild/pkg/api"
)

const (
	jsEntryPointMain          = "src/main.ts"
	jsEntryPointServiceWorker = "src/serviceworker.ts"
	jsOutputPathMain          = "js/main"
	jsOutputPathServiceWorker = "serviceworker"
	jsOutdir                  = "dist"
)

type BuildJsOptions struct {
	ctx api.BuildContext
}

func (options BuildJsOptions) Build() BuildResult {
	result := options.ctx.Rebuild()
	buildResult := BuildResult{
		Errors:   make([]string, 0, len(result.Errors)),
		Warnings: make([]string, 0, len(result.Warnings)),
	}

	if len(result.Errors) > 0 {
		for _, err := range result.Errors {
			log.Printf("  JS Error: %s", err.Text)
			buildResult.Errors = append(
				buildResult.Errors,
				fmt.Sprintf("  JS Error: %s", err.Text),
			)
		}
	}

	if len(result.Warnings) > 0 {
		for _, warning := range result.Warnings {
			log.Printf("  JS Warning: %s", warning.Text)
			buildResult.Warnings = append(
				buildResult.Warnings,
				fmt.Sprintf("  JS Warning: %s", warning.Text),
			)
		}
	}

	return buildResult
}

func NewJsBuildStep(workDir string, isDev bool) (BuildTask, error) {
	sourcemap := api.SourceMapNone
	if isDev {
		sourcemap = api.SourceMapLinked
	}

	options := api.BuildOptions{
		EntryPointsAdvanced: []api.EntryPoint{
			{InputPath: jsEntryPointMain, OutputPath: jsOutputPathMain},
			{InputPath: jsEntryPointServiceWorker, OutputPath: jsOutputPathServiceWorker},
		},
		Outdir:        jsOutdir,
		Bundle:        true,
		Write:         true,
		Platform:      api.PlatformBrowser,
		Target:        api.ES2020,
		Format:        api.FormatESModule,
		AbsWorkingDir: workDir,

		// Sourcemaps
		Sourcemap: sourcemap,

		// Minification (production only)
		MinifyWhitespace:  !isDev,
		MinifyIdentifiers: !isDev,
		MinifySyntax:      !isDev,

		// Logging
		LogLevel: api.LogLevelInfo,
		Color:    api.ColorAlways,

		// Loader configuration
		// Note: ALL .css imports become text strings, not just those with ?inline
		// esbuild strips query parameters during resolution, so "./index.css?inline"
		// resolves to "./index.css" and uses this loader.
		Loader: map[string]api.Loader{
			".css": api.LoaderText, // For Shadow DOM: import styles from "./index.css"
		},
	}

	ctx, err := api.Context(options)
	if err != nil {
		return nil, err
	}

	return BuildJsOptions{ctx: ctx}, nil
}
