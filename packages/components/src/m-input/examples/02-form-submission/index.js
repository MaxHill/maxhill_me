document.querySelector('#demo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  document.querySelector('#demo-output-text').textContent =
    JSON.stringify(data, null, 2);
});
