/**
 * ui-utilities.js - UI utility functions for ASB Personal Finance App
 * 
 * This file contains UI-related functions including date pickers, modal handling,
 * and other UI interaction utilities.
 */

/**
 * Sets up date filters and custom date modal
 */
function setupDateFilters() {
    const dateFilter = document.getElementById('date-filter');

    // Setup custom date dialog handlers
    const customDateModal = document.getElementById('custom-date-modal');
    const customDateStart = document.getElementById('custom-date-start');
    const customDateEnd = document.getElementById('custom-date-end');
    const customDateCancel = document.getElementById('custom-date-cancel');
    const customDateApply = document.getElementById('custom-date-apply');

    // Set default dates (current month)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    customDateStart.value = formatDate(firstDayOfMonth);
    customDateEnd.value = formatDate(today);

    // Cancel button
    if (customDateCancel) {
        customDateCancel.addEventListener('click', function () {
            customDateModal.style.display = 'none';
            // Reset date filter to previous selection
            dateFilter.value = dateFilter.getAttribute('data-previous') || 'all';
        });
    }

    // Apply button
    if (customDateApply) {
        customDateApply.addEventListener('click', function () {
            if (!customDateStart.value || !customDateEnd.value) {
                alert('Please select both start and end dates');
                return;
            }

            // Update transactionFilter if available
            const transactionFilter = AppState.getComponent('transactionFilter');
            if (transactionFilter) {
                transactionFilter.customDateStart = customDateStart.value;
                transactionFilter.customDateEnd = customDateEnd.value;
            }

            // Create a new option for this specific date range
            let customRangeOption = dateFilter.querySelector('option[value="custom"]');
            if (!customRangeOption) {
                customRangeOption = document.createElement('option');
                customRangeOption.value = 'custom';
                dateFilter.appendChild(customRangeOption);
            }

            // Update the text to show the selected range
            customRangeOption.textContent = `${customDateStart.value.replace(/\/\d{4}$/, (match) => '/' + match.slice(-2))} - ${customDateEnd.value.replace(/\/\d{4}$/, (match) => '/' + match.slice(-2))}`;

            // Select the custom option
            dateFilter.value = 'custom';

            // Close modal and apply filter
            customDateModal.style.display = 'none';
            if (transactionFilter) {
                transactionFilter.applyFilters(); // This will also save the filters
            }
        });
    }
}

/**
 * Shows the custom date range selection modal
 */
function showCustomDateModal() {
    const customDateModal = document.getElementById('custom-date-modal');
    const dateFilter = document.getElementById('date-filter');

    if (!customDateModal) return;

    // Store previous selection
    dateFilter.setAttribute('data-previous', dateFilter.value);

    // Show modal
    customDateModal.style.display = 'block';
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
 * Sets up the export data functionality and modal
 */
function setupExportData() {
    const exportButton = document.getElementById('export-data-btn');
    const exportModal = document.getElementById('export-data-modal');
    const exportCancel = document.getElementById('export-cancel');
    const exportConfirm = document.getElementById('export-confirm');

    if (!exportButton || !exportModal) return;

    // Show export modal when button is clicked
    exportButton.addEventListener('click', function () {
        exportModal.style.display = 'block';
    });

    // Hide modal when cancel is clicked
    if (exportCancel) {
        exportCancel.addEventListener('click', function () {
            exportModal.style.display = 'none';
        });
    }

    // Close modal if clicked outside
    if (exportModal) {
        exportModal.addEventListener('click', function (event) {
            if (event.target === exportModal) {
                exportModal.style.display = 'none';
            }
        });
    }

    // Add the click handler to the export confirm button
    if (exportConfirm) {
        exportConfirm.addEventListener('click', function () {
            exportTransactions();
        });
    }
}

/**
 * Exports transactions to a CSV file
 */
function exportTransactions() {
    const dateRange = document.getElementById('export-date-range').value;
    const exportConfirm = document.getElementById('export-confirm');

    // Show loading state
    exportConfirm.innerHTML = 'Exporting... <div class="loading" style="width: 12px; height: 12px; margin-left: 5px;"></div>';
    exportConfirm.disabled = true;

    // First, fetch all transactions to ensure we have everything
    fetch('/get_transactions')
        .then(response => response.json())
        .then(transactionData => {
            if (transactionData.error) {
                throw new Error('Error fetching transactions: ' + transactionData.error);
            }

            const allTransactions = transactionData.transactions || [];
            console.log(`Found ${allTransactions.length} transactions for potential export`);

            // Now request the export with the date range
            return fetch('/export_transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date_range: dateRange,
                    // Include transaction count so server can validate
                    expected_count: allTransactions.length
                })
            });
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error exporting transactions: ' + data.error);
            } else {
                console.log(`Exported ${data.transaction_count || 'unknown'} transactions`);

                // Create and download CSV file
                const blob = new Blob([data.csv_data], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                // Hide modal
                document.getElementById('export-data-modal').style.display = 'none';
            }

            // Reset button
            exportConfirm.innerHTML = 'Export';
            exportConfirm.disabled = false;
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to export transactions');

            // Reset button
            exportConfirm.innerHTML = 'Export';
            exportConfirm.disabled = false;
        });
}

/**
 * Initialize the category dropdown component in the UI
 */
function initCategoryDropdown() {
    // If category component already exists, just reload its data and return
    const existingComponent = AppState.getComponent('categoryComponent');
    if (existingComponent) {
        existingComponent.reload();
        return;
    }

    // Use the new container for category dropdown
    const categoryContainer = document.getElementById('new-category-container');

    // Handle the case where the container doesn't exist
    if (!categoryContainer) {
        console.error("Cannot find new-category-container element");
        return;
    }

    // Initialize the category component
    const categoryComponent = createCategoryDropdown({
        containerId: 'new-category-container',
        inputName: 'category',
        subcategoryInputName: 'subcategory',
        required: true
    });

    AppState.registerComponent('categoryComponent', categoryComponent);
}

/**
 * Set up the monthly category date pickers
 */
function setupMonthlyCategoryDatePickers() {
    // Get the input elements
    const startDateInput = document.getElementById('monthly-start-date');
    const endDateInput = document.getElementById('monthly-end-date');
    const applyButton = document.getElementById('apply-monthly-dates');

    if (!startDateInput || !endDateInput) return;

    // Set default dates (last 6 months)
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    startDateInput.value = formatMonthYear(sixMonthsAgo);
    endDateInput.value = formatMonthYear(today);

    // Add click handlers to show month picker when inputs are clicked
    startDateInput.addEventListener('click', function () {
        showMonthPicker(this);
    });

    endDateInput.addEventListener('click', function () {
        showMonthPicker(this);
    });

    // Add handler for the apply button
    if (applyButton) {
        applyButton.addEventListener('click', function () {
            updateMonthlyCategoryTotals();
        });
    }

    // Call once to initialize
    updateMonthlyCategoryTotals();
}

/**
 * Update monthly category totals based on selected date range
 */
function updateMonthlyCategoryTotals() {
    const startDateInput = document.getElementById('monthly-start-date');
    const endDateInput = document.getElementById('monthly-end-date');

    if (!startDateInput || !endDateInput) return;

    const startMonthYear = startDateInput.value; // Format: MM/YYYY
    const endMonthYear = endDateInput.value;     // Format: MM/YYYY

    // Validate dates
    if (!startMonthYear || !endMonthYear) {
        alert('Please select both start and end dates');
        return;
    }

    // Parse dates to compare them
    const startParts = startMonthYear.split('/');
    const endParts = endMonthYear.split('/');

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
    const monthlySection = document.getElementById('monthly-category-section');
    const monthlyTable = document.getElementById('monthly-category-table');

    // Create a loading indicator if it doesn't exist
    let loadingIndicator = document.getElementById('monthly-loading-indicator');
    if (!loadingIndicator) {
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'monthly-loading-indicator';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.innerHTML = 'Loading monthly totals... <div class="loading" style="display: inline-block;"></div>';
        monthlySection.insertBefore(loadingIndicator, monthlyTable);
    } else {
        loadingIndicator.style.display = 'block';
    }

    monthlyTable.style.display = 'none';

    // Filter transactions based on the selected date range
    fetch('/get_transactions')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error loading transactions: ' + data.error);
                return;
            }

            const transactions = data.transactions || [];

            // Filter transactions by date range
            const filteredTransactions = transactions.filter(tx => {
                if (!tx.raw_date) return false;

                // Convert raw_date to a Date object
                const txDate = new Date(tx.raw_date);
                if (isNaN(txDate.getTime())) return false;

                // Create date objects for comparison (just year/month)
                const txYearMonth = new Date(txDate.getFullYear(), txDate.getMonth(), 1);

                // Check if the transaction date is within our range
                return txYearMonth >= startDate && txYearMonth <= endDate;
            });

            // Calculate and display monthly totals
            // We pass ALL transactions to ensure we collect all categories,
            // but also pass date range to only show months within that range
            const monthlyData = calculateMonthlyCategoryTotals(transactions, startDate, endDate);
            displayMonthlyCategoryTotals(monthlyData.monthlyTable, monthlyData.months);

            // Hide loading indicator and show table
            loadingIndicator.style.display = 'none';
            monthlyTable.style.display = 'table';
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load transaction data');

            // Hide loading indicator and show table
            loadingIndicator.style.display = 'none';
            monthlyTable.style.display = 'table';
        });
}