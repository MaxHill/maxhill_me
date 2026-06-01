package utils

import "log"

func Assert(condition bool, format string, args ...any) {
	if !condition {
		log.Fatalf(format, args...)
	}
}
