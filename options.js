// Saves options to chrome.storage
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  const status = document.getElementById('status');

  chrome.storage.sync.set(
    { geminiApiKey: apiKey },
    () => {
      // Update status to let user know options were saved.
      status.textContent = 'API Key saved.';
      console.log('ClarityCheck: API Key saved.');
      setTimeout(() => {
        status.textContent = '';
      }, 1500);
    }
  );
}

// Restores input state using the preferences stored in chrome.storage.
function restoreOptions() {
  const apiKeyInput = document.getElementById('apiKey');
  const status = document.getElementById('status');

  chrome.storage.sync.get(
    { geminiApiKey: '' }, // Default to empty string if not set
    (items) => {
       if (chrome.runtime.lastError) {
           console.error("Error retrieving API key:", chrome.runtime.lastError);
           status.textContent = 'Error loading key.';
           status.style.color = 'red';
       } else if (items.geminiApiKey) {
           apiKeyInput.value = items.geminiApiKey;
           console.log('ClarityCheck: API Key loaded.');
       } else {
           console.log('ClarityCheck: No API Key found in storage.');
       }
    }
  );
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions); 