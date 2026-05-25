const emailInput = document.querySelector('#email-input');
const logList = document.querySelector('#log-list');

emailInput.addEventListener('m-invalid', (e) => {
  const li = document.createElement('li');
  li.textContent = `m-invalid: "${e.detail.validationMessage}"`;
  li.style.color = 'var(--color-destructive-fill-mid)';
  logList.appendChild(li);
});

emailInput.addEventListener('m-input-clear', (e) => {
  const li = document.createElement('li');
  li.textContent = `m-input-clear: Previous value was "${e.detail.value}"`;
  li.style.color = 'var(--color-neutral-fill-mid)';
  logList.appendChild(li);
});

emailInput.addEventListener('input', () => {
  if (emailInput.validity.valid && emailInput.value) {
    const li = document.createElement('li');
    li.textContent = 'Valid email entered';
    li.style.color = 'var(--color-success-fill-mid)';
    logList.appendChild(li);
  }
});
