const eventCombobox = document.getElementById('event-combobox');
const eventLogList = document.getElementById('event-log-list');

function logEvent(message, color = 'var(--color-neutral-fill-mid)') {
  const li = document.createElement('li');
  li.textContent = message;
  li.style.color = color;
  eventLogList.prepend(li);
  if (eventLogList.children.length > 10) {
    eventLogList.removeChild(eventLogList.lastChild);
  }
}

eventCombobox.addEventListener('m-combobox-change', (e) => {
  logEvent(`m-combobox-change: [${e.detail.selected.join(', ') || 'none'}]`, 'var(--color-primary-fill-mid)');
});

eventCombobox.addEventListener('m-combobox-select', (e) => {
  logEvent(`m-combobox-select: "${e.detail.option.value}"`, 'var(--color-success-fill-mid)');
});

eventCombobox.addEventListener('m-combobox-unselected', (e) => {
  logEvent(`m-combobox-unselected: "${e.detail.option.value}"`, 'var(--color-destructive-fill-mid)');
});

eventCombobox.addEventListener('m-combobox-focus-change', (e) => {
  const value = e.detail.option?.value || 'none';
  logEvent(`m-combobox-focus-change: "${value}"`, 'var(--color-neutral-fill-mid)');
});
