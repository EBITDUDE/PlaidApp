/**
 * Creates and manages a category dropdown component with subcategory support
 * @param {Object} options - Configuration options
 * @param {string} options.containerId - ID of the container to place the component in
 * @param {string} options.inputName - Name attribute for the hidden input (for forms)
 * @param {Function} options.onChange - Optional callback when category changes
 * @param {boolean} options.required - Whether the field is required
 * @returns {Object} Component API with methods to get/set values
 */
function createCategoryDropdown(options = {}) {
    // Default options
    const config = {
        containerId: 'category-container',
        inputName: 'category',
        subcategoryInputName: 'subcategory',
        onChange: null,
        required: true,
        ...options
    };

    // Get container element
    const container = document.getElementById(config.containerId);
    if (!container) {
        console.error(`Container with ID "${config.containerId}" not found`);
        return null;
    }

    // Create component elements
    const dropdownId = `${config.containerId}-dropdown`;
    const subcatDropdownId = `${config.containerId}-subcat-dropdown`;
    const newFieldId = `${config.containerId}-new-field`;
    const newSubcatFieldId = `${config.containerId}-new-subcat-field`;
    const hiddenInputId = `${config.containerId}-hidden`;
    const hiddenSubcatInputId = `${config.containerId}-subcat-hidden`;

    // Create main structure
    container.innerHTML = `
        <div style="margin-bottom: 10px;">
            <select id="${dropdownId}" class="category-select" style="width: 100%; padding: 5px; display: block;" ${config.required ? 'required' : ''}>
                <option value="" disabled selected>Select a category</option>
            </select>
        </div>
        <div style="margin-bottom: 10px; display: none;" id="${config.containerId}-subcat-container">
            <select id="${subcatDropdownId}" class="subcategory-select" style="width: 100%; padding: 5px; display: block;">
                <option value="" selected>No subcategory (optional)</option>
            </select>
        </div>
        <div id="${config.containerId}-new-subcat-container" style="display: none; margin-top: 5px;">
            <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                <input type="text" id="${newSubcatFieldId}" placeholder="Enter new subcategory name (optional)" 
                    style="flex-grow: 1; padding: 5px;">
                <button type="button" id="${config.containerId}-add-subcat-btn" 
                    style="padding: 5px 10px; background-color: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 3px;">Add</button>
                <button type="button" id="${config.containerId}-cancel-subcat-btn" 
                    style="padding: 5px 10px; border: 1px solid #ddd; background-color: #f8f8f8; cursor: pointer; border-radius: 3px;">Cancel</button>
            </div>
        </div>
        <div id="${config.containerId}-new-container" style="display: none; margin-top: 5px;">
            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                <input type="text" id="${newFieldId}" placeholder="Enter new category name" 
                    style="flex-grow: 1; padding: 5px;">
                <button type="button" id="${config.containerId}-add-btn" 
                    style="padding: 5px 10px; background-color: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 3px;">Add</button>
                <button type="button" id="${config.containerId}-cancel-btn" 
                    style="padding: 5px 10px; border: 1px solid #ddd; background-color: #f8f8f8; cursor: pointer; border-radius: 3px;">Cancel</button>
            </div>
        </div>
        <input type="hidden" id="${hiddenInputId}" name="${config.inputName}" ${config.required ? 'required' : ''}>
        <input type="hidden" id="${hiddenSubcatInputId}" name="${config.subcategoryInputName}">
    `;

    // Get created elements
    const dropdown = document.getElementById(dropdownId);
    const subcatDropdown = document.getElementById(subcatDropdownId);
    const subcatContainer = document.getElementById(`${config.containerId}-subcat-container`);
    const newContainer = document.getElementById(`${config.containerId}-new-container`);
    const newField = document.getElementById(newFieldId);
    const newSubcatField = document.getElementById(newSubcatFieldId);
    const newSubcatContainer = document.getElementById(`${config.containerId}-new-subcat-container`);
    const addButton = document.getElementById(`${config.containerId}-add-btn`);
    const addSubcatButton = document.getElementById(`${config.containerId}-add-subcat-btn`);
    const cancelButton = document.getElementById(`${config.containerId}-cancel-btn`);
    const hiddenInput = document.getElementById(hiddenInputId);
    const hiddenSubcatInput = document.getElementById(hiddenSubcatInputId);

    // Store categories data
    let categoriesData = [];

    // Populate dropdown with categories
    function loadCategories() {
        return fetch('/get_categories')
            .then(response => response.json())
            .then(data => {
                // Store categories data
                categoriesData = data.categories || [];

                // Keep the first option (placeholder)
                const firstOption = dropdown.options[0];
                dropdown.innerHTML = '';
                dropdown.appendChild(firstOption);

                // Add categories from the server
                categoriesData.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    dropdown.appendChild(option);
                });

                // Add "Add New" option
                const addNewOption = document.createElement('option');
                addNewOption.value = 'add_new';
                addNewOption.textContent = '+ Add New Category';
                dropdown.appendChild(addNewOption);

                return categoriesData;
            })
            .catch(err => {
                ErrorUtils.handleError(err, 'Failed to load categories');
                return [];
            });
    }

    // Populate subcategory dropdown
    function loadSubcategories(categoryName) {
        // Clear subcategory dropdown
        subcatDropdown.innerHTML = '';

        // Add default "No subcategory" option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'No subcategory (optional)';
        subcatDropdown.appendChild(defaultOption);

        // Find the selected category
        const category = categoriesData.find(c => c.name === categoryName);
        if (!category) return;

        // Add subcategories
        category.subcategories.forEach(subcategory => {
            const option = document.createElement('option');
            option.value = subcategory;
            option.textContent = subcategory;
            subcatDropdown.appendChild(option);
        });

        // Add new subcategory option
        const addNewOption = document.createElement('option');
        addNewOption.value = 'add_new';
        addNewOption.textContent = '+ Add New Subcategory';
        subcatDropdown.appendChild(addNewOption);

        // Show the subcategory container
        subcatContainer.style.display = 'block';
    }

    // Check if a category already exists (case-insensitive)
    function categoryExists(categoryName) {
        return categoriesData.some(category =>
            category.name.toLowerCase() === categoryName.toLowerCase()
        );
    }

    // Check if a subcategory already exists (case-insensitive)
    function subcategoryExists(categoryName, subcategoryName) {
        const category = categoriesData.find(c => c.name === categoryName);
        if (!category) return false;

        return category.subcategories.some(subcategory =>
            subcategory.toLowerCase() === subcategoryName.toLowerCase()
        );
    }

    // Save a new category to the server
    function saveNewCategory(categoryName) {
        return fetch('/add_category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: categoryName })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                // Handle case where category already exists on server-side check
                if (data.message && data.message === 'Category already exists') {
                    throw new Error('Category already exists');
                }
                return data;
            })
            .catch(err => {
                ErrorUtils.handleError(err, 'Failed to add category');
            });
    }

    // Save a new subcategory to the server
    function saveNewSubcategory(categoryName, subcategoryName) {
        return fetch('/add_subcategory', {
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
                    throw new Error(data.error);
                }
                return data;
            })
            .catch(err => {
                ErrorUtils.handleError(err, 'Failed to add subcategory');
            });
    }

    // Event handler for dropdown change
    dropdown.addEventListener('change', function () {
        if (this.value === 'add_new') {
            // Show the "add new" form
            dropdown.style.display = 'none';
            subcatContainer.style.display = 'none';
            newContainer.style.display = 'block';
            newField.focus();
            hiddenInput.value = '';
            hiddenSubcatInput.value = '';
        } else {
            // Update hidden input with selected category
            hiddenInput.value = this.value;

            // Clear subcategory
            hiddenSubcatInput.value = '';

            // Load subcategories for this category
            loadSubcategories(this.value);

            // Call onChange callback if provided
            if (typeof config.onChange === 'function') {
                config.onChange({
                    category: this.value,
                    subcategory: ''
                });
            }
        }
    });

    // Event handler for subcategory dropdown change
    subcatDropdown.addEventListener('change', function () {
        if (this.value === 'add_new') {
            // Show and ensure the new subcategory input is usable
            newSubcatContainer.style.display = 'flex'; // Match new category container styling
            subcatDropdown.style.display = 'none'; // Hide the dropdown
            newSubcatField.value = ''; // Clear any previous value
            newSubcatField.focus(); // Ensure focus
            newSubcatField.disabled = false; // Ensure it's not disabled
        } else {
            // Update hidden input with selected subcategory
            hiddenSubcatInput.value = this.value;

            // Hide new subcategory input if visible
            newSubcatContainer.style.display = 'none';

            // Show the dropdown again if it was hidden
            subcatDropdown.style.display = 'block';

            // Call onChange callback if provided
            if (typeof config.onChange === 'function') {
                config.onChange({
                    category: hiddenInput.value,
                    subcategory: this.value
                });
            }
        }
    });

    // Event handler for add category button
    addButton.addEventListener('click', function () {
        const newCategory = newField.value.trim();

        if (!newCategory) {
            alert('Please enter a category name');
            newField.focus();
            return;
        }

        // Check if category already exists in dropdown (client-side check)
        if (categoryExists(newCategory)) {
            alert('Category already exists');
            newField.focus();
            return;
        }

        // Save to server
        saveNewCategory(newCategory)
            .then(data => {
                // Reload categories
                return loadCategories().then(() => {
                    // Select the new category
                    dropdown.value = newCategory;
                    hiddenInput.value = newCategory;

                    // Show dropdown and hide new category form
                    dropdown.style.display = 'block';
                    newContainer.style.display = 'none';

                    // Load subcategories (which will be empty for a new category)
                    loadSubcategories(newCategory);

                    // Show new subcategory form
                    newSubcatContainer.style.display = 'block';
                    newSubcatField.focus();

                    // Call onChange callback if provided
                    if (typeof config.onChange === 'function') {
                        config.onChange({
                            category: newCategory,
                            subcategory: ''
                        });
                    }
                });
            })
            .catch(err => {
                alert('Error adding category: ' + err.message);
            });
    });

    // Event handler for add subcategory button
    addSubcatButton.addEventListener('click', function () {
        const categoryName = hiddenInput.value;
        const newSubcategory = newSubcatField.value.trim();

        if (!categoryName) {
            alert('Please select a category first');
            return;
        }

        if (!newSubcategory) {
            alert('Please enter a subcategory name');
            newSubcatField.focus();
            return;
        }

        // Check if subcategory already exists (client-side check)
        if (subcategoryExists(categoryName, newSubcategory)) {
            alert('Subcategory already exists');
            newSubcatField.focus();
            return;
        }

        // Save to server
        saveNewSubcategory(categoryName, newSubcategory)
            .then(data => {
                // Update categoriesData with the updated category
                const categoryIndex = categoriesData.findIndex(c => c.name === categoryName);
                if (categoryIndex >= 0) {
                    categoriesData[categoryIndex] = data.category;
                }

                // Reload subcategories
                loadSubcategories(categoryName);

                // Select the new subcategory
                subcatDropdown.value = newSubcategory;
                hiddenSubcatInput.value = newSubcategory;
                subcatDropdown.style.display = 'block'; // Ensure dropdown is visible

                // Hide new subcategory form
                newSubcatContainer.style.display = 'none';

                // Call onChange callback if provided
                if (typeof config.onChange === 'function') {
                    config.onChange({
                        category: categoryName,
                        subcategory: newSubcategory
                    });
                }
            })
            .catch(err => {
                alert('Error adding subcategory: ' + err.message);
            });
    });

    // Event handler for cancel subcategory button
    const cancelSubcatBtn = document.getElementById(`${config.containerId}-cancel-subcat-btn`);
    if (cancelSubcatBtn) {
        cancelSubcatBtn.addEventListener('click', function () {
            // Hide new subcategory input
            newSubcatContainer.style.display = 'none';
            // Show the dropdown again
            subcatDropdown.style.display = 'block';
            subcatDropdown.value = '';
            // Clear input
            newSubcatField.value = '';
        });
    }

    // Event handler for cancel button
    cancelButton.addEventListener('click', function () {
        // Clear and hide the "add new" form
        newField.value = '';
        newSubcatField.value = '';
        dropdown.style.display = 'block';
        newContainer.style.display = 'none';
        newSubcatContainer.style.display = 'none';
        dropdown.value = '';
        subcatContainer.style.display = 'none';
        hiddenInput.value = '';
        hiddenSubcatInput.value = '';
    });

    // Initial load of categories
    loadCategories();

    // Return public API
    return {
        /**
         * Get the current selected category and subcategory
         * @returns {Object} Object with category and subcategory properties
         */
        getValue: () => ({
            category: hiddenInput.value,
            subcategory: hiddenSubcatInput.value
        }),

        /**
         * Set the selected category and optionally subcategory
         * @param {Object} value - Object with category and optional subcategory properties
         */
        setValue: (value) => {
            if (!value) {
                dropdown.value = '';
                subcatDropdown.value = '';
                hiddenInput.value = '';
                hiddenSubcatInput.value = '';
                subcatContainer.style.display = 'none';
                return;
            }

            const categoryName = value.category || '';
            const subcategoryName = value.subcategory || '';

            if (categoryName) {
                // Check if the category exists in the dropdown
                const categoryOption = Array.from(dropdown.options).find(opt => opt.value === categoryName);

                if (categoryOption) {
                    dropdown.value = categoryName;
                    hiddenInput.value = categoryName;

                    // Load subcategories
                    loadSubcategories(categoryName);

                    // Set subcategory if provided
                    if (subcategoryName) {
                        // Check if the subcategory exists
                        setTimeout(() => {
                            const subcategoryOption = Array.from(subcatDropdown.options)
                                .find(opt => opt.value === subcategoryName);

                            if (subcategoryOption) {
                                subcatDropdown.value = subcategoryName;
                                hiddenSubcatInput.value = subcategoryName;
                            } else {
                                console.warn(`Subcategory "${subcategoryName}" not found`);
                            }
                        }, 100); // Small delay to allow subcategories to load
                    }
                } else {
                    console.warn(`Category "${categoryName}" not found`);
                }
            } else {
                dropdown.value = '';
                hiddenInput.value = '';
                subcatContainer.style.display = 'none';
            }
        },

        /**
         * Reload categories from the server
         * @returns {Promise} Promise that resolves with the categories
         */
        reload: loadCategories
    };
}