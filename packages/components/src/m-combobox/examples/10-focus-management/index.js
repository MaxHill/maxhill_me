const focusDemo = document.getElementById('focus-demo');
const focusOutput = document.getElementById('focus-output');
const selectOutput = document.getElementById('select-output');

focusDemo.addEventListener('m-combobox-focus-change', (e) => {
  focusOutput.textContent = e.detail.option?.value || 'None';
});

focusDemo.addEventListener('m-combobox-change', (e) => {
  selectOutput.textContent = e.detail.selected.join(', ') || 'None';
});
