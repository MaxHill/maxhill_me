document.querySelector('#example-required-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const outputEl = document.querySelector("#example-required-form-output");
  const formData = new FormData(e.target);
  if(outputEl){
    outputEl.textContent = JSON.stringify(Object.fromEntries(formData));
  }
});
