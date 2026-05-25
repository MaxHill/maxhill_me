document.querySelector('#wrap-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const output = document.querySelector('#wrap-output');
  output.textContent = JSON.stringify(Object.fromEntries(formData), null, 2);
});
