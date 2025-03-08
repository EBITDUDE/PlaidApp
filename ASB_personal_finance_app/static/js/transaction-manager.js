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
        if (target.classList.contains('editable')) {
            handleEditableCell(target);
        } else if (target.classList.contains('delete-btn')) {
            handleDeleteButton(target);
        }
    });
    isEventListenerAttached = true; // Mark as attached
}

/**
 * Handler for editable cell clicks
 */
function handleEditableCell(cell) {
    const field = cell.getAttribute('data-field');
    const row = cell.closest('tr');
    const txId = row.getAttribute('data-id');
    const currentValue = cell.textContent.trim();

    // Don't allow editing if already in edit mode
    if (cell.querySelector('input, select')) return;

    // Store original content to restore if edit is cancelled
    const originalContent = cell.innerHTML;

    // Create edit interface based on field type
    let editHtml = '';

    if (field === 'date') {
        editHtml = `<input type="text" class="edit-input" value="${currentValue}" placeholder="MM/DD/YYYY">`;
    } else if (field === 'amount') {
        // Strip currency formatting
        let numValue = currentValue.replace(/[^0-9.-]+/g, '');
        if (numValue.startsWith('+')) numValue = numValue.substring(1);
        editHtml = `<input type="text" class="edit-input" value="${numValue}" placeholder="0.00">`;
    } else if (field === 'category') {
        // Extract category and subcategory
        let category = currentValue;
        let subcategory = cell.getAttribute('data-subcategory') || '';

        // If display includes subcategory, parse it out
        if (currentValue.includes(' › ')) {
            const parts = currentValue.split(' › ');
            category = parts[0];
            subcategory = parts[1];
        }

        // Create container for the category editor
        editHtml = `<div id="tx-category-editor"></div>`;

        // Set the cell content to the edit interface
        cell.innerHTML = editHtml;

        // Create the category dropdown
        const categoryEditor = createCategoryDropdown({
            containerId: 'tx-category-editor',
            inputName: 'tx-category',
            subcategoryInputName: 'tx-subcategory',
            required: false
        });

        // Set the initial value
        categoryEditor.setValue({
            category: category,
            subcategory: subcategory
        });

        // Create a save button
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'save-btn';
        saveBtn.style.marginTop = '5px';
        saveBtn.style.padding = '2px 5px';
        saveBtn.style.backgroundColor = '#4CAF50';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '3px';
        saveBtn.style.cursor = 'pointer';

        // Create a cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'cancel-btn';
        cancelBtn.style.marginTop = '5px';
        cancelBtn.style.marginLeft = '5px';
        cancelBtn.style.padding = '2px 5px';
        cancelBtn.style.backgroundColor = '#f8f8f8';
        cancelBtn.style.border = '1px solid #ddd';
        cancelBtn.style.borderRadius = '3px';
        cancelBtn.style.cursor = 'pointer';

        // Add buttons to the cell
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.appendChild(saveBtn);
        buttonContainer.appendChild(cancelBtn);
        cell.appendChild(buttonContainer);

        // Save button handler
        saveBtn.addEventListener('click', function () {
            const value = categoryEditor.getValue();
            if (!value.category) {
                alert('Please select a category');
                return;
            }

            // Update transaction with new category and subcategory
            updateTransactionCategory(txId, value.category, value.subcategory, cell, originalContent);
        });

        // Cancel button handler
        cancelBtn.addEventListener('click', function () {
            cell.innerHTML = originalContent;
        });

        // Don't proceed with the rest of the function
        return;
    } else if (field === 'subcategory') {
        editHtml = `<input type="text" class="edit-input" value="${currentValue}">`;
    } else if (field === 'merchant') {
        editHtml = `<input type="text" class="edit-input" value="${currentValue}">`;
    } else if (field === 'type') {
        const isDebit = row.querySelector('[data-field="amount"]').getAttribute('data-is-debit') === 'true';
        editHtml = `
            <select class="edit-input">
                <option value="expense" ${isDebit ? 'selected' : ''}>Expense</option>
                <option value="income" ${!isDebit ? 'selected' : ''}>Income</option>
            </select>
        `;
    }

    // Set the cell content to the edit interface (for non-category fields)
    if (editHtml) {
        cell.innerHTML = editHtml;
        const input = cell.querySelector('.edit-input');
        input.focus();

        // Handler for save on Enter or blur
        const saveEdit = () => {
            let newValue = input.value.trim();

            // For select elements, get the selected option
            if (input.tagName === 'SELECT') {
                newValue = input.options[input.selectedIndex].value;
            }

            // Don't save if empty
            if (!newValue) {
                cell.innerHTML = originalContent;
                return;
            }

            // Process based on field type
            if (field === 'date') {
                // Validate date format
                if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(newValue)) {
                    alert('Please use MM/DD/YYYY format');
                    cell.innerHTML = originalContent;
                    return;
                }

                updateTransactionField(txId, 'date', newValue, cell, originalContent);
            } else if (field === 'amount') {
                // Validate amount
                if (isNaN(parseFloat(newValue))) {
                    alert('Please enter a valid number');
                    cell.innerHTML = originalContent;
                    return;
                }

                const isDebit = row.querySelector('[data-field="amount"]').getAttribute('data-is-debit') === 'true';
                updateTransactionField(txId, 'amount', newValue, cell, originalContent, isDebit);
            } else if (field === 'merchant') {
                updateTransactionField(txId, 'merchant', newValue, cell, originalContent);
            } else if (field === 'type') {
                const isDebit = newValue === 'expense';
                const amountCell = row.querySelector('[data-field="amount"]');
                const amountStr = amountCell.textContent.replace(/[^0-9.-]+/g, '');

                updateTransactionField(txId, 'is_debit', isDebit, cell, originalContent, null, () => {
                    // Update the UI to reflect type change
                    cell.textContent = isDebit ? 'Expense' : 'Income';

                    // Update amount display and data-is-debit attribute
                    amountCell.setAttribute('data-is-debit', isDebit);
                    amountCell.classList.toggle('income-amount', !isDebit);

                    const amount = parseFloat(amountStr);
                    amountCell.textContent = isDebit ? `$${amount.toFixed(2)}` : `+$${amount.toFixed(2)}`;
                });
            } else if (field === 'subcategory') {
                updateTransactionField(txId, 'subcategory', newValue, cell, originalContent);
            }
        };

        // Event handlers for non-category fields
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cell.innerHTML = originalContent;
            }
        });
    }
}

/**
 * Handler for delete button clicks
 */
function handleDeleteButton(button) {
    const row = button.closest('tr');
    const txId = row.getAttribute('data-id');

    if (confirm('Are you sure you want to delete this transaction?')) {
        fetch('/delete_transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: txId })
        })
            .then(response => response.json())
            .then(data => {
                console.log('Transaction deleted:', data);

                // Remove row from table
                row.style.display = 'none';

                // Refresh transactions to update totals
                loadTransactions();
            })
            .catch(err => {
                ErrorUtils.handleError(err, 'Failed to delete transaction');
            });
    }
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
            <td colspan="7" style="text-align: center; padding: 20px;">
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
                    <td colspan="7" style="text-align: center; color: red; padding: 20px;">
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
                    <td colspan="7" style="text-align: center; color: #666; padding: 20px;">
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
                <td colspan="7" style="text-align: center; color: red; padding: 20px;">
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
    row.setAttribute('data-id', tx.id);
    row.setAttribute('data-category', tx.category);
    row.setAttribute('data-subcategory', tx.subcategory || '');
    row.setAttribute('data-date', tx.date);
    row.setAttribute('data-type', tx.is_debit ? 'expense' : 'income');

    // Date cell
    const dateCell = document.createElement('td');
    dateCell.className = 'editable';
    dateCell.setAttribute('data-field', 'date');
    dateCell.textContent = tx.date;
    row.appendChild(dateCell);

    // Amount cell
    const amountCell = document.createElement('td');
    amountCell.className = 'editable';
    if (!tx.is_debit) {
        amountCell.classList.add('income-amount');
    }
    amountCell.setAttribute('data-field', 'amount');
    amountCell.setAttribute('data-is-debit', tx.is_debit.toString());
    amountCell.textContent = formatAmount(tx);
    row.appendChild(amountCell);

    // Type cell
    const typeCell = document.createElement('td');
    typeCell.textContent = tx.is_debit ? 'Expense' : 'Income';
    row.appendChild(typeCell);

    // Category cell
    const categoryCell = document.createElement('td');
    categoryCell.className = 'editable';
    categoryCell.setAttribute('data-field', 'category');
    categoryCell.textContent = tx.category;
    row.appendChild(categoryCell);

    // Subcategory cell
    const subcategoryCell = document.createElement('td');
    subcategoryCell.className = 'editable';
    subcategoryCell.setAttribute('data-field', 'subcategory');
    subcategoryCell.textContent = tx.subcategory || '—';
    row.appendChild(subcategoryCell);

    // Merchant cell
    const merchantCell = document.createElement('td');
    merchantCell.className = 'editable';
    merchantCell.setAttribute('data-field', 'merchant');
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

    // Actions cell
    const actionCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.style.backgroundColor = '#ff4d4d';
    deleteBtn.style.color = 'white';
    deleteBtn.style.border = 'none';
    deleteBtn.style.padding = '2px 5px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.borderRadius = '3px';
    deleteBtn.textContent = 'Delete';
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

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
        emptyCell.setAttribute('colspan', '7');
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
 * Updates a transaction category
 * 
 * @param {string} txId - Transaction ID
 * @param {string} newCategory - New category value
 * @param {HTMLElement} cell - The cell element being edited
 * @param {string} originalContent - Original HTML content to restore on error
 */
function updateTransactionCategory(txId, newCategory, newSubcategory, cell, originalContent) {
    fetch('/update_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: txId,
            category: newCategory,
            subcategory: newSubcategory
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log('Transaction category updated:', data);

            // Update cell with new category and subcategory
            const displayValue = newSubcategory ?
                `${newCategory} › ${newSubcategory}` :
                newCategory;

            cell.textContent = displayValue;

            // Update data attributes
            cell.setAttribute('data-subcategory', newSubcategory || '');
            cell.closest('tr').setAttribute('data-category', newCategory);
            cell.closest('tr').setAttribute('data-subcategory', newSubcategory || '');

            // Refresh transactions to update category totals
            loadTransactions();
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to update transaction category');
            // Restore original content on error
            cell.innerHTML = originalContent || newCategory;
        });
}

/**
 * Updates any transaction field
 * 
 * @param {string} txId - Transaction ID
 * @param {string} field - Field name to update
 * @param {*} value - New value
 * @param {HTMLElement} cell - The cell element being edited
 * @param {string} originalContent - Original HTML content to restore on error
 * @param {boolean} [isDebit] - Whether transaction is a debit (for amount)
 * @param {Function} [callback] - Optional callback on success
 */
function updateTransactionField(txId, field, value, cell, originalContent, isDebit, callback) {
    // Create update object
    const updateData = {
        id: txId,
        [field]: value
    };

    // Add is_debit for amount updates
    if (field === 'amount' && isDebit !== undefined) {
        updateData.is_debit = isDebit;
    }

    fetch('/update_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    })
        .then(response => response.json())
        .then(data => {
            console.log(`Transaction ${field} updated:`, data);

            if (callback) {
                // Use callback for custom UI updates
                callback();
            } else {
                // Default behavior for different fields
                if (field === 'amount') {
                    // Format amount with proper display
                    const amount = parseFloat(value);
                    if (!isNaN(amount)) {
                        cell.textContent = isDebit ?
                            formatCurrency(amount) :
                            '+' + formatCurrency(amount);
                    } else {
                        cell.textContent = value;
                    }
                } else {
                    // For other fields, just set the content
                    cell.textContent = value;
                }
            }

            // Reload if needed for certain fields
            if (['category', 'amount', 'date'].includes(field)) {
                loadTransactions();
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, `Failed to update transaction ${field}`);
            // Restore original content on error
            cell.innerHTML = originalContent;
        });
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