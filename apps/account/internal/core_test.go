package internal_test

import (
	"account/internal"
	"testing"
)

func FuzzCore_Enqueue(f *testing.F) {
	f.Add(uint8(0))
	f.Add(uint8(1))
	f.Add(uint8(10))
	f.Add(uint8(100))
	f.Add(uint8(255))

	f.Fuzz(func(t *testing.T, numOps uint8) {
		core := internal.NewCore()
		successcount := 0

		for i := range numOps {
			request := internal.NewRequestEvent{
				RequestID: int64(i),
				Handler: func(*internal.RequestState) internal.RequestState {
					return internal.RequestState{}
				},
			}

			if core.Enqueue(request) {
				successcount++
			}
		}

		expectedSize := successcount
		if expectedSize > 100 {
			// should fail
		}

		if core.RequestQueueSize() != expectedSize {
			t.Errorf("Queue size = %d, want %d (after %d enqueues)",
				core.RequestQueueSize(), expectedSize, numOps)
		}

		if core.RequestQueueSize() > 100 {
			t.Errorf("Queue size %d, exceeded capacity 100", core.RequestQueueSize())
		}

	})
}

func FuzzCore_SimpleHandler(f *testing.F) {
    f.Add(uint8(5))
    
    f.Fuzz(func(t *testing.T, numRequests uint8) {
        if numRequests > 100 {
            numRequests = 100
        }
        
        core := internal.NewCore()
        channels := make([]chan *internal.Response, numRequests)
        
        for i := range numRequests {
            channels[i] = make(chan *internal.Response, 1)
            core.Enqueue(internal.NewRequestEvent{
                RequestID:  int64(i),
                ResponseCh: channels[i],  // Pass channel to event
                Handler: func(state *internal.RequestState) internal.RequestState {
                    state.Done(internal.Response{Status: 200, Body: "OK"})
                    return *state
                },
            })
        }
        
        for i := range numRequests {
            if !core.Tick() {
                t.Fatalf("Tick %d failed", i)
            }
            
            select {
            case resp := <-channels[i]:
                if resp.Status != 200 {
                    t.Errorf("Request %d: status %d, want 200", i, resp.Status)
                }
            default:
                t.Errorf("Request %d: no response", i)
            }
        }
    })
}
