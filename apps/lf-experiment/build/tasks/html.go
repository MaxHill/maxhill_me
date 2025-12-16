package tasks

import (
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const (
	htmlTemplatesGlob = "templates/*.html"
	htmlPagesDir      = "pages"
	htmlDistDir       = "dist"
	htmlBaseTemplate  = "base.html"
	htmlContentName   = "content"
	htmlFileExtension = ".html"
)

type BuildHtmlOptions struct {
	workDir string
}

func (options BuildHtmlOptions) Build() BuildResult {
	buildResult := BuildResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	tmpl, err := template.ParseGlob(htmlTemplatesGlob)
	if err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("Error parsing templates: %v", err))
		return buildResult
	}

	err = filepath.Walk(htmlPagesDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		if !strings.HasSuffix(info.Name(), htmlFileExtension) {
			return nil
		}

		pageContent, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		pageTemplate, err := tmpl.Clone()
		if err != nil {
			return err
		}
		pageTemplate.New(htmlContentName).Parse(string(pageContent))

		relPath, err := filepath.Rel(htmlPagesDir, path)
		if err != nil {
			return err
		}
		outPath := filepath.Join(htmlDistDir, relPath)

		os.MkdirAll(filepath.Dir(outPath), os.ModePerm)

		outFile, err := os.Create(outPath)
		if err != nil {
			return err
		}
		defer outFile.Close()

		// Execute template with no data (or empty PageData)
		err = pageTemplate.ExecuteTemplate(outFile, htmlBaseTemplate, nil)
		if err != nil {
			return err
		}

		log.Printf("  Generated %s", outPath)
		return nil
	})

	if err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("Error processing pages: %v", err))
		return buildResult
	}

	log.Println("  ✓ HTML generation complete")
	return buildResult
}

func (options BuildHtmlOptions) Watch() BuildResult {
	return BuildResult{}
}

func NewHtmlBuildStep(workDir string, isDev bool) (BuildTask, error) {
	return BuildHtmlOptions{workDir: workDir}, nil
}
