# Fuzz Testing Guide

## Re-running with Known Seeds

### Method 1: Run a specific seed from the corpus

After fuzzing generates interesting test cases, they're stored in `testdata/fuzz/FuzzPoll2/`:

```bash
# Run all seed corpus cases
go test -v -run=FuzzPoll2

# Run a specific seed (e.g., seed#0)
go test -v -run=FuzzPoll2/seed#0
```

### Method 2: Re-run with specific values

You can create a test case with exact values:

```go
func TestPoll2_SpecificCase(t *testing.T) {
    // Test with: 5 initial files, 10 operations, seed 42
    // (Copy the FuzzPoll2 body and call it directly)
    initialFiles := uint8(5)
    numOperations := uint8(10)
    operationSeed := uint8(42)
    
    // ... rest of test logic from FuzzPoll2
}
```

### Method 3: Use the corpus file directly

If the fuzzer creates corpus files (when it finds failures), you can:

```bash
# List corpus files
ls testdata/fuzz/FuzzPoll2/

# Run specific corpus file
go test -run=FuzzPoll2 -fuzz=FuzzPoll2 -fuzztime=0 testdata/fuzz/FuzzPoll2/<specific_file>
```

### Method 4: Fuzz with minimum time to test seed corpus only

```bash
# Only run seed corpus without fuzzing
go test -run=FuzzPoll2
```

## Current Seed Corpus

The test includes these seed cases:
- `(5, 3, 42)` - 5 files, 3 operations
- `(10, 10, 99)` - 10 files, 10 operations  
- `(3, 20, 7)` - 3 files, 20 operations
- `(20, 5, 123)` - 20 files, 5 operations

## Debugging a Specific Scenario

To debug a specific scenario, add it to the seed corpus:

```go
f.Add(uint8(5), uint8(3), uint8(42))  // Your specific case
```

Then run:
```bash
go test -v -run=FuzzPoll2/seed#4  # If it's the 5th seed (0-indexed)
```

## Viewing Operation Sequences

Run with verbose logging to see all operations:

```bash
go test -v -run=FuzzPoll2 2>&1 | grep "Operation"
```

Example output:
```
Operation 0: Edited file_1.txt (expected callbacks: 1)
Operation 1: Edited file_4.txt (expected callbacks: 2)
Operation 2: Removed file_2.txt (expected callbacks: 3)
```

## Tips

- The `operationSeed` determines the sequence of operations (edit/add/remove)
- Same seed = same operation sequence (deterministic)
- To test a specific sequence, just add it to `f.Add()` and re-run
