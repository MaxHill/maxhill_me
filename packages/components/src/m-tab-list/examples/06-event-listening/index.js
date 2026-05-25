const eventTabs = document.getElementById('event-tabs');
const tabEventOutput = document.getElementById('tab-event-output');

eventTabs.addEventListener('m-tab-show', (e) => {
  tabEventOutput.textContent = `Tab shown: ${e.detail.tab.textContent} → Panel: ${e.detail.panel.name}`;
});

eventTabs.addEventListener('m-tab-hide', (e) => {
  console.log('Tab hidden:', e.detail.tab.textContent);
});
