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

// PageData holds data to be passed to page templates
type PageData struct {
	// Empty for now - can add page-specific data as needed
}

// GenerateSite processes HTML pages from the pages/ directory and renders them
// using templates from templates/ directory.
func GenerateSite() {
	tmpl, err := template.ParseGlob("templates/*.html")
	if err != nil {
		log.Fatalf("Error parsing templates: %v", err)
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

		log.Printf("Generated %s", outPath)
		return nil
	})
	if err != nil {
		log.Fatalf("Error processing pages: %v", err)
	}

	fmt.Println("✓ Site generation complete")
}
