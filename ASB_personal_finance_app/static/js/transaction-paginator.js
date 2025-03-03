/**
 * Handles pagination of large transaction lists with efficient DOM updates
 */
class TransactionPaginator {
    /**
     * Creates a new paginator
     * @param {Object} options Configuration options
     * @param {string} options.tableId ID of the table element
     * @param {string} options.pageSizeId ID of the page size selector
     * @param {number} options.defaultPageSize Default number of items per page
     * @param {Function} options.onPageChange Optional callback when page changes
     */
    constructor(options = {}) {
        this.options = Object.assign({
            tableId: 'transactions-table',
            pageSizeId: 'page-size',
            defaultPageSize: 50,
            onPageChange: null
        }, options);

        this.tableElement = document.getElementById(this.options.tableId);
        this.pageSizeElement = document.getElementById(this.options.pageSizeId);

        this.currentPage = 1;
        this.pageSize = this.pageSizeElement ?
            parseInt(this.pageSizeElement.value) || this.options.defaultPageSize :
            this.options.defaultPageSize;

        this.totalItems = 0;
        this.filteredItems = 0;
        this.rows = [];

        // Initialize pagination controls and events
        this._init();

        console.log('Paginator initialized', {
            tableId: this.options.tableId,
            pageSize: this.pageSize,
            defaultPageSize: this.options.defaultPageSize
        });

        console.log('TransactionPaginator initialized:', {
            totalItems: this.totalItems,
            pageSize: this.pageSize,
            currentPage: this.currentPage,
            filteredItems: this.filteredItems
        });
    }

    /**
     * Initialize pagination controls and event handlers
     * @private
     */
    _init() {
        // Set up page size change handler
        if (this.pageSizeElement) {
            this.pageSizeElement.addEventListener('change', () => {
                const newSize = this.pageSizeElement.value;
                if (newSize === 'all') {
                    this.showAllPages();
                } else {
                    this.pageSize = parseInt(newSize);
                    this.currentPage = 1; // Reset to first page when size changes
                    this.updateVisibility();
                }
            });
        }

        // Create pagination controls container if it doesn't exist
        let paginationContainer = document.getElementById('pagination-controls');
        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'pagination-controls';
            paginationContainer.className = 'pagination-controls';
            paginationContainer.style.margin = '15px 0';
            paginationContainer.style.textAlign = 'center';

            // Insert after the table
            if (this.tableElement && this.tableElement.parentNode) {
                this.tableElement.parentNode.insertBefore(
                    paginationContainer,
                    this.tableElement.nextSibling
                );
            }
        }

        this.paginationContainer = paginationContainer;
    }

    /**
     * Update which rows are displayed based on current page and filters
     * @param {boolean} forceUpdate Force update even if nothing changed
     */
    updateVisibility(forceUpdate = false) {
        console.log('Updating visibility', {
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            filteredItems: this.filteredItems,
            forceUpdate
        });

        if (!this.tableElement) return;

        // Get tbody element
        const tbody = this.tableElement.querySelector('tbody');
        if (!tbody) return;

        // Get all rows (cache if not already done)
        if (!this.rows.length || forceUpdate) {
            this.rows = Array.from(tbody.querySelectorAll('tr:not(.pagination-row)'));
            this.totalItems = this.rows.length;
        }

        // Handle "all" page size
        if (this.pageSizeElement && this.pageSizeElement.value === 'all') {
            this.rows.forEach(row => {
                if (!row.getAttribute('data-filtered')) {
                    row.style.display = '';
                }
            });
            this._updatePaginationControls();
            return;
        }

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;

        // Track how many filtered rows we've seen and shown
        let visibleCount = 0;
        let visibleIndex = 0;
        this.filteredItems = 0;

        // Update visibility for each row
        this.rows.forEach(row => {
            // Skip rows that are filtered out
            const isFiltered = row.getAttribute('data-filtered') === 'true';
            if (isFiltered) {
                row.style.display = 'none';
                return;
            }

            // Count total visible rows (after filtering)
            this.filteredItems++;

            // Check if this row should be shown on current page
            if (visibleIndex >= startIndex && visibleIndex < endIndex) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }

            visibleIndex++;
        });

        // Update pagination controls
        this._updatePaginationControls();

        // Call the callback if provided
        if (typeof this.options.onPageChange === 'function') {
            this.options.onPageChange({
                currentPage: this.currentPage,
                pageSize: this.pageSize,
                totalPages: this.getTotalPages(),
                totalItems: this.totalItems,
                filteredItems: this.filteredItems,
                visibleItems: visibleCount
            });
        }
    }

    /**
     * Update the pagination controls UI
     * @private
     */
    _updatePaginationControls() {
        console.log('Updating pagination controls:', {
            totalPages: this.getTotalPages(),
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            filteredItems: this.filteredItems,
            pageSizeElementValue: this.pageSizeElement ? this.pageSizeElement.value : 'N/A'
        });
        
        if (!this.paginationContainer) return;

        const totalPages = this.getTotalPages();
        const isShowingAll = this.pageSizeElement && this.pageSizeElement.value === 'all';

        // Hide pagination if showing all or only one page
        if (isShowingAll || totalPages <= 1) {
            this.paginationContainer.style.display = 'none';
            return;
        }

        // Show pagination controls
        this.paginationContainer.style.display = 'block';

        // Create pagination UI
        let html = `
            <div class="pagination-info">
                Showing ${Math.min(this.filteredItems, this.pageSize)} of ${this.filteredItems} items
                (Page ${this.currentPage} of ${totalPages})
            </div>
            <div class="pagination-buttons">
        `;

        // Previous button
        html += `
            <button class="pagination-btn" 
                ${this.currentPage === 1 ? 'disabled' : ''} 
                data-page="prev">
                &laquo; Prev
            </button>
        `;

        // Determine which page buttons to show
        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
        let endPage = startPage + maxButtons - 1;

        if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        // First page button (if not in range)
        if (startPage > 1) {
            html += `<button class="pagination-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        // Page buttons
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="pagination-btn ${i === this.currentPage ? 'pagination-btn-active' : ''}" 
                    data-page="${i}">
                    ${i}
                </button>
            `;
        }

        // Last page button (if not in range)
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
            html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        html += `
            <button class="pagination-btn" 
                ${this.currentPage === totalPages ? 'disabled' : ''} 
                data-page="next">
                Next &raquo;
            </button>
        `;

        html += '</div>';

        // Update container and add event listeners
        this.paginationContainer.innerHTML = html;

        // Add event listeners to buttons
        this.paginationContainer.querySelectorAll('.pagination-btn').forEach(button => {
            button.addEventListener('click', () => {
                if (button.disabled) return;

                const page = button.getAttribute('data-page');
                if (page === 'prev') {
                    this.prevPage();
                } else if (page === 'next') {
                    this.nextPage();
                } else {
                    this.goToPage(parseInt(page));
                }
            });
        });
    }

    /**
     * Get the total number of pages
     * @returns {number} Total pages
     */
    getTotalPages() {
        if (this.pageSize <= 0 || this.filteredItems <= 0) return 1;
        return Math.ceil(this.filteredItems / this.pageSize);
    }

    /**
     * Go to a specific page
     * @param {number} page Page number
     */
    goToPage(page) {
        const totalPages = this.getTotalPages();
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        if (this.currentPage !== page) {
            this.currentPage = page;
            this.updateVisibility();

            // Scroll to top of table for better UX
            if (this.tableElement) {
                this.tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    /**
     * Go to the next page
     */
    nextPage() {
        this.goToPage(this.currentPage + 1);
    }

    /**
     * Go to the previous page
     */
    prevPage() {
        this.goToPage(this.currentPage - 1);
    }

    /**
     * Show all items (disable pagination)
     */
    showAllPages() {
        if (this.pageSizeElement) {
            this.pageSizeElement.value = 'all';
        }

        // Show all unfiltered rows
        this.rows.forEach(row => {
            if (row.getAttribute('data-filtered') !== 'true') {
                row.style.display = '';
            }
        });

        // Hide pagination controls
        if (this.paginationContainer) {
            this.paginationContainer.style.display = 'none';
        }

        // Call callback if provided
        if (typeof this.options.onPageChange === 'function') {
            this.options.onPageChange({
                currentPage: 1,
                pageSize: this.filteredItems,
                totalPages: 1,
                totalItems: this.totalItems,
                filteredItems: this.filteredItems,
                visibleItems: this.filteredItems
            });
        }
    }

    /**
     * Apply a filter to the rows
     * @param {Function} filterFn Function that takes a row element and returns true if it should be visible
     */
    applyFilter(filterFn) {
        if (!this.tableElement || !filterFn) return;

        // Get all rows if not already cached
        if (!this.rows.length) {
            const tbody = this.tableElement.querySelector('tbody');
            if (!tbody) return;
            this.rows = Array.from(tbody.querySelectorAll('tr:not(.pagination-row)'));
            this.totalItems = this.rows.length;
        }

        // Apply filter to each row
        this.filteredItems = 0;
        this.rows.forEach(row => {
            const isVisible = filterFn(row);
            row.setAttribute('data-filtered', !isVisible);

            if (isVisible) {
                this.filteredItems++;
            }
        });

        // Reset to first page after filtering
        this.currentPage = 1;
        this.updateVisibility();
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.rows.forEach(row => {
            row.setAttribute('data-filtered', 'false');
        });

        this.filteredItems = this.totalItems;
        this.currentPage = 1;
        this.updateVisibility();
    }

    /**
     * Reset the paginator to its initial state
     * @param {boolean} resetFilters Whether to clear filters as well
     */
    reset(resetFilters = true) {
        this.currentPage = 1;

        if (this.pageSizeElement) {
            this.pageSizeElement.value = this.options.defaultPageSize.toString();
            this.pageSize = this.options.defaultPageSize;
        }

        if (resetFilters) {
            this.clearFilters();
        } else {
            this.updateVisibility();
        }
    }
}

// Usage example:
//
// const paginator = new TransactionPaginator({
//     tableId: 'transactions-table',
//     pageSizeId: 'page-size',
//     defaultPageSize: 50,
//     onPageChange: (info) => {
//         console.log(`Showing page ${info.currentPage} of ${info.totalPages}`);
//     }
// });
//
// // Apply a search filter
// document.getElementById('search-input').addEventListener('input', function(e) {
//     const searchTerm = e.target.value.toLowerCase();
//     paginator.applyFilter(row => {
//         const text = row.textContent.toLowerCase();
//         return text.includes(searchTerm);
//     });
// });
//
// // Initial visibility update
// paginator.updateVisibility();