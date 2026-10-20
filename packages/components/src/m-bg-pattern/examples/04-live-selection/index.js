const graph = document.querySelector("#graph-live-demo");
document.querySelector("#graph-pattern-choice").addEventListener("change", (event) => {
  graph.pattern = event.target.value;
});
document.querySelector("#graph-size-choice").addEventListener("change", (event) => {
  graph.size = event.target.value;
});
