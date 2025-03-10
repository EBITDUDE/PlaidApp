/**
 * categories.js - Category management functionality for ASB Personal Finance App
 */

let currentCategories = [];
let selectedCategory = null;

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
    // Show loading indicator
    const categoriesList = document.getElementById('categories-list');
    categoriesList.innerHTML = '<div style="text-align: center; padding: 20px;">Loading categories...</div>';

    // Create promises for both categories and counts
    const categoriesPromise = fetch('/get_categories')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error loading categories:', data.error);
                return [];
            }
            return data.categories || [];
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load categories');
            return [];
        });

    const countsPromise = loadCategoryCounts();

    // Wait for both to complete
    Promise.all([categoriesPromise, countsPromise])
        .then(([categories, counts]) => {
            currentCategories = categories;

            // Display categories with counts
            displayCategories(categories, counts.categoryCounts);

            // If we had a previously selected category, try to reselect it
            if (selectedCategory) {
                const category = currentCategories.find(c => c.name === selectedCategory.name);
                if (category) {
                    selectCategory(category, counts.subcategoryCounts[category.name] || {});
                } else {
                    selectedCategory = null;
                    displaySubcategories(null);
                }
            }
        });
}

/**
 * Display categories in the left panel
 * 
 * @param {Array} categories - Array of category objects
 */
function displayCategories(categories, categoryCounts = {}) {
    const categoriesList = document.getElementById('categories-list');
    categoriesList.innerHTML = '';

    if (categories.length === 0) {
        categoriesList.innerHTML = '<div class="no-categories">No categories found. Add your first category above.</div>';
        return;
    }

    categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-item';
        if (selectedCategory && category.name === selectedCategory.name) {
            categoryItem.className += ' active';
        }

        // Get count for this category
        const count = categoryCounts[category.name] || 0;

        categoryItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${category.name}</span>
                <button class="delete-btn" data-category="${category.name}">✕</button>
            </div>
            <div style="font-size: 0.8em; color: #777;">
                ${category.subcategories.length} subcategories<br>
                ${count} total transactions
            </div>
        `;
        
        categoryItem.addEventListener('click', function (e) {
            // Don't trigger if the delete button was clicked
            if (e.target.classList.contains('delete-btn')) {
                return;
            }

            // Remove active class from all categories
            document.querySelectorAll('.category-item').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to this category
            categoryItem.classList.add('active');

            // Fetch counts and then select category with subcounts
            loadCategoryCounts().then(counts => {
                selectCategory(category, counts.subcategoryCounts[category.name] || {});
            });
        });

        categoriesList.appendChild(categoryItem);
    });

    // Add delete button handlers
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();  // Prevent triggering the category click
            const category = this.getAttribute('data-category');
            if (confirm(`Are you sure you want to delete the category "${category}" and all its subcategories?`)) {
                deleteCategory(category);
            }
        });
    });
}

/**
 * Select a category and display its subcategories
 * 
 * @param {Object} category - The category object to select
 */
function selectCategory(category, subcategoryCounts = {}) {
    selectedCategory = category;
    displaySubcategories(category, subcategoryCounts);
}

/**
 * Display subcategories for the selected category
 * 
 * @param {Object} category - The selected category object
 */
function displaySubcategories(category, subcategoryCounts = {}) {
    const headerDiv = document.getElementById('subcategory-header');
    const contentDiv = document.getElementById('subcategory-content');

    if (!category) {
        headerDiv.innerHTML = '<h3>Select a category to manage subcategories</h3>';
        contentDiv.innerHTML = `
            <div class="no-subcategories">
                Please select a category from the left panel.
            </div>
        `;
        return;
    }

    // Update header with category name
    headerDiv.innerHTML = `
        <h3>Subcategories for "${category.name}"</h3>
        <div class="add-form" style="margin-top: 10px;">
            <input type="text" id="new-subcategory" placeholder="Enter subcategory name">
            <button id="add-subcategory-btn">Add Subcategory</button>
        </div>
    `;

    // Show subcategories list or empty message
    if (category.subcategories.length === 0) {
        contentDiv.innerHTML = `
            <div class="no-subcategories">
                No subcategories found for "${category.name}". Add your first subcategory above.
            </div>
        `;
    } else {
        contentDiv.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Subcategory Name</th>
                        <th class="subcategory-count-column">Transactions</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="subcategories-body"></tbody>
            </table>
        `;

        const tbody = document.getElementById('subcategories-body');

        category.subcategories.forEach(subcategory => {
            // Get count for this subcategory
            const count = subcategoryCounts[subcategory] || 0;

            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${subcategory}</td>
                <td class="subcategory-count-column">${count}</td>
                <td>
                    <button class="delete-subcategory-btn delete-btn" 
                            data-category="${category.name}" 
                            data-subcategory="${subcategory}">Delete</button>
                </td>
            `;

            tbody.appendChild(row);
        });

        // Add delete button handlers for subcategories
        document.querySelectorAll('.delete-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const catName = this.getAttribute('data-category');
                const subName = this.getAttribute('data-subcategory');
                if (confirm(`Are you sure you want to delete the subcategory "${subName}"?`)) {
                    deleteSubcategory(catName, subName);
                }
            });
        });
    }

    // Add handler for the add subcategory button
    const addSubcategoryBtn = document.getElementById('add-subcategory-btn');
    if (addSubcategoryBtn) {
        addSubcategoryBtn.addEventListener('click', function () {
            addSubcategory(category.name);
        });
    }

    // Add subcategory on Enter key
    const subcategoryInput = document.getElementById('new-subcategory');
    if (subcategoryInput) {
        subcategoryInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                addSubcategory(category.name);
            }
        });
    }
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
    if (currentCategories.some(c => c.name.toLowerCase() === newCategory.toLowerCase())) {
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
            } else {
                categoryInput.value = '';
                loadCategories(); // Refresh the full list
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to add category');
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
                // Clear selection if we deleted the selected category
                if (selectedCategory && selectedCategory.name === category) {
                    selectedCategory = null;
                    displaySubcategories(null);
                }
                loadCategories();
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to delete category');
        });
}

/**
 * Add a new subcategory to the selected category
 * 
 * @param {string} categoryName - Name of the category to add the subcategory to
 */
function addSubcategory(categoryName) {
    const subcategoryInput = document.getElementById('new-subcategory');
    const newSubcategory = subcategoryInput.value.trim();

    if (!newSubcategory) {
        alert('Please enter a subcategory name');
        return;
    }

    if (newSubcategory.length > 50) {
        alert('Subcategory name must be 50 characters or less');
        return;
    }

    // Find the category
    const category = currentCategories.find(c => c.name === categoryName);
    if (!category) {
        alert('Category not found');
        return;
    }

    // Client-side check for existing subcategories
    if (category.subcategories.some(s => s.toLowerCase() === newSubcategory.toLowerCase())) {
        alert('Subcategory already exists');
        subcategoryInput.focus();
        return;
    }

    fetch('/add_subcategory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            category: categoryName,
            subcategory: newSubcategory
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error adding subcategory: ' + data.error);
            } else {
                subcategoryInput.value = '';

                // Update local data and UI without a full reload
                const categoryIndex = currentCategories.findIndex(c => c.name === categoryName);
                if (categoryIndex >= 0) {
                    currentCategories[categoryIndex] = data.category;
                    loadCategoryCounts().then(counts => {
                        displayCategories(currentCategories, counts.categoryCounts);
                        selectCategory(currentCategories[categoryIndex], counts.subcategoryCounts[categoryName] || {});
                    });
                } else {
                    loadCategories(); // Fallback to full reload
                }
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to add subcategory');
        });
}

/**
 * Delete a subcategory
 * 
 * @param {string} categoryName - Name of the category containing the subcategory
 * @param {string} subcategoryName - Name of the subcategory to delete
 */
function deleteSubcategory(categoryName, subcategoryName) {
    fetch('/delete_subcategory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            category: categoryName,
            subcategory: subcategoryName
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error deleting subcategory: ' + data.error);
            } else {
                // Update local data and UI without a full reload
                const categoryIndex = currentCategories.findIndex(c => c.name === categoryName);
                if (categoryIndex >= 0) {
                    currentCategories[categoryIndex] = data.category;
                    loadCategoryCounts().then(counts => {
                        displayCategories(currentCategories, counts.categoryCounts);
                        selectCategory(currentCategories[categoryIndex], counts.subcategoryCounts[categoryName] || {});
                    });
                } else {
                    loadCategories(); // Fallback to full reload
                }
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to delete subcategory');
        });
}

// Add a function to fetch category counts from the server
function loadCategoryCounts() {
    return fetch('/get_category_counts')
        .then(response => response.json())
        .then(data => {
            return {
                categoryCounts: data.category_counts || {},
                subcategoryCounts: data.subcategory_counts || {}
            };
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to load category counts');
            return {
                categoryCounts: {},
                subcategoryCounts: {}
            };
        });
}