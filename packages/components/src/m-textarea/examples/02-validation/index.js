const form = document.querySelector('#validation-form');
form.addEventListener('submit', function(e) {
  e.preventDefault();
  const outputEl = document.querySelector("#validation-form-output");
  const formData = new FormData(e.target);
  if(outputEl){
    outputEl.textContent = JSON.stringify(Object.fromEntries(formData), null, 2);
  }
});
