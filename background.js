// Background service worker for ClarityCheck
console.log("ClarityCheck background script loaded.");

// --- Constants ---
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
// THIS MUST BE THE NAME/KEY used in chrome.storage.sync.set
const API_KEY_STORAGE_KEY = "geminiApiKey";

// --- Storage Helper ---
async function getApiKey() {
    const result = await chrome.storage.sync.get([API_KEY_STORAGE_KEY]);
    return result[API_KEY_STORAGE_KEY];
}

// --- API Call Logic ---
async function callGeminiApi(textToAnalyze) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("ClarityCheck: Gemini API key not found. Please set it in extension options.");
        // Return a structured error object
        return {
            status: 'neutral',
            analysis: "Error: API Key not set. Please configure it in the extension settings.",
            politicalLeaning: 'Unknown',
            politicalLeaningScore: null,
            findings: []
        };
    }

    console.log("Calling Gemini API for analysis...");

    // --- MODIFIED PROMPT V5 --- Added numerical score --- 
    const prompt = `Analyze the following text for credibility, bias, and potential disinformation. Identify specific techniques (e.g., emotional language, logical fallacies, unsourced claims, propaganda types).

RESPONSE FORMATTING RULES:
1. On the first line, provide a brief 1-2 sentence overall summary of the analysis.
2. On the second line, provide the estimated political leaning formatted EXACTLY as: LEANING: [Spectrum] - Justification (e.g., LEANING: Left-leaning - Focuses heavily on social programs and critiques of corporate power. or LEANING: Center - Presents multiple viewpoints with balanced reporting. or LEANING: Not Applicable - Text is non-political.). Use 'Not Applicable' if the text isn't political.
3. On the third line, provide a numerical score for the political leaning formatted EXACTLY as: SCORE: [Number from -100 to 100] (where -100 is strongly left, 0 is center, 100 is strongly right). Use 'SCORE: N/A' if leaning is 'Not Applicable'.
4. After the score, list specific findings. Each finding MUST be on a new line and formatted EXACTLY as follows:
   [ISSUE_CATEGORY]: "Exact quote from the text" - Brief explanation of the issue. {Suggestion: Optional more neutral phrasing}
   - Replace [ISSUE_CATEGORY] with a relevant category (e.g., BIAS, FALLACY, CLAIM, EMOTIONAL, PROPAGANDA, SOURCING, OTHER).
   - The "Exact quote from the text" should be copied verbatim from the provided text.
   - Keep the explanation concise.
   - *If the category is BIAS*, include a suggested neutral phrasing within curly braces at the end: {Suggestion: More neutral phrasing here}. If no suggestion is feasible, omit the braces part.
5. If no specific issues are found, state "No specific issues identified." after the score line.

EXAMPLE:
(Analysis Summary Line 1)
The article presents a biased view but cites some sources.
LEANING: Right-leaning - Emphasizes deregulation and criticizes government spending.
SCORE: 65
BIAS: "the disastrous policy" - Uses emotionally charged, negative language. {Suggestion: the policy}
SOURCING: "Sources say..." - Vague sourcing, doesn't name sources.
CLAIM: "This will boost the economy by 10%." - Specific claim without immediate data.

Text to Analyze:
---
${textToAnalyze}
---
`;

    const requestBody = {
        contents: [ { parts: [ { text: prompt } ] } ],
        // IMPORTANT: Add safety settings to get the classification back!
        safetySettings: [
             { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
             { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ]
    };

    try {
        const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            // Try to get more detailed error text
            const errorText = await response.text(); 
            console.error("ClarityCheck: Gemini API Error Response Text:", errorText);
            try {
                const errorData = JSON.parse(errorText); // Try parsing manually
                console.error("ClarityCheck: Gemini API Error Parsed:", response.status, errorData);
                 return {
                    status: 'neutral',
                    analysis: `Error: API request failed (${response.status}). ${errorData?.error?.message || 'Check console.'}`,
                    politicalLeaning: 'Unknown',
                    politicalLeaningScore: null,
                    findings: []
                };
            } catch (parseError) {
                console.error("ClarityCheck: Could not parse error response as JSON.");
                 return {
                    status: 'neutral',
                    analysis: `Error: API request failed (${response.status}). Response: ${errorText.substring(0, 100)}...`,
                    politicalLeaning: 'Unknown',
                    politicalLeaningScore: null,
                    findings: []
                };
            }
        }

        const data = await response.json();
        console.log("ClarityCheck: Gemini API Response:", data);

        // --- Determine Status from Safety Ratings or Findings --- 
        let status = 'green'; // Default to green
        const safetyRatings = data.candidates?.[0]?.safetyRatings;
        let highProbBlock = false;
        if(safetyRatings){
            safetyRatings.forEach(rating => {
                if (rating.probability === 'HIGH') highProbBlock = true;
                if (rating.probability === 'MEDIUM') status = 'yellow'; // If any are medium, make it yellow
            });
        }
        if (highProbBlock) status = 'red'; // High probability overrides yellow

        // If still green, check if findings contain bias/fallacy etc. to make it yellow
        const findings = []; // Will be populated later
        const rawAnalysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawAnalysis) {
            return {
                status: 'neutral',
                analysis: "Analysis could not be extracted from the API response.",
                politicalLeaning: 'Unknown',
                politicalLeaningScore: null,
                findings: []
            };
        }

        // --- MODIFIED PARSING: Leaning, Summary, Findings, and Score --- 
        let analysisSummary = "Analysis unavailable.";
        let politicalLeaning = 'Unknown - Format error';
        let politicalLeaningScore = null; // NEW: For numerical score

        const lines = rawAnalysis?.trim().split('\n') || [];
        let lineOffset = 0; // Start checking from the first line
        
        if (lines.length > 0) {
            analysisSummary = lines[lineOffset].trim(); // Summary is now expected on the first line
            lineOffset++;

            // Look for Leaning line (now expected on line 2)
            if (lines.length > lineOffset) {
                const leaningMatch = lines[lineOffset]?.match(/^LEANING:\s*(.*?)(?:\s*-\s*(.*))?$/i); 
                if (leaningMatch) {
                    politicalLeaning = leaningMatch[1].trim();
                    if (leaningMatch[2]) { // Append justification if present
                        politicalLeaning += ` - ${leaningMatch[2].trim()}`;
                    }
                    console.log(`Parsed leaning: ${politicalLeaning}`);
                } else {
                    console.warn("ClarityCheck: Could not parse LEANING line on line 2.");
                    politicalLeaning = 'Unknown - Format error';
                }
                lineOffset++;
            } else {
                 politicalLeaning = 'Unknown - Missing lines';
            }

            // Look for Score line (now expected on line 3)
            if (lines.length > lineOffset) {
                 const scoreMatch = lines[lineOffset]?.match(/^SCORE:\s*(-?\d+|N\/A)$/i);
                 if (scoreMatch) {
                     if (scoreMatch[1].toUpperCase() === 'N/A') {
                         politicalLeaningScore = null; // Explicitly null for N/A
                     } else {
                         politicalLeaningScore = parseInt(scoreMatch[1], 10);
                         // Clamp the score between -100 and 100
                         politicalLeaningScore = Math.max(-100, Math.min(100, politicalLeaningScore)); 
                     }
                     console.log(`Parsed score: ${politicalLeaningScore}`);
                 } else {
                     console.warn("ClarityCheck: Could not parse SCORE line on line 3.");
                     politicalLeaningScore = null; // Default to null if parsing fails
                 }
                 lineOffset++;
            } else {
                 politicalLeaningScore = null; // Default to null if line is missing
            }

            // Regex to parse findings lines, now capturing optional suggestion
            const findingRegex = /^\s*\[([^\]]+)\]:\s*"([^"]+)"\s*-\s*(.*?)(?:\s*\{Suggestion:\s*(.*)\}\s*)?$/i;
            // Findings now start from line 4 (index depends on previous parsing)

            for (let i = lineOffset; i < lines.length; i++) {
                const findingMatch = lines[i].trim().match(findingRegex);
                if (findingMatch) {
                    const category = findingMatch[1].trim().toUpperCase();
                    findings.push({
                        category: category,
                        quote: findingMatch[2].trim(),
                        explanation: findingMatch[3].trim(),
                        suggestion: findingMatch[4] ? findingMatch[4].trim() : null // Add suggestion if captured
                    });
                     // Downgrade status based on findings if not already red
                    if (status === 'green' && ['BIAS', 'FALLACY', 'PROPAGANDA', 'EMOTIONAL', 'SOURCING', 'CLAIM'].includes(category)) {
                        status = 'yellow';
                    }
                }
                 // Ignore lines that don't match the finding format
            }
            console.log(`Findings:`, findings);
             // If summary is still empty after parsing findings, assign the first line again
             if (analysisSummary === "Analysis unavailable." && lines[0]) {
                 analysisSummary = lines[0].trim(); 
             }

        } else {
             analysisSummary = rawAnalysis || "Could not extract analysis.";
             politicalLeaning = 'Unknown - No content';
        }

        console.log(`Final Status: ${status}, Summary: ${analysisSummary}, Leaning: ${politicalLeaning}, Score: ${politicalLeaningScore}`);
        return { status, analysis: analysisSummary, politicalLeaning, politicalLeaningScore, findings };

    } catch (error) {
        console.error("ClarityCheck: Error calling Gemini API:", error);
        return {
            status: 'neutral',
            analysis: "Error: Could not connect to the analysis service.",
            politicalLeaning: 'Unknown',
            politicalLeaningScore: null, // Ensure score is null on error
            findings: []
         };
    }
}

// --- RE-ADD Claim Verification Logic with Grounding ---
async function verifyClaimWithGemini(claimToVerify) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("ClarityCheck: Gemini API key not found for claim verification.");
        return { error: "API Key not set. Please configure it." };
    }

    console.log("Calling Gemini API for claim verification with grounding...");

    // Updated prompt asking for concise summary and agreement status
    const prompt = `Analyze the following claim rigorously using a web search:
"${claimToVerify}"

1.  Perform a web search to identify authoritative sources (news agencies, fact-checkers, reputable organizations) that have addressed this claim.
2.  For each relevant source found in your search, determine its stance towards the claim.
3.  Provide the following for each source:
    a.  The name of the source.
    b.  The actual URL found during your search.
    c.  A **very concise (1 sentence)** summary of the perspective or information that source provides regarding the claim's validity or context based on the search results.
    d.  An **agreement indicator** which MUST be one of: "Supports", "Contradicts", or "Neutral".
4.  Structure your entire response STRICTLY as a single JSON object containing a key named "sources". The value of "sources" should be an array of objects, where each object has the keys "name", "url", "summary", and "agreement".

Example JSON Response Format:
\`\`\`json
{
  "sources": [
    {
      "name": "Example News Agency",
      "url": "https://example.com/news/actual-search-result-url",
      "summary": "Confirms the core assertion with data from their investigation.",
      "agreement": "Supports"
    },
    {
      "name": "FactCheck Website",
      "url": "https://factcheck.example.org/claim-review-url",
      "summary": "Debunks the claim, highlighting factual errors found online.",
      "agreement": "Contradicts"
    },
    {
      "name": "Neutral Analysis Org",
      "url": "https://neutral.example/context-article",
      "summary": "Provides background context without taking a definitive stance.",
      "agreement": "Neutral"
    }
  ]
}
\`\`\`

Return ONLY the JSON object and nothing else. If your web search yields no relevant sources for the specific claim, return an empty sources array: { "sources": [] }. Do not include introductory text or markdown formatting around the JSON.`;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [
            { googleSearch: {} } 
        ],
        // Cannot use responseMimeType with grounding tool
    };

    try {
        const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("ClarityCheck: Claim Verification API Error (Grounding):", response.status, errorText);
            // Try to parse error for more specific message
             try {
                 const errorData = JSON.parse(errorText);
                 return { error: `API request failed (${response.status}): ${errorData?.error?.message || errorText}` };
             } catch (e) {
                 return { error: `API request failed (${response.status}). ${errorText.substring(0, 200)}...` };
             }
        }

        const data = await response.json();
        console.log("ClarityCheck: Claim Verification API Response (Grounding):", data);

        const candidate = data.candidates?.[0];
        if (!candidate) {
            // Handle cases where API returns 200 OK but no candidates (e.g., blocked prompt)
            const blockReason = data.promptFeedback?.blockReason;
            if (blockReason) {
                 console.error(`ClarityCheck: Prompt blocked due to ${blockReason}`);
                 return { error: `Request blocked due to safety reasons (${blockReason}).` };
            }
            console.error("ClarityCheck: No candidate found in claim verification response.");
            return { error: "No candidate received from API." };
        }

        // --- PARSING LOGIC: Prioritize Grounding Metadata, then attempt to parse text for details --- 
        const groundingMetadata = candidate.groundingMetadata;
        const textResponse = candidate.content?.parts?.[0]?.text || "";
        let parsedTextData = null;

        // Best effort: Try parsing the text response as JSON even if grounding occurred
        if (textResponse) {
             try {
                 const cleanedJson = textResponse.replace(/^```json\s*|```$/g, '').trim();
                 if (cleanedJson) { // Only parse if non-empty after cleaning
                     parsedTextData = JSON.parse(cleanedJson);
                 }
             } catch (e) {
                 console.warn("Could not parse text response as JSON (this is expected if grounding was primary):", e);
                 // It's okay if this fails, especially if grounding metadata is present
             }
        }
        
        if (groundingMetadata?.groundingChunks?.length > 0) {
             console.log("Found grounding metadata, extracting sources and trying to merge with text data...");
             const sources = groundingMetadata.groundingChunks.map((chunk, index) => {
                 const name = chunk.web?.title || "Unknown Source";
                 const url = chunk.web?.uri || "#";
                 
                 // Attempt to find corresponding summary/agreement from parsed text data
                 const textSource = parsedTextData?.sources?.[index]; 
                 let summary = "Grounded source. Summary not extracted."; // Default
                 let agreement = "Unknown"; // Default
                 
                 if (textSource) {
                     // Basic check: does the name roughly match? (Very naive)
                     if (textSource.name && name.includes(textSource.name.substring(0,10))) {
                         summary = textSource.summary || summary;
                         agreement = textSource.agreement || agreement;
                     } else {
                          console.warn(`Grounding chunk ${index} name '${name}' didn't seem to match text source name '${textSource.name}'. Using defaults.`);
                     }
                 } else if (parsedTextData?.sources?.length === groundingMetadata.groundingChunks.length) {
                     // If counts match but names didn't, maybe just take it by index?
                      console.warn(`Name mismatch but counts match for index ${index}. Taking summary/agreement by index anyway.`);
                      summary = parsedTextData.sources[index]?.summary || summary;
                      agreement = parsedTextData.sources[index]?.agreement || agreement;
                 }
                 
                 return { name, url, summary, agreement };
             });
             return { sources: sources };
        }
        
        // --- Fallback to parsing JSON from text part if no grounding metadata --- 
        console.log("No grounding metadata found or used, relying solely on parsed text JSON...");
        if (parsedTextData?.sources && Array.isArray(parsedTextData.sources)) {
             // Validate expected fields (optional but good practice)
             parsedTextData.sources.forEach(s => {
                 s.agreement = s.agreement || "Unknown"; // Ensure agreement field exists
                 s.summary = s.summary || "Summary not provided."; // Ensure summary exists
             });
             return parsedTextData; 
        } else {
             console.error("ClarityCheck: Failed to extract valid sources from API response text.", "Text Response:", textResponse);
             // Check for block reason if candidate exists but content is bad
             if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                 return { error: `API call finished unexpectedly (${candidate.finishReason}). Check safety settings or prompt.` };
             }
             return { error: "Failed to parse valid source data from API response." };
        }

    } catch (error) {
        console.error("ClarityCheck: Network or other error during claim verification (Grounding):", error);
        return { error: `Network error or other issue: ${error.message}` };
    }
}

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyzeSelection",
        title: "Analyze selection with ClarityCheck",
        contexts: ["selection"]
    });
    // RE-ADD context menu for claim verification
    chrome.contextMenus.create({
        id: "verifyClaim",
        title: "Verify selected claim with ClarityCheck",
        contexts: ["selection"]
    });
    console.log("ClarityCheck context menus created."); // Update log message
});

// --- MODIFIED Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Restore handling for both menu items
    if (!tab?.id || !info.selectionText) return; // Basic validation

    const selection = info.selectionText.trim();

    if (info.menuItemId === "analyzeSelection") {
        console.log("Context menu clicked for analysis:", selection);
        callGeminiApi(selection).then(result => {
             if (result && tab?.id) {
                 console.log("Sending structured analysis (with score) to content script", result);
                 chrome.tabs.sendMessage(tab.id, { action: "displayAnalysisInCustomPanel", data: result });
             } else {
                  const errorResult = result || { status: 'neutral', analysis: 'Analysis failed.', politicalLeaning: 'Unknown', politicalLeaningScore: null, findings: [] };
                  console.log("Analysis failed or no tab ID found. Sending error to content script");
                  if (tab?.id) {
                     chrome.tabs.sendMessage(tab.id, { action: "displayAnalysisInCustomPanel", data: errorResult });
                  }
             }
        }).catch(error => {
             console.error("Error during context menu analysis processing:", error);
             const errorResult = { status: 'neutral', analysis: 'An unexpected error occurred during analysis.', politicalLeaning: 'Unknown', politicalLeaningScore: null, findings: [] };
             if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, { action: "displayAnalysisInCustomPanel", data: errorResult });
             }
        });
    // RE-ADD handling for verifyClaim
    } else if (info.menuItemId === "verifyClaim") {
        console.log("Context menu clicked for claim verification:", selection);
        // Show loading sidebar immediately
        chrome.tabs.sendMessage(tab.id, { action: "showClaimVerificationLoading" });
        verifyClaimWithGemini(selection).then(result => {
            console.log("Sending claim verification result to content script", result);
            // Use a different action name for claim verification results
            chrome.tabs.sendMessage(tab.id, { 
                action: "displayClaimVerification", 
                data: result // This will be { sources: [...] } or { error: "..." }
            });
        }).catch(error => {
            console.error("Error during context menu claim verification processing:", error);
            const errorResult = { error: `An unexpected error occurred during claim verification: ${error.message}` };
            chrome.tabs.sendMessage(tab.id, { action: "displayClaimVerification", data: errorResult });
        });
    }
});


// --- Side Panel Handling REMOVED ---
// chrome.sidePanel
//   .setPanelBehavior({ openPanelOnActionClick: true })
//   .catch((error) => console.error(error));

// --- MODIFIED Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in background:", message, "from sender:", sender);
  let isAsync = false; // Flag for asynchronous operations

  // We no longer handle openSidePanel directly here
  // if (message.action === "openSidePanel" && sender.tab) { ... }

  if (message.action === "analyzePageContent" && sender.tab) {
      if (message.content) {
          console.log("Received content from tab", sender.tab.id, "for analysis.");
          isAsync = true; // API call is async
          callGeminiApi(message.content).then(result => {
              if (result && sender.tab?.id) {
                  console.log("Sending structured analysis (with score) to content script", result);
                   // Send full result object (including score) to content script
                  chrome.tabs.sendMessage(sender.tab.id, { action: "displayAnalysisInCustomPanel", data: result });
              } else {
                  const errorResult = result || { status: 'neutral', analysis: 'Page analysis failed.', politicalLeaning: 'Unknown', politicalLeaningScore: null, findings: [] };
                  console.log("Page analysis failed. Sending error to content script");
                  if (sender.tab?.id) {
                     chrome.tabs.sendMessage(sender.tab.id, { action: "displayAnalysisInCustomPanel", data: errorResult });
                  }
              }
          }).catch(error => {
              console.error("Error during analyzePageContent processing:", error);
              const errorResult = { status: 'neutral', analysis: 'An unexpected error occurred during analysis.', politicalLeaning: 'Unknown', politicalLeaningScore: null, findings: [] };
              if (sender?.tab?.id) {
                 chrome.tabs.sendMessage(sender.tab.id, { action: "displayAnalysisInCustomPanel", data: errorResult });
              }
          });
      } else {
          console.error("Received analyzePageContent message without content.");
      }
  }

  // Return true only if we initiated an async operation
  return isAsync;
});

// TODO: Add logic for message handling from options page (to save API key)

// Removed hardcoded API key setting line

chrome.storage.sync.get('geminiApiKey', console.log)
