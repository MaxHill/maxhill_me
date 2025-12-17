package tasks

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// BenchmarkPoll_SinglePath benchmarks polling a single directory
func BenchmarkPoll_SinglePath(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 10)
	defer os.RemoveAll(tempDir)

	paths := []string{tempDir}
	callbackCount := 0
	callback := func() {
		callbackCount++
	}

	// Run the benchmark
	b.ResetTimer()
	go Poll(paths, callback)

	// Simulate work for the benchmark duration
	time.Sleep(time.Duration(b.N) * 300 * time.Millisecond)
	b.StopTimer()
}

// BenchmarkPoll_MultiplePaths benchmarks polling multiple directories
func BenchmarkPoll_MultiplePaths(b *testing.B) {
	// Create 5 temp directories with 20 files each
	tempDirs := make([]string, 5)
	for i := 0; i < 5; i++ {
		tempDirs[i] = createTempDirWithFiles(b, 20)
		defer os.RemoveAll(tempDirs[i])
	}

	callbackCount := 0
	callback := func() {
		callbackCount++
	}

	// Run the benchmark
	b.ResetTimer()
	go Poll(tempDirs, callback)

	// Simulate work for the benchmark duration
	time.Sleep(time.Duration(b.N) * 300 * time.Millisecond)
	b.StopTimer()
}

// BenchmarkPoll_LargeDirectory benchmarks polling a directory with many files
func BenchmarkPoll_LargeDirectory(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 1000)
	defer os.RemoveAll(tempDir)

	paths := []string{tempDir}
	callbackCount := 0
	callback := func() {
		callbackCount++
	}

	// Run the benchmark
	b.ResetTimer()
	go Poll(paths, callback)

	// Simulate work for the benchmark duration
	time.Sleep(time.Duration(b.N) * 300 * time.Millisecond)
	b.StopTimer()
}

// BenchmarkPoll_NestedDirectories benchmarks polling nested directory structures
func BenchmarkPoll_NestedDirectories(b *testing.B) {
	tempDir := createNestedDirStructure(b, 3, 10)
	defer os.RemoveAll(tempDir)

	paths := []string{tempDir}
	callbackCount := 0
	callback := func() {
		callbackCount++
	}

	// Run the benchmark
	b.ResetTimer()
	go Poll(paths, callback)

	// Simulate work for the benchmark duration
	time.Sleep(time.Duration(b.N) * 300 * time.Millisecond)
	b.StopTimer()
}

// BenchmarkPoll_WithFileChanges benchmarks polling with actual file changes
func BenchmarkPoll_WithFileChanges(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 50)
	defer os.RemoveAll(tempDir)

	paths := []string{tempDir}
	callbackCount := 0
	callback := func() {
		callbackCount++
	}

	// Start polling
	go Poll(paths, callback)

	// Simulate file changes during benchmark
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Touch a file to trigger change detection
		testFile := filepath.Join(tempDir, "file_0.txt")
		now := time.Now()
		os.Chtimes(testFile, now, now)
		time.Sleep(400 * time.Millisecond) // Wait for poll cycle + processing
	}
	b.StopTimer()

	b.ReportMetric(float64(callbackCount), "callbacks")
}

// BenchmarkGetLatestModTime benchmarks the getLatestModTime function directly
func BenchmarkGetLatestModTime_SmallDir(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 10)
	defer os.RemoveAll(tempDir)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = getLatestModTime(tempDir)
	}
}

func BenchmarkGetLatestModTime_MediumDir(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 100)
	defer os.RemoveAll(tempDir)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = getLatestModTime(tempDir)
	}
}

func BenchmarkGetLatestModTime_LargeDir(b *testing.B) {
	tempDir := createTempDirWithFiles(b, 1000)
	defer os.RemoveAll(tempDir)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = getLatestModTime(tempDir)
	}
}

func BenchmarkGetLatestModTime_NestedDir(b *testing.B) {
	tempDir := createNestedDirStructure(b, 5, 20)
	defer os.RemoveAll(tempDir)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = getLatestModTime(tempDir)
	}
}

// Helper functions

func createTempDirWithFiles(b *testing.B, numFiles int) string {
	b.Helper()
	tempDir, err := os.MkdirTemp("", "poll_bench_*")
	if err != nil {
		b.Fatal(err)
	}

	for i := 0; i < numFiles; i++ {
		filePath := filepath.Join(tempDir, fmt.Sprintf("file_%d.txt", i))
		if err := os.WriteFile(filePath, []byte("test content"), 0644); err != nil {
			b.Fatal(err)
		}
	}

	return tempDir
}

func createNestedDirStructure(b *testing.B, depth int, filesPerDir int) string {
	b.Helper()
	tempDir, err := os.MkdirTemp("", "poll_bench_nested_*")
	if err != nil {
		b.Fatal(err)
	}

	createNestedDirs(b, tempDir, depth, filesPerDir)
	return tempDir
}

func createNestedDirs(b *testing.B, baseDir string, depth int, filesPerDir int) {
	b.Helper()
	if depth == 0 {
		return
	}

	// Create files in current directory
	for i := 0; i < filesPerDir; i++ {
		filePath := filepath.Join(baseDir, fmt.Sprintf("file_%d.txt", i))
		if err := os.WriteFile(filePath, []byte("test content"), 0644); err != nil {
			b.Fatal(err)
		}
	}

	// Create subdirectories
	for i := 0; i < 3; i++ {
		subDir := filepath.Join(baseDir, fmt.Sprintf("subdir_%d", i))
		if err := os.MkdirAll(subDir, 0755); err != nil {
			b.Fatal(err)
		}
		createNestedDirs(b, subDir, depth-1, filesPerDir)
	}
}
