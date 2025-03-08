const ErrorUtils = {
    handleError: function (error, userMessage = 'An error occurred') {
        console.error(error);
        // Show user-friendly message
        this.showErrorToUser(userMessage);
    },

    showErrorToUser: function (message) {
        // Create a toast notification
        const errorToast = document.createElement('div');
        errorToast.className = 'error-toast';
        errorToast.textContent = message;
        errorToast.style.position = 'fixed';
        errorToast.style.bottom = '20px';
        errorToast.style.right = '20px';
        errorToast.style.backgroundColor = '#e74c3c';
        errorToast.style.color = 'white';
        errorToast.style.padding = '10px 20px';
        errorToast.style.borderRadius = '4px';
        errorToast.style.zIndex = '1000';
        errorToast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        document.body.appendChild(errorToast);

        // Auto-remove after a few seconds
        setTimeout(() => {
            errorToast.style.opacity = '0';
            errorToast.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                document.body.removeChild(errorToast);
            }, 500);
        }, 5000);
    }
};