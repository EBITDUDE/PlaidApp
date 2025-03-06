/**
 * Provides efficient filtering for transaction tables
 */
class TransactionFilter {
    /**
     * Creates a new transaction filter
     * @param {Object} options Configuration options
     * @param {string} options.tableId ID of the table element
     * @param {Object} options.filters Filter element IDs keyed by filter type
     * @param {Function} options.onFilterChange Callback when filters change
     * @param {TransactionPaginator} options.paginator Optional paginator to integrate with
     */
    constructor(options = {}) {
        this.options = Object.assign({
            tableId: 'transactions-table',
            filters: {
                search: 'transaction-search',
                date: 'date-filter',
                category: 'category-filter',
                type: 'type-filter'
            },
            onFilterChange: null,
            paginator: null
        }, options);

        // Get table element
        this.tableElement = document.getElementById(this.options.tableId);
        if (!this.tableElement) {
            console.error(`Table element with ID "${this.options.tableId}" not found`);
            return;
        }

        // Get filter elements
        this.filterElements = {};
        for (const [type, id] of Object.entries(this.options.filters)) {
            const element = document.getElementById(id);
            if (element) {
                this.filterElements[type] = element;
            }
        }

        // Initialize filter events
        this._initFilterEvents();

        // Restore saved filters
        this.restoreFilters();

        // Custom date range variables
        this.customDateStart = null;
        this.customDateEnd = null;
    }

    /**
     * Initialize filter event handlers
     * @private
     */
    _initFilterEvents() {
        // Search input
        if (this.filterElements.search) {
            this.filterElements.search.addEventListener('input', () => {
                this.applyFilters();
            });
        }

        // Date filter
        if (this.filterElements.date) {
            this.filterElements.date.addEventListener('change', () => {
                const dateFilter = this.filterElements.date.value;

                // Handle custom date range
                if (dateFilter === 'custom') {
                    this._showCustomDateDialog();
                } else {
                    this.applyFilters();
                }
            });
        }

        // Category filter
        if (this.filterElements.category) {
            this.filterElements.category.addEventListener('change', () => {
                this.applyFilters();
            });
        }

        // Type filter
        if (this.filterElements.type) {
            this.filterElements.type.addEventListener('change', () => {
                this.applyFilters();
            });
        }
    }

    /**
     * Shows the custom date range dialog
     * @private
     */
    _showCustomDateDialog() {
        const customDateModal = document.getElementById('custom-date-modal');
        if (!customDateModal) return;

        // Show the modal
        customDateModal.style.display = 'block';

        // Store the current date filter value in case the user cancels
        if (this.filterElements.date) {
            this.filterElements.date.setAttribute('data-previous',
                this.filterElements.date.getAttribute('data-previous') || 'all');
        }

        // Set up cancel button
        const cancelButton = document.getElementById('custom-date-cancel');
        if (cancelButton) {
            cancelButton.onclick = () => {
                customDateModal.style.display = 'none';

                // Reset to previous selection
                if (this.filterElements.date) {
                    this.filterElements.date.value =
                        this.filterElements.date.getAttribute('data-previous') || 'all';
                }
            };
        }

        // Set up apply button
        const applyButton = document.getElementById('custom-date-apply');
        if (applyButton) {
            applyButton.onclick = () => {
                const startInput = document.getElementById('custom-date-start');
                const endInput = document.getElementById('custom-date-end');

                if (!startInput || !endInput || !startInput.value || !endInput.value) {
                    alert('Please select both start and end dates');
                    return;
                }

                // Store the date range
                this.customDateStart = startInput.value;
                this.customDateEnd = endInput.value;

                // Update date filter dropdown label
                if (this.filterElements.date) {
                    // Find or create the custom option
                    let customOption = Array.from(this.filterElements.date.options)
                        .find(option => option.value === 'custom');

                    if (!customOption) {
                        customOption = document.createElement('option');
                        customOption.value = 'custom';
                        this.filterElements.date.appendChild(customOption);
                    }

                    // Update the label with date range
                    const startText = startInput.value.replace(/\/\d{4}$/, match => '/' + match.slice(-2));
                    const endText = endInput.value.replace(/\/\d{4}$/, match => '/' + match.slice(-2));
                    customOption.textContent = `${startText} - ${endText}`;

                    // Select the custom option
                    this.filterElements.date.value = 'custom';
                }

                // Hide the modal
                customDateModal.style.display = 'none';

                // Apply the filters
                this.applyFilters();
            };
        }
    }

    /**
     * Apply all filters to the transaction table
     */
    applyFilters() {
        // Skip if table element doesn't exist
        if (!this.tableElement) return;

        const tbody = this.tableElement.querySelector('tbody');
        if (!tbody) return;

        // Get all transaction rows
        const rows = tbody.querySelectorAll('tr:not(.pagination-row)');
        if (rows.length === 0) return;

        // Get filter values
        const searchTerm = this.filterElements.search ?
            this.filterElements.search.value.toLowerCase() : '';

        const dateFilter = this.filterElements.date ?
            this.filterElements.date.value : 'all';

        const categoryFilter = this.filterElements.category ?
            this.filterElements.category.value : 'all';

        const typeFilter = this.filterElements.type ?
            this.filterElements.type.value : 'all';

        // Calculate date thresholds for date filtering
        const current = new Date();
        let startDate = null;
        let endDate = null;

        if (dateFilter === '30') {
            startDate = new Date(current);
            startDate.setDate(current.getDate() - 30);
        } else if (dateFilter === '90') {
            startDate = new Date(current);
            startDate.setDate(current.getDate() - 90);
        } else if (dateFilter === '180') {
            startDate = new Date(current);
            startDate.setDate(current.getDate() - 180);
        } else if (dateFilter === '365') {
            startDate = new Date(current);
            startDate.setDate(current.getDate() - 365);
        } else if (dateFilter === 'ytd') {
            startDate = new Date(current.getFullYear(), 0, 1);
        } else if (dateFilter === 'custom') {
            if (this.customDateStart && this.customDateEnd) {
                startDate = this._parseDate(this.customDateStart);
                endDate = this._parseDate(this.customDateEnd);
            }
        }

        // Use current date as default end date
        if (!endDate) {
            endDate = new Date(current);
        }

        // Get filter states for efficiency
        const hasSearchFilter = searchTerm.length > 0;
        const hasCategoryFilter = categoryFilter !== 'all';
        const hasTypeFilter = typeFilter !== 'all';
        const hasDateFilter = startDate !== null;

        // Track visible count
        let visibleCount = 0;

        // Apply filters to each row
        rows.forEach(row => {
            // Get filter attributes once for efficiency
            const rowCategory = row.getAttribute('data-category') || '';
            const rowType = row.getAttribute('data-type') || '';
            const rowDate = row.getAttribute('data-date') || '';
            const rowText = hasSearchFilter ? row.textContent.toLowerCase() : '';

            // Default to showing the row
            let showRow = true;

            // Apply search filter
            if (hasSearchFilter && showRow) {
                showRow = rowText.includes(searchTerm);
            }

            // Apply category filter
            if (hasCategoryFilter && showRow) {
                showRow = rowCategory === categoryFilter;
            }

            // Apply type filter
            if (hasTypeFilter && showRow) {
                showRow = rowType === typeFilter;
            }

            // Apply date filter
            if (hasDateFilter && showRow && rowDate) {
                const txDate = this._parseDate(rowDate);
                if (txDate) {
                    showRow = txDate >= startDate && txDate <= endDate;
                }
            }

            // Update row visibility flag
            row.setAttribute('data-filtered', !showRow);

            // Count visible rows
            if (showRow) {
                visibleCount++;
            }
        });

        // Update paginator if available
        if (this.options.paginator) {
            this.options.paginator.updateVisibility();
        } else {
            // Simple visibility toggle without pagination
            rows.forEach(row => {
                row.style.display = row.getAttribute('data-filtered') === 'true' ? 'none' : '';
            });
        }

        // Call the callback if provided
        if (typeof this.options.onFilterChange === 'function') {
            this.options.onFilterChange({
                totalRows: rows.length,
                visibleRows: visibleCount,
                filters: {
                    search: searchTerm,
                    date: dateFilter,
                    category: categoryFilter,
                    type: typeFilter,
                    dateRange: hasDateFilter ? {
                        start: startDate,
                        end: endDate
                    } : null
                }
            });
        }

        this.saveFilters();

        return visibleCount;
    }

    /**
     * Saves the current filter state to sessionStorage
     */
    saveFilters() {
        const filterState = {
            search: this.filterElements.search ? this.filterElements.search.value : '',
            date: this.filterElements.date ? this.filterElements.date.value : 'all',
            category: this.filterElements.category ? this.filterElements.category.value : 'all',
            type: this.filterElements.type ? this.filterElements.type.value : 'all',
            customDateStart: this.customDateStart || '',
            customDateEnd: this.customDateEnd || ''
        };
        sessionStorage.setItem('transactionFilters', JSON.stringify(filterState));
    }

    /**
     * Restores filter state from sessionStorage
     */
    restoreFilters() {
        const saved = sessionStorage.getItem('transactionFilters');
        if (saved) {
            const filterState = JSON.parse(saved);

            if (this.filterElements.search && filterState.search !== undefined) {
                this.filterElements.search.value = filterState.search;
            }
            if (this.filterElements.date && filterState.date !== undefined) {
                this.filterElements.date.value = filterState.date;
                if (filterState.date === 'custom' && filterState.customDateStart && filterState.customDateEnd) {
                    let customOption = Array.from(this.filterElements.date.options).find(opt => opt.value === 'custom');
                    if (!customOption) {
                        customOption = document.createElement('option');
                        customOption.value = 'custom';
                        this.filterElements.date.appendChild(customOption);
                    }
                    const startText = filterState.customDateStart.replace(/\/\d{4}$/, match => '/' + match.slice(-2));
                    const endText = filterState.customDateEnd.replace(/\/\d{4}$/, match => '/' + match.slice(-2));
                    customOption.textContent = `${startText} - ${endText}`;
                }
            }
            if (this.filterElements.category && filterState.category !== undefined) {
                this.filterElements.category.value = filterState.category;
            }
            if (this.filterElements.type && filterState.type !== undefined) {
                this.filterElements.type.value = filterState.type;
            }
            this.customDateStart = filterState.customDateStart || null;
            this.customDateEnd = filterState.customDateEnd || null;
        }
    }

    /**
     * Resets all filters to default and applies them
     */
    clearAllFilters() {
        if (this.filterElements.search) {
            this.filterElements.search.value = '';
        }
        if (this.filterElements.date) {
            this.filterElements.date.value = 'all';
        }
        if (this.filterElements.category) {
            this.filterElements.category.value = 'all';
        }
        if (this.filterElements.type) {
            this.filterElements.type.value = 'all';
        }
        this.customDateStart = null;
        this.customDateEnd = null;
        sessionStorage.removeItem('transactionFilters');
        this.applyFilters();
    }

    /**
     * Reset all filters to their default state
     */
    resetFilters() {
        // Reset search input
        if (this.filterElements.search) {
            this.filterElements.search.value = '';
        }

        // Reset date filter
        if (this.filterElements.date) {
            this.filterElements.date.value = 'all';
        }

        // Reset category filter
        if (this.filterElements.category) {
            this.filterElements.category.value = 'all';
        }

        // Reset type filter
        if (this.filterElements.type) {
            this.filterElements.type.value = 'all';
        }

        // Clear custom date range
        this.customDateStart = null;
        this.customDateEnd = null;

        // Apply the reset filters
        this.applyFilters();
    }

    /**
     * Parse a date string in various formats
     * @param {string} dateStr Date string to parse
     * @returns {Date|null} Parsed date object or null if invalid
     * @private
     */
    _parseDate(dateStr) {
        if (!dateStr) return null;

        try {
            // Try MM/DD/YYYY format
            if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                const [month, day, year] = dateStr.split('/').map(Number);
                return new Date(year, month - 1, day);
            }

            // Try YYYY-MM-DD format
            if (dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                const [year, month, day] = dateStr.split('-').map(Number);
                return new Date(year, month - 1, day);
            }

            // Use native Date parsing as fallback
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date;
            }
        } catch (e) {
            console.warn(`Failed to parse date: ${dateStr}`, e);
        }

        return null;
    }
}

// Usage example:
//
// // Create the filter
// const transactionFilter = new TransactionFilter({
//     tableId: 'transactions-table',
//     filters: {
//         search: 'transaction-search',
//         date: 'date-filter',
//         category: 'category-filter',
//         type: 'type-filter'
//     },
//     onFilterChange: (info) => {
//         console.log(`Showing ${info.visibleRows} of ${info.totalRows} transactions`);
//     },
//     paginator: paginator // Optional integration with the TransactionPaginator
// });
//
// // Initialize filters
// transactionFilter.applyFilters();