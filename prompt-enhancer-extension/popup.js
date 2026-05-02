// DOM Elements
const rawPromptInput = document.getElementById('rawPrompt');
const enhanceBtn = document.getElementById('enhanceBtn');
const clearBtn = document.getElementById('clearBtn');
const detailedModeCheckbox = document.getElementById('detailedMode');
const outputSection = document.getElementById('outputSection');
const enhancedPromptOutput = document.getElementById('enhancedPrompt');
const copyBtn = document.getElementById('copyBtn');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Event Listeners
enhanceBtn.addEventListener('click', handleEnhancePrompt);
clearBtn.addEventListener('click', () => {
    rawPromptInput.value = '';
    rawPromptInput.focus();
});
copyBtn.addEventListener('click', copyToClipboard);
clearHistoryBtn.addEventListener('click', clearHistory);

// Load history on startup
window.addEventListener('load', loadHistory);

// Main enhancement function
function handleEnhancePrompt() {
    const rawPrompt = rawPromptInput.value.trim();

    if (!rawPrompt) {
        alert('Please enter a prompt to enhance');
        return;
    }

    const isDetailed = detailedModeCheckbox.checked;
    const enhancedPrompt = enhancePrompt(rawPrompt, isDetailed);

    // Display result
    enhancedPromptOutput.innerHTML = formatPromptOutput(enhancedPrompt);
    outputSection.style.display = 'block';

    // Save to history
    saveToHistory(rawPrompt, enhancedPrompt);
}

// Core enhancement logic
function enhancePrompt(rawPrompt, isDetailed) {
    // Extract context, task, requirements from raw prompt
    const { context, task, requirements, outputFormat } = parsePrompt(rawPrompt);

    // Build enhanced prompt
    let enhanced = '';

    if (isDetailed) {
        enhanced = `## Context
${context || 'Understand the background and purpose of this task.'}

## Task
${task || cleanAndCapitalize(rawPrompt)}

## Requirements
${formatRequirements(requirements)}

## Output Format
${outputFormat || 'Provide clear and well-organized output.'}`;
    } else {
        enhanced = `Task: ${task || cleanAndCapitalize(rawPrompt)}

Requirements: ${formatRequirements(requirements)}`;
    }

    return enhanced;
}

// Parse raw prompt into components
function parsePrompt(rawPrompt) {
    let context = '';
    let task = '';
    let requirements = [];
    let outputFormat = '';

    const lines = rawPrompt.split('\n').filter(line => line.trim());

    // Extract task (usually first meaningful line)
    if (lines.length > 0) {
        task = lines[0].trim();
        task = cleanAndCapitalize(task);
    }

    // Extract keywords and requirements
    const keywordPatterns = {
        context: /context|background|purpose|situation|scenario/i,
        requirements: /requirement|must|should|need|include|exclude|without|with/i,
        output: /output|format|return|should return|should provide/i
    };

    lines.forEach(line => {
        const cleanLine = line.trim();

        if (keywordPatterns.context.test(cleanLine)) {
            context = cleanLine.replace(keywordPatterns.context, '').trim();
        }
        if (keywordPatterns.requirements.test(cleanLine)) {
            const req = cleanLine.replace(keywordPatterns.requirements, '').trim();
            if (req && !requirements.includes(req)) {
                requirements.push(req);
            }
        }
        if (keywordPatterns.output.test(cleanLine)) {
            outputFormat = cleanLine.replace(keywordPatterns.output, '').trim();
        }
    });

    // Extract additional requirements from remaining lines
    lines.slice(1).forEach(line => {
        const cleanLine = line.trim();
        if (cleanLine && !context.includes(cleanLine) && requirements.length < 5) {
            requirements.push(cleanLine);
        }
    });

    // Remove duplicates
    requirements = [...new Set(requirements)].filter(r => r);

    return {
        context: context || extractContextFromPrompt(rawPrompt),
        task,
        requirements: requirements.slice(0, 5),
        outputFormat: outputFormat || 'Clear and structured'
    };
}

// Extract context if not explicitly stated
function extractContextFromPrompt(prompt) {
    const words = prompt.split(/\s+/).slice(0, 10).join(' ');
    return words.length > 20 ? words : '';
}

// Clean and capitalize text
function cleanAndCapitalize(text) {
    return text
        .replace(/^(write|create|build|make|generate|develop|implement)/i, match => match.charAt(0).toUpperCase() + match.slice(1))
        .replace(/^[a-z]/, match => match.toUpperCase())
        .trim();
}

// Format requirements as list
function formatRequirements(requirements) {
    if (requirements.length === 0) {
        return '- Clear and well-structured output';
    }

    return requirements
        .map(req => `- ${cleanAndCapitalize(req)}`)
        .join('\n');
}

// Format output with styling
function formatPromptOutput(prompt) {
    return prompt
        .replace(/##\s+(\w+)/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/^(\-\s+.*?)(?=<br>|$)/gm, '<span style="color: #555;">$1</span>');
}

// Copy to clipboard
function copyToClipboard() {
    const text = enhancedPromptOutput.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }).catch(() => {
        alert('Failed to copy. Please try again.');
    });
}

// History Management
function saveToHistory(original, enhanced) {
    chrome.storage.local.get(['promptHistory'], (result) => {
        const history = result.promptHistory || [];

        const entry = {
            id: Date.now(),
            original: original.substring(0, 50) + (original.length > 50 ? '...' : ''),
            enhanced: enhanced,
            timestamp: new Date().toLocaleString()
        };

        history.unshift(entry);

        // Keep only last 10 entries
        if (history.length > 10) {
            history.pop();
        }

        chrome.storage.local.set({ promptHistory: history }, () => {
            loadHistory();
        });
    });
}

function loadHistory() {
    chrome.storage.local.get(['promptHistory'], (result) => {
        const history = result.promptHistory || [];

        if (history.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        historyList.innerHTML = '';

        history.forEach(entry => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div><strong>${entry.original}</strong></div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">${entry.timestamp}</div>
            `;

            historyItem.addEventListener('click', () => {
                enhancedPromptOutput.innerHTML = formatPromptOutput(entry.enhanced);
                outputSection.style.display = 'block';
                window.scrollTo(0, 0);
            });

            historyList.appendChild(historyItem);
        });
    });
}

function clearHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        chrome.storage.local.set({ promptHistory: [] }, () => {
            loadHistory();
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    rawPromptInput.focus();
});
