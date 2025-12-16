package tasks

import (
	"fmt"
	"log"

	"github.com/evanw/esbuild/pkg/api"
)

type BuildCssOptions struct {
	ctx api.BuildContext
}

func (options BuildCssOptions) Build() BuildResult {
	result := options.ctx.Rebuild()
	buildResult := BuildResult{
		Errors:   make([]string, 0, len(result.Errors)),
		Warnings: make([]string, 0, len(result.Warnings)),
	}

	if len(result.Errors) > 0 {
		for _, err := range result.Errors {
			// TODO: maybe not print here
			log.Printf("  CSS Error: %s", err.Text)
			buildResult.Errors = append(
				buildResult.Errors,
				fmt.Sprintf("  CSS Error: %s", err.Text),
			)
		}
	}

	if len(result.Warnings) > 0 {
		for _, warning := range result.Warnings {
			// TODO: maybe not print here
			log.Printf("  CSS Warning: %s", warning.Text)
			buildResult.Warnings = append(
				buildResult.Warnings,
				fmt.Sprintf("  CSS Warning: %s", warning.Text),
			)
		}
	}

	return buildResult
}

func (options BuildCssOptions) Watch() BuildResult {

	err := options.ctx.Watch(api.WatchOptions{})
	if err != nil {
		log.Fatalf("could not start css watching")
	}

	return BuildResult{}
}

func NewCssBuildStep(workDir string, isDev bool) (BuildTask, error) {
	ctx, err := buildContext(workDir, isDev)
	if err != nil {
		return nil, err
	}

	return BuildCssOptions{ctx: ctx}, nil
}

func buildContext(workDir string, isDev bool) (api.BuildContext, error) {
	options := api.BuildOptions{
		EntryPoints:   []string{"src/main.css"},
		Outfile:       "dist/css/style.css",
		Bundle:        true,
		Write:         true,
		AbsWorkingDir: workDir,

		// Minification (production only)
		MinifyWhitespace: !isDev,

		// Logging
		LogLevel: api.LogLevelInfo,
		Color:    api.ColorAlways,

		// Loader
		Loader: map[string]api.Loader{
			".css": api.LoaderCSS,
		},

		// Keep font URLs as-is (fonts copied separately)
		External: []string{"/fonts/*"},
	}

	ctx, err := api.Context(options)
	if err != nil {
		return nil, err
	}

	return ctx, nil

}
