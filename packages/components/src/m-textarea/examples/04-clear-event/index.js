const textarea = document.querySelector('#clear-event-demo');
const output = document.querySelector('#clear-output');

textarea.addEventListener('m-textarea-clear', (e) => {
  output.textContent = 'Clear button clicked! Event can be prevented with e.preventDefault()';
});
