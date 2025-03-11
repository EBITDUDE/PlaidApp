/**
 * transaction-manager.js - Transaction management functionality for ASB Personal Finance App
 * 
 * This file contains functions for loading, displaying, and manipulating transactions.
 */

/**
 * Sets up event delegation for transaction edit and delete actions
 */
let isEventListenerAttached = false;

function setupTransactionEventHandlers() {
    if (isEventListenerAttached) return; // Skip if already attached

    const txTable = document.getElementById('transactions-body');
    txTable.addEventListener('click', function (event) {
        const target = event.target;

        // Check if the click was on a delete button
        if (target.classList.contains('delete-btn')) {
            handleDeleteButton(target);
            return;
        }

        // Get the transaction row
        const row = target.closest('tr');
        if (row && row.classList.contains('transaction-row')) {
            handleEditTransaction(row);
        }
    });

    isEventListenerAttached = true; // Mark as attached

    // Cancel add/edit transaction
    const cancelAddTransaction = document.getElementById('cancel-add-transaction');
    if (cancelAddTransaction) {
        cancelAddTransaction.addEventListener('click', function () {
            // Hide delete button if it exists
            const deleteButton = document.getElementById('delete-transaction-btn');
            if (deleteButton) {
                deleteButton.style.display = 'none';
            }

            // Reset form mode
            document.getElementById('add-transaction-form').setAttribute('data-mode', 'add');

            // Hide modal
            document.getElementById('add-transaction-modal').style.display = 'none';
        });
    }
}

// Add after setupTransactionEventHandlers
function handleTransactionFormSubmit(event) {
    event.preventDefault();

    // Get form values
    const newDate = document.getElementById('new-date').value;
    const newAmount = document.getElementById('new-amount').value;
    const newType = document.getElementById('new-type').value;
    const newMerchant = document.getElementById('new-merchant').value;
    const newAccount = document.getElementById('new-account').value;

    // Get category and subcategory values from our component
    let newCategory = '';
    let newSubcategory = '';

    if (window.categoryComponent && typeof window.categoryComponent.getValue === 'function') {
        const categoryData = window.categoryComponent.getValue();
        newCategory = categoryData.category;
        newSubcategory = categoryData.subcategory;
    }

    // Validate inputs
    if (!newDate || !newAmount || !newCategory || !newMerchant) {
        alert('Please fill in all required fields');
        return;
    }

    if (newCategory.length > 50) {
        alert('Category name must be 50 characters or less');
        return;
    }

    // Determine if it's a debit based on the type
    const isDebit = newType === 'expense';

    // Create transaction object
    const transaction = {
        date: newDate,
        amount: newAmount,
        is_debit: isDebit,
        category: newCategory,
        subcategory: newSubcategory,
        merchant: newMerchant,
        account_id: newAccount
    };

    // Check if adding or editing
    const form = event.target;
    const mode = form.getAttribute('data-mode') || 'add';

    if (mode === 'edit') {
        // Add transaction ID to the object
        transaction.id = form.getAttribute('data-id');

        // Update the transaction
        updateTransaction(transaction);
    } else {
        // Add a new transaction
        addTransaction(transaction);
    }
}

function updateTransaction(transaction) {
    fetch('/update_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Transaction updated:', data);

            // Reset form
            document.getElementById('add-transaction-form').setAttribute('data-mode', 'add');

            // Hide delete button
            const deleteButton = document.getElementById('delete-transaction-btn');
            if (deleteButton) {
                deleteButton.style.display = 'none';
            }

            // Hide modal
            document.getElementById('add-transaction-modal').style.display = 'none';

            // Refresh transactions
            loadTransactions();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Error updating transaction');
        });
}

/**
 * Adds a new transaction
 * 
 * @param {Object} transaction - Transaction data to add
 */
function addTransaction(transaction) {
    fetch('/add_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Transaction added:', data);

            // Reset form fields
            document.getElementById('new-date').value = formatDate(new Date()); // Default to today
            document.getElementById('new-amount').value = '';
            document.getElementById('new-merchant').value = '';

            // Reset category safely
            if (window.categoryComponent && typeof window.categoryComponent.setValue === 'function') {
                window.categoryComponent.setValue({
                    category: '',
                    subcategory: ''
                });
            }

            // Hide modal
            document.getElementById('add-transaction-modal').style.display = 'none';

            // Refresh transactions
            loadTransactions();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Error adding transaction');
        });
}

/**
 * Handler for delete button clicks
 */
function handleDeleteButton(button) {
    const row = button.closest('tr');
    const txId = row.getAttribute('data-id');

    if (confirm('Are you sure you want to delete this transaction?')) {
        deleteTransaction(txId);
    }
}

function handleEditTransaction(row) {
    // Get transaction data from row attributes
    const txId = row.getAttribute('data-id');
    const txCategory = row.getAttribute('data-category');
    const txSubcategory = row.getAttribute('data-subcategory');
    const txDate = row.getAttribute('data-date');
    const txAmount = row.getAttribute('data-amount');
    const txIsDebit = row.getAttribute('data-is-debit') === 'true';
    const txMerchant = row.getAttribute('data-merchant');
    const txAccountId = row.getAttribute('data-account-id');

    // Store the original category data for the transaction
    // This way we can create selective rules that only apply to similar transactions
    row.originalCategory = txCategory;
    row.originalSubcategory = txSubcategory;

    // Get modal elements
    const modal = document.getElementById('add-transaction-modal');
    const modalTitle = modal.querySelector('h3');
    const form = document.getElementById('add-transaction-form');
    const submitButton = form.querySelector('button[type="submit"]');
    const modalFooter = modal.querySelector('.modal-footer');

    // Change modal title and button text
    modalTitle.textContent = 'Edit Transaction';
    submitButton.textContent = 'Save Changes';

    // Set form to edit mode
    form.setAttribute('data-mode', 'edit');
    form.setAttribute('data-id', txId);

    // Populate form fields
    document.getElementById('new-date').value = txDate;
    document.getElementById('new-amount').value = txAmount;
    document.getElementById('new-type').value = txIsDebit ? 'expense' : 'income';
    document.getElementById('new-merchant').value = txMerchant;

    // Set category and subcategory
    if (window.categoryComponent && typeof window.categoryComponent.setValue === 'function') {
        window.categoryComponent.setValue({
            category: txCategory,
            subcategory: txSubcategory
        });
    }

    // Create a "Create Rule" button if it doesn't exist
    let createRuleBtn = document.getElementById('create-rule-btn');
    if (!createRuleBtn) {
        // Create the rule button container
        const categoryContainer = document.getElementById('new-category-container');
        if (categoryContainer) {
            const ruleButtonContainer = document.createElement('div');
            ruleButtonContainer.style.marginTop = '10px';

            // Create the button
            createRuleBtn = document.createElement('button');
            createRuleBtn.id = 'create-rule-btn';
            createRuleBtn.type = 'button';
            createRuleBtn.className = 'btn-primary';
            createRuleBtn.style.fontSize = '0.9em';
            createRuleBtn.innerHTML = '<span style="font-size: 1.2em;">+</span> Create Rule';

            // Add button to container
            ruleButtonContainer.appendChild(createRuleBtn);

            // Add container after category dropdown
            categoryContainer.parentNode.insertBefore(ruleButtonContainer, categoryContainer.nextSibling);
        }
    }

    // Add click event to rule button
    if (createRuleBtn) {
        // Remove any existing event listeners to avoid duplicates
        const newBtn = createRuleBtn.cloneNode(true);
        createRuleBtn.parentNode.replaceChild(newBtn, createRuleBtn);
        createRuleBtn = newBtn;

        // Add new event listener
        createRuleBtn.addEventListener('click', function () {
            // Get current transaction data
            const transactionData = {
                merchant: document.getElementById('new-merchant').value,
                amount: document.getElementById('new-amount').value,
                is_debit: document.getElementById('new-type').value === 'expense',
                category: window.categoryComponent ? window.categoryComponent.getValue().category : '',
                subcategory: window.categoryComponent ? window.categoryComponent.getValue().subcategory : '',
                // Add original category data for selective rule creation
                originalCategory: row.originalCategory,
                originalSubcategory: row.originalSubcategory
            };

            // Show rule modal with transaction data
            showRuleModal(transactionData);

            // Initialize rule category dropdown
            initRuleCategoryDropdown();
        });
    }

    // First, update account dropdown and pass the account ID to select
    // This ensures the dropdown is populated before we try to select a value
    updateAccountDropdown(txAccountId).then(() => {
        // Log debug info
        console.log('Account dropdown updated and account selected:', {
            txAccountId,
            accountValue: document.getElementById('new-account').value,
            mappedName: txAccountId ? window.accountsMap[String(txAccountId)] : null
        });
    }).catch(err => {
        ErrorUtils.handleError(err, 'Error updating account dropdown');

        // As a fallback, try direct selection if dropdown update failed
        const accountSelect = document.getElementById('new-account');
        if (accountSelect && txAccountId) {
            accountSelect.value = txAccountId;
            console.log('Fallback account selection result:', accountSelect.value);
        }
    });

    // Add delete button if it doesn't exist
    let deleteButton = document.getElementById('delete-transaction-btn');
    if (!deleteButton) {
        deleteButton = document.createElement('button');
        deleteButton.id = 'delete-transaction-btn';
        deleteButton.type = 'button';
        deleteButton.className = 'btn-danger';
        deleteButton.textContent = 'Delete';
        deleteButton.style.marginRight = '10px';
        deleteButton.addEventListener('click', function () {
            if (confirm('Are you sure you want to delete this transaction?')) {
                const txId = form.getAttribute('data-id');
                deleteTransaction(txId, modal);
            }
        });
        modalFooter.insertBefore(deleteButton, document.getElementById('cancel-add-transaction'));
    } else {
        deleteButton.style.display = 'inline-block';
    }

    // Show modal
    modal.style.display = 'block';
}

// Helper function to delete a transaction
function deleteTransaction(txId, modal) {
    fetch('/delete_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId })
    })
        .then(response => response.json())
        .then(data => {
            console.log('Transaction deleted:', data);

            // Hide modal
            modal.style.display = 'none';

            // Refresh transactions
            loadTransactions();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to delete transaction');
        });
}

/**
 * Loads transactions from the server
 */
function loadTransactions() {
    console.log("Loading transactions...");

    // Add a loading indicator
    const txTable = document.getElementById('transactions-body');
    const txSection = document.getElementById('transactions-section');

    // Check if we already have filters/paginator that we want to preserve
    const hadExistingFilters = window.transactionFilter != null;
    if (hadExistingFilters) {
        console.log("Preserving existing filters during transaction reload");
    }

    // Clear previous content and show loading
    txTable.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 20px;">
                <div class="loading" style="display: inline-block; width: 30px; height: 30px; 
                    border: 3px solid rgba(0,0,0,0.3); border-radius: 50%; 
                    border-top-color: #3498db; animation: spin 1s ease-in-out infinite;">
                    Loading...
                </div>
            </td>
        </tr>
    `;
    txSection.style.display = 'block';

    // Get the selected page size (for display purposes only)
    const pageSizeSelect = document.getElementById('page-size');

    // Always fetch ALL transactions for client-side pagination
    const fetchSize = 10000;

    console.log(`Fetching all transactions (up to ${fetchSize}) for client-side pagination`);

    // Fetch transactions with a large page size to get everything at once
    fetch(`/get_transactions?page=1&page_size=${fetchSize}`)
        .then(response => {
            console.log("Transaction response status:", response.status);

            // Check for HTTP errors
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.json();
        })
        .then(data => {
            // Store pagination data globally for debugging
            window.lastPaginationData = data.pagination;

            console.log("Received transaction data:", {
                transactionCount: data.transactions.length,
                pagination: data.pagination
            });

            // Clear loading indicator
            txTable.innerHTML = '';

            // Handle different potential response scenarios
            if (data.error) {
                console.error("Server-side transaction error:", data.error);

                // Show error message in the table
                const errorRow = document.createElement('tr');
                errorRow.innerHTML = `
                    <td colspan="6" style="text-align: center; color: red; padding: 20px;">
                        Error loading transactions: ${data.error}
                    </td>
                `;
                txTable.appendChild(errorRow);
                return;
            }

            // Verify transactions exist
            const transactions = data.transactions || [];
            if (transactions.length === 0) {
                console.warn("No transactions found");

                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `
                    <td colspan="6" style="text-align: center; color: #666; padding: 20px;">
                        No transactions available. Connect a bank account or add manual transactions.
                    </td>
                `;
                txTable.appendChild(emptyRow);
                return;
            }

            // Display transactions with a callback to set up and apply filters after DOM is updated
            displayTransactions(transactions, () => {
                // Setup pagination and filters in one step
                setupPaginationAndFiltersAndApply();
            });
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load transactions');

            // Show error in table
            const errorRow = document.createElement('tr');
            errorRow.innerHTML = `
                <td colspan="6" style="text-align: center; color: red; padding: 20px;">
                    Error fetching transactions: ${err.message}
                    <br>
                    <small>Check console for more details</small>
                </td>
            `;
            txTable.appendChild(errorRow);
        });
}

/**
 * Creates a transaction row using DOM methods instead of innerHTML
 * @param {Object} tx - Transaction object
 * @param {Object} accountsMap - Map of account IDs to account names
 * @returns {HTMLElement} - The created table row
 */
function createTransactionRow(tx, accountsMap) {
    const row = document.createElement('tr');
    row.className = 'transaction-row'; // Add class for styling and selection

    // Store all transaction data as attributes
    row.setAttribute('data-id', tx.id);
    row.setAttribute('data-category', tx.category);
    row.setAttribute('data-subcategory', tx.subcategory || '');
    row.setAttribute('data-date', tx.date);
    row.setAttribute('data-raw-date', tx.raw_date || tx.date);
    row.setAttribute('data-type', tx.is_debit ? 'expense' : 'income');
    row.setAttribute('data-amount', tx.amount);
    row.setAttribute('data-merchant', tx.merchant);
    row.setAttribute('data-account-id', tx.account_id || '');
    row.setAttribute('data-is-debit', tx.is_debit.toString());

    // Date cell - remove editable class
    const dateCell = document.createElement('td');
    dateCell.textContent = tx.date;
    row.appendChild(dateCell);

    // Amount cell - remove editable class
    const amountCell = document.createElement('td');
    if (!tx.is_debit) {
        amountCell.classList.add('income-amount');
    }
    amountCell.textContent = formatAmount(tx);
    row.appendChild(amountCell);

    // Type cell
    const typeCell = document.createElement('td');
    typeCell.textContent = tx.is_debit ? 'Expense' : 'Income';
    row.appendChild(typeCell);

    // Category cell - remove editable class
    const categoryCell = document.createElement('td');
    categoryCell.textContent = tx.category;
    row.appendChild(categoryCell);

    // Subcategory cell - remove editable class
    const subcategoryCell = document.createElement('td');
    subcategoryCell.textContent = tx.subcategory || '—';
    row.appendChild(subcategoryCell);

    // Merchant cell - remove editable class
    const merchantCell = document.createElement('td');
    merchantCell.textContent = tx.merchant;
    row.appendChild(merchantCell);

    // Account cell
    const accountCell = document.createElement('td');
    let accountDisplay;
    if (tx.account_id) {
        accountDisplay = accountsMap[tx.account_id] ||
            tx.account_name ||
            `Account ${tx.account_id.substring(0, 8)}...`;
    } else {
        accountDisplay = 'No Account';
    }
    accountCell.textContent = accountDisplay;
    row.appendChild(accountCell);

    return row;
}

/**
 * Displays transactions in the transaction table
 * 
 * @param {Array} transactions - Array of transaction objects
 * @param {Function} callback - Optional callback to run after transactions are displayed
 */
function displayTransactions(transactions, callback) {
    console.log('Displaying transactions:', {
        totalTransactions: transactions.length,
        paginationDetails: window.lastPaginationData
    });

    const txTable = document.getElementById('transactions-body');
    const txSection = document.getElementById('transactions-section');
    const categoryFilter = document.getElementById('category-filter');

    if (transactions.length > 0) {
        txSection.style.display = 'block';

        // Populate the category filter dropdown
        const categories = [...new Set(transactions.map(tx => tx.category))].sort();
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';

        // Use a document fragment for batch DOM updates
        const categoryFragment = document.createDocumentFragment();
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFragment.appendChild(option);
        });
        categoryFilter.appendChild(categoryFragment);

        const accountsPromise = window.accountsMap && Object.keys(window.accountsMap).length > 0
            ? Promise.resolve(window.accountsMap)
            : fetchAndStoreAccounts();

        // Fetch accounts before showing transactions
        return accountsPromise.then(accountsMap => {
            // Create a document fragment for transaction rows
            const fragment = document.createDocumentFragment();

            // Create and add each transaction row to the fragment
            transactions.forEach((tx) => {
                const row = createTransactionRow(tx, accountsMap);
                fragment.appendChild(row);
            });

            // Clear previous content
            txTable.innerHTML = '';

            // Add all rows at once
            txTable.appendChild(fragment);

            // Call the callback if provided
            if (typeof callback === 'function') {
                callback();
            }
        });
    } else {
        // Handle empty case
        txTable.innerHTML = '';

        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.setAttribute('colspan', '6');
        emptyCell.style.textAlign = 'center';
        emptyCell.style.color = '#666';
        emptyCell.style.padding = '20px';
        emptyCell.textContent = 'No transactions available. Connect a bank account or add manual transactions.';

        emptyRow.appendChild(emptyCell);
        txTable.appendChild(emptyRow);

        // Call the callback even in the empty case
        if (typeof callback === 'function') {
            callback();
        }
    }
}

/**
 * Processes transaction data and calculates monthly category totals
 * 
 * @param {Array} transactions - List of transaction objects
 * @param {Date} startDate - Start date of the range to include
 * @param {Date} endDate - End date of the range to include
 * @returns {Object} Object containing monthly totals and month list
 */
function calculateMonthlyCategoryTotals(transactions, startDate, endDate) {
    // Initialize structures using objects instead of repeatedly searching arrays
    const monthlyTotals = {};
    const allCategories = new Set();
    const months = new Set();

    // First, collect all categories from all transactions (not just filtered ones)
    // This ensures we display all categories even if they have no transactions in the selected range
    transactions.forEach(tx => {
        if (tx.category) {
            allCategories.add(tx.category);
        }
    });

    // If we don't have any categories yet, check if we can fetch from category filter
    if (allCategories.size === 0) {
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            Array.from(categoryFilter.options).forEach(option => {
                if (option.value !== 'all') {
                    allCategories.add(option.value);
                }
            });
        }
    }

    // Generate all months in the date range
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    // Add each month in the range to the months set
    let current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;
        months.add(monthKey);

        // Initialize each month in the totals object
        monthlyTotals[monthKey] = {};

        // Pre-initialize zero amounts for all categories in this month
        allCategories.forEach(category => {
            monthlyTotals[monthKey][category] = 0;
        });

        // Move to next month
        current.setMonth(current.getMonth() + 1);
    }

    // Process each transaction - Single pass through all transactions
    transactions.forEach(tx => {
        // Skip transactions without dates
        if (!tx.raw_date) return;

        try {
            // Extract month-year
            let monthYear;
            let txDate;

            if (typeof tx.raw_date === 'string') {
                // Parse date string in format YYYY-MM-DD
                const match = tx.raw_date.match(/^(\d{4})-(\d{2})/);
                if (match) {
                    monthYear = `${match[1]}-${match[2]}`; // YYYY-MM format
                    txDate = new Date(tx.raw_date);
                } else {
                    console.warn(`Couldn't parse date: ${tx.raw_date}`);
                    return;
                }
            } else {
                // Assume it's a Date object
                txDate = new Date(tx.raw_date);
                if (isNaN(txDate.getTime())) {
                    console.warn(`Invalid date: ${tx.raw_date}`);
                    return;
                }

                const year = txDate.getFullYear();
                const month = String(txDate.getMonth() + 1).padStart(2, '0');
                monthYear = `${year}-${month}`;
            }

            // Skip if month is not in our range
            if (!months.has(monthYear)) return;

            // Skip if no category
            if (!tx.category) return;

            // Add amount (negative for expenses, positive for income)
            const amount = tx.is_debit ? -tx.amount : tx.amount;
            monthlyTotals[monthYear][tx.category] += amount;
        } catch (err) {
            ErrorUtils.handleError(err, 'Failed to process transaction for monthly totals');
        }
    });

    // Convert to array format for display - Use sorted months and categories for consistency
    const sortedMonths = Array.from(months).sort();
    const sortedCategories = Array.from(allCategories).sort();

    const monthlyTable = sortedCategories.map(category => {
        const row = { category };

        sortedMonths.forEach(monthKey => {
            // Format month for display (e.g., "Jan 2023")
            const [year, month] = monthKey.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthDisplay = `${monthNames[parseInt(month) - 1]} ${year}`;

            // Get amount (default to 0)
            const amount = monthlyTotals[monthKey]?.[category] || 0;

            // Display dash for zero amounts, otherwise format as currency
            row[monthDisplay] = amount === 0 ? "–" : formatCurrency(Math.abs(amount));
        });

        return row;
    });

    // Convert month keys to display format
    const displayMonths = sortedMonths.map(monthKey => {
        const [year, month] = monthKey.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    return {
        monthlyTable,
        months: displayMonths
    };
}

/**
 * Renders monthly category totals in the UI
 * 
 * @param {Array} categoryTotals - Processed category totals data
 * @param {Array} months - List of months to display
 */
function displayMonthlyCategoryTotals(categoryTotals, months) {
    const tableHeader = document.getElementById('monthly-category-header').querySelector('tr');
    const tableBody = document.getElementById('monthly-category-body');
    const tableSection = document.getElementById('monthly-category-section');

    if (!tableHeader || !tableBody || !tableSection) {
        console.error('Monthly category table elements not found');
        return;
    }

    if (categoryTotals.length > 0) {
        tableSection.style.display = 'block';

        // Clear existing headers except the first one (Category)
        while (tableHeader.children.length > 1) {
            tableHeader.removeChild(tableHeader.lastChild);
        }

        // Add month headers
        months.forEach(month => {
            const th = document.createElement('th');
            th.textContent = month;
            th.style.position = 'sticky'; // Helpful for wide tables
            th.style.top = '0';
            tableHeader.appendChild(th);
        });

        // Add category rows
        tableBody.innerHTML = '';

        categoryTotals.forEach(row => {
            const tr = document.createElement('tr');

            // Add category name
            const categoryCell = document.createElement('td');
            categoryCell.textContent = row.category;
            categoryCell.style.position = 'sticky'; // Optional: make category sticky as well
            categoryCell.style.left = '0';
            tr.appendChild(categoryCell);

            // Add amounts for each month
            months.forEach(month => {
                const td = document.createElement('td');

                if (row[month]) {
                    // Parse amount string to get numeric value for color coding
                    let numericValue = 0;

                    if (typeof row[month] === 'string' && row[month].startsWith('$')) {
                        // Parse currency string
                        numericValue = parseFloat(row[month].replace(/[$,]/g, '')) || 0;
                    } else {
                        numericValue = parseFloat(row[month]) || 0;
                    }

                    // Set text content
                    td.textContent = typeof row[month] === 'string' ? row[month] : formatCurrency(row[month]);

                } else {
                    td.textContent = '$0.00';
                }

                tr.appendChild(td);
            });

            tableBody.appendChild(tr);
        });
    }
}

/**
 * Helper function to format transaction amount display
 * 
 * @param {Object} tx - Transaction object
 * @returns {string} Formatted amount string
 */
function formatAmount(tx) {
    const isIncome = !tx.is_debit;
    const amountPrefix = isIncome ? '+' : '';
    const amountDisplay = `${amountPrefix}${formatCurrency(tx.amount)}`;
    return amountDisplay;
}