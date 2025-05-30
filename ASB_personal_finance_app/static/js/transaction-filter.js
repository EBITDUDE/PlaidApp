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
                subcategory: 'subcategory-filter',
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

        // Subcategory filter
        if (this.filterElements.subcategory) {
            this.filterElements.subcategory.addEventListener('change', () => {
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

        const subcategoryFilter = this.filterElements.subcategory ?
            this.filterElements.subcategory.value : 'all';

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
        const hasSubcategoryFilter = subcategoryFilter !== 'all';
        const hasTypeFilter = typeFilter !== 'all';
        const hasDateFilter = startDate !== null;

        // Track visible count
        let visibleCount = 0;

        // Apply filters to each row
        rows.forEach(row => {
            // Get filter attributes once for efficiency
            const rowCategory = row.getAttribute('data-category') || '';
            const rowSubcategory = row.getAttribute('data-subcategory') || '';
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

            // Apply subcategory filter
            if (hasSubcategoryFilter && showRow) {
                if (subcategoryFilter === 'uncategorized') {
                    // Special case for "Uncategorized": show only transactions without subcategories
                    showRow = !rowSubcategory || rowSubcategory === '' || rowSubcategory === '—';
                } else {
                    showRow = rowSubcategory === subcategoryFilter;
                }
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
            subcategory: this.filterElements.subcategory ? this.filterElements.subcategory.value : 'all',
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
        // Check if this is a new browsing session
        const isNewSession = !sessionStorage.getItem('financeAppSessionActive');
        sessionStorage.setItem('financeAppSessionActive', 'true');

        if (isNewSession) return;

        const saved = sessionStorage.getItem('transactionFilters');
        if (!saved) return;

        try {
            const filterState = JSON.parse(saved);

            // Validate restored data
            const validFilters = ['all', '30', '90', '180', '365', 'ytd', 'custom'];
            const validTypes = ['all', 'expense', 'income'];

            // Validate and sanitize each filter
            if (this.filterElements.date && validFilters.includes(filterState.date)) {
                this.filterElements.date.value = filterState.date;
            }

            if (this.filterElements.type && validTypes.includes(filterState.type)) {
                this.filterElements.type.value = filterState.type;
            }

            // Sanitize search input
            if (this.filterElements.search && filterState.search) {
                this.filterElements.search.value = filterState.search.substring(0, 100);
            }

            // Validate category and subcategory exist in current options
            if (this.filterElements.category && filterState.category) {
                const exists = Array.from(this.filterElements.category.options)
                    .some(opt => opt.value === filterState.category);
                if (exists) {
                    this.filterElements.category.value = filterState.category;
                }
            }

        } catch (e) {
            console.warn('Failed to restore filters:', e);
            sessionStorage.removeItem('transactionFilters');
        }
    }

    /**
     * Resets all filters to their default state
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
        if (this.filterElements.subcategory) {
            this.filterElements.subcategory.value = 'all';
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
     * Parse a date string in various formats
     * Uses the shared utility function from date-utils.js
     * @param {string} dateStr Date string to parse
     * @returns {Date|null} Parsed date object or null if invalid
     * @private
     */
    _parseDate(dateStr) {
        // Use the shared utility function
        return window.parseDate ? window.parseDate(dateStr) : null;
    }
}