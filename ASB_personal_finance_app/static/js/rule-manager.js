/**
 * rule-manager.js - Transaction rule management functionality for ASB Personal Finance App
 * 
 * This file contains functions for creating and managing transaction categorization rules.
 */

/**
 * Initialize rule management functionality
 */
function initRuleManager() {
    // Set up event listeners for rule modal
    setupRuleModalListeners();
}

/**
 * Set up event listeners for rule modal elements
 */
function setupRuleModalListeners() {
    // Apply button handler
    const applyRuleBtn = document.getElementById('apply-rule-btn');
    if (applyRuleBtn) {
        applyRuleBtn.addEventListener('click', saveRule);
    }

    // Cancel button handler
    const cancelRuleBtn = document.getElementById('cancel-rule-btn');
    if (cancelRuleBtn) {
        cancelRuleBtn.addEventListener('click', hideRuleModal);
    }

    // Close modal if clicked outside
    const ruleModal = document.getElementById('rule-modal');
    if (ruleModal) {
        ruleModal.addEventListener('click', function (event) {
            if (event.target === ruleModal) {
                hideRuleModal();
            }
        });
    }

    // Toggle switches
    const matchDescriptionToggle = document.getElementById('match-description-toggle');
    if (matchDescriptionToggle) {
        matchDescriptionToggle.addEventListener('change', function () {
            const descriptionField = document.getElementById('rule-description');
            if (descriptionField) {
                descriptionField.disabled = !this.checked;
                if (this.checked) {
                    descriptionField.focus();
                }
            }
        });
    }

    const matchAmountToggle = document.getElementById('match-amount-toggle');
    if (matchAmountToggle) {
        matchAmountToggle.addEventListener('change', function () {
            const amountField = document.getElementById('rule-amount');
            if (amountField) {
                amountField.disabled = !this.checked;
                if (this.checked) {
                    amountField.focus();
                }
            }
        });
    }

    const matchOriginalCategoryToggle = document.getElementById('match-original-category-toggle');
    if (matchOriginalCategoryToggle) {
        matchOriginalCategoryToggle.addEventListener('change', function () {
            toggleOriginalCategoryField(this.checked);
        });
    }
}

/**
 * Toggle the original category dropdown based on the checkbox state
 * 
 * @param {boolean} isEnabled - Whether the original category field should be enabled
 */
function toggleOriginalCategoryField(isEnabled) {
    // Get the original category container
    const originalCategoryContainer = document.getElementById('rule-original-category-container');

    if (originalCategoryContainer) {
        // Set the disabled state of all inputs in the container
        const inputs = originalCategoryContainer.querySelectorAll('select, input');
        inputs.forEach(input => {
            input.disabled = !isEnabled;
        });

        // Update visual styling for the container
        originalCategoryContainer.style.opacity = isEnabled ? '1' : '0.5';
    }
}

/**
 * Show the rule creation modal with prefilled data
 * 
 * @param {Object} transactionData - Transaction data to prefill in the rule
 */
function showRuleModal(transactionData) {
    // Get modal element
    const ruleModal = document.getElementById('rule-modal');
    if (!ruleModal) return;

    // Initialize category dropdowns if they don't exist
    let ruleOriginalCategoryComponent = AppState.getComponent('ruleOriginalCategoryComponent');
    if (!ruleOriginalCategoryComponent && document.getElementById('rule-original-category-container')) {
        ruleOriginalCategoryComponent = createCategoryDropdown({
            containerId: 'rule-original-category-container',
            inputName: 'rule-original-category',
            subcategoryInputName: 'rule-original-subcategory',
            required: false
        });
        AppState.registerComponent('ruleOriginalCategoryComponent', ruleOriginalCategoryComponent);
    }

    // Set rule form values if transaction data provided
    if (transactionData) {
        // Description
        const descriptionField = document.getElementById('rule-description');
        if (descriptionField && transactionData.merchant) {
            descriptionField.value = transactionData.merchant;
        }

        // Amount
        const amountField = document.getElementById('rule-amount');
        if (amountField && transactionData.amount) {
            amountField.value = transactionData.amount;
        }

        // Original Category (the category before edit)
        if (ruleOriginalCategoryComponent && typeof ruleOriginalCategoryComponent.setValue === 'function') {
            ruleOriginalCategoryComponent.setValue({
                category: transactionData.originalCategory || '',
                subcategory: transactionData.originalSubcategory || ''
            });
        }

        // Match Original Category toggle
        const matchOriginalCategoryToggle = document.getElementById('match-original-category-toggle');
        if (matchOriginalCategoryToggle) {
            // Enable by default if original category is provided
            const hasOriginalCategory = !!(transactionData.originalCategory);
            matchOriginalCategoryToggle.checked = hasOriginalCategory;

            // Update original category field state
            toggleOriginalCategoryField(hasOriginalCategory);
        }

        // New Category (target category)
        if (rulesCategoryComponent && typeof rulesCategoryComponent.setValue === 'function') {
            rulesCategoryComponent.setValue({
                category: transactionData.category || '',
                subcategory: transactionData.subcategory || ''
            });
        }
    }

    // Show modal
    ruleModal.style.display = 'block';
}

/**
 * Hide the rule creation modal
 */
function hideRuleModal() {
    const ruleModal = document.getElementById('rule-modal');
    if (ruleModal) {
        ruleModal.style.display = 'none';
    }
}

/**
 * Save a new transaction rule
 */
function saveRule() {
    // Get form values
    const descriptionField = document.getElementById('rule-description');
    const amountField = document.getElementById('rule-amount');
    const matchDescriptionToggle = document.getElementById('match-description-toggle');
    const matchAmountToggle = document.getElementById('match-amount-toggle');
    const matchOriginalCategoryToggle = document.getElementById('match-original-category-toggle');
    const applyToPastToggle = document.getElementById('apply-to-past-toggle');

    // Validate required fields
    if (!descriptionField || !descriptionField.value.trim()) {
        alert('Please enter a description pattern');
        return;
    }

    // Get original category data
    let originalCategoryData = { category: '', subcategory: '' };
    const ruleOriginalCategoryComponent = AppState.getComponent('ruleOriginalCategoryComponent');
    if (ruleOriginalCategoryComponent && typeof ruleOriginalCategoryComponent.getValue === 'function') {
        originalCategoryData = ruleOriginalCategoryComponent.getValue();
    }

    // Get target category data
    let categoryData = { category: '', subcategory: '' };
    const rulesCategoryComponent = AppState.getComponent('rulesCategoryComponent');
    if (rulesCategoryComponent && typeof rulesCategoryComponent.getValue === 'function') {
        categoryData = rulesCategoryComponent.getValue();
    }

    if (!categoryData.category) {
        alert('Please select a target category');
        return;
    }

    // Create rule object
    const rule = {
        description: descriptionField.value.trim(),
        match_description: matchDescriptionToggle ? matchDescriptionToggle.checked : true,
        amount: amountField && amountField.value ? parseFloat(amountField.value) : null,
        match_amount: matchAmountToggle ? matchAmountToggle.checked : false,
        category: categoryData.category,
        subcategory: categoryData.subcategory || '',
        apply_to_past: applyToPastToggle ? applyToPastToggle.checked : false
    };

    // Add original category data only if the toggle is checked
    if (matchOriginalCategoryToggle && matchOriginalCategoryToggle.checked) {
        rule.original_category = originalCategoryData.category || '';
        rule.original_subcategory = originalCategoryData.subcategory || '';
    }

    // Save rule to server
    window.securePost('/add_rule', rule)
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Rule created:', data);

            // Show success message
            alert('Rule created successfully' +
                (rule.apply_to_past ? '\nRule has been applied to matching transactions.' : ''));

            // Hide modal
            hideRuleModal();

            // Reload transactions to show updated categories
            if (rule.apply_to_past) {
                loadTransactions();
            }
        })
        .catch(err => {
            ErrorUtils.handleError(err, 'Error creating rule');
        });
}

/**
 * Initialize the category dropdown component in the rule modal
 */
function initRuleCategoryDropdown() {
    // Initialize both the original and target category components

    // If original category component already exists, just reload its data
    const ruleOriginalCategoryComponent = AppState.getComponent('ruleOriginalCategoryComponent');
    if (ruleOriginalCategoryComponent) {
        ruleOriginalCategoryComponent.reload();
    } else {
        // Initialize the original category component
        const originalCategoryContainer = document.getElementById('rule-original-category-container');
        if (originalCategoryContainer) {
            const newComponent = createCategoryDropdown({
                containerId: 'rule-original-category-container',
                inputName: 'rule-original-category',
                subcategoryInputName: 'rule-original-subcategory',
                required: false
            });
            AppState.registerComponent('ruleOriginalCategoryComponent', newComponent);
        }
    }

    // If target category component already exists, just reload its data
    const rulesCategoryComponent = AppState.getComponent('rulesCategoryComponent');
    if (rulesCategoryComponent) {
        rulesCategoryComponent.reload();
        return;
    }

    // Initialize the target category component
    const categoryContainer = document.getElementById('rule-category-container');
    if (!categoryContainer) {
        console.error("Cannot find rule-category-container element");
        return;
    }

    rulesCategoryComponent = createCategoryDropdown({
        containerId: 'rule-category-container',
        inputName: 'rule-category',
        subcategoryInputName: 'rule-subcategory',
        required: true
    });
}