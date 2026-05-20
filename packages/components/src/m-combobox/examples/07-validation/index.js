const validationForm = document.getElementById('validation-form');
const combobox = document.querySelector('[name="country"]');
const validationText = document.getElementById('validation-text');

combobox.addEventListener('m-invalid', (e) => {
  validationText.textContent = `Invalid: ${e.detail.validationMessage}`;
  validationText.style.color = 'var(--color-destructive-fill-mid)';
});

combobox.addEventListener('change', () => {
  if (combobox.value) {
    validationText.textContent = `Valid: "${combobox.value}" selected`;
    validationText.style.color = 'var(--color-success-fill-mid)';
  }
});

validationForm.addEventListener('submit', (e) => {
  e.preventDefault();
  validationText.textContent = 'Form submitted successfully!';
  validationText.style.color = 'var(--color-success-fill-mid)';
});
