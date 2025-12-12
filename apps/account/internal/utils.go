package internal

import "fmt"

// assert checks a condition and panics with a message if false.
// Following TigerBeetle's TIGER_STYLE: "Assertions detect programmer errors.
// Unlike operating errors, which are expected and which must be handled,
// assertion failures are unexpected. The only correct way to handle corrupt
// code is to crash. Assertions downgrade catastrophic correctness bugs into
// liveness bugs."
func assert(condition bool, msg string) {
	if !condition {
		panic(msg)
	}
}

// assertf is like assert but with formatted message support.
func assertf(condition bool, format string, args ...interface{}) {
	if !condition {
		panic(fmt.Sprintf(format, args...))
	}
}
