const eventCopy = document.getElementById('event-copy');
const copyEventOutput = document.getElementById('copy-event-output');

eventCopy.addEventListener('copy-success', (e) => {
  copyEventOutput.textContent = `✓ Copied: "${e.detail.value}"`;
});

eventCopy.addEventListener('copy-error', (e) => {
  copyEventOutput.textContent = `✗ Error: ${e.detail.error.message}`;
});
