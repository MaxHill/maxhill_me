const validationForm = document.getElementById('validation-form');
const requiredListbox = document.getElementById('required-listbox');
const validationText = document.getElementById('validation-text');

requiredListbox.addEventListener('m-invalid', (e) => {
  validationText.textContent = `Invalid: ${e.detail.validationMessage}`;
  validationText.style.color = 'var(--color-destructive-fill-mid)';
});

requiredListbox.addEventListener('change', () => {
  if (requiredListbox.value) {
    validationText.textContent = `Valid: "${requiredListbox.value}" selected`;
    validationText.style.color = 'var(--color-success-fill-mid)';
  }
});

validationForm.addEventListener('submit', (e) => {
  e.preventDefault();
  validationText.textContent = 'Form submitted successfully!';
  validationText.style.color = 'var(--color-success-fill-mid)';
});
