package internal

// ------------------------------------------------------------------------
// Request
// ------------------------------------------------------------------------
type RequestStatus int

type RequestID = int64
type RequestState struct {
	ID         RequestID // Unique identifier for deterministic ordering
	ResponseCh chan *Response
	Handler    func(*RequestState) RequestState
	Response   *Response
}

func (requestState *RequestState) Done(response Response) {
	requestState.Response = &response
}

func (requestState *RequestState) IsDone() bool {
	if requestState.Response != nil {
		return true
	} else {
		return false
	}
}

type Response struct {
	Status int
	Body   string
}

type NewRequestEvent struct {
	RequestID  RequestID
	Handler    func(*RequestState) RequestState
	ResponseCh chan *Response
}

// ------------------------------------------------------------------------
// Effect
// ------------------------------------------------------------------------
type EffectCompleteEvent struct {
	RequestID RequestID
	Result    EffectResult
}
type EffectResult struct {
	Data any   // The result data
	Err  error // Any error that occurred
}

// ------------------------------------------------------------------------
// Core
// ------------------------------------------------------------------------
type Core struct {
	currentTick          int64 // Logical time counter
	requestQueue         *Queue[NewRequestEvent]
	effectCompletedQueue *Queue[EffectCompleteEvent]
}

func NewCore() Core {
	return Core{
		currentTick:          0,
		requestQueue:         NewQueue[NewRequestEvent](10000),
		effectCompletedQueue: NewQueue[EffectCompleteEvent](10000),
	}
}

func (core *Core) RequestQueueSize() int {
	return core.requestQueue.size
}

func (core *Core) RequestQueueCapacity() int {
	return core.requestQueue.cap
}

func (core *Core) Enqueue(request NewRequestEvent) bool {
	// Assert input
	result := core.requestQueue.Enqueue(request)
	return result
}

func (core *Core) Tick() bool {
	newRequest, hasValue := core.requestQueue.Dequeue()

	if !hasValue {
		return false
	}

	// TODO: remove allocation, local variable
	state := RequestState{
		ID:         newRequest.RequestID,
		ResponseCh: newRequest.ResponseCh,
		Handler:    newRequest.Handler,
	}

	if state.Handler != nil {
		state = state.Handler(&state)
	}

	if state.IsDone() && state.ResponseCh != nil {
		select {
		case state.ResponseCh <- state.Response:
			close(state.ResponseCh)
		default:
		}
	}

	return true
}

//  ------------------------------------------------------------------------
//  Datastructures
//  ------------------------------------------------------------------------

type Queue[T any] struct {
	buf  []T
	head int
	tail int
	size int
	cap  int
}

func NewQueue[T any](capacity int) *Queue[T] {
	return &Queue[T]{
		buf: make([]T, capacity),
		cap: capacity,
	}
}

func (q *Queue[T]) Enqueue(v T) bool {
	if q.size == q.cap {
		return false // full
	}
	q.buf[q.tail] = v
	q.tail = (q.tail + 1) % q.cap
	q.size++
	return true
}

func (q *Queue[T]) Dequeue() (T, bool) {
	if q.size == 0 {
		var zero T
		return zero, false
	}
	v := q.buf[q.head]
	q.head = (q.head + 1) % q.cap
	q.size--
	return v, true
}
