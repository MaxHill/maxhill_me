package tasks

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/evanw/esbuild/pkg/api"
)

// formatBytes converts bytes to human-readable format
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// BuildAssets orchestrates the asset build pipeline: JavaScript, CSS, and fonts.
func BuildAssets(environment string) error {
	log.Println("Building assets...")

	// Get absolute working directory
	absWorkDir, err := filepath.Abs(".")
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	// Determine build mode
	isDev := environment == "dev" || environment == "development"

	// Build JavaScript (with inline CSS for Shadow DOM)
	if err := buildJavaScript(absWorkDir, isDev); err != nil {
		return err
	}

	// Build CSS (global styles)
	if err := buildCSS(absWorkDir, isDev); err != nil {
		return err
	}

	// Copy fonts
	if err := copyFonts(absWorkDir); err != nil {
		return err
	}

	// Calculate and report total size
	var totalSize int64
	filepath.Walk("dist", func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			totalSize += info.Size()
		}
		return nil
	})

	log.Printf("✓ Asset build complete (total: %s)", formatBytes(totalSize))
	return nil
}

func buildJavaScript(workDir string, isDev bool) error {
	log.Println("  Building JavaScript...")

	sourcemap := api.SourceMapNone
	if isDev {
		sourcemap = api.SourceMapLinked
	}

	result := api.Build(api.BuildOptions{
		EntryPoints:   []string{"src/main.ts"},
		Outfile:       "dist/js/main.js",
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
	})

	if len(result.Errors) > 0 {
		for _, err := range result.Errors {
			log.Printf("  JS Error: %s", err.Text)
		}
		return fmt.Errorf("JavaScript build failed with %d errors", len(result.Errors))
	}

	if len(result.Warnings) > 0 {
		for _, warning := range result.Warnings {
			log.Printf("  JS Warning: %s", warning.Text)
		}
	}

	// Report output size
	if info, err := os.Stat("dist/js/main.js"); err == nil {
		log.Printf("  ✓ JavaScript built: dist/js/main.js (%s)", formatBytes(info.Size()))
	} else {
		log.Printf("  ✓ JavaScript built: dist/js/main.js")
	}
	return nil
}

func buildCSS(workDir string, isDev bool) error {
	log.Println("  Building CSS...")

	result := api.Build(api.BuildOptions{
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
	})

	if len(result.Errors) > 0 {
		for _, err := range result.Errors {
			log.Printf("  CSS Error: %s", err.Text)
		}
		return fmt.Errorf("CSS build failed with %d errors", len(result.Errors))
	}

	if len(result.Warnings) > 0 {
		for _, warning := range result.Warnings {
			log.Printf("  CSS Warning: %s", warning.Text)
		}
	}

	// Report output size
	if info, err := os.Stat("dist/css/style.css"); err == nil {
		log.Printf("  ✓ CSS built: dist/css/style.css (%s)", formatBytes(info.Size()))
	} else {
		log.Printf("  ✓ CSS built: dist/css/style.css")
	}
	return nil
}

func copyFonts(workDir string) error {
	log.Println("  Copying fonts...")

	// Source: apps/site/public/fonts/optimized
	// Target: dist/fonts/optimized
	srcDir := filepath.Join(workDir, "../site/public/fonts/optimized")
	destDir := filepath.Join(workDir, "dist/fonts/optimized")

	// Create destination directory
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("failed to create fonts directory: %w", err)
	}

	// Read source directory
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return fmt.Errorf("failed to read fonts directory: %w", err)
	}

	// Copy each font file
	copiedCount := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		srcPath := filepath.Join(srcDir, entry.Name())
		destPath := filepath.Join(destDir, entry.Name())

		if err := copyFile(srcPath, destPath); err != nil {
			return fmt.Errorf("failed to copy %s: %w", entry.Name(), err)
		}
		copiedCount++
	}

	log.Printf("  ✓ Copied %d font files to dist/fonts/optimized", copiedCount)
	return nil
}

func copyFile(src, dest string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
