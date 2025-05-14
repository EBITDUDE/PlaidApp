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
            
            // Use cached data if already available - no additional API call needed
            if (accountsCache.rawData && accountsCache.rawData.accounts) {
                displayAccounts(accountsCache.rawData);
                return Promise.resolve(accountsMap);
            } else {
                // This should rarely happen as fetchAndStoreAccounts should have populated the cache
                console.warn("Account data not available in cache after fetchAndStoreAccounts");
                return Promise.resolve(accountsMap);
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load account information');
            return {};
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
                    if (response.status === 401) {
                        // Handle login required error
                        return response.json().then(data => {
                            if (data.error_code === 'ITEM_LOGIN_REQUIRED') {
                                console.log("Bank re-authentication required");
                                // Trigger re-authentication flow
                                if (typeof window.showReauthenticationPrompt === 'function') {
                                    window.showReauthenticationPrompt();
                                } else {
                                    console.error('showReauthenticationPrompt is not available');
                                    alert('Your bank requires you to log in again. Please refresh the page and try again.');
                                }
                                return {};
                            }
                            throw new Error(data.error || 'Authentication failed');
                        });
                    }

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
            ErrorUtils.handleError(err, 'Failed to check access token');
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
 * 
 * @param {string} [selectedAccountId] - Optional account ID to select after updating
 * @returns {Promise} Promise that resolves when the dropdown is updated
 */
function updateAccountDropdown(selectedAccountId) {
    return new Promise((resolve, reject) => {
        // First check if we have data in our cache
        if (accountsCache.rawData && accountsCache.rawData.accounts) {
            console.log("Using cached account data for dropdown");
            populateAccountDropdown(accountsCache.rawData.accounts, selectedAccountId);
            resolve();
            return;
        }

        // If not in cache, fetch from server
        console.log("Fetching fresh account data for dropdown");
        fetch('/get_accounts')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error loading accounts:', data.error);
                    reject(data.error);
                    return;
                }

                // Update cache
                accountsCache.rawData = data;
                accountsCache.timestamp = Date.now();

                // Create accounts map
                const accountsMap = {};
                const accounts = data.accounts || [];
                accounts.forEach(account => {
                    if (account.id) {
                        accountsMap[account.id] = account.name || `Account ${account.id.substring(0, 8)}...`;
                    }
                });

                // Update global accounts map
                accountsCache.data = accountsMap;
                window.accountsMap = accountsMap;

                // Populate the dropdown
                populateAccountDropdown(accounts, selectedAccountId);
                resolve();
            })
            .catch(err => {
                ErrorUtils.handleError(err, 'Failed to load account dropdown information:');
                reject(err);
            });
    });
}

/**
 * Helper function to populate the account dropdown
 * 
 * @param {Array} accounts - Array of account objects
 * @param {string} [selectedAccountId] - Optional account ID to select
 */
function populateAccountDropdown(accounts, selectedAccountId) {
    const accountDropdown = document.getElementById('new-account');

    // Clear current options except the first one (if it exists)
    if (accountDropdown.options.length > 0 && accountDropdown.options[0].value === '') {
        // Keep only the first empty/placeholder option
        while (accountDropdown.options.length > 1) {
            accountDropdown.remove(1);
        }
    } else {
        // Clear all options and add a placeholder
        accountDropdown.innerHTML = '<option value="">Select Account</option>';
    }

    // Add account options
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name} - ${formatCurrency(account.balance.current)}`;
        accountDropdown.appendChild(option);
    });

    // Select account if provided
    if (selectedAccountId) {
        accountDropdown.value = selectedAccountId;

        // Log whether selection worked
        console.log(`Account selection: ${selectedAccountId} -> ${accountDropdown.value}`);

        // If selection failed, log available options for debugging
        if (!accountDropdown.value && accounts.length > 0) {
            console.warn("Account selection failed. Available options:",
                Array.from(accountDropdown.options).map(opt => ({ value: opt.value, text: opt.text }))
            );
        }
    }
}