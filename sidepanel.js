// Side panel script for ClarityCheck
console.log("ClarityCheck side panel script loaded.");

const resultsDiv = document.getElementById('results');
const statusIndicatorDiv = document.createElement('div'); // Create a div for status
statusIndicatorDiv.id = 'claritycheck-sidepanel-status';
statusIndicatorDiv.style.marginBottom = '10px'; // Add some spacing
statusIndicatorDiv.style.padding = '5px 10px';
statusIndicatorDiv.style.borderRadius = '4px';
statusIndicatorDiv.style.display = 'inline-block'; // Make it inline-block

// Reading Mode Toggle Button
const readingModeButton = document.getElementById('reading-mode-toggle');
let currentTabId = null; // Store the active tab ID

// Get current tab ID when the panel loads
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
        currentTabId = tabs[0].id;
        console.log("Current tab ID for side panel:", currentTabId);
        // Optionally, ask content script for current reading mode state
        // chrome.tabs.sendMessage(currentTabId, { action: "getReadingModeState" }, (response) => {
        //     if (chrome.runtime.lastError) {
        //         console.log("Error getting reading mode state:", chrome.runtime.lastError.message);
        //     } else if (response?.isReadingModeActive) {
        //         readingModeButton?.classList.add('active');
        //     }
        // });
    } else {
        console.error("Could not get active tab ID.");
    }
});

// Prepend the status indicator div to the results container
if (resultsDiv && resultsDiv.parentNode) {
    resultsDiv.parentNode.insertBefore(statusIndicatorDiv, resultsDiv);
}

// Add click listener for Reading Mode Button
if (readingModeButton) {
    readingModeButton.addEventListener('click', () => {
        if (currentTabId) {
            const isActive = readingModeButton.classList.toggle('active');
            console.log(`Toggling reading mode ${isActive ? 'ON' : 'OFF'} for tab:`, currentTabId);
            chrome.tabs.sendMessage(currentTabId, { action: "toggleReadingMode", enable: isActive });
        } else {
            console.error("Cannot toggle reading mode: Tab ID not known.");
            // Maybe disable the button if tab ID is unknown
        }
    });
} else {
    console.error("Reading mode button not found.");
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in side panel:", message);

    if (message.action === "displayAnalysis") {
        if (resultsDiv && statusIndicatorDiv) {
            // Clear previous results
            resultsDiv.innerHTML = '';
            statusIndicatorDiv.textContent = 'Status: Unknown'; // Default text
            statusIndicatorDiv.style.backgroundColor = '#eee'; // Default color
            statusIndicatorDiv.style.color = '#333';

            // --- UPDATED --- Handle the structured data object
            const resultData = message.data;

            if (resultData) {
                // Update Status Indicator
                const status = resultData.status || 'neutral';
                statusIndicatorDiv.textContent = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
                switch (status) {
                    case 'green':
                        statusIndicatorDiv.style.backgroundColor = '#27ae60'; // Match indicator green
                        statusIndicatorDiv.style.color = 'white';
                        break;
                    case 'yellow':
                        statusIndicatorDiv.style.backgroundColor = '#f39c12'; // Match indicator yellow
                        statusIndicatorDiv.style.color = 'white';
                        break;
                    case 'red':
                        statusIndicatorDiv.style.backgroundColor = '#c0392b'; // Match indicator red
                        statusIndicatorDiv.style.color = 'white';
                        break;
                    default:
                        statusIndicatorDiv.style.backgroundColor = '#7f8c8d'; // Match indicator neutral
                        statusIndicatorDiv.style.color = 'white';
                        break;
                }

                // Display the main analysis summary
                const analysisContent = document.createElement('pre');
                analysisContent.style.whiteSpace = 'pre-wrap';
                analysisContent.textContent = resultData.analysis || "No analysis summary received.";
                resultsDiv.appendChild(analysisContent);

                // Display Findings (if any exist, even if parsing in background failed)
                if (resultData.findings && resultData.findings.length > 0) {
                    const findingsHeader = document.createElement('h3');
                    findingsHeader.textContent = 'Specific Findings:';
                    findingsHeader.style.marginTop = '15px';
                    resultsDiv.appendChild(findingsHeader);

                    const findingsList = document.createElement('ul');
                    findingsList.style.paddingLeft = '20px';
                    resultData.findings.forEach(finding => {
                        const item = document.createElement('li');
                        item.innerHTML = `<b>[${finding.category || 'N/A'}]</b>: "<i>${finding.quote || 'N/A'}</i>" - ${finding.explanation || 'N/A'}`;
                        item.style.marginBottom = '8px';
                        findingsList.appendChild(item);
                    });
                    resultsDiv.appendChild(findingsList);
                } else if (!resultData.analysis?.startsWith("Error:")) {
                    // If no findings and not an error message, state that none were identified
                    const noFindings = document.createElement('p');
                    noFindings.textContent = "No specific issues identified in the findings section.";
                    noFindings.style.fontStyle = 'italic';
                    resultsDiv.appendChild(noFindings);
                }

            } else {
                resultsDiv.innerHTML = '<p>Analysis failed or no data received.</p>';
                statusIndicatorDiv.textContent = 'Status: Error';
                statusIndicatorDiv.style.backgroundColor = '#e74c3c';
                statusIndicatorDiv.style.color = 'white';
            }
        } else {
            console.error("Could not find results/status divs in side panel.");
        }
    }
    return false; // Keep channel open only if expecting an async response (like in background script)
});

// Initial message (optional, could ask background for current status)
// resultsDiv.innerHTML = '<p>Ready to analyze. Select text and right-click, or click the page indicator.</p>'; 