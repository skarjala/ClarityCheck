console.log("Popup script loaded.");

// --- API Key Handling (adapted from options.js) ---

// Saves options to chrome.storage
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  const status = document.getElementById('status');

  if (!apiKey) {
    status.textContent = 'Please enter an API key.';
    status.style.color = 'red';
     setTimeout(() => {
        status.textContent = '';
        status.style.color = 'green'; // Reset color
      }, 1500);
    return;
  }

  chrome.storage.sync.set(
    { geminiApiKey: apiKey },
    () => {
       if (chrome.runtime.lastError) {
           console.error("Error saving API key:", chrome.runtime.lastError);
           status.textContent = 'Error saving key.';
           status.style.color = 'red';
       } else {
           status.textContent = 'API Key saved.';
           status.style.color = 'green';
           console.log('ClarityCheck: API Key saved via popup.');
           // Optionally change input back to password type after saving
           // document.getElementById('apiKey').type = 'password'; 
       }
       setTimeout(() => {
        status.textContent = '';
        status.style.color = 'green'; // Reset color
      }, 2000); // Longer timeout for feedback
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
            // Optionally allow seeing the key by default in popup?
           // apiKeyInput.type = 'text'; 
           console.log('ClarityCheck: API Key loaded in popup.');
       } else {
           console.log('ClarityCheck: No API Key found in storage.');
       }
    }
  );
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// Optional: Allow pressing Enter in the input field to save
document.getElementById('apiKey').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission (if any)
        saveOptions();
    }
});

// Add any popup-specific logic here 