/**
 * Initializes all date picker fields in the application
 */
function initializeAllDatePickers() {
    // Initialize date picker for transaction form
    const newDatePicker = new CalendarPicker({
        inputSelector: '#new-date',
        format: 'MM/DD/YYYY',
        onSelect: (date, formatted) => {
            console.log('Transaction date selected:', formatted);
        }
    });

    // Initialize custom date range pickers
    const startDatePicker = new CalendarPicker({
        inputSelector: '#custom-date-start',
        format: 'MM/DD/YYYY',
        onSelect: (date, formatted) => {
            // Optionally validate start date is before end date
            const endDateInput = document.getElementById('custom-date-end');
            if (endDateInput && endDateInput.value) {
                try {
                    const endDate = new Date(parseDate(endDateInput.value));
                    if (date > endDate) {
                        alert('Start date must be before end date');
                        // Reset to previous value or clear
                        document.getElementById('custom-date-start').value = '';
                    }
                } catch (e) {
                    console.warn('Could not validate date range:', e);
                }
            }
        }
    });

    const endDatePicker = new CalendarPicker({
        inputSelector: '#custom-date-end',
        format: 'MM/DD/YYYY',
        onSelect: (date, formatted) => {
            // Optionally validate end date is after start date
            const startDateInput = document.getElementById('custom-date-start');
            if (startDateInput && startDateInput.value) {
                try {
                    const startDate = new Date(parseDate(startDateInput.value));
                    if (date < startDate) {
                        alert('End date must be after start date');
                        // Reset to previous value or clear
                        document.getElementById('custom-date-end').value = '';
                    }
                } catch (e) {
                    console.warn('Could not validate date range:', e);
                }
            }
        }
    });
}

/**
 * Helper function to parse dates in different formats
 * @param {string|Date} dateStr - Date string or Date object to parse
 * @returns {Date|null} JavaScript Date object or null if parsing fails
 * @description
 * Supports the following formats:
 * - JavaScript Date objects (returned as-is)
 * - MM/DD/YYYY (e.g., 01/31/2023)
 * - YYYY-MM-DD (e.g., 2023-01-31)
 * - Native JavaScript Date parsing as fallback
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    try {
        // Handle date objects
        if (dateStr instanceof Date) return dateStr;

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

/**
 * Formats a date in MM/DD/YYYY format
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

/**
 * Formats a date in MM/YYYY format for month selection
 * @param {Date} date - Date to format
 * @returns {string} Formatted month/year string
 */
function formatMonthYear(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    // Initialize date pickers for standard fields
    initializeAllDatePickers();

    // The code that follows would replace your commented-out blocks for:
    // - Monthly date range picker
    // - Custom calendar implementations
    // - Any other specialized date picker functionality
});