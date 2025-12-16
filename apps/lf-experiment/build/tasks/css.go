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

type StepBuilder struct {
	workDir       string
	isDev         bool
	onEndCallback func(api.BuildResult)
}

func NewCssBuildStep(workDir string, isDev bool) StepBuilder {
	return StepBuilder{
		workDir:       workDir,
		isDev:         isDev,
		onEndCallback: nil,
	}
}

func (builder StepBuilder) WithOnEndCallback(onEndCallback func(api.BuildResult)) StepBuilder {
	builder.onEndCallback = onEndCallback
	return builder
}

func (builder StepBuilder) Create() (BuildTask, error) {
	plugins := []api.Plugin{}
	if builder.onEndCallback != nil {
		plugins = append(plugins, CreateOnEndPlugin(builder.onEndCallback))
	}

	options := api.BuildOptions{
		EntryPoints:   []string{"src/main.css"},
		Outfile:       "dist/css/style.css",
		Bundle:        true,
		Write:         true,
		AbsWorkingDir: builder.workDir,

		// Minification (production only)
		MinifyWhitespace: !builder.isDev,

		// Logging
		LogLevel: api.LogLevelInfo,
		Color:    api.ColorAlways,

		// Loader
		Loader: map[string]api.Loader{
			".css": api.LoaderCSS,
		},

		Plugins: plugins,

		// Keep font URLs as-is (fonts copied separately)
		External: []string{"/fonts/*"},
	}

	ctx, err := api.Context(options)
	if err != nil {
		return nil, err
	}

	return BuildCssOptions{ctx: ctx}, nil
}

// func NewCssBuildStep(workDir string, isDev bool, onEndCallback func(api.BuildResult)) (BuildTask, error) {
// 	ctx, err := buildContext(workDir, isDev, onEndCallback)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	return BuildCssOptions{ctx: ctx}, nil
// }
//
// func buildContext(workDir string, isDev bool, onEndCallback func(api.BuildResult)) (api.BuildContext, error) {
// 	plugins := []api.Plugin{}
// 	if onEndCallback != nil {
// 		plugins = append(plugins, CreateOnEndPlugin(onEndCallback))
// 	}
//
// 	options := api.BuildOptions{
// 		EntryPoints:   []string{"src/main.css"},
// 		Outfile:       "dist/css/style.css",
// 		Bundle:        true,
// 		Write:         true,
// 		AbsWorkingDir: workDir,
//
// 		// Minification (production only)
// 		MinifyWhitespace: !isDev,
//
// 		// Logging
// 		LogLevel: api.LogLevelInfo,
// 		Color:    api.ColorAlways,
//
// 		// Loader
// 		Loader: map[string]api.Loader{
// 			".css": api.LoaderCSS,
// 		},
//
// 		Plugins: plugins,
//
// 		// Keep font URLs as-is (fonts copied separately)
// 		External: []string{"/fonts/*"},
// 	}
//
// 	ctx, err := api.Context(options)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	return ctx, nil
//
// }
