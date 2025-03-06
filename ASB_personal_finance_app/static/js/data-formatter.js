/**
 * data-formatter.js - Data formatting utilities for ASB Personal Finance App
 * 
 * This file contains utility functions for formatting dates, currency, and other data.
 */

/**
 * Format a date as MM/DD/YYYY
 * 
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

/**
 * Format a number as currency (USD)
 * 
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    // Format as $#,##0.00
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

// Make the function available globally
window.formatCurrency = formatCurrency;

/**
 * Helper function to get month number from name
 * 
 * @param {string} monthName - Month name (3-letter abbreviation)
 * @returns {number} Month number (1-12)
 */
function getMonthNumber(monthName) {
    const months = {
        'Jan': 1, 'Feb': 2, 'Mar': 3,
        'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9,
        'Oct': 10, 'Nov': 11, 'Dec': 12
    };
    return months[monthName] || 1;
}

/**
 * Parse a date string in various formats
 * 
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
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

        // Try MM/YYYY format (month only)
        if (dateStr.match(/^\d{1,2}\/\d{4}$/)) {
            const [month, year] = dateStr.split('/').map(Number);
            return new Date(year, month - 1, 1);
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