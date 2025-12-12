#!/usr/bin/env bun
import { type Action } from 'hyperapp'
import { actions, type State } from "./src/main"

const clientState = JSON.parse('{"todos":[],"value":"test", "data":""}') as State;
const actionFn = actions.AddTodo;

console.log("Input state:", clientState);
const result = actionFn(clientState, undefined);
console.log("Result:", JSON.stringify(result, null, 2));
