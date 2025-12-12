```
gRPC / HTTP2 / Raw TCP / Simulator
            |
            v
+-----------------------------+
|     REQUEST QUEUE           |
+-----------------------------+
            |
            v
+-----------------------------+
|      CORE PROCESSOR         |
|  (single-threaded, pure)    |
+-----------------------------+
            |
            v
Return response to caller (real or simulated)
```


# Type Definitions

## Core Entities

### 1. Request (RequestState)

**What it is:** A state machine representing a single HTTP request being processed.

**Type Definition:**
```go
type RequestState struct {
    ID           RequestID        // Unique identifier for deterministic ordering
    Step         int              // Current step in the state machine
    ResponseCh   chan Response    // Channel to send final response
    EffectResult *EffectResult    // Result from the last completed effect
    Handler      func(*Core, *RequestState) StepResult  // The business logic
}
```

**Description:**
Each request is a state machine that progresses through steps. When it needs IO, it calls an EffectActor and yields control. When the effect completes, the Core resumes the request at the next step with the result available in `EffectResult`.

**Handler returns:**
- `StepDone` - Request finished, send response
- `StepYield` - Waiting for effect to complete
- `StepContinue` - Continue processing (not currently used)

---

### 2. Core (Event Loop)

**What it is:** The single-threaded deterministic executor that processes all events.

**Type Definition:**
```go
type Core struct {
    mode             Mode                        // Simulation or Production
    currentTick      Tick                        // Logical time counter
    nextReqID        RequestID                   // ID generator for determinism
    
    // Two separate queues (like JavaScript)
    requestQueue     []NewRequestEvent           // New requests to start
    taskQueue        []EffectCompleteEvent       // Effect completions to resume
    
    // Active state
    activeRequests   map[RequestID]*RequestState // Requests currently processing
    
    // Production channels
    newRequestCh     chan NewRequestEvent        // Receives new HTTP requests
    effectCompleteCh chan EffectCompleteEvent    // Receives effect completions
    workSignal       chan struct{}               // Wakes up event loop
    
    rng              *rand.Rand                  // Seeded for determinism
}
```

**Description:**
The Core is a single-threaded event loop that processes one event per tick. It maintains two queues: one for new requests (higher priority) and one for effect completions (processed when no new requests). All business logic execution happens inside the Core, making it deterministic.

**Key Methods:**
- `Tick()` - Process one event from the queues
- `EnqueueRequest(handler)` - Add a new request
- `RunSimulation(maxTicks)` - Manual tick control for testing
- `RunProduction()` - Auto-tick when events arrive

---

### 3. EffectActor (Interface)

**What it is:** An abstraction for any IO operation (DB, HTTP, file system, etc).

**Type Definition:**
```go
type EffectActor interface {
    // Execute runs the effect and sends completion to core's task queue
    Execute(core *Core, reqID RequestID, input interface{})
}
```

**Description:**
An EffectActor encapsulates an IO operation. When called, it:
1. Spawns a goroutine to do the actual IO
2. Returns immediately (non-blocking)
3. When IO completes, sends an `EffectCompleteEvent` to Core's task queue
4. Core then resumes the request deterministically

**Example Implementation:**
```go
type DBReadEffect struct{}

func (e *DBReadEffect) Execute(core *Core, reqID RequestID, input interface{}) {
    go func() {
        // Do IO (real or simulated based on core.mode)
        result := database.Read(input)
        
        // Send result back to Core's task queue
        core.enqueueEffectComplete(reqID, EffectResult{
            Data: result,
            Err:  nil,
        })
        core.signalWork()
    }()
}
```

---

## Supporting Types

### 4. Events

**NewRequestEvent:**
```go
type NewRequestEvent struct {
    RequestID RequestID
    Handler   func(*Core, *RequestState) StepResult
}
```
Represents a new HTTP request entering the system. Goes to the request queue.

**EffectCompleteEvent:**
```go
type EffectCompleteEvent struct {
    RequestID RequestID
    Result    EffectResult
}
```
Represents an effect (IO operation) that has completed. Goes to the task queue.

---

### 5. EffectResult

**Type Definition:**
```go
type EffectResult struct {
    Data interface{}  // The result data
    Err  error        // Any error that occurred
}
```

**Description:**
The result returned from an EffectActor. Stored in `RequestState.EffectResult` when the Core resumes the request.

---

### 6. Response

**Type Definition:**
```go
type Response struct {
    Status int
    Body   string
}
```

**Description:**
The final HTTP response sent back to the client when a request completes.

---

## Summary

**Main entities:**
1. **Request** - State machine representing user's HTTP request
2. **Core** - Single-threaded event loop processing everything deterministically
3. **EffectActor** - Interface for IO operations that send results back to Core

**Supporting types:**
4. **Events** (NewRequestEvent, EffectCompleteEvent) - Things that happen
5. **EffectResult** - Data returned from effects
6. **Response** - Final output to user

**The flow:**
```
HTTP Request 
  → NewRequestEvent 
  → Core processes Request (handler runs)
  → Request calls EffectActor.Execute()
  → Request yields (StepYield)
  → Effect completes → EffectCompleteEvent → task queue
  → Core resumes Request with EffectResult
  → Request completes → sends Response
```
