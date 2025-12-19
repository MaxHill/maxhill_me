package tasks

import "log"

// ReloadBuildTask broadcasts reload events to connected browsers after successful builds
type ReloadBuildTask struct {
	broker *SSEBroker
}

// Build implements BuildTask interface - broadcasts reload to all connected browsers
func (r ReloadBuildTask) Build() BuildResult {
	buildResult := BuildResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	if r.broker == nil {
		// No broker means reload not configured (shouldn't happen)
		return buildResult
	}

	// Broadcast reload to all connected browsers
	r.broker.Broadcast("reload")
	log.Println("  ✓ Browser reload triggered")

	return buildResult
}

// NewReloadBuildStep creates a new reload build task with the given SSE broker
func NewReloadBuildStep(workDir string, isDev bool, broker *SSEBroker) (BuildTask, error) {
	return ReloadBuildTask{
		broker: broker,
	}, nil
}
