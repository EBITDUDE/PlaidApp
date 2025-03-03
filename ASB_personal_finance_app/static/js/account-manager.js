/**
 * account-manager.js - Account management functionality for ASB Personal Finance App
 * 
 * This file contains functions related to fetching, caching, and displaying bank accounts.
 */

// Improved Account Caching Implementation
let accountsCache = {
    data: null,
    rawData: null,
    timestamp: 0,
    maxAge: 60000 // Cache expires after 1 minute (60000 ms)
};

/**
 * Loads accounts data and displays them in the UI
 * 
 * @param {boolean} forceRefresh - Whether to force a refresh from the server
 * @returns {Promise} - Promise that resolves when accounts are loaded
 */
function loadAccounts(forceRefresh = false) {
    return fetchAndStoreAccounts(forceRefresh)
        .then(accountsMap => {
            const accountsContainer = document.getElementById('accounts-container');

            // Check if we have the accounts data from server response
            const accountsData = accountsCache.rawData?.accounts;
            if (!accountsData || accountsData.length === 0) {
                return fetch('/get_accounts')
                    .then(response => response.json())
                    .then(data => {
                        accountsCache.rawData = data;
                        displayAccounts(data);
                    });
            } else {
                // Use cached data
                displayAccounts(accountsCache.rawData);
                return Promise.resolve();
            }
        })
        .catch(err => {
            console.error('Error loading accounts:', err);
        });
}

/**
 * Fetches account information from the server and stores it in the cache
 * 
 * @param {boolean} forceRefresh - Whether to bypass the cache and fetch fresh data
 * @returns {Promise<Object>} - Promise resolving to a map of account IDs to names
 */
function fetchAndStoreAccounts(forceRefresh = false) {
    // Check if we have cached data that isn't expired
    const now = Date.now();
    if (!forceRefresh && accountsCache.data && (now - accountsCache.timestamp < accountsCache.maxAge)) {
        console.log("Using cached account data");
        return Promise.resolve(accountsCache.data);
    }

    // First check if we have an access token before making the request
    return fetch('/has_access_token')
        .then(response => response.json())
        .then(data => {
            if (!data.has_token) {
                console.log("No access token available, skipping account fetch");
                // Return empty account map if no token exists
                return {};
            }

            console.log("Access token found, fetching fresh account data");
            return fetch('/get_accounts')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch accounts');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.error) {
                        console.error('Error loading accounts:', data.error);
                        return {};
                    }

                    // Create a mapping of account IDs to account names
                    const accountsMap = {};
                    if (data.accounts && Array.isArray(data.accounts)) {
                        data.accounts.forEach(account => {
                            if (account.id) {
                                accountsMap[account.id] = account.name || `Account ${account.id.substring(0, 8)}...`;
                            }
                        });
                    }

                    // Update cache
                    accountsCache.data = accountsMap;
                    accountsCache.rawData = data;
                    accountsCache.timestamp = now;

                    // Store in global variable for compatibility with existing code
                    window.accountsMap = accountsMap;
                    return accountsMap;
                });
        })
        .catch(err => {
            console.error('Error fetching accounts:', err);
            return {};
        });
}

/**
 * Displays accounts in the UI
 * 
 * @param {Object} data - Account data from the server
 */
function displayAccounts(data) {
    const accountsContainer = document.getElementById('accounts-container');
    const accountsSection = document.getElementById('accounts-section');

    // If no data or error, hide the accounts section
    if (!data || data.error || !data.accounts || data.accounts.length === 0) {
        accountsSection.style.display = 'none';
        return;
    }

    // Show the accounts section and display the accounts
    accountsSection.style.display = 'block';
    accountsContainer.innerHTML = '';

    data.accounts.forEach(account => {
        const accountCard = document.createElement('div');
        accountCard.className = 'account-card';

        const availableBalance = account.balance.available !== null ?
            `${formatCurrency(account.balance.available)}` : 'N/A';

        accountCard.innerHTML = `
        <h3>${account.name}</h3>
        <p>Type: ${account.type}${account.subtype ? ' - ' + account.subtype : ''}</p>
        <p>Current Balance: ${formatCurrency(account.balance.current)}</p>
        <p>Available Balance: ${availableBalance}</p>
    `;

        accountsContainer.appendChild(accountCard);
    });
}

/**
 * Updates the account dropdown in the add transaction form
 */
function updateAccountDropdown() {
    // Fetch accounts from the server
    fetch('/get_accounts')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error loading accounts:', data.error);
                return;
            }

            const accounts = data.accounts || [];
            const accountDropdown = document.getElementById('new-account');

            // Clear current options except the first one
            while (accountDropdown.options.length > 1) {
                accountDropdown.remove(1);
            }

            // Add account options
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.name} - ${formatCurrency(account.balance.current)}`;
                accountDropdown.appendChild(option);
            });
        })
        .catch(err => {
            console.error('Error fetching accounts:', err);
        });
}