const InputValidator = {
    validateTransaction(data) {
        const errors = [];

        // Required fields
        if (!data.date) errors.push('Date is required');
        if (!data.amount) errors.push('Amount is required');
        if (!data.category) errors.push('Category is required');
        if (!data.merchant) errors.push('Merchant is required');

        // Amount validation
        if (data.amount) {
            const amount = parseFloat(data.amount.toString().replace(/[$,]/g, ''));
            if (isNaN(amount) || amount <= 0) {
                errors.push('Amount must be a positive number');
            }
        }

        // Length validation
        if (data.merchant && data.merchant.length > 100) {
            errors.push('Merchant name must be 100 characters or less');
        }

        return errors;
    },

    sanitizeForDisplay(value) {
        if (!value) return '';

        // Create a text node and get its content to escape HTML
        const div = document.createElement('div');
        const text = document.createTextNode(value);
        div.appendChild(text);
        return div.innerHTML;
    }
};