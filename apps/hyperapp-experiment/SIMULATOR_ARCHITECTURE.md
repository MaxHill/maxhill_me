# Hyperapp Simulator Architecture

## Overview

The simulator executes Hyperapp actions server-side (in Bun) and returns:
1. The final state after all synchronous actions
2. Serialized effect descriptors for side effects that need to run in Go
3. Rendered HTML

## Effect Types

### Synchronous Actions
These are executed immediately in the simulator:
```typescript
[actions.SetData, "some data"]  // [Action, Payload]
[actions.FetchData]             // [Action] with no payload
```

### Side Effects (Effecters)
These are collected and returned as descriptors:
```typescript
[fetchJson, { url: "...", action: actions.SetData }]  // [Effecter, Options]
```

## Creating Reusable Effecters

```typescript
// Define the effecter with typed options
const fetchJson = (dispatch: Dispatch<State>, options: { url: string, action: any }) => {
    fetch(options.url)
        .then(response => response.json())
        .then(data => dispatch(options.action, data))
}

// Use in actions
const FetchData = (state: State): [State, any] => [
    state,
    [fetchJson, { 
        url: 'https://api.example.com/data',
        action: actions.SetData
    }]
]

// Export for registration
export const effecters = {
    fetchJson
}
```

## Simulator Output

```json
{
  "state": {
    "todos": ["test"],
    "value": "",
    "data": "test-chainging"
  },
  "pendingEffects": [
    {
      "name": "fetchJson",
      "params": {
        "url": "https://jsonplaceholder.typicode.com/todos/1",
        "action": "SetData"
      }
    }
  ],
  "html": "<main>...</main>"
}
```

## Go Integration

Your Go code should:

1. **Execute the simulator**:
   ```go
   output := exec.Command("bun", "simulator.ts", stateJSON, actionJSON, paramsJSON)
   ```

2. **Parse the output**:
   ```go
   type SimulatorOutput struct {
       State          map[string]interface{}
       PendingEffects []EffectDescriptor
       HTML           string
   }
   ```

3. **Execute each effect**:
   ```go
   for _, effect := range output.PendingEffects {
       switch effect.Name {
       case "fetchJson":
           data := httpGet(effect.Params["url"])
           // Dispatch effect.Params["action"] with data
       }
   }
   ```

## Type Safety

The simulator uses:
- Type guards to distinguish actions from effecters
- WeakSet registry for known effecters
- Function name heuristics (functions with "Effect" in name)
- Serialization of action references to their names

## TigerBeetle-Inspired Design

This follows TigerBeetle's separation of concerns:
- **Control Plane** (Simulator): Decides what should happen
- **Data Plane** (Go): Actually executes side effects

Benefits:
- Server-side rendering with effects
- Testable action logic without mocking fetch/network
- Single source of truth for application logic
- Effects can be rate-limited, queued, or batched in Go
