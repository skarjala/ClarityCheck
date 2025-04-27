// Content script for ClarityCheck
console.log("ClarityCheck content script loaded.");

// Function to attempt extraction of main page content
function extractMainContent() {
    console.log("Attempting to extract main content...");
    let mainContentElement = document.querySelector('article') || document.querySelector('main');
    let textContent = '';

    if (mainContentElement) {
        // Try to get text, excluding certain elements like nav, headers, footers if nested
        // This is a simple approach; more robust parsing might be needed
        const irrelevantSelectors = 'nav, header, footer, aside, script, style, [aria-hidden="true"]';
        const clones = mainContentElement.cloneNode(true);
        clones.querySelectorAll(irrelevantSelectors).forEach(el => el.remove());
        textContent = clones.innerText || clones.textContent;
    } else {
        // Fallback: If no <article> or <main>, try taking the whole body
        // This is less ideal as it includes menus, ads, etc.
        console.warn("ClarityCheck: Could not find <article> or <main> element. Falling back to body. Text quality may vary.");
        textContent = document.body.innerText || document.body.textContent;
    }

    // Basic cleaning (remove excessive whitespace)
    textContent = textContent.replace(/\s{2,}/g, ' \n').trim(); // Replace multiple spaces/newlines with single space or newline

    console.log(`Extracted content length: ${textContent.length} characters.`);
    // Limit content length if necessary (Gemini has input limits)
    // const MAX_LENGTH = 15000; // Example limit - adjust as needed
    // if (textContent.length > MAX_LENGTH) {
    //     textContent = textContent.substring(0, MAX_LENGTH) + "... [Content Truncated]";
    //     console.log(`Content truncated to ${MAX_LENGTH} characters.`);
    // }

    return textContent;
}

let customPanel = null;
// REVERT: Keep old names where applicable, add new ones
let panelHeader = null;
let panelContent = null;
let panelStatusIndicator = null; // NEW span for status
let panelLeaningIndicator = null; // NEW span for leaning
let panelResultsDiv = null;
let panelReadingModeButton = null;
let floatingIndicator = null; // Keep this
let isReadingModeActive = false; // Keep this
let originalStyles = {}; // Keep this

// --- Function to Create the Custom Overlay Panel --- REVERTED STRUCTURE
function createCustomPanel() {
    if (document.getElementById('claritycheck-custom-panel')) return; // Already created

    console.log("Creating ClarityCheck custom panel (iOS Style)...");

    customPanel = document.createElement('div');
    customPanel.id = 'claritycheck-custom-panel';
    customPanel.classList.add('claritycheck-panel-hidden'); // Start hidden

    // Basic Inner Structure (iOS Style) - REMOVED static leaning indicator
    customPanel.innerHTML = `
        <div class="claritycheck-panel-header">
            <span id="claritycheck-panel-status-indicator" class="claritycheck-panel-status-indicator status-neutral">Neutral</span> <!-- NEW Status Indicator -->
            <h1 class="claritycheck-panel-title">ClarityCheck</h1>
            <button id="claritycheck-reading-mode-toggle" class="claritycheck-panel-button" title="Toggle Clarity Reading Mode">
                 <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                 <!-- Removed text span -->
             </button>
            <button id="claritycheck-panel-close" class="claritycheck-panel-button" title="Close Panel">
                 <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
             </button>
        </div>
        <div class="claritycheck-panel-content">
             <!-- REMOVED STATIC: <div id="claritycheck-panel-leaning-indicator" class="claritycheck-panel-leaning-indicator">Leaning: Unknown</div> -->
             <div id="claritycheck-panel-results">
                 <p>Click the indicator or select text to analyze.</p>
             </div>
        </div>
    `;

    document.body.appendChild(customPanel);

    // Get references to inner elements
    panelHeader = customPanel.querySelector('.claritycheck-panel-header');
    panelContent = customPanel.querySelector('.claritycheck-panel-content');
    panelResultsDiv = customPanel.querySelector('#claritycheck-panel-results');
    panelStatusIndicator = customPanel.querySelector('#claritycheck-panel-status-indicator'); // NEW ref
    panelReadingModeButton = customPanel.querySelector('#claritycheck-reading-mode-toggle');
    const closeButton = customPanel.querySelector('#claritycheck-panel-close');

    // Add listeners for panel buttons
    closeButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideCustomPanel();
    });
    panelReadingModeButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        isReadingModeActive = !isReadingModeActive; // Use correct state variable
         if (isReadingModeActive) {
             panelReadingModeButton.classList.add('active');
             applyReadingMode();
         } else {
             panelReadingModeButton.classList.remove('active');
             removeReadingMode();
         }
    });

    console.log("ClarityCheck custom panel created (iOS Style).");

    // Make panel draggable (optional, add if needed)
    // makeDraggable(customPanel);
}

// --- Functions to Show/Hide Custom Panel --- REVERTED TO CLASSES
function showCustomPanel() {
    if (customPanel) {
        customPanel.classList.remove('claritycheck-panel-hidden');
        customPanel.classList.add('claritycheck-panel-visible');
    }
}

function hideCustomPanel() {
    if (customPanel) {
        customPanel.classList.add('claritycheck-panel-hidden');
        customPanel.classList.remove('claritycheck-panel-visible');
    }
}

// --- Modify Floating Indicator Click --- UPDATED
function createFloatingIndicator() {
    floatingIndicator = document.createElement('div'); // Assign to global ref
    floatingIndicator.id = 'claritycheck-indicator';
    floatingIndicator.classList.add('claritycheck-indicator', 'status-neutral');

    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    floatingIndicator.innerHTML = `<img src="${iconUrl}" alt="ClarityCheck Status" width="28" height="28">`;

    floatingIndicator.addEventListener('click', () => {
        console.log('ClarityCheck indicator clicked!');
        // Toggle the custom panel visibility using classes
        if (customPanel && customPanel.classList.contains('claritycheck-panel-visible')) {
            hideCustomPanel();
        } else {
            if (!customPanel) createCustomPanel(); // Ensure panel exists
            showCustomPanel();
            // If panel results are default, trigger analysis
            if (panelResultsDiv && panelResultsDiv.textContent.includes("Click the indicator")) {
                 updateIndicatorStatus('neutral'); // Update floating indicator color
                 // Update NEW panel status indicator text
                 if (panelStatusIndicator) {
                     panelStatusIndicator.textContent = "Analyzing...";
                     panelStatusIndicator.className = 'claritycheck-panel-status-indicator claritycheck-status-analyzing'; // Add analyzing class
                 }
                 if (panelResultsDiv) panelResultsDiv.innerHTML = "<p><i>Analyzing page content...</i></p>";
                 const pageContent = extractMainContent();
                 if (pageContent) {
                     console.log('Sending page content to background for analysis.');
                     chrome.runtime.sendMessage({ action: "analyzePageContent", content: pageContent });
                 } else {
                     console.warn("ClarityCheck: No content extracted to analyze.");
                      if(panelResultsDiv) panelResultsDiv.textContent = "Could not extract content.";
                      if(panelStatusIndicator) {
                          panelStatusIndicator.textContent = "Error";
                          panelStatusIndicator.className = 'claritycheck-panel-status-indicator status-red'; // Error class
                      }
                 }
            }
        }
    });

    document.body.appendChild(floatingIndicator);
    console.log("ClarityCheck indicator added to page.");
    // Create the panel itself, but hidden, when indicator is created
    createCustomPanel();
}

// --- Function to Update Indicator Status --- (Updates floating button)
function updateIndicatorStatus(status) {
    const indicator = document.getElementById('claritycheck-indicator');
    if (indicator) {
        console.log(`Updating floating indicator status to: ${status}`);
        indicator.classList.remove('status-neutral', 'status-green', 'status-yellow', 'status-red');
        if (['green', 'yellow', 'red'].includes(status)) {
            indicator.classList.add(`status-${status}`);
        } else {
            indicator.classList.add('status-neutral');
        }
    }
}

// Ensure the DOM is ready before adding the indicator
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingIndicator);
} else {
    createFloatingIndicator(); // DOM is already ready
}

// --- Reading Mode Logic ---

function getMainContentElement() {
    // Helper to find the primary content container (reuse extraction logic idea)
    return document.querySelector('article') || document.querySelector('main') || document.body; // Fallback needed
}

function applyReadingMode() {
    if (isReadingModeActive) return; // Already active
    console.log("Applying Clarity Reading Mode");

    const body = document.body;
    const contentElement = getMainContentElement();

    // Add a class to the body to scope styles and track state
    body.classList.add('claritycheck-reading-mode-active');

    // Hide all direct children of body initially
    for (const child of body.children) {
        // Don't hide the ClarityCheck elements or the main content itself (if it's a direct child)
        if (child.id !== 'claritycheck-indicator' && child !== contentElement && !child.classList.contains('claritycheck-hover-card')) {
            child.style.display = 'none'; // Simple hiding
        }
    }

    // If the content element wasn't a direct child, ensure its parents up to body are visible
    // This is tricky and might not work perfectly on all sites.
    let current = contentElement.parentElement;
    while (current && current !== body) {
        current.style.display = 'block'; // Or revert to original display?
        // Ensure siblings of the path are hidden (might require more specific selectors)
        for (const sibling of current.parentElement?.children || []) {
             if (sibling !== current && sibling.id !== 'claritycheck-indicator' && !sibling.contains(contentElement) && !sibling.classList.contains('claritycheck-hover-card')) {
                 sibling.style.display = 'none';
             }
         }
        current = current.parentElement;
    }

    // Apply styles to the content element (basic centering example)
    if (contentElement !== body) {
        contentElement.style.display = 'block'; // Ensure it's visible
        contentElement.style.maxWidth = '800px'; // Limit width
        contentElement.style.margin = '20px auto'; // Center it
        contentElement.style.padding = '20px';
        contentElement.style.backgroundColor = '#fff'; // Ensure white background
        contentElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)'; // Add subtle shadow
    }

    isReadingModeActive = true;
    console.log("Reading Mode Applied.");
}

function removeReadingMode() {
    if (!isReadingModeActive) return; // Not active
    console.log("Removing Clarity Reading Mode");

    const body = document.body;
    body.classList.remove('claritycheck-reading-mode-active');

    // Show all direct children of body again (simplistic revert)
    for (const child of body.children) {
        child.style.display = ''; // Remove inline style to potentially revert
    }

    // Remove specific styles applied to the content element
    const contentElement = getMainContentElement();
    if (contentElement !== body) {
        contentElement.style.maxWidth = '';
        contentElement.style.margin = '';
        contentElement.style.padding = '';
        contentElement.style.backgroundColor = '';
        contentElement.style.boxShadow = '';
        contentElement.style.display = ''; // Also revert display
    }

    // Reverting visibility for nested elements is complex, this simple approach might leave some hidden.

    isReadingModeActive = false;
    console.log("Reading Mode Removed.");
}


// --- MODIFIED Listener for Messages --- UPDATED FOR SCORE & BAR
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in content script:", message);

    if (message.action === "displayAnalysisInCustomPanel") {
        // Ensure panel exists
        if (!customPanel) createCustomPanel();

        // Update floating indicator color
        updateIndicatorStatus(message.data?.status || 'neutral');

        // Update the custom panel's content using NEW structure
        if (panelStatusIndicator && panelResultsDiv) {
            const resultData = message.data;
            // Clear ONLY results div, keep leaning bar container if it exists
            panelResultsDiv.innerHTML = ''; 

            // --- Get or Create the Info Bars Container --- 
            let barsContainer = panelContent.querySelector('.claritycheck-info-bars-container');
            if (!barsContainer) {
                barsContainer = document.createElement('div');
                barsContainer.className = 'claritycheck-info-bars-container';
                // Insert bars container before the results div
                panelContent.insertBefore(barsContainer, panelResultsDiv);
            } else {
                barsContainer.innerHTML = ''; // Clear previous bars
            }

            if (resultData) {
                // Update Status Indicator (in header)
                const status = resultData.status || 'neutral';
                panelStatusIndicator.textContent = `${status.charAt(0).toUpperCase() + status.slice(1)}`;
                panelStatusIndicator.className = `claritycheck-panel-status-indicator status-${status}`;

                // --- Political Leaning Bar --- 
                const score = resultData.politicalLeaningScore;
                const leaningText = resultData.politicalLeaning || 'Unknown';
                const leaningSpectrum = leaningText.replace(/\s*-.*/, '').trim(); // Extract only the spectrum part (e.g., "Left-leaning")

                const politicalBarContainer = document.createElement('div');
                politicalBarContainer.className = 'claritycheck-bar-container claritycheck-bar-political';

                if (score !== null && score !== undefined && leaningSpectrum !== 'Not Applicable') {
                    const barLabel = document.createElement('span');
                    barLabel.className = 'claritycheck-bar-label';
                    // SIMPLIFIED LABEL: Use only the spectrum
                    barLabel.textContent = leaningSpectrum;
                    politicalBarContainer.appendChild(barLabel);

                    const barWrapper = document.createElement('div');
                    barWrapper.className = 'claritycheck-bar-wrapper';

                    const barGradient = document.createElement('div');
                    barGradient.className = 'claritycheck-bar-gradient';
                    barWrapper.appendChild(barGradient);

                    const barIndicator = document.createElement('div');
                    barIndicator.className = 'claritycheck-bar-indicator';
                    const leftPercentage = ((score + 100) / 200) * 100;
                    barIndicator.style.left = `${Math.max(0, Math.min(100, leftPercentage))}%`;
                    barIndicator.title = `Score: ${score}\n(${leaningText})`; // Keep full info in tooltip
                    barWrapper.appendChild(barIndicator);

                    politicalBarContainer.appendChild(barWrapper);

                    // --- NEW: Add Percentage Display --- 
                    const percentageDisplay = document.createElement('div');
                    percentageDisplay.className = 'claritycheck-bar-percentage';
                    const percentageValue = Math.round((score + 100) / 2);
                    percentageDisplay.textContent = `${percentageValue}%`;
                    politicalBarContainer.appendChild(percentageDisplay);
                    // --- END NEW --- 

                } else {
                    // If score is N/A or missing, display textually or hide
                    politicalBarContainer.classList.add('not-applicable');
                    const barLabel = document.createElement('span');
                    // Use the simplified spectrum text here too for consistency
                    barLabel.className = 'claritycheck-bar-label not-applicable-text'; 
                    barLabel.textContent = leaningSpectrum; // e.g., "Not Applicable"
                    politicalBarContainer.appendChild(barLabel);
                }
                barsContainer.appendChild(politicalBarContainer);

                // Summary (in results div)
                const summary = document.createElement('p');
                summary.className = 'claritycheck-panel-summary';
                summary.textContent = resultData.analysis || "No analysis summary.";
                panelResultsDiv.appendChild(summary);

                // Findings (in results div)
                if (resultData.findings && resultData.findings.length > 0) {
                    const findingsHeader = document.createElement('h3');
                    findingsHeader.textContent = 'Specific Findings:';
                    findingsHeader.className = 'claritycheck-panel-findings-title';
                    panelResultsDiv.appendChild(findingsHeader);
                    const findingsList = document.createElement('ul');
                    findingsList.className = 'claritycheck-panel-findings-list';
                    resultData.findings.forEach(f => {
                        const item = document.createElement('li');
                        const category = f.category || 'Info';
                        const quote = f.quote || '';
                        const explanation = f.explanation || 'No details.';
                        // Render suggestion if available
                        const suggestionHTML = f.suggestion ? `<span class="claritycheck-finding-suggestion"> {Suggestion: ${f.suggestion}}</span>` : '';
                        item.innerHTML = `<b>[${category}]</b> ${quote ? `"<i>${quote}</i>" - ` : ''}${explanation}${suggestionHTML}`;
                        findingsList.appendChild(item);
                    });
                    panelResultsDiv.appendChild(findingsList);

                    applyHighlights(resultData.findings);
                } else {
                   clearHighlights();
                   if (!resultData.analysis?.startsWith("Error:")) {
                      const noFindings = document.createElement('p');
                      noFindings.textContent = "No specific issues identified.";
                      noFindings.style.fontStyle = 'italic';
                      panelResultsDiv.appendChild(noFindings);
                   }
                }

            } else {
                // Error state 
                panelStatusIndicator.textContent = "Error";
                panelStatusIndicator.className = 'claritycheck-panel-status-indicator status-red';
                // Clear bars on error
                barsContainer.innerHTML = '<p style="font-style: italic; color: #c0392b;">Could not load analysis details.</p>'; 
                // Clear results div as well
                panelResultsDiv.textContent = "Failed to get analysis data.";
                clearHighlights();
            }

        } else {
            console.error("Custom panel elements (status indicator or results div) not found!");
        }
        // Make sure panel is visible when analysis comes in
        showCustomPanel();

    } else if (message.action === "toggleReadingMode") {
       console.log("Reading mode toggle message received (now handled internally)");
       // Ensure button reference is correct
       if (panelReadingModeButton) {
            // Sync button state with message if needed (e.g., from popup)
            if (message.enable && !panelReadingModeButton.classList.contains('active')) {
                isReadingModeActive = true;
                panelReadingModeButton.classList.add('active');
                applyReadingMode();
            } else if (!message.enable && panelReadingModeButton.classList.contains('active')) {
                isReadingModeActive = false;
                panelReadingModeButton.classList.remove('active');
                removeReadingMode();
            }
       }
    }
    // --- Handler for Claim Verification Loading State ---
    else if (message.action === "showClaimVerificationLoading") {
        // Ensure panel exists
        if (!customPanel) createCustomPanel();
        if (panelStatusIndicator) {
            panelStatusIndicator.textContent = "Verifying...";
            panelStatusIndicator.className = 'claritycheck-panel-status-indicator claritycheck-status-analyzing';
        }
        // Clear previous results and bars
        const barsContainer = panelContent?.querySelector('.claritycheck-info-bars-container');
        if (barsContainer) barsContainer.innerHTML = '';
        panelContent?.classList.remove('claritycheck-has-bars');
        clearHighlights();
        updateIndicatorStatus('neutral');
        if (panelResultsDiv) {
            panelResultsDiv.innerHTML = '<div class="claritycheck-loading"><div class="claritycheck-spinner"></div><div>Verifying claim with web search&hellip;</div></div>';
        }
        showCustomPanel();
    }
    // --- RE-ADD handler for Claim Verification display
    else if (message.action === "displayClaimVerification") {
        // Ensure panel exists
        if (!customPanel) createCustomPanel();
        
        // Update status indicator (Neutral/Info for verification)
        if (panelStatusIndicator) {
            panelStatusIndicator.textContent = "Verification";
            panelStatusIndicator.className = 'claritycheck-panel-status-indicator status-neutral';
        }
        // Clear previous analysis content (like political bar)
        const barsContainer = panelContent?.querySelector('.claritycheck-info-bars-container');
        if (barsContainer) barsContainer.innerHTML = ''; // Remove bars
        panelContent?.classList.remove('claritycheck-has-bars');
        clearHighlights(); // Clear any previous text highlights
        updateIndicatorStatus('neutral'); // Set floating indicator to neutral
        
        if (panelResultsDiv) {
            panelResultsDiv.innerHTML = ''; // Clear previous results
            const resultData = message.data;
            
            if (resultData?.error) {
                 // Display error message
                 panelResultsDiv.innerHTML = `<p class="claritycheck-panel-error">Error verifying claim: ${resultData.error}</p>`;
                 if (panelStatusIndicator) { // Update status to red on error
                     panelStatusIndicator.textContent = "Error";
                     panelStatusIndicator.className = 'claritycheck-panel-status-indicator status-red';
                 }
                 updateIndicatorStatus('red'); // Update floating indicator
            } else if (resultData?.sources && Array.isArray(resultData.sources)) {
                 // Display the sources
                 const header = document.createElement('h3');
                 header.textContent = 'Claim Verification Sources:';
                 header.className = 'claritycheck-panel-findings-title';
                 panelResultsDiv.appendChild(header);
                 
                 if (resultData.sources.length > 0) {
                     const list = document.createElement('ul');
                     list.className = 'claritycheck-panel-findings-list claritycheck-verification-list'; // Add specific class
                     
                     resultData.sources.forEach(source => {
                         const item = document.createElement('li');
                         item.className = 'claritycheck-verification-item';
                         
                         // --- Agreement Indicator (Badge Style) --- 
                         const agreement = source.agreement?.toLowerCase() || 'unknown'; // Normalize
                         let indicatorClass = 'status-neutral'; // Default (grey/yellow)
                         let indicatorText = 'Neutral/Unknown'; // For title attribute
                         
                         if (agreement === 'supports') {
                             indicatorClass = 'status-green';
                             indicatorText = 'Supports';
                         } else if (agreement === 'contradicts') {
                             indicatorClass = 'status-red';
                             indicatorText = 'Contradicts';
                         } else if (agreement === 'neutral') {
                              indicatorClass = 'status-yellow'; // Use yellow for explicit neutral
                              indicatorText = 'Neutral';
                         }
                         
                         const agreementBadge = document.createElement('span');
                         agreementBadge.className = `claritycheck-agreement-badge ${indicatorClass}`;
                         agreementBadge.title = `Source stance on claim: ${indicatorText}`; // Keep title for accessibility
                         item.appendChild(agreementBadge); // Add badge first
                         // --- End Agreement Indicator --- 

                         // --- NEW: Text Content Wrapper --- 
                         const textWrapper = document.createElement('div');
                         textWrapper.className = 'claritycheck-verification-text';
                         // --- END NEW --- 

                         const sourceName = document.createElement('strong');
                         sourceName.textContent = source.name || "Unknown Source";
                         // Add space after name if link exists (handled by inline display now)
                         // if (source.url && source.url !== '#') { 
                         //     sourceName.textContent += ' ';
                         // }
                         
                         const sourceLink = document.createElement('a');
                         sourceLink.href = source.url || '#';
                         sourceLink.textContent = "(Link)";
                         sourceLink.target = '_blank'; // Open in new tab
                         sourceLink.rel = 'noopener noreferrer';
                         sourceLink.className = 'claritycheck-verification-link';
                                                 
                         const sourceSummary = document.createElement('p');
                         // Use the potentially concise summary
                         sourceSummary.textContent = source.summary || "No summary available.";
                         sourceSummary.className = 'claritycheck-verification-summary';
                         
                         // Append elements to the text wrapper
                         textWrapper.appendChild(sourceName);
                         if (source.url && source.url !== '#') {
                             textWrapper.appendChild(sourceLink);
                         }
                         textWrapper.appendChild(sourceSummary);

                         // Append the wrapper to the list item
                         item.appendChild(textWrapper);
                         list.appendChild(item);
                     });
                     panelResultsDiv.appendChild(list);
                 } else {
                      // Display message if no sources were found
                      const noSources = document.createElement('p');
                      noSources.textContent = "No relevant sources found during web search for this claim.";
                      noSources.style.fontStyle = 'italic';
                      panelResultsDiv.appendChild(noSources);
                 }
            } else {
                 // Handle unexpected data format
                 panelResultsDiv.innerHTML = `<p class="claritycheck-panel-error">Received unexpected data format for claim verification.</p>`;
                 if (panelStatusIndicator) { // Update status to red on error
                     panelStatusIndicator.textContent = "Error";
                     panelStatusIndicator.className = 'claritycheck-panel-status-indicator status-red';
                 }
                 updateIndicatorStatus('red'); // Update floating indicator
            }
        } else {
             console.error("Custom panel results div not found for claim verification!");
        }
        // Ensure panel is visible
        showCustomPanel();
    }

    return false;
});

// --- Highlighting Logic --- 

// Function to clear existing highlights
function clearHighlights() {
    console.log("Clearing previous ClarityCheck highlights...");
    // UPDATED SELECTOR: Target any element whose class starts with "claritycheck-highlight-"
    const highlights = document.querySelectorAll('[class^="claritycheck-highlight-"]'); 
    highlights.forEach(span => {
        // Unwrap the content: Replace the span with its text content
        const parent = span.parentNode;
        // Ensure parent exists before manipulating
        if (!parent) return;
        
        while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        // Normalize to merge adjacent text nodes, important after unwrapping
        parent.normalize(); 
    });
}

// Function to apply highlights based on findings
function applyHighlights(findings) {
    console.log("Applying highlights for findings:", findings);
    clearHighlights(); // Ensure clean slate

    // Highlight BIAS with suggestions AND other categories without suggestions
    const findingsToHighlight = findings.filter(f => f.quote);
    // const biasFindings = findings.filter(f => f.category.toUpperCase() === 'BIAS' && f.quote && f.suggestion);
    if (findingsToHighlight.length === 0) {
        console.log("No findings with quotes to highlight.");
        return;
    }

    const contentElement = getMainContentElement();
    if (!contentElement) {
        console.error("Cannot apply highlights: Main content element not found.");
        return;
    }

    findingsToHighlight.forEach(finding => {
        const quote = finding.quote;
        const category = finding.category.toUpperCase();
        const suggestion = finding.suggestion;
        const explanation = finding.explanation;
        // Determine highlight class based on category - use status colors?
        let highlightClass = 'claritycheck-highlight-info'; // Default/other
        if (['BIAS', 'FALLACY', 'PROPAGANDA', 'SOURCING', 'CLAIM', 'EMOTIONAL'].includes(category)) {
             highlightClass = 'claritycheck-highlight-warning'; // Yellow-ish?
        }
        // Could add a 'red'/'error' class too if needed

        const treeWalker = document.createTreeWalker(contentElement, NodeFilter.SHOW_TEXT);
        let currentNode;

        while (currentNode = treeWalker.nextNode()) {
            const textNode = currentNode;
            let index = textNode.nodeValue.indexOf(quote);

            while (index !== -1) {
                const range = document.createRange();
                range.setStart(textNode, index);
                range.setEnd(textNode, index + quote.length);

                // Prevent nesting highlights
                if (range.startContainer.parentElement.closest('[class^="claritycheck-highlight-"]')) {
                    index = textNode.nodeValue.indexOf(quote, index + 1);
                    continue;
                }

                const highlightSpan = document.createElement('span');
                highlightSpan.className = highlightClass; // Use dynamic class

                // Create the hover card with category, explanation, and suggestion
                const hoverCard = document.createElement('span');
                hoverCard.className = 'claritycheck-hover-card';
                let cardContent = `<b>[${category}]</b> ${explanation}`;
                if (suggestion) {
                    cardContent += `<br><i>Suggestion: ${suggestion}</i>`;
                }
                hoverCard.innerHTML = cardContent;

                highlightSpan.appendChild(hoverCard);

                try {
                    range.surroundContents(highlightSpan);
                    textNode = highlightSpan.nextSibling || textNode;
                    index = -1;
                } catch (e) {
                     console.error("Error surrounding content:", e, "Quote:", quote);
                     index = -1;
                     break;
                }
            }
        }
    });
     console.log("Highlighting complete.");
}

// TODO: Add logic for hover cards 