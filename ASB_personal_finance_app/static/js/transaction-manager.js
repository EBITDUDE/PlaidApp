/**
 * transaction-manager.js - Transaction management functionality for ASB Personal Finance App
 * 
 * This file contains functions for loading, displaying, and manipulating transactions.
 */

function setupTransactionEventHandlers() {
    const txTable = document.getElementById('transactions-body');

    // Use event delegation for dynamic content
    EventManager.delegate(txTable, 'click', '.delete-btn', function (e) {
        e.stopPropagation();
        handleDeleteButton(this);
    });

    EventManager.delegate(txTable, 'click', '.transaction-row', function (e) {
        if (!e.target.closest('button')) {
            handleEditTransaction(this);
        }
    });

    // Setup form handlers with cleanup
    const cancelBtn = document.getElementById('cancel-add-transaction');
    if (cancelBtn) {
        EventManager.on(cancelBtn, 'click', function () {
            const deleteButton = document.getElementById('delete-transaction-btn');
            if (deleteButton) {
                deleteButton.style.display = 'none';
            }

            const form = document.getElementById('add-transaction-form');
            form.setAttribute('data-mode', 'add');

            document.getElementById('add-transaction-modal').style.display = 'none';
        });
    }
}

// Add after setupTransactionEventHandlers
function handleTransactionFormSubmit(event) {
    event.preventDefault();

    // Gather form data
    const transaction = {
        date: document.getElementById('new-date').value,
        amount: document.getElementById('new-amount').value,
        is_debit: document.getElementById('new-type').value === 'expense',
        category: '', // Will be set below
        subcategory: '',
        merchant: document.getElementById('new-merchant').value,
        account_id: document.getElementById('new-account').value
    };

    // Get category data
    const categoryComponent = AppState.getComponent('categoryComponent');
    if (categoryComponent) {
        const categoryData = categoryComponent.getValue();
        transaction.category = categoryData.category;
        transaction.subcategory = categoryData.subcategory;
    }

    // Sanitize inputs before sending
    transaction.merchant = transaction.merchant.replace(/<[^>]*>/g, ''); // Strip HTML
    transaction.amount = parseFloat(transaction.amount) || 0;

    // Validate amount range
    if (transaction.amount <= 0 || transaction.amount > 999999.99) {
        alert('Amount must be between $0.01 and $999,999.99');
        return;
    }

    // Validate before submitting
    const errors = InputValidator.validateTransaction(transaction);
    if (errors.length > 0) {
        alert('Please fix the following errors:\n' + errors.join('\n'));
        return;
    }

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
    EventManager.cleanupElement(document.getElementById('add-transaction-modal'));
    
    securePost('/update_transaction', transaction)
        .then(response => response.json())
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

            // Sync categories first
            syncCategories().then(() => {
                // Update just the affected row and filters
                updateTransactionAndFilters(transaction);
            });
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
    securePost('/add_transaction', transaction)
        .then(response => response.json())
        .then(data => {
            console.log('Transaction added:', data);

            // Reset form fields
            document.getElementById('new-date').value = formatDate(new Date());
            document.getElementById('new-amount').value = '';
            document.getElementById('new-merchant').value = '';

            // Reset category safely
            const categoryComponent = AppState.getComponent('categoryComponent');
            if (categoryComponent && typeof categoryComponent.setValue === 'function') {
                categoryComponent.setValue({
                    category: '',
                    subcategory: ''
                });
            }

            // Hide modal
            document.getElementById('add-transaction-modal').style.display = 'none';

            // Sync categories with transactions
            syncCategories().then(() => {
                loadTransactions();
            });
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
    document.getElementById('new-merchant').value = InputValidator.sanitizeForDisplay(txMerchant);

    // Set category and subcategory
    const categoryComponent = AppState.getComponent('categoryComponent');
    if (categoryComponent && typeof categoryComponent.setValue === 'function') {
        categoryComponent.setValue({
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
            createRuleBtn.style.fontSize = '0.75em';
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
                category: categoryComponent ? categoryComponent.getValue().category : '',
                subcategory: categoryComponent ? categoryComponent.getValue().subcategory : '',
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
            mappedName: txAccountId ? AppState.getAccountsMap()[String(txAccountId)] : null
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
    // Use securePost instead of fetch
    securePost('/delete_transaction', { id: txId })
        .then(response => response.json())
        .then(data => {
            console.log('Transaction deleted:', data);

            // Hide modal
            if (modal) {
                modal.style.display = 'none';
            }

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

    cleanupBeforeNavigation();

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
    safeFetch(`/get_transactions?page=1&page_size=${fetchSize}`)
        .then(response => {
            console.log("Transaction response status:", response.status);

            // Check for authentication errors
            if (response.status === 401) {
                return response.json().then(data => {
                    if (data.error_code === 'ITEM_LOGIN_REQUIRED') {
                        if (typeof window.showReauthenticationPrompt === 'function') {
                            window.showReauthenticationPrompt();
                        }
                        throw new Error('Re-authentication required');
                    }
                    throw new Error(data.error || 'Authentication failed');
                });
            }

            // Check for other HTTP errors
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

// Optimized row creation with minimal DOM access
function createTransactionRow(tx, accountsMap) {
    const row = document.createElement('tr');
    row.className = 'transaction-row';

    // Set all attributes at once
    const attributes = {
        'data-id': tx.id,
        'data-category': tx.category,
        'data-subcategory': tx.subcategory || '',
        'data-date': tx.date,
        'data-raw-date': tx.raw_date || tx.date,
        'data-type': tx.is_debit ? 'expense' : 'income',
        'data-amount': tx.amount,
        'data-merchant': tx.merchant,
        'data-account-id': tx.account_id || '',
        'data-is-debit': tx.is_debit.toString()
    };

    Object.entries(attributes).forEach(([key, value]) => {
        row.setAttribute(key, value);
    });

    // Create cells efficiently
    const cells = [
        tx.date,
        formatAmount(tx),
        tx.is_debit ? 'Expense' : 'Income',
        tx.category,
        tx.subcategory || '—',
        tx.merchant,
        accountsMap[tx.account_id] || 'No Account'
    ];

    // When creating cells, sanitize the content:
    cells.forEach((content, index) => {
        const cell = document.createElement('td');

        // Add special styling for amount column
        if (index === 1 && !tx.is_debit) {
            cell.classList.add('income-amount');
        }

        cell.textContent = content;

        row.appendChild(cell);
    });

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
        totalTransactions: transactions.length
    });

    const txTable = document.getElementById('transactions-body');
    const txSection = document.getElementById('transactions-section');

    // Clean up any existing event listeners on the table before adding new rows
    EventManager.cleanupElement(txTable);

    if (transactions.length === 0) {
        txTable.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #666; padding: 20px;">
                    No transactions available. Connect a bank account or add manual transactions.
                </td>
            </tr>
        `;
        if (callback) callback();
        return;
    }

    txSection.style.display = 'block';

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
        // Create document fragment for batch DOM updates
        const fragment = document.createDocumentFragment();
        const accountsMap = AppState.getAllAccounts().reduce((map, acc) => {
            map[acc.id] = acc.name;
            return map;
        }, {});

        // Process transactions in chunks to avoid blocking
        const chunkSize = 100;
        let index = 0;

        function processChunk() {
            const chunk = transactions.slice(index, index + chunkSize);

            chunk.forEach(tx => {
                const row = createTransactionRow(tx, accountsMap);
                fragment.appendChild(row);
            });

            index += chunkSize;

            if (index < transactions.length) {
                // Process next chunk on next frame
                requestAnimationFrame(processChunk);
            } else {
                // All chunks processed, update DOM once
                txTable.innerHTML = '';
                txTable.appendChild(fragment);

                // Update category filter efficiently
                updateCategoryFilter(transactions);

                if (callback) callback();
            }
        }

        processChunk();
    });
}

// Add this method to handle incremental updates
function updateTransactionRow(txId, updates) {
    const row = document.querySelector(`tr[data-id="${txId}"]`);
    if (!row) return;

    // Update date if provided
    if (updates.date !== undefined) {
        row.setAttribute('data-date', updates.date);
        row.setAttribute('data-raw-date', updates.date);
        const dateCell = row.cells[0];
        if (dateCell) dateCell.textContent = updates.date;
    }

    // Update amount and type if provided
    if (updates.amount !== undefined || updates.is_debit !== undefined) {
        // Get current values if not provided
        const amount = updates.amount !== undefined ? updates.amount : row.getAttribute('data-amount');
        const isDebit = updates.is_debit !== undefined ? updates.is_debit : (row.getAttribute('data-is-debit') === 'true');

        // Update attributes
        if (updates.amount !== undefined) {
            row.setAttribute('data-amount', updates.amount);
        }
        if (updates.is_debit !== undefined) {
            row.setAttribute('data-is-debit', updates.is_debit.toString());
            row.setAttribute('data-type', updates.is_debit ? 'expense' : 'income');
        }

        // Update display cells
        const amountCell = row.cells[1];
        const typeCell = row.cells[2];

        if (amountCell) {
            const tx = { amount: amount, is_debit: isDebit };
            amountCell.textContent = formatAmount(tx);
            amountCell.className = isDebit ? '' : 'income-amount';
        }

        if (typeCell) {
            typeCell.textContent = isDebit ? 'Expense' : 'Income';
        }
    }

    // Update category
    if (updates.category !== undefined) {
        row.setAttribute('data-category', updates.category);
        const categoryCell = row.cells[3];
        if (categoryCell) categoryCell.textContent = updates.category;
    }

    // Update subcategory
    if (updates.subcategory !== undefined) {
        row.setAttribute('data-subcategory', updates.subcategory);
        const subcategoryCell = row.cells[4];
        if (subcategoryCell) subcategoryCell.textContent = updates.subcategory || '—';
    }

    // Update merchant
    if (updates.merchant !== undefined) {
        row.setAttribute('data-merchant', updates.merchant);
        const merchantCell = row.cells[5];
        if (merchantCell) merchantCell.textContent = updates.merchant;
    }

    // Update account
    if (updates.account_id !== undefined) {
        row.setAttribute('data-account-id', updates.account_id);
        const accountCell = row.cells[6];
        if (accountCell) {
            // Get account name from AppState
            const accountsMap = AppState.getAccountsMap();
            accountCell.textContent = accountsMap[updates.account_id] || 'No Account';
        }
    }

    // Apply filters to potentially hide/show the row
    if (window.transactionFilter) {
        window.transactionFilter.applyFilters();
    }
}

function updateTransactionAndFilters(transaction) {
    // Update the specific row with all changed fields
    updateTransactionRow(transaction.id, {
        date: transaction.date,
        amount: transaction.amount,
        is_debit: transaction.is_debit,
        category: transaction.category,
        subcategory: transaction.subcategory,
        merchant: transaction.merchant,
        account_id: transaction.account_id
    });

    // Update category filter if new category was added
    const categoryFilter = document.getElementById('category-filter');
    const categoryExists = Array.from(categoryFilter.options)
        .some(option => option.value === transaction.category);

    if (!categoryExists && transaction.category) {
        // Add new category to filter
        const newOption = document.createElement('option');
        newOption.value = transaction.category;
        newOption.textContent = transaction.category;

        // Insert in alphabetical order
        const options = Array.from(categoryFilter.options);
        const insertIndex = options.findIndex(opt =>
            opt.value !== 'all' && opt.textContent > transaction.category
        );

        if (insertIndex === -1) {
            categoryFilter.appendChild(newOption);
        } else {
            categoryFilter.insertBefore(newOption, options[insertIndex]);
        }
    }
}

function updateCategoryFilter(transactions) {
    const categoryFilter = document.getElementById('category-filter');

    // Use Set for unique categories
    const categories = new Set();
    transactions.forEach(tx => {
        if (tx.category) categories.add(tx.category);
    });

    // Convert to sorted array
    const sortedCategories = Array.from(categories).sort();

    // Build options HTML at once
    const optionsHTML = ['<option value="all">All Categories</option>'];
    sortedCategories.forEach(category => {
        optionsHTML.push(`<option value="${category}">${category}</option>`);
    });

    categoryFilter.innerHTML = optionsHTML.join('');
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

// Add this helper function for syncing categories
function syncCategories() {
    // Use securePost instead of fetch
    return securePost('/sync_transaction_categories', {})
        .then(response => response.json())
        .then(result => {
            if (result.added_categories > 0 || result.added_subcategories > 0) {
                console.log(`Category sync found ${result.added_categories} new categories and ${result.added_subcategories} new subcategories`);

                const categoryComponent = AppState.getComponent('categoryComponent');
                if (categoryComponent && typeof categoryComponent.reload === 'function') {
                    categoryComponent.reload();
                }
            }
            return result;
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to sync categories');
            throw err; // Re-throw to handle in calling function
        });
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