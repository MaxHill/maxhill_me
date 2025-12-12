TODO:
- [ ] listbox skip attribute does not feel great as an api
- [ ] m-option maybe should emit clicked event?
- [ ] m-input submit using enter
- [ ] m-input: Error text not populating in test - possible timing issue with m-invalid event listener registration vs validation
- [ ] m-input: Implement internals.ariaInvalid setting for accessibility (currently null)
- [ ] Listbox label and error state like input



bun simulator.ts \
              '{"todos":[],"value":"test", "data":""}' \
              '{"type":"AddTodo"}' \
              '{"param1":""}' |jq
{
  "state": {
    "todos": [
      "test"
    ],
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
  "html": "<main><h1>To do list</h1><input type=\"text\" value=\"\"/><ul><li>test</li></ul><button>New!</button><button>Fetch Data</button><pre>test-chainging</pre></main>"
}

