package tasks

import (
	"fmt"
	"log"

	"github.com/evanw/esbuild/pkg/api"
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
			// TODO: maybe not print here
			log.Printf("  JS Error: %s", err.Text)
			buildResult.Errors = append(
				buildResult.Errors,
				fmt.Sprintf("  JS Error: %s", err.Text),
			)
		}
	}

	if len(result.Warnings) > 0 {
		for _, warning := range result.Warnings {
			// TODO: maybe not print here
			log.Printf("  JS Warning: %s", warning.Text)
			buildResult.Warnings = append(
				buildResult.Warnings,
				fmt.Sprintf("  JS Warning: %s", warning.Text),
			)
		}
	}

	return buildResult
}

func (options BuildJsOptions) Watch() BuildResult {
	err := options.ctx.Watch(api.WatchOptions{})
	if err != nil {
		log.Fatalf("could not start js watching")
	}

	return BuildResult{}
}

type JsStepBuilder struct {
	workDir       string
	isDev         bool
	onEndCallback func(api.BuildResult)
}

func NewJsBuildStep(workDir string, isDev bool) JsStepBuilder {
	return JsStepBuilder{
		workDir:       workDir,
		isDev:         isDev,
		onEndCallback: nil,
	}
}

func (builder JsStepBuilder) WithOnEndCallback(onEndCallback func(api.BuildResult)) JsStepBuilder {
	builder.onEndCallback = onEndCallback
	return builder
}

func (builder JsStepBuilder) Create() (BuildTask, error) {
	plugins := []api.Plugin{}
	if builder.onEndCallback != nil {
		plugins = append(plugins, CreateOnEndPlugin(builder.onEndCallback))
	}

	sourcemap := api.SourceMapNone
	if builder.isDev {
		sourcemap = api.SourceMapLinked
	}

	options := api.BuildOptions{
		EntryPoints:   []string{"src/main.ts"},
		Outfile:       "dist/js/main.js",
		Bundle:        true,
		Write:         true,
		Platform:      api.PlatformBrowser,
		Target:        api.ES2020,
		Format:        api.FormatESModule,
		AbsWorkingDir: builder.workDir,

		// Sourcemaps
		Sourcemap: sourcemap,

		// Minification (production only)
		MinifyWhitespace:  !builder.isDev,
		MinifyIdentifiers: !builder.isDev,
		MinifySyntax:      !builder.isDev,

		// Logging
		LogLevel: api.LogLevelInfo,
		Color:    api.ColorAlways,

		Plugins: plugins,

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
