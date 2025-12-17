# Poll FS Benchmarks

This directory contains benchmarks for the filesystem polling mechanism used in the build system.

## Running Benchmarks

### Run all benchmarks
```bash
go test -bench=. -benchmem -benchtime=3s -run=^$
```

### Run specific benchmarks
```bash
# Test getLatestModTime performance with different directory sizes
go test -bench=BenchmarkGetLatestModTime -benchmem -benchtime=3s -run=^$

# Test Poll function with file changes
go test -bench=BenchmarkPoll_WithFileChanges -benchmem -benchtime=10x -run=^$
```

### Generate benchmark comparison
```bash
# Save baseline results
go test -bench=. -benchmem -benchtime=3s -run=^$ > old.txt

# After implementing new version, save new results
go test -bench=. -benchmem -benchtime=3s -run=^$ > new.txt

# Compare using benchstat (install with: go install golang.org/x/perf/cmd/benchstat@latest)
benchstat old.txt new.txt
```

## Benchmark Descriptions

### `BenchmarkGetLatestModTime_*`
These benchmarks test the performance of walking a directory tree and finding the latest modification time:
- **SmallDir**: 10 files
- **MediumDir**: 100 files
- **LargeDir**: 1,000 files
- **NestedDir**: Deeply nested structure with ~2,000 files across multiple levels

### `BenchmarkPoll_WithFileChanges`
Tests the full polling mechanism including:
- File system walking
- Change detection
- Callback invocation

Use `-benchtime=10x` to test 10 file changes (or adjust as needed).

## Expected Performance (M4 Pro)

Current implementation (`Poll` with `getLatestModTime`):
```
BenchmarkGetLatestModTime_SmallDir-12     	   13322	     89249 ns/op	    6312 B/op	      54 allocs/op
BenchmarkGetLatestModTime_MediumDir-12    	    4538	    265505 ns/op	   47723 B/op	     417 allocs/op
BenchmarkGetLatestModTime_LargeDir-12     	     499	   2266556 ns/op	  452987 B/op	    4024 allocs/op
BenchmarkGetLatestModTime_NestedDir-12    	      21	  49386889 ns/op	 1985958 B/op	   14467 allocs/op
```

**Key takeaway**: Performance degrades significantly with nested directories (~50ms per poll cycle for realistic project structure).

## Tips for New Implementation

1. Consider using OS-level file watching APIs (fsnotify) instead of polling
2. If polling, cache file paths to avoid repeated directory walks
3. Use goroutines carefully - file system operations are I/O bound
4. Profile with real project directories for accurate measurements

## Profiling

To generate CPU and memory profiles:
```bash
go test -bench=BenchmarkGetLatestModTime_NestedDir -benchmem -cpuprofile=cpu.prof -memprofile=mem.prof -run=^$
go tool pprof -http=:8080 cpu.prof
```
