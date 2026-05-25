document.querySelector('#comment-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const output = document.querySelector('#comment-output');
  output.textContent = 'Comment submitted: ' + JSON.stringify(Object.fromEntries(formData), null, 2);
});
