#!/usr/bin/env bun
import { type Action, type Effect, type Dispatchable } from 'hyperapp'
import { actions, type State } from "./src/app"

const clientState = JSON.parse('{"todos":[],"value":"test", "data":""}') as State;

const actionFn = actions.AddTodo;
const result = actionFn(clientState, undefined);

console.log("Action result:", result);
console.log("\nEffect types:");
if (Array.isArray(result)) {
    const [_, ...effects] = result;
    effects.forEach((effect, i) => {
        console.log(`Effect ${i}:`, {
            isArray: Array.isArray(effect),
            length: Array.isArray(effect) ? effect.length : 'N/A',
            type: typeof effect,
            value: effect
        });
    });
}
