document.querySelector('#feedback-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const output = document.querySelector('#feedback-output');
  output.textContent = 'Feedback submitted: ' + JSON.stringify(Object.fromEntries(formData), null, 2);
});
