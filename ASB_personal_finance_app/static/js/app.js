/**
 * app.js - Main application file for ASB Personal Finance App
 * 
 * This file contains the core application initialization and global functionality.
 */

// Global variables
window.accountsMap = {};
let currentDate = new Date();
let calendarDate = new Date();

// Global objects for pagination and filtering
let paginator;
let transactionFilter;

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - Milliseconds to wait before invoking the function
 * @returns {Function} - The debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Main initialization function that runs when the DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    console.log('Initializing ASB Personal Finance App...');

    // Set up the navigation and UI components
    setupEventListeners();
    setupTransactionEventHandlers();

    // Initialize UI components - without account fetching
    initializeUIComponents();

    // Single point of entry for data loading
    checkAccessTokenAndLoadData();
});

/**
 * Checks if an access token exists and updates the UI accordingly
 */
function checkAccessTokenAndLoadData() {
    fetch('/has_access_token')
        .then(response => response.json())
        .then(data => {
            if (data.has_token) {
                document.getElementById('transactions-button').style.display = 'block';

                // Load accounts first, then transactions
                loadAccounts().then(() => {
                    loadTransactions();
                });
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to check account connection');
        });
}

/**
 * Sets up event listeners for various UI elements
 */
function setupEventListeners() {
    // Set up Plaid Link button
    document.getElementById('link-button').addEventListener('click', initiatePlaidConnection);

    // Set up refresh transactions button
    const transactionsButton = document.getElementById('transactions-button');
    if (transactionsButton) {
        transactionsButton.addEventListener('click', function () {
            // Force refresh of accounts data
            loadAccounts(true).then(() => {
                loadTransactions();
            });
        });
    }

    // Set up filter change handlers
    setupFilterEventListeners();

    // Set up transaction actions (add, edit, delete)
    setupTransactionEventListeners();

    // Set up compact view toggle
    setupCompactViewToggle();

    // Set up export functionality
    setupExportData();
}

/**
 * Sets up filter event listeners for transactions
 */
function setupFilterEventListeners() {
    document.getElementById('date-filter').addEventListener('change', function () {
        if (this.value === 'custom') {
            // Show custom date dialog
            showCustomDateModal();
        } else if (transactionFilter) {
            // Apply selected filter
            transactionFilter.applyFilters();
        }
    });

    document.getElementById('category-filter').addEventListener('change', function () {
        if (transactionFilter) transactionFilter.applyFilters();
        updateSubcategoryDropdown(this.value);
    });

    document.getElementById('subcategory-filter').addEventListener('change', function () {
        if (transactionFilter) transactionFilter.applyFilters();
    });

    document.getElementById('type-filter').addEventListener('change', function () {
        if (transactionFilter) transactionFilter.applyFilters();
    });

    document.getElementById('transaction-search').addEventListener('keyup',
        debounce(function () {
            if (transactionFilter) transactionFilter.applyFilters();
        }, 300)
    );

    // UPDATED: Change this to use updateVisibility instead of reloading transactions
    document.getElementById('page-size').addEventListener('change', function () {
        // If we have the paginator initialized, update its page size
        if (paginator) {
            const newSize = this.value === 'all' ? 10000 : parseInt(this.value);
            paginator.pageSize = newSize;
            paginator.currentPage = 1; // Reset to first page when size changes
            paginator.updateVisibility(true);
        }
    });

    // Add clear filters button handler
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function () {
            if (transactionFilter) {
                transactionFilter.clearAllFilters();
            }
        });
    }

    updateSubcategoryDropdown('all');
}

/**
 * Sets up event listeners for transaction actions
 */
function setupTransactionEventListeners() {
    // Add transaction button
    const addTransactionBtn = document.getElementById('add-transaction-btn');
    if (addTransactionBtn) {
        addTransactionBtn.addEventListener('click', function () {
            const modal = document.getElementById('add-transaction-modal');
            const modalTitle = modal.querySelector('h3');
            const form = document.getElementById('add-transaction-form');
            const submitButton = form.querySelector('button[type="submit"]');

            // Set to add mode
            modalTitle.textContent = 'Add New Transaction';
            submitButton.textContent = 'Save';
            form.setAttribute('data-mode', 'add');
            form.removeAttribute('data-id');

            // Hide delete button if it exists
            const deleteButton = document.getElementById('delete-transaction-btn');
            if (deleteButton) {
                deleteButton.style.display = 'none';
            }

            // Clear form fields
            document.getElementById('new-date').value = formatDate(new Date()); // Default to today
            document.getElementById('new-amount').value = '';
            document.getElementById('new-type').value = 'expense'; // Default to expense
            document.getElementById('new-merchant').value = '';

            // Reset category safely
            if (window.categoryComponent && typeof window.categoryComponent.setValue === 'function') {
                window.categoryComponent.setValue({
                    category: '',
                    subcategory: ''
                });
            }

            // Show modal
            modal.style.display = 'block';

            updateAccountDropdown();
            initCategoryDropdown();
        });
    }

    // Cancel add transaction
    const cancelAddTransaction = document.getElementById('cancel-add-transaction');
    if (cancelAddTransaction) {
        cancelAddTransaction.addEventListener('click', function () {
            document.getElementById('add-transaction-modal').style.display = 'none';
        });
    }

    // Handle add transaction form submission
    const addTransactionForm = document.getElementById('add-transaction-form');
    if (addTransactionForm) {
        // Remove any existing event listeners to avoid duplicates
        const newForm = addTransactionForm.cloneNode(true);
        addTransactionForm.parentNode.replaceChild(newForm, addTransactionForm);

        // Add new event listener using our handler from transaction-manager.js
        newForm.addEventListener('submit', handleTransactionFormSubmit);
    }

    // Close modal if clicked outside
    window.addEventListener('click', function (event) {
        const modal = document.getElementById('add-transaction-modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * Sets up the compact view toggle switch
 */
function setupCompactViewToggle() {
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) {
        viewToggle.addEventListener('change', function () {
            const isCompact = this.checked;
            document.body.classList.toggle('compact-view', isCompact);

            // Store preference for next time
            localStorage.setItem('compact-view', isCompact);
        });

        // Load saved view preference
        if (localStorage.getItem('compact-view') === 'true') {
            viewToggle.checked = true;
            document.body.classList.add('compact-view');
        }
    }
}

/**
 * Initializes various UI components
 */
function initializeUIComponents() {
    // Initialize all date pickers
    initializeAllDatePickers();

    // Initialize the monthly category date pickers
    setupMonthlyCategoryDatePickers();

    // Initialize category dropdown
    initCategoryDropdown();

    // Set up custom date filters
    setupDateFilters();

    // Initialize the rule manager
    initRuleManager();
}

/**
 * Loads initial data if access token exists
 */
function loadInitialData() {
    fetch('/has_access_token')
        .then(response => response.json())
        .then(data => {
            if (data.has_token) {
                loadAccounts().then(() => {
                    loadTransactions();
                });
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load initial data');
        });
}

/**
 * Initiates Plaid connection process
 */
function initiatePlaidConnection() {
    console.log('Bank connection initiated');

    // Add loading state to button
    const linkButton = document.getElementById('link-button');
    const originalButtonText = linkButton.textContent;
    linkButton.innerHTML = '<span style="display: flex; align-items: center;">Connecting... <span class="loading" style="margin-left: 8px;"></span></span>';
    linkButton.disabled = true;

    // Fetch link token
    fetch('/create_link_token')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (!data.link_token) {
                throw new Error('No link token in response');
            }

            // Initialize Plaid Link
            const handler = Plaid.create({
                token: data.link_token,
                onSuccess: (public_token, metadata) => {
                    console.log('Link success - public token received');

                    // Exchange public token
                    fetch('/exchange_public_token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ public_token: public_token })
                    })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('Token exchange failed');
                            }
                            return response.json();
                        })
                        .then(data => {
                            console.log('Access token received');

                            // Add or show Refresh Transactions button
                            const buttonsContainer = document.querySelector('.buttons-container');
                            let refreshButton = document.getElementById('transactions-button');

                            if (!refreshButton) {
                                refreshButton = document.createElement('button');
                                refreshButton.id = 'transactions-button';
                                refreshButton.textContent = 'Refresh Transactions';
                                refreshButton.addEventListener('click', function () {
                                    loadAccounts(true)
                                        .then(() => loadTransactions());
                                });
                                buttonsContainer.appendChild(refreshButton);
                            }

                            refreshButton.style.display = 'block';

                            // Load accounts and transactions
                            loadAccounts().then(() => {
                                loadTransactions();
                            });

                            // Show success message
                            alert('Bank account connected successfully!');
                        })
                        .catch(err => {
                            ErrorUtils.handleError(err, 'Error connecting to bank');

                            // Reset button
                            linkButton.innerHTML = originalButtonText;
                            linkButton.disabled = false;
                        });
                },
                onExit: (err, metadata) => {
                    console.log('Link exit:', err ? 'error' : 'normal');

                    // Reset button
                    linkButton.innerHTML = originalButtonText;
                    linkButton.disabled = false;

                    if (err) {
                        console.error('Link error:', err);
                        alert('Error connecting to bank: ' + (err.display_message || err.error_message || err.message || 'Unknown error'));
                    }
                }
            });

            // Open Plaid Link
            handler.open();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Error connecting bank account');

            // Reset button
            linkButton.innerHTML = originalButtonText;
            linkButton.disabled = false;
        });
}

/**
 * Sets up pagination and filtering for transactions
 */
function setupPaginationAndFiltersAndApply() {
    // Create paginator instance
    paginator = new TransactionPaginator({
        tableId: 'transactions-table',
        pageSizeId: 'page-size',
        defaultPageSize: 50,
        onPageChange: (info) => {
            console.log(`Showing page ${info.currentPage} of ${info.totalPages} (${info.visibleItems} items)`);
        }
    });

    // Create transaction filter
    transactionFilter = new TransactionFilter({
        tableId: 'transactions-table',
        filters: {
            search: 'transaction-search',
            date: 'date-filter',
            category: 'category-filter',
            subcategory: 'subcategory-filter',
            type: 'type-filter'
        },
        onFilterChange: (info) => {
            console.log(`Showing ${info.visibleRows} of ${info.totalRows} transactions`);

            // Reset to first page when filters change
            if (paginator) {
                paginator.goToPage(1);
            }
        },
        paginator: paginator // Connect filter to paginator
    });

    // Make transactionFilter globally available
    window.transactionFilter = transactionFilter;

    // Apply filters immediately
    transactionFilter.applyFilters();

    // No setTimeout here - the caller will apply filters when needed
}

function updateSubcategoryDropdown(categoryFilter) {
    const subcategoryFilter = document.getElementById('subcategory-filter');
    if (!subcategoryFilter) return;

    // Clear existing options only once
    subcategoryFilter.innerHTML = '<option value="all">All Subcategories</option>';
    // Add the new "Uncategorized" option
    subcategoryFilter.innerHTML += '<option value="uncategorized">Uncategorized</option>';

    // Explicitly reset the selected value to "All Subcategories"
    subcategoryFilter.value = 'all';

    fetch('/get_categories')
        .then(response => response.json())
        .then(data => {
            const categories = data.categories || [];
            const uniqueSubcategories = new Set();

            categories.forEach(category => {
                if (categoryFilter !== 'all' && category.name !== categoryFilter) {
                    return;
                }
                if (category.subcategories && category.subcategories.length > 0) {
                    category.subcategories.forEach(subcategory => {
                        // Normalize to prevent duplicates due to case differences
                        uniqueSubcategories.add(subcategory.trim().toLowerCase());
                    });
                }
            });

            // Convert to array, restore original case, and sort
            const subcategoryMap = new Map();
            categories.forEach(category => {
                if (categoryFilter === 'all' || category.name === categoryFilter) {
                    category.subcategories.forEach(sub => {
                        subcategoryMap.set(sub.trim().toLowerCase(), sub);
                    });
                }
            });
            const sortedSubcategories = Array.from(subcategoryMap.values()).sort();

            sortedSubcategories.forEach(subcategory => {
                const option = document.createElement('option');
                option.value = subcategory;
                option.textContent = subcategory;
                subcategoryFilter.appendChild(option);
            });

            // Apply filters after dropdown is updated
            if (window.transactionFilter) {
                window.transactionFilter.applyFilters();
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to fetch subcategories');
        });
}

/**
 * Shows a prompt to re-authenticate with the bank
 */
function showReauthenticationPrompt() {
    // Make the function globally available
    window.showReauthenticationPrompt = showReauthenticationPrompt;
    if (confirm('Your bank requires you to log in again. Would you like to re-authenticate now?')) {
        initiateUpdateMode();
    }
}

/**
 * Initiates Plaid Link in update mode for re-authentication
 */
function initiateUpdateMode() {
    console.log('Starting bank re-authentication...');

    fetch('/create_update_link_token')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to create update link token');
            }
            return response.json();
        })
        .then(data => {
            if (!data.link_token) {
                throw new Error('No link token in response');
            }

            // Initialize Plaid Link in update mode
            const handler = Plaid.create({
                token: data.link_token,
                onSuccess: (public_token, metadata) => {
                    console.log('Re-authentication successful');

                    // Reload accounts and transactions
                    loadAccounts().then(() => {
                        loadTransactions();
                    });

                    alert('Bank account re-authenticated successfully!');
                },
                onExit: (err, metadata) => {
                    if (err) {
                        console.error('Update mode error:', err);
                        alert('Failed to re-authenticate: ' + (err.display_message || err.error_message || 'Unknown error'));
                    }
                }
            });

            handler.open();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Error initiating re-authentication');
        });
}