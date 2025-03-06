/**
 * monthly-totals.js - Monthly category totals functionality for ASB Personal Finance App
 * 
 * This file contains the JavaScript code for the monthly category totals page.
 */

/**
 * Initialize the monthly totals page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    // Initialize month pickers
    setupMonthPickers();

    // Set default dates (last 6 months)
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const startDateInput = document.getElementById('monthly-start-date');
    const endDateInput = document.getElementById('monthly-end-date');

    if (startDateInput && endDateInput) {
        startDateInput.value = formatMonthYear(sixMonthsAgo);
        endDateInput.value = formatMonthYear(today);
    }

    // Load monthly totals with default dates
    loadMonthlyTotals();

    // Refresh button handler
    document.getElementById('refresh-button').addEventListener('click', loadMonthlyTotals);

    // Apply dates button handler
    document.getElementById('apply-monthly-dates').addEventListener('click', loadMonthlyTotals);
});

/**
 * Setup month pickers for date inputs
 */
function setupMonthPickers() {
    const startDateInput = document.getElementById('monthly-start-date');
    const endDateInput = document.getElementById('monthly-end-date');

    if (startDateInput) {
        startDateInput.addEventListener('click', function () {
            showMonthPicker(this);
        });
    }

    if (endDateInput) {
        endDateInput.addEventListener('click', function () {
            showMonthPicker(this);
        });
    }
}

/**
 * Shows a month picker popup for date input fields
 * 
 * @param {HTMLElement} inputElement - The input element to show month picker for
 */
function showMonthPicker(inputElement) {
    // Create month picker if it doesn't exist
    let pickerElement = document.querySelector(`.month-picker[data-for="${inputElement.id}"]`);

    if (!pickerElement) {
        pickerElement = document.createElement('div');
        pickerElement.className = 'month-picker';
        pickerElement.setAttribute('data-for', inputElement.id);
        pickerElement.style.display = 'block';
        pickerElement.style.position = 'absolute';
        pickerElement.style.backgroundColor = 'white';
        pickerElement.style.border = '1px solid #ddd';
        pickerElement.style.borderRadius = '4px';
        pickerElement.style.padding = '10px';
        pickerElement.style.zIndex = '1000';
        pickerElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        pickerElement.style.width = '200px';

        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.marginBottom = '10px';

        const prevYearBtn = document.createElement('button');
        prevYearBtn.type = 'button';
        prevYearBtn.textContent = '<<';
        prevYearBtn.style.padding = '2px 5px';

        const yearSpan = document.createElement('span');
        yearSpan.style.fontWeight = 'bold';

        const nextYearBtn = document.createElement('button');
        nextYearBtn.type = 'button';
        nextYearBtn.textContent = '>>';
        nextYearBtn.style.padding = '2px 5px';

        headerDiv.appendChild(prevYearBtn);
        headerDiv.appendChild(yearSpan);
        headerDiv.appendChild(nextYearBtn);

        // Create month grid
        const monthsDiv = document.createElement('div');
        monthsDiv.style.display = 'grid';
        monthsDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
        monthsDiv.style.gap = '5px';

        // Append elements
        pickerElement.appendChild(headerDiv);
        pickerElement.appendChild(monthsDiv);

        // Add to document
        inputElement.parentNode.appendChild(pickerElement);

        // Initialize current year
        let currentYear = new Date().getFullYear();

        // Parse input value if present
        if (inputElement.value) {
            const parts = inputElement.value.split('/');
            if (parts.length === 2) {
                currentYear = parseInt(parts[1]);
            }
        }

        // Update month picker function
        function updateMonthPicker() {
            yearSpan.textContent = currentYear;
            monthsDiv.innerHTML = '';

            const months = [
                'Jan', 'Feb', 'Mar',
                'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'
            ];

            months.forEach((month, index) => {
                const monthBtn = document.createElement('button');
                monthBtn.type = 'button';
                monthBtn.textContent = month;
                monthBtn.style.padding = '5px';
                monthBtn.style.border = '1px solid #ddd';
                monthBtn.style.borderRadius = '3px';
                monthBtn.style.cursor = 'pointer';
                monthBtn.style.backgroundColor = '#f8f8f8';

                monthBtn.addEventListener('click', function () {
                    const monthNum = (index + 1).toString().padStart(2, '0');
                    inputElement.value = `${monthNum}/${currentYear}`;
                    pickerElement.style.display = 'none';
                });

                monthsDiv.appendChild(monthBtn);
            });
        }

        // Initialize
        updateMonthPicker();

        // Previous year button
        prevYearBtn.addEventListener('click', function () {
            currentYear--;
            updateMonthPicker();
        });

        // Next year button
        nextYearBtn.addEventListener('click', function () {
            currentYear++;
            updateMonthPicker();
        });

        // Close if clicked outside
        document.addEventListener('click', function (e) {
            if (!pickerElement.contains(e.target) && e.target !== inputElement) {
                pickerElement.style.display = 'none';
            }
        });
    } else {
        // Toggle visibility
        pickerElement.style.display = pickerElement.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Load monthly totals data from the server
 */
function loadMonthlyTotals() {
    const startDateInput = document.getElementById('monthly-start-date');
    const endDateInput = document.getElementById('monthly-end-date');
    const loadingIndicator = document.getElementById('loading-indicator');
    const monthlyTable = document.getElementById('monthly-table');

    // Validate dates
    if (!startDateInput.value || !endDateInput.value) {
        alert('Please select both start and end dates');
        return;
    }

    // Parse dates to compare them
    const startParts = startDateInput.value.split('/');
    const endParts = endDateInput.value.split('/');

    if (startParts.length !== 2 || endParts.length !== 2) {
        alert('Invalid date format. Please use MM/YYYY format');
        return;
    }

    const startDate = new Date(startParts[1], parseInt(startParts[0]) - 1, 1);
    const endDate = new Date(endParts[1], parseInt(endParts[0]) - 1, 1);

    // Check if start date is after end date
    if (startDate > endDate) {
        alert('Start date must be before end date');
        return;
    }

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    monthlyTable.style.display = 'none';

    // Fetch transactions for the specified date range
    fetch('/get_transactions')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                loadingIndicator.textContent = 'Error: ' + data.error;
                return;
            }

            // Filter transactions based on the date range
            const transactions = data.transactions || [];

            // Calculate monthly totals
            const monthlyData = calculateMonthlyCategoryTotals(transactions, startDate, endDate);

            // Display the data
            displayMonthlyTotals(monthlyData.monthlyTable, monthlyData.months);

            // Hide loading indicator and show table
            loadingIndicator.style.display = 'none';
            monthlyTable.style.display = 'table';
        })
        .catch(err => {
            loadingIndicator.textContent = 'Error loading data: ' + err.message;
            console.error('Error loading monthly totals:', err);
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

    // If we don't have any categories yet, try to get them from the server
    if (allCategories.size === 0) {
        // This is an async call but we'll continue with empty categories
        // and let the server populate them later if needed
        fetch('/get_categories')
            .then(response => response.json())
            .then(data => {
                if (data.categories && data.categories.length > 0) {
                    data.categories.forEach(category => allCategories.add(category));
                }
            })
            .catch(err => console.error('Error fetching categories:', err));
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
            console.error('Error processing transaction for monthly totals:', err);
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
 * Display monthly totals in the table
 * 
 * @param {Array} monthlyTable - Array of category total objects
 * @param {Array} months - Array of months to display
 */
function displayMonthlyTotals(monthlyTable, months) {
    const tableHeader = document.getElementById('monthly-header').querySelector('tr');
    const tableBody = document.getElementById('monthly-body');

    // Clear existing headers except the first one (Category)
    while (tableHeader.children.length > 1) {
        tableHeader.removeChild(tableHeader.lastChild);
    }

    // Add month headers
    months.forEach(month => {
        const th = document.createElement('th');
        th.textContent = month;
        tableHeader.appendChild(th);
    });

    // Clear and rebuild the table body
    tableBody.innerHTML = '';

    if (monthlyTable.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="${months.length + 1}">No data available</td>`;
        tableBody.appendChild(row);
        return;
    }

    // Add category rows
    monthlyTable.forEach(row => {
        const tr = document.createElement('tr');

        // Add category name
        const categoryCell = document.createElement('td');
        categoryCell.textContent = row.category;
        tr.appendChild(categoryCell);

        // Add amounts for each month
        months.forEach(month => {
            const td = document.createElement('td');
            td.textContent = row[month] || "–";
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

/**
 * Format a date as MM/YYYY for month selection
 * 
 * @param {Date} date - Date to format
 * @returns {string} Formatted month/year string
 */
function formatMonthYear(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
}