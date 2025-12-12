import { app } from "hyperapp"
import { view, type State } from "./app"

app<State>({
    init: { todos: [], value: "", data: null, pingResult: null },
    view: view,
    node: document.getElementById("app")!,
})
