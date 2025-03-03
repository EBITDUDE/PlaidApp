/**
 * log-viewer.js - Log viewer functionality for ASB Personal Finance App
 * 
 * This file contains the JavaScript code for the log viewer page.
 */

/**
 * Initialize the log viewer when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    // Load logs when page loads
    loadLogs();

    // Set up refresh button
    document.getElementById('refresh-btn').addEventListener('click', loadLogs);

    // Set up filter and search
    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-logs');

    levelFilter.addEventListener('change', filterLogs);
    searchInput.addEventListener('keyup', filterLogs);
});

/**
 * Load logs from the server
 */
function loadLogs() {
    fetch('/api/logs')
        .then(response => response.json())
        .then(data => {
            displayLogs(data.logs);
        })
        .catch(err => {
            console.error('Error loading logs:', err);
            document.getElementById('log-content').innerHTML =
                `<div class="log-entry error">Error loading logs: ${err.message}</div>`;
        });
}

/**
 * Display logs in the log container
 * 
 * @param {Array} logs - Array of log objects
 */
function displayLogs(logs) {
    const logContent = document.getElementById('log-content');
    logContent.innerHTML = '';

    if (logs.length === 0) {
        logContent.innerHTML = '<div class="log-entry">No logs found.</div>';
        return;
    }

    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${log.level.toLowerCase()}`;
        logEntry.setAttribute('data-level', log.level);
        logEntry.textContent = log.message;

        // If timestamp is available, add it as a prefix
        if (log.timestamp) {
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'log-timestamp';
            timestampSpan.textContent = log.timestamp + ' ';
            logEntry.prepend(timestampSpan);
        }

        logContent.appendChild(logEntry);
    });

    // Apply initial filter
    filterLogs();
}

/**
 * Filter logs based on level and search term
 */
function filterLogs() {
    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-logs');
    const selectedLevel = levelFilter.value;
    const searchTerm = searchInput.value.toLowerCase();
    const logEntries = document.querySelectorAll('.log-entry');

    logEntries.forEach(entry => {
        let showByLevel = true;
        let showBySearch = true;

        // Level filtering
        if (selectedLevel !== 'all') {
            const entryLevel = entry.getAttribute('data-level');

            // Define level hierarchy
            const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
            const selectedLevelIndex = levels.indexOf(selectedLevel);
            const entryLevelIndex = levels.indexOf(entryLevel);

            // Show only if entry level is >= selected level in severity
            showByLevel = entryLevelIndex >= selectedLevelIndex;
        }

        // Search filtering
        if (searchTerm) {
            showBySearch = entry.textContent.toLowerCase().includes(searchTerm);
        }

        // Apply both filters
        entry.style.display = (showByLevel && showBySearch) ? '' : 'none';
    });
}