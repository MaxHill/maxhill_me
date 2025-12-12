import './style.css'
import { h, text, type Dispatch } from "hyperapp"
import { pingServer } from './grpc-client'

export type State = {
    todos: string[]; value: any; data: string | null; pingResult: number | null
}

// Effecter functions - reusable effecters with options
const fetchJson = (dispatch: Dispatch<State>, options: { url: string, action: any }) => {
    fetch(options.url)
        .then(response => response.json())
        .then(data => dispatch(options.action, JSON.stringify(data, null, 2)))
}

const grpcPing = (dispatch: Dispatch<State>, options: { pingValue: number, action: any }) => {
    pingServer(options.pingValue)
        .then(result => dispatch(options.action, result))
        .catch(err => console.error('gRPC ping failed:', err))
}

// Actions object - define all actions here to avoid TDZ issues
export const actions = {
    SetData: (state: State, data: string) => ({
        ...state,
        data,
    }),
    
    SetPingResult: (state: State, result: number) => ({
        ...state,
        pingResult: result,
    }),
    
    NewValue: (state: State, event: Event) => ({
        ...state,
        value: (event.target as HTMLInputElement)?.value,
    }),
    
    FetchData: (state: State): [State, any] => [
        state,
        [fetchJson, { 
            url: 'https://jsonplaceholder.typicode.com/todos/1',
            action: actions.SetData
        }]
    ],
    
    DoPing: (state: State): [State, any] => [
        state,
        [grpcPing, {
            pingValue: 42,
            action: actions.SetPingResult
        }]
    ],
    
    AddTodo: (state: State) => [{
        ...state,
        value: "",
        todos: state.todos.concat(state.value),
    },
    [actions.SetData, "test-chainging"],
    [actions.FetchData]
    ],
}

// Export effecters for registration in simulator
export const effecters = {
    fetchJson,
    grpcPing
}

// Export for backwards compatibility
export const { AddTodo, NewValue } = actions


// View
export const view = ({ todos, value, data, pingResult }: State) =>
    h<State>("main", {}, [
        h<State>("h1", {}, text("To do list")),
        h<State>("input", { type: "text", oninput: actions.NewValue, value }),
        h<State>("ul", {},
            todos.map((todo) => h<State>("li", {}, text(todo)))
        ),
        h<State>("button", { onclick: actions.AddTodo }, text("New!")),
        h<State>("button", { onclick: actions.FetchData }, text("Fetch Data")),
        h<State>("button", { onclick: actions.DoPing }, text("Ping gRPC Server")),
        ...(pingResult !== null ? [h<State>("div", {}, text(`Ping result: ${pingResult}`))] : []),
        ...(data ? [h<State>("pre", {}, text(data))] : []),
    ])
