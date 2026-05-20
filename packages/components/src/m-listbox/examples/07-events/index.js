const eventListbox = document.getElementById('event-listbox');
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

eventListbox.addEventListener('m-listbox-change', (e) => {
  logEvent(`m-listbox-change: [${e.detail.selected.join(', ') || 'none'}]`, 'var(--color-primary-fill-mid)');
});

eventListbox.addEventListener('m-listbox-select', (e) => {
  logEvent(`m-listbox-select: "${e.detail.option.value}"`, 'var(--color-success-fill-mid)');
});

eventListbox.addEventListener('m-listbox-unselected', (e) => {
  logEvent(`m-listbox-unselected: "${e.detail.option.value}"`, 'var(--color-destructive-fill-mid)');
});

eventListbox.addEventListener('m-listbox-focus-change', (e) => {
  const value = e.detail.item?.value || 'none';
  logEvent(`m-listbox-focus-change: "${value}"`, 'var(--color-neutral-fill-mid)');
});
