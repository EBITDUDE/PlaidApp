// csrf-utils.js - Centralized CSRF token management
window.CSRFUtils = (function () {
    let cachedToken = null;

    async function getToken() {
        if (cachedToken) return cachedToken;

        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken) {
            cachedToken = metaToken.content;
            return cachedToken;
        }

        try {
            const response = await fetch('/get_csrf_token');
            const data = await response.json();
            cachedToken = data.csrf_token;
            return cachedToken;
        } catch (error) {
            console.error('Failed to get CSRF token:', error);
            return '';
        }
    }

    async function securePost(url, data) {
        const token = await getToken();
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token
            },
            body: JSON.stringify(data)
        });
    }

    return { getToken, securePost };
})();

// Make securePost globally available for backward compatibility
window.securePost = window.CSRFUtils.securePost;