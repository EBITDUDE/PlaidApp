/**
 * Creates and manages a category dropdown component with "add new" functionality
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
    const newFieldId = `${config.containerId}-new-field`;
    const hiddenInputId = `${config.containerId}-hidden`;

    // Create main structure
    container.innerHTML = `
        <select id="${dropdownId}" class="category-select" style="width: 100%; padding: 5px; display: block;" ${config.required ? 'required' : ''}>
            <option value="" disabled selected>Select a category</option>
        </select>
        
        <div id="${config.containerId}-new-container" style="display: none; margin-top: 5px;">
            <div style="display: flex; gap: 5px;">
                <input type="text" id="${newFieldId}" placeholder="Enter new category name" 
                       style="flex-grow: 1; padding: 5px;" ${config.required ? 'required' : ''}>
                <button type="button" id="${config.containerId}-add-btn" 
                        style="padding: 5px 10px; background-color: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 3px;">Add</button>
                <button type="button" id="${config.containerId}-cancel-btn" 
                        style="padding: 5px 10px; border: 1px solid #ddd; background-color: #f8f8f8; cursor: pointer; border-radius: 3px;">Cancel</button>
            </div>
        </div>
        
        <input type="hidden" id="${hiddenInputId}" name="${config.inputName}" ${config.required ? 'required' : ''}>
    `;

    // Get created elements
    const dropdown = document.getElementById(dropdownId);
    const newContainer = document.getElementById(`${config.containerId}-new-container`);
    const newField = document.getElementById(newFieldId);
    const addButton = document.getElementById(`${config.containerId}-add-btn`);
    const cancelButton = document.getElementById(`${config.containerId}-cancel-btn`);
    const hiddenInput = document.getElementById(hiddenInputId);

    // Populate dropdown with categories
    function loadCategories() {
        return fetch('/get_categories')
            .then(response => response.json())
            .then(data => {
                // Keep the first option (placeholder)
                const firstOption = dropdown.options[0];
                dropdown.innerHTML = '';
                dropdown.appendChild(firstOption);

                // Add categories from the server
                const categories = data.categories || [];
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    dropdown.appendChild(option);
                });

                // Add "Add New" option
                const addNewOption = document.createElement('option');
                addNewOption.value = 'add_new';
                addNewOption.textContent = '+ Add New Category';
                dropdown.appendChild(addNewOption);

                return categories;
            })
            .catch(err => {
                console.error('Error loading categories:', err);
                return [];
            });
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
                return data;
            });
    }

    // Event handler for dropdown change
    dropdown.addEventListener('change', function () {
        if (this.value === 'add_new') {
            // Show the "add new" form
            dropdown.style.display = 'none';
            newContainer.style.display = 'block';
            newField.focus();
            hiddenInput.value = '';
        } else {
            // Update hidden input with selected category
            hiddenInput.value = this.value;

            // Call onChange callback if provided
            if (typeof config.onChange === 'function') {
                config.onChange(this.value);
            }
        }
    });

    // Event handler for add button
    addButton.addEventListener('click', function () {
        const newCategory = newField.value.trim();

        if (!newCategory) {
            alert('Please enter a category name');
            newField.focus();
            return;
        }

        // Save to server
        saveNewCategory(newCategory)
            .then(data => {
                // Add to dropdown (before the "Add New" option)
                const option = document.createElement('option');
                option.value = newCategory;
                option.textContent = newCategory;

                // Insert before the last option (which is "Add New")
                dropdown.insertBefore(option, dropdown.options[dropdown.options.length - 1]);

                // Select the new category
                dropdown.value = newCategory;
                hiddenInput.value = newCategory;

                // Hide the "add new" form
                dropdown.style.display = 'block';
                newContainer.style.display = 'none';

                // Call onChange callback if provided
                if (typeof config.onChange === 'function') {
                    config.onChange(newCategory);
                }
            })
            .catch(err => {
                alert('Error adding category: ' + err.message);
            });
    });

    // Event handler for cancel button
    cancelButton.addEventListener('click', function () {
        // Clear and hide the "add new" form
        newField.value = '';
        dropdown.style.display = 'block';
        newContainer.style.display = 'none';
        dropdown.value = '';
        hiddenInput.value = '';
    });

    // Initial load of categories
    loadCategories();

    // Return public API
    return {
        /**
         * Get the current selected category value
         * @returns {string} The selected category
         */
        getValue: () => hiddenInput.value,

        /**
         * Set the selected category
         * @param {string} value - Category to select
         */
        setValue: (value) => {
            if (value) {
                // Check if the value exists in the dropdown
                const option = Array.from(dropdown.options).find(opt => opt.value === value);

                if (option) {
                    dropdown.value = value;
                    hiddenInput.value = value;
                } else {
                    console.warn(`Category "${value}" not found in dropdown`);
                }
            } else {
                dropdown.value = '';
                hiddenInput.value = '';
            }
        },

        /**
         * Reload categories from the server
         * @returns {Promise} Promise that resolves with the categories
         */
        reload: loadCategories
    };
}