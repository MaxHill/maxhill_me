const focusDemo = document.getElementById('focus-demo');
const focusOutput = document.getElementById('focus-output');
const selectOutput = document.getElementById('select-output');

focusDemo.addEventListener('m-listbox-focus-change', (e) => {
  focusOutput.textContent = e.detail.item?.value || 'None';
});

focusDemo.addEventListener('m-listbox-change', (e) => {
  selectOutput.textContent = e.detail.selected.join(', ') || 'None';
});
