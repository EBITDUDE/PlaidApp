/**
 * transaction-manager.js - Transaction management functionality for ASB Personal Finance App
 * 
 * This file contains functions for loading, displaying, and manipulating transactions.
 */

/**
 * Loads transactions from the server
 */
function loadTransactions() {
    console.log("Loading transactions...");

    // Add a loading indicator
    const txTable = document.getElementById('transactions-body');
    const txSection = document.getElementById('transactions-section');

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

    // Get the selected page size (default to 50 if none selected)
    const pageSizeSelect = document.getElementById('page-size');
    let fetchSize = 50; // Default

    if (pageSizeSelect && pageSizeSelect.value) {
        if (pageSizeSelect.value === 'all') {
            fetchSize = 10000; // Use a large number to fetch all
        } else {
            fetchSize = parseInt(pageSizeSelect.value);
        }
    }

    // Fetch transactions with the selected page size
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
            console.log("Received transaction data:", data);

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

            // Trigger accounts loading before displaying transactions
            fetchAndStoreAccounts()
                .then(() => {
                    // Display transactions
                    displayTransactions(transactions);

                    // Calculate and display monthly totals
                    const monthlyData = calculateMonthlyCategoryTotals(transactions);
                    displayMonthlyCategoryTotals(monthlyData.monthlyTable, monthlyData.months);

                    // Initialize pagination and filters
                    setupPaginationAndFilters();
                })
                .catch(err => {
                    console.error("Error loading accounts:", err);
                });
        })
        .catch(err => {
            console.error("Transaction fetch error:", err);

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
 * Displays transactions in the transaction table
 * 
 * @param {Array} transactions - Array of transaction objects
 */
function displayTransactions(transactions) {
    const txTable = document.getElementById('transactions-body');
    const txSection = document.getElementById('transactions-section');
    const categoryFilter = document.getElementById('category-filter');

    if (transactions.length > 0) {
        txSection.style.display = 'block';

        // Populate the category filter dropdown
        const categories = [...new Set(transactions.map(tx => tx.category))].sort();
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });

        // First, ensure we have the account map
        fetchAndStoreAccounts().then(accountsMap => {
            // Populate account dropdown for new transactions
            const accounts = [...new Set(transactions
                .filter(tx => tx.account_id)
                .map(tx => tx.account_id))];
            const accountDropdown = document.getElementById('new-account');
            accountDropdown.innerHTML = '<option value="">No Account</option>';

            accounts.forEach(accountId => {
                const option = document.createElement('option');
                option.value = accountId;

                // Use our account map to get the proper account name
                const accountName = accountsMap[accountId] ||
                    transactions.find(tx => tx.account_id === accountId)?.account_name ||
                    `Account ${accountId.substring(0, 8)}...`;

                option.textContent = accountName;
                accountDropdown.appendChild(option);
            });

            // Clear and populate the transaction table
            txTable.innerHTML = '';
            transactions.forEach((tx, index) => {
                const row = document.createElement('tr');
                row.setAttribute('data-id', tx.id);
                row.setAttribute('data-category', tx.category);
                row.setAttribute('data-date', tx.date);
                row.setAttribute('data-type', tx.is_debit ? 'expense' : 'income');

                // Format amount - always positive, with +/- sign depending on type
                const amountDisplay = formatAmount(tx);
                const amountClass = !tx.is_debit ? 'income-amount' : '';

                // Display the correct transaction type
                const typeDisplay = !tx.is_debit ? 'Income' : 'Expense';

                // Get the proper account name from our map or fallback options
                let accountDisplay;
                if (tx.account_id) {
                    accountDisplay = accountsMap[tx.account_id] ||
                        tx.account_name ||
                        `Account ${tx.account_id.substring(0, 8)}...`;
                } else {
                    accountDisplay = 'No Account';
                }

                row.innerHTML = `
                    <td class="editable" data-field="date">${tx.date}</td>
                    <td class="editable ${amountClass}" data-field="amount" data-is-debit="${tx.is_debit}">${amountDisplay}</td>
                    <td>${typeDisplay}</td>
                    <td class="editable" data-field="category">${tx.category}</td>
                    <td class="editable" data-field="merchant">${tx.merchant}</td>
                    <td>${accountDisplay}</td>
                    <td>
                        <button class="delete-btn" style="background-color: #ff4d4d; color: white; border: none; padding: 2px 5px; cursor: pointer; border-radius: 3px;">Delete</button>
                    </td>
                `;

                txTable.appendChild(row);

                // Add type editing capability
                const typeCell = row.querySelector('td:nth-child(3)');
                typeCell.classList.add('editable');
                typeCell.setAttribute('data-field', 'type');
            });

            // Add event listeners for editable cells
            setupTransactionEditHandlers();

            // Add delete button functionality
            setupTransactionDeleteHandlers();

            // Apply filters using the transaction filter utility
            if (transactionFilter) {
                transactionFilter.applyFilters();
            } else {
                // If the transaction filter hasn't been initialized yet, set up pagination and filters
                setupPaginationAndFilters();
            }
        });
    }
}

/**
 * Sets up handlers for editable transaction cells
 */
function setupTransactionEditHandlers() {
    document.querySelectorAll('.editable').forEach(cell => {
        cell.addEventListener('click', function () {
            const field = this.getAttribute('data-field');
            const row = this.closest('tr');
            const txId = row.getAttribute('data-id');
            const currentValue = this.textContent.trim();

            // Don't allow editing if already in edit mode
            if (this.querySelector('input, select')) return;

            // Store original content to restore if edit is cancelled
            const originalContent = this.innerHTML;

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
                // We'll load categories from the server
                editHtml = `<select class="edit-input"><option value="${currentValue}">${currentValue}</option></select>`;

                // Fetch categories and add to dropdown
                fetch('/get_categories')
                    .then(response => response.json())
                    .then(data => {
                        const select = this.querySelector('select');
                        select.innerHTML = '';

                        data.categories.forEach(category => {
                            const option = document.createElement('option');
                            option.value = category;
                            option.textContent = category;
                            option.selected = category === currentValue;
                            select.appendChild(option);
                        });
                    });
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

            // Set the cell content to the edit interface
            this.innerHTML = editHtml;
            const input = this.querySelector('.edit-input');
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
                    this.innerHTML = originalContent;
                    return;
                }

                // Process based on field type
                if (field === 'category') {
                    updateTransactionCategory(txId, newValue, this, originalContent);
                } else if (field === 'date') {
                    // Validate date format
                    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(newValue)) {
                        alert('Please use MM/DD/YYYY format');
                        this.innerHTML = originalContent;
                        return;
                    }

                    updateTransactionField(txId, 'date', newValue, this, originalContent);
                } else if (field === 'amount') {
                    // Validate amount
                    if (isNaN(parseFloat(newValue))) {
                        alert('Please enter a valid number');
                        this.innerHTML = originalContent;
                        return;
                    }

                    const isDebit = row.querySelector('[data-field="amount"]').getAttribute('data-is-debit') === 'true';
                    updateTransactionField(txId, 'amount', newValue, this, originalContent, isDebit);
                } else if (field === 'merchant') {
                    updateTransactionField(txId, 'merchant', newValue, this, originalContent);
                } else if (field === 'type') {
                    const isDebit = newValue === 'expense';
                    const amountCell = row.querySelector('[data-field="amount"]');
                    const amountStr = amountCell.textContent.replace(/[^0-9.-]+/g, '');

                    updateTransactionField(txId, 'is_debit', isDebit, this, originalContent, null, () => {
                        // Update the UI to reflect type change
                        this.textContent = isDebit ? 'Expense' : 'Income';

                        // Update amount display and data-is-debit attribute
                        amountCell.setAttribute('data-is-debit', isDebit);
                        amountCell.classList.toggle('income-amount', !isDebit);

                        const amount = parseFloat(amountStr);
                        amountCell.textContent = isDebit ? `$${amount.toFixed(2)}` : `+$${amount.toFixed(2)}`;
                    });
                }
            };

            // Event handlers
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
        });
    });
}

/**
 * Sets up handlers for transaction delete buttons
 */
function setupTransactionDeleteHandlers() {
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function () {
            const row = this.closest('tr');
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
                        console.error('Error deleting transaction:', err);
                        alert('Error deleting transaction: ' + err.message);
                    });
            }
        });
    });
}

/**
 * Updates a transaction category
 * 
 * @param {string} txId - Transaction ID
 * @param {string} newCategory - New category value
 * @param {HTMLElement} cell - The cell element being edited
 * @param {string} originalContent - Original HTML content to restore on error
 */
function updateTransactionCategory(txId, newCategory, cell, originalContent) {
    fetch('/update_transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: txId,
            category: newCategory
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log('Transaction category updated:', data);

            // Update cell with new value
            cell.textContent = newCategory;

            // Update category in row dataset
            cell.closest('tr').setAttribute('data-category', newCategory);

            // Refresh transactions to update category totals
            loadTransactions();
        })
        .catch(err => {
            console.error('Error updating category:', err);
            alert('Error updating category: ' + err.message);
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
            console.error(`Error updating ${field}:`, err);
            alert(`Error updating transaction: ${err.message}`);
            // Restore original content on error
            cell.innerHTML = originalContent;
        });
}

/**
 * Processes transaction data and calculates monthly category totals
 * 
 * @param {Array} transactions - List of transaction objects
 * @returns {Object} Object containing monthly totals and month list
 */
function calculateMonthlyCategoryTotals(transactions) {
    // Initialize structures
    const monthlyTotals = {};
    const categories = new Set();

    // Process each transaction
    transactions.forEach(tx => {
        // Skip transactions without dates
        if (!tx.raw_date) return;

        try {
            // Extract month-year
            let monthYear;

            if (typeof tx.raw_date === 'string') {
                // Parse date string in format YYYY-MM-DD
                const match = tx.raw_date.match(/^(\d{4})-(\d{2})/);
                if (match) {
                    monthYear = `${match[1]}-${match[2]}`; // YYYY-MM format
                } else {
                    console.warn(`Couldn't parse date: ${tx.raw_date}`);
                    return;
                }
            } else {
                // Assume it's a Date object
                const date = new Date(tx.raw_date);
                if (isNaN(date.getTime())) {
                    console.warn(`Invalid date: ${tx.raw_date}`);
                    return;
                }

                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                monthYear = `${year}-${month}`;
            }

            // Add category to our set
            categories.add(tx.category);

            // Initialize month if needed
            if (!monthlyTotals[monthYear]) {
                monthlyTotals[monthYear] = {};
            }

            // Initialize category for this month if needed
            if (!monthlyTotals[monthYear][tx.category]) {
                monthlyTotals[monthYear][tx.category] = 0;
            }

            // Add amount (negative for expenses, positive for income)
            const amount = tx.is_debit ? -tx.amount : tx.amount;
            monthlyTotals[monthYear][tx.category] += amount;
        } catch (err) {
            console.error('Error processing transaction for monthly totals:', err);
        }
    });

    // Convert to array format for display
    const months = Object.keys(monthlyTotals).sort();
    const sortedCategories = Array.from(categories).sort();

    const monthlyTable = sortedCategories.map(category => {
        const row = { category };

        months.forEach(monthKey => {
            // Format month for display (e.g., "Jan 2023")
            const [year, month] = monthKey.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthDisplay = `${monthNames[parseInt(month) - 1]} ${year}`;

            // Get amount (default to 0)
            const amount = monthlyTotals[monthKey][category] || 0;

            // Format as currency string
            row[monthDisplay] = formatCurrency(Math.abs(amount));
        });

        return row;
    });

    // Convert month keys to display format
    const displayMonths = months.map(monthKey => {
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