/**
 * annual-totals.js - Annual category totals functionality for ASB Personal Finance App
 * 
 * This file contains the JavaScript code for the annual category totals page.
 */

/**
 * Initialize the annual totals page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    // Initialize year pickers
    setupYearPickers();

    // Set default years (last 5 years)
    const currentYear = new Date().getFullYear();
    const fiveYearsAgo = currentYear - 4;

    const startYearInput = document.getElementById('annual-start-year');
    const endYearInput = document.getElementById('annual-end-year');

    if (startYearInput && endYearInput) {
        startYearInput.value = fiveYearsAgo.toString();
        endYearInput.value = currentYear.toString();
    }

    // Load annual totals with default years
    loadAnnualTotals();

    // Refresh button handler
    document.getElementById('refresh-button').addEventListener('click', loadAnnualTotals);

    // Apply years button handler
    document.getElementById('apply-annual-years').addEventListener('click', loadAnnualTotals);
});

/**
 * Setup year pickers for date inputs
 */
function setupYearPickers() {
    const startYearInput = document.getElementById('annual-start-year');
    const endYearInput = document.getElementById('annual-end-year');

    if (startYearInput) {
        startYearInput.addEventListener('click', function () {
            showYearPicker(this);
        });
    }

    if (endYearInput) {
        endYearInput.addEventListener('click', function () {
            showYearPicker(this);
        });
    }
}

/**
 * Shows a year picker popup for input fields
 * 
 * @param {HTMLElement} inputElement - The input element to show year picker for
 */
function showYearPicker(inputElement) {
    // Create year picker if it doesn't exist
    let pickerElement = document.querySelector(`.year-picker[data-for="${inputElement.id}"]`);

    if (!pickerElement) {
        pickerElement = document.createElement('div');
        pickerElement.className = 'year-picker';
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
        headerDiv.style.textAlign = 'center';
        headerDiv.style.fontWeight = 'bold';
        headerDiv.textContent = 'Select Year';

        // Create years grid
        const yearsDiv = document.createElement('div');
        yearsDiv.style.display = 'grid';
        yearsDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
        yearsDiv.style.gap = '5px';

        // Append elements
        pickerElement.appendChild(headerDiv);
        pickerElement.appendChild(yearsDiv);

        // Add to document
        inputElement.parentNode.appendChild(pickerElement);

        // Get current year
        const currentYear = new Date().getFullYear();

        // Create range of years (current year down to 10 years ago)
        const years = [];
        for (let year = currentYear; year >= currentYear - 10; year--) {
            years.push(year);
        }

        // Add years to grid
        years.forEach(year => {
            const yearBtn = document.createElement('button');
            yearBtn.type = 'button';
            yearBtn.textContent = year;
            yearBtn.style.padding = '5px';
            yearBtn.style.border = '1px solid #ddd';
            yearBtn.style.borderRadius = '3px';
            yearBtn.style.cursor = 'pointer';
            yearBtn.style.backgroundColor = '#f8f8f8';

            yearBtn.addEventListener('click', function () {
                inputElement.value = year.toString();
                pickerElement.style.display = 'none';
            });

            yearsDiv.appendChild(yearBtn);
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
 * Load annual totals data from the server
 */
function loadAnnualTotals() {
    const startYearInput = document.getElementById('annual-start-year');
    const endYearInput = document.getElementById('annual-end-year');
    const loadingIndicator = document.getElementById('loading-indicator');
    const annualTable = document.getElementById('annual-table');

    // Validate years
    if (!startYearInput.value || !endYearInput.value) {
        alert('Please select both start and end years');
        return;
    }

    // Parse years to compare them
    const startYear = parseInt(startYearInput.value);
    const endYear = parseInt(endYearInput.value);

    // Check if start year is after end year
    if (startYear > endYear) {
        alert('Start year must be before or equal to end year');
        return;
    }

    // Show loading indicator
    loadingIndicator.style.display = 'block';
    annualTable.style.display = 'none';

    // Fetch annual data with year range parameters
    fetch(`/get_annual_totals?start_year=${startYear}&end_year=${endYear}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
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