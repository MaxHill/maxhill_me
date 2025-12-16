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

type BuildHtmlOptions struct {
	workDir string
}

func (options BuildHtmlOptions) Build() BuildResult {
	buildResult := BuildResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	tmpl, err := template.ParseGlob("templates/*.html")
	if err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("Error parsing templates: %v", err))
		return buildResult
	}

	err = filepath.Walk("pages", func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		if !strings.HasSuffix(info.Name(), ".html") {
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
		pageTemplate.New("content").Parse(string(pageContent))

		relPath, err := filepath.Rel("pages", path)
		if err != nil {
			return err
		}
		outPath := filepath.Join("dist", relPath)

		os.MkdirAll(filepath.Dir(outPath), os.ModePerm)

		outFile, err := os.Create(outPath)
		if err != nil {
			return err
		}
		defer outFile.Close()

		// Execute template with no data (or empty PageData)
		err = pageTemplate.ExecuteTemplate(outFile, "base.html", nil)
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
