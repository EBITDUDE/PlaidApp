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
        window.addEventListener('click', function (event) {
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

        // Category/subcategory
        if (window.rulesCategoryComponent && typeof window.rulesCategoryComponent.setValue === 'function') {
            window.rulesCategoryComponent.setValue({
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
    const applyToPastToggle = document.getElementById('apply-to-past-toggle');

    // Validate required fields
    if (!descriptionField || !descriptionField.value.trim()) {
        alert('Please enter a description pattern');
        return;
    }

    // Get category data
    let categoryData = { category: '', subcategory: '' };
    if (window.rulesCategoryComponent && typeof window.rulesCategoryComponent.getValue === 'function') {
        categoryData = window.rulesCategoryComponent.getValue();
    }

    if (!categoryData.category) {
        alert('Please select a category');
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

    // Save rule to server
    fetch('/add_rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
    })
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
                (rule.apply_to_past ? '\nRule has been applied to matching past transactions.' : ''));

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
    // If category component already exists, just reload its data and return
    if (window.rulesCategoryComponent) {
        window.rulesCategoryComponent.reload();
        return;
    }

    // Use the rule category container
    const categoryContainer = document.getElementById('rule-category-container');

    // Handle the case where the container doesn't exist
    if (!categoryContainer) {
        console.error("Cannot find rule-category-container element");
        return;
    }

    // Initialize the category component
    const categoryComponent = createCategoryDropdown({
        containerId: 'rule-category-container',
        inputName: 'rule-category',
        subcategoryInputName: 'rule-subcategory',
        required: true
    });

    // Store the component in a global variable for access from other functions
    window.rulesCategoryComponent = categoryComponent;
}