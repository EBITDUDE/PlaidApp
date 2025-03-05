/**
 * annual-totals.js - Annual category totals functionality for ASB Personal Finance App
 * 
 * This file contains the JavaScript code for the annual category totals page.
 */

/**
 * Initialize the annual totals page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    // Load annual totals
    loadAnnualTotals();

    // Refresh button handler
    document.getElementById('refresh-button').addEventListener('click', loadAnnualTotals);
});

/**
 * Load annual totals data from the server
 */
function loadAnnualTotals() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const annualTable = document.getElementById('annual-table');

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    annualTable.style.display = 'none';

    fetch('/get_annual_totals')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                loadingIndicator.textContent = 'Error: ' + data.error;
            } else {
                loadingIndicator.style.display = 'none';
                annualTable.style.display = 'table';

                displayAnnualTotals(data.annual_category_totals, data.years);
            }
        })
        .catch(err => {
            loadingIndicator.textContent = 'Error loading data: ' + err.message;
            console.error('Error loading annual totals:', err);
        });
}

/**
 * Display annual totals in the table
 * 
 * @param {Array} categoryTotals - Array of category total objects
 * @param {Array} years - Array of years to display
 */
function displayAnnualTotals(categoryTotals, years) {
    const tableHeader = document.getElementById('annual-header').querySelector('tr');
    const tableBody = document.getElementById('annual-body');

    // Clear existing headers except the first one (Category)
    while (tableHeader.children.length > 1) {
        tableHeader.removeChild(tableHeader.lastChild);
    }

    // Add year headers
    years.forEach(year => {
        const th = document.createElement('th');
        th.textContent = year;
        tableHeader.appendChild(th);
    });

    // Add category rows
    tableBody.innerHTML = '';

    if (categoryTotals.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="${years.length + 1}">No data available</td>`;
        tableBody.appendChild(row);
        return;
    }

    categoryTotals.forEach(row => {
        const tr = document.createElement('tr');

        // Add category name
        const categoryCell = document.createElement('td');
        categoryCell.textContent = row.category;
        tr.appendChild(categoryCell);

        years.forEach(year => {
            const td = document.createElement('td');

            // Check for zero value
            let value = 0;

            if (row[year]) {
                if (typeof row[year] === 'string' && row[year].startsWith('$')) {
                    // If it's already a string with $ sign, parse it first
                    value = parseFloat(row[year].replace(/[\$,]/g, ''));
                } else {
                    // Otherwise use the value directly
                    value = parseFloat(row[year]);
                }
            }

            // Display dash for zero, otherwise format as currency
            td.textContent = (value === 0) ? "–" : formatCurrency(value);

            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

/**
 * Format a number as currency (USD)
 * 
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}