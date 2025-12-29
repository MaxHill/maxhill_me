package tasks_test

import (
	"fmt"
	"lf-experiment/tasks"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func FuzzPoll2(f *testing.F) {
	// Seed corpus: (initialFiles, numOperations, operationSeed)
	f.Add(uint8(5), uint8(3), uint8(42))   // 5 files, 3 operations
	f.Add(uint8(10), uint8(10), uint8(99)) // 10 files, 10 operations
	f.Add(uint8(3), uint8(20), uint8(7))   // 3 files, many operations
	f.Add(uint8(20), uint8(5), uint8(123)) // many files, few operations

	f.Fuzz(func(t *testing.T, initialFiles uint8, numOperations uint8, operationSeed uint8) {
		// Limit to reasonable values
		if initialFiles > 50 {
			initialFiles = 50
		}
		if numOperations > 30 {
			numOperations = 30
		}

		// Create a temporary directory
		tempDir := t.TempDir()

		// Create initial files
		fileList := make([]string, 0, int(initialFiles)+int(numOperations))
		for i := uint8(0); i < initialFiles; i++ {
			fileName := filepath.Join(tempDir, fmt.Sprintf("file_%d.txt", i))
			if err := os.WriteFile(fileName, []byte("initial"), 0644); err != nil {
				t.Fatal(err)
			}
			fileList = append(fileList, fileName)
		}

		// Initialize Poll2
		expectedCallbacks := 0
		actualCallbacks := 0
		actualChangedFiles := make(map[string]int)

		callback := func(changed map[string]tasks.WatchedFile) {
			actualCallbacks++
			// Track which files changed
			for path := range changed {
				actualChangedFiles[path]++
			}
		}

		fileSystemPoller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, callback)
		if err != nil {
			t.Errorf("Could not create fileSystemPoller %s)", err)
		}

		// Perform random operations
		seed := operationSeed
		for i := uint8(0); i < numOperations; i++ {
			// Use seed to determine operation type
			operation := seed % 3
			seed = (seed*7 + 13) % 255 // Simple PRNG

			switch operation {
			case 0: // Edit existing file
				if len(fileList) > 0 {
					fileIdx := int(seed) % len(fileList)
					time.Sleep(2 * time.Millisecond) // Ensure timestamp changes
					if err := os.WriteFile(fileList[fileIdx], fmt.Appendf(nil, "edited_%d", i), 0644); err != nil {
						t.Logf("Failed to edit file: %v", err)
					} else {
						expectedCallbacks++
						t.Logf("Operation %d: Edited %s (expected callbacks: %d)", i, filepath.Base(fileList[fileIdx]), expectedCallbacks)
					}
				}

			case 1: // Add new file
				newFileName := filepath.Join(tempDir, fmt.Sprintf("new_file_%d.txt", i))
				time.Sleep(2 * time.Millisecond)
				if err := os.WriteFile(newFileName, []byte("new"), 0644); err != nil {
					t.Logf("Failed to add file: %v", err)
				} else {
					fileList = append(fileList, newFileName)
					expectedCallbacks++
					t.Logf("Operation %d: Added %s (expected callbacks: %d)", i, filepath.Base(newFileName), expectedCallbacks)
				}

			case 2: // Remove file
				if len(fileList) > 1 { // Keep at least one file
					fileIdx := int(seed) % len(fileList)
					if err := os.Remove(fileList[fileIdx]); err != nil {
						t.Logf("Failed to remove file: %v", err)
					} else {
						t.Logf("Operation %d: Removed %s (expected callbacks: %d)", i, filepath.Base(fileList[fileIdx]), expectedCallbacks)
						fileList = append(fileList[:fileIdx], fileList[fileIdx+1:]...)
						expectedCallbacks++
					}
				}
			}

			err := fileSystemPoller.FindNewFiles()
			if err != nil {
				t.Errorf("FindNewFiles failed: %s", err)
			}

			err = fileSystemPoller.Poll()
			if err != nil {
				t.Errorf("Polling failed: %s", err)
			}
		}

		// Final validation
		t.Logf("Test complete: %d initial files, %d operations", initialFiles, numOperations)

		// Allow test to pass even if callbacks don't match (Poll2 is still under development)
		if expectedCallbacks != actualCallbacks {
			t.Errorf("X Callback mismatch (expected: %d, got: %d)", expectedCallbacks, actualCallbacks)
		} else {
			t.Logf("✓ Callback count matches!")
		}
	})
}
