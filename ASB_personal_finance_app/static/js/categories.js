/**
 * categories.js - Category management functionality for ASB Personal Finance App
 * 
 * This file contains the JavaScript code for the category management page.
 */

/**
 * Initialize the category management page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function () {
    // Load categories
    loadCategories();

    // Add category button handler
    document.getElementById('add-category-btn').addEventListener('click', addCategory);

    // Add category on Enter key
    document.getElementById('new-category').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addCategory();
        }
    });
});

/**
 * Load categories from the server and display them
 */
function loadCategories() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const categoriesTable = document.getElementById('categories-table');

    fetch('/get_categories')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                loadingIndicator.textContent = 'Error loading categories: ' + data.error;
            } else {
                loadingIndicator.style.display = 'none';
                categoriesTable.style.display = 'table';

                const categories = data.categories;
                displayCategories(categories);
            }
        })
        .catch(err => {
            loadingIndicator.textContent = 'Error loading categories: ' + err.message;
            console.error('Error loading categories:', err);
        });
}

/**
 * Display categories in the table
 * 
 * @param {Array} categories - Array of category names
 */
function displayCategories(categories) {
    const tbody = document.getElementById('categories-body');
    tbody.innerHTML = '';

    if (categories.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="2">No categories found. Add your first category above.</td>';
        tbody.appendChild(row);
        return;
    }

    categories.forEach(category => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${category}</td>
            <td>
                <button class="delete-btn" data-category="${category}">Delete</button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Add delete button handlers
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const category = this.getAttribute('data-category');
            if (confirm(`Are you sure you want to delete the category "${category}"?`)) {
                deleteCategory(category);
            }
        });
    });
}

/**
 * Add a new category
 */
function addCategory() {
    const categoryInput = document.getElementById('new-category');
    const newCategory = categoryInput.value.trim();

    if (!newCategory) {
        alert('Please enter a category name');
        return;
    }

    if (newCategory.length > 50) {
        alert('Category name must be 50 characters or less');
        return;
    }

    // Client-side check for existing categories
    const existingCategories = document.querySelectorAll('#categories-body tr td:first-child');
    const categoryExists = Array.from(existingCategories).some(
        categoryCell => categoryCell.textContent.toLowerCase() === newCategory.toLowerCase()
    );

    if (categoryExists) {
        alert('Category already exists');
        categoryInput.focus();
        return;
    }

    fetch('/add_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error adding category: ' + data.error);
            } else if (data.message && data.message === 'Category already exists') {
                // Handle server-side duplicate check
                alert('Category already exists');
                categoryInput.focus();
            } else {
                categoryInput.value = '';
                loadCategories(); // Refresh the full list
            }
        })
        .catch(err => {
            console.error('Error adding category:', err);
            alert('Error adding category: ' + err.message);
        });
}

/**
 * Delete a category
 * 
 * @param {string} category - Category name to delete
 */
function deleteCategory(category) {
    fetch('/delete_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error deleting category: ' + data.error);
            } else {
                loadCategories();
            }
        })
        .catch(err => {
            console.error('Error deleting category:', err);
            alert('Error deleting category: ' + err.message);
        });
}