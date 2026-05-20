const form = document.getElementById('fruit-form');
const resultText = document.getElementById('form-result-text');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  resultText.textContent = JSON.stringify(data, null, 2);
});
