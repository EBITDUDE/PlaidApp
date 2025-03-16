/**
 * categories.js - Category management functionality for ASB Personal Finance App
 */

let currentCategories = [];
let selectedCategory = null;
let isEditingCategory = false;
let isEditingSubcategory = false;

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

    // First sync transaction categories with the categories database
    fetch('/sync_transaction_categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    })
        .then(response => response.json())
        .then(syncResult => {
            // Log sync results
            if (syncResult.added_categories > 0 || syncResult.added_subcategories > 0) {
                console.log(`Category sync found ${syncResult.added_categories} new categories and ${syncResult.added_subcategories} new subcategories`);
            }

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
            return Promise.all([categoriesPromise, countsPromise]);
        })
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
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to sync or load categories');
            categoriesList.innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Error loading categories. Please try reloading the page.</div>';
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

        // Create the category display with edit and delete buttons
        categoryItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span data-category="${category.name}">${category.name}</span>
                <div class="action-buttons">
                    <button class="edit-category-btn action-btn" data-category="${category.name}">Edit</button>
                    <button class="delete-category-btn action-btn" data-category="${category.name}">Delete</button>
                </div>
            </div>
            <div style="font-size: 0.8em; color: #777;">
                ${category.subcategories.length} subcategories<br>
                ${count} total transactions
            </div>
        `;

        categoryItem.addEventListener('click', function (e) {
            // Don't trigger if clicked a button
            if (e.target.classList.contains('edit-category-btn') ||
                e.target.classList.contains('delete-category-btn')) {
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

    // Add edit button handlers
    document.querySelectorAll('.edit-category-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();  // Prevent triggering the category click

            if (isEditingCategory || isEditingSubcategory) {
                alert('Please finish your current edit first.');
                return;
            }

            const categoryName = this.getAttribute('data-category');

            // Find the category element
            const categorySpan = this.closest('.category-item').querySelector('span[data-category]');

            // Switch to edit mode
            isEditingCategory = true;

            // Store the original content and replace with an edit field
            const originalContent = categorySpan.textContent;
            const editContainer = document.createElement('div');
            editContainer.className = 'edit-container';
            editContainer.innerHTML = `
                <input type="text" class="edit-category-input" value="${categoryName}" style="width: 60%; padding: 4px;">
                <button class="save-edit-btn action-btn">Save</button>
                <button class="cancel-edit-btn action-btn">Cancel</button>
            `;

            // Replace the category span with our edit container
            categorySpan.parentNode.replaceChild(editContainer, categorySpan);

            // Focus the input
            const input = editContainer.querySelector('.edit-category-input');
            input.focus();
            input.select();

            // Save on Enter
            input.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    saveEditedCategory(categoryName, input.value, editContainer, originalContent);
                }
            });

            // Save button handler
            editContainer.querySelector('.save-edit-btn').addEventListener('click', function () {
                saveEditedCategory(categoryName, input.value, editContainer, originalContent);
            });

            // Cancel button handler
            editContainer.querySelector('.cancel-edit-btn').addEventListener('click', function () {
                // Restore the original span
                const span = document.createElement('span');
                span.setAttribute('data-category', categoryName);
                span.textContent = originalContent;
                editContainer.parentNode.replaceChild(span, editContainer);
                isEditingCategory = false;
            });
        });
    });

    // Add delete button handlers
    document.querySelectorAll('.delete-category-btn').forEach(btn => {
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
                <td data-subcategory="${subcategory}">${subcategory}</td>
                <td class="subcategory-count-column">${count}</td>
                <td>
                    <button class="edit-subcategory-btn action-btn" 
                            data-category="${category.name}" 
                            data-subcategory="${subcategory}">Edit</button>
                    <button class="delete-subcategory-btn action-btn" 
                            data-category="${category.name}" 
                            data-subcategory="${subcategory}">Delete</button>
                </td>
            `;

            tbody.appendChild(row);
        });

        // Add edit button handlers for subcategories
        document.querySelectorAll('.edit-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                if (isEditingCategory || isEditingSubcategory) {
                    alert('Please finish your current edit first.');
                    return;
                }

                const categoryName = this.getAttribute('data-category');
                const subcategoryName = this.getAttribute('data-subcategory');

                // Find the subcategory cell
                const subcategoryCell = this.closest('tr').querySelector(`td[data-subcategory="${subcategoryName}"]`);

                // Switch to edit mode
                isEditingSubcategory = true;

                // Store the original content and replace with an edit field
                const originalContent = subcategoryCell.textContent;
                const editContainer = document.createElement('div');
                editContainer.className = 'edit-container';
                editContainer.innerHTML = `
                    <input type="text" class="edit-subcategory-input" value="${subcategoryName}" style="width: 60%; padding: 4px;">
                    <button class="save-subcategory-edit-btn action-btn">Save</button>
                    <button class="cancel-subcategory-edit-btn action-btn">Cancel</button>
                `;

                // Replace the content with edit form
                subcategoryCell.innerHTML = '';
                subcategoryCell.appendChild(editContainer);

                // Focus the input
                const input = editContainer.querySelector('.edit-subcategory-input');
                input.focus();
                input.select();

                // Save on Enter
                input.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') {
                        saveEditedSubcategory(categoryName, subcategoryName, input.value, subcategoryCell, originalContent);
                    }
                });

                // Save button handler
                editContainer.querySelector('.save-subcategory-edit-btn').addEventListener('click', function () {
                    saveEditedSubcategory(categoryName, subcategoryName, input.value, subcategoryCell, originalContent);
                });

                // Cancel button handler
                editContainer.querySelector('.cancel-subcategory-edit-btn').addEventListener('click', function () {
                    subcategoryCell.textContent = originalContent;
                    isEditingSubcategory = false;
                });
            });
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
 * Save edited category name
 * 
 * @param {string} oldName - Original category name
 * @param {string} newName - New category name
 * @param {HTMLElement} container - The container element
 * @param {string} originalContent - Original content to restore on cancel
 */
function saveEditedCategory(oldName, newName, container, originalContent) {
    newName = newName.trim();

    // Validate new name
    if (!newName) {
        alert('Category name cannot be empty');
        return;
    }

    if (newName.length > 50) {
        alert('Category name must be 50 characters or less');
        return;
    }

    // If name hasn't changed, just cancel the edit
    if (oldName === newName) {
        // Restore the original span
        const span = document.createElement('span');
        span.setAttribute('data-category', oldName);
        span.textContent = originalContent;
        container.parentNode.replaceChild(span, container);
        isEditingCategory = false;
        return;
    }

    // Client-side check for existing categories
    const categoryExists = currentCategories.some(c =>
        c.name.toLowerCase() === newName.toLowerCase() &&
        c.name.toLowerCase() !== oldName.toLowerCase()
    );

    if (categoryExists) {
        alert('Category with this name already exists');
        return;
    }

    // Send rename request to server
    fetch('/rename_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            old_name: oldName,
            new_name: newName
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error renaming category: ' + data.error);

                // Restore the original span
                const span = document.createElement('span');
                span.setAttribute('data-category', oldName);
                span.textContent = originalContent;
                container.parentNode.replaceChild(span, container);
            } else {
                // Reset edit state
                isEditingCategory = false;

                // If this was the selected category, update its name
                if (selectedCategory && selectedCategory.name === oldName) {
                    selectedCategory.name = newName;
                }

                // Show success notification
                if (data.updated_count > 0) {
                    const notification = document.createElement('div');
                    notification.className = 'success-notification';
                    notification.textContent = `Updated ${data.updated_count} transactions with the new category name`;
                    notification.style.position = 'fixed';
                    notification.style.bottom = '20px';
                    notification.style.right = '20px';
                    notification.style.backgroundColor = '#4CAF50';
                    notification.style.color = 'white';
                    notification.style.padding = '10px 20px';
                    notification.style.borderRadius = '4px';
                    notification.style.zIndex = '1000';
                    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

                    document.body.appendChild(notification);

                    // Remove after a few seconds
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.5s';
                        setTimeout(() => {
                            document.body.removeChild(notification);
                        }, 500);
                    }, 5000);
                }

                // Reload all categories
                loadCategories();
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to rename category');

            // Restore the original span
            const span = document.createElement('span');
            span.setAttribute('data-category', oldName);
            span.textContent = originalContent;
            container.parentNode.replaceChild(span, container);

            isEditingCategory = false;
        });
}

/**
 * Save edited subcategory name
 * 
 * @param {string} categoryName - Category name
 * @param {string} oldSubcategory - Original subcategory name
 * @param {string} newSubcategory - New subcategory name
 * @param {HTMLElement} container - The container element
 * @param {string} originalContent - Original content to restore on cancel
 */
function saveEditedSubcategory(categoryName, oldSubcategory, newSubcategory, container, originalContent) {
    newSubcategory = newSubcategory.trim();

    // Validate new name
    if (!newSubcategory) {
        alert('Subcategory name cannot be empty');
        return;
    }

    if (newSubcategory.length > 50) {
        alert('Subcategory name must be 50 characters or less');
        return;
    }

    // If name hasn't changed, just cancel the edit
    if (oldSubcategory === newSubcategory) {
        container.textContent = originalContent;
        isEditingSubcategory = false;
        return;
    }

    // Find the current category
    const category = currentCategories.find(c => c.name === categoryName);
    if (!category) {
        alert('Category not found');
        container.textContent = originalContent;
        isEditingSubcategory = false;
        return;
    }

    // Client-side check for existing subcategories
    const subcategoryExists = category.subcategories.some(s =>
        s.toLowerCase() === newSubcategory.toLowerCase() &&
        s.toLowerCase() !== oldSubcategory.toLowerCase()
    );

    if (subcategoryExists) {
        alert('Subcategory with this name already exists in this category');
        return;
    }

    // Send rename request to server
    fetch('/rename_subcategory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            category: categoryName,
            old_subcategory: oldSubcategory,
            new_subcategory: newSubcategory
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error renaming subcategory: ' + data.error);
                container.textContent = originalContent;
            } else {
                // Reset edit state
                isEditingSubcategory = false;

                // Show success notification
                if (data.updated_count > 0) {
                    const notification = document.createElement('div');
                    notification.className = 'success-notification';
                    notification.textContent = `Updated ${data.updated_count} transactions with the new subcategory name`;
                    notification.style.position = 'fixed';
                    notification.style.bottom = '20px';
                    notification.style.right = '20px';
                    notification.style.backgroundColor = '#4CAF50';
                    notification.style.color = 'white';
                    notification.style.padding = '10px 20px';
                    notification.style.borderRadius = '4px';
                    notification.style.zIndex = '1000';
                    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

                    document.body.appendChild(notification);

                    // Remove after a few seconds
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.5s';
                        setTimeout(() => {
                            document.body.removeChild(notification);
                        }, 500);
                    }, 5000);
                }

                // Update the selected category with the new data
                if (selectedCategory && selectedCategory.name === categoryName) {
                    // Replace old subcategory with new one
                    const subcatIndex = selectedCategory.subcategories.findIndex(
                        s => s.toLowerCase() === oldSubcategory.toLowerCase()
                    );
                    if (subcatIndex >= 0) {
                        selectedCategory.subcategories[subcatIndex] = newSubcategory;
                    }

                    // Reload subcategories display
                    loadCategoryCounts().then(counts => {
                        displaySubcategories(
                            selectedCategory,
                            counts.subcategoryCounts[selectedCategory.name] || {}
                        );
                    });
                }
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Failed to rename subcategory');
            container.textContent = originalContent;
            isEditingSubcategory = false;
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