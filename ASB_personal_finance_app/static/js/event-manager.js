// Centralized event management to prevent memory leaks
const EventManager = (function () {
    'use strict';

    const listeners = new Map();
    const delegatedHandlers = new Map();

    return {
        // Add event listener with automatic cleanup
        on(element, event, handler, options = {}) {
            if (!element || !event || !handler) return;

            const key = this._getKey(element, event, handler);

            // Remove existing listener if present
            if (listeners.has(key)) {
                this.off(element, event, handler);
            }

            // Add new listener
            element.addEventListener(event, handler, options);
            listeners.set(key, { element, event, handler, options });

            return () => this.off(element, event, handler);
        },

        // Remove event listener
        off(element, event, handler) {
            const key = this._getKey(element, event, handler);
            const listener = listeners.get(key);

            if (listener) {
                element.removeEventListener(event, handler, listener.options);
                listeners.delete(key);
            }
        },

        // Delegate events for dynamic elements
        delegate(parent, event, selector, handler) {
            if (!parent || !event || !selector || !handler) return;

            const delegatedHandler = (e) => {
                const target = e.target.closest(selector);
                if (target && parent.contains(target)) {
                    handler.call(target, e);
                }
            };

            const key = `${event}:${selector}`;

            // Remove existing delegated handler
            if (delegatedHandlers.has(key)) {
                const existing = delegatedHandlers.get(key);
                parent.removeEventListener(event, existing.handler);
            }

            // Add new delegated handler
            parent.addEventListener(event, delegatedHandler);
            delegatedHandlers.set(key, { parent, handler: delegatedHandler });

            return () => {
                parent.removeEventListener(event, delegatedHandler);
                delegatedHandlers.delete(key);
            };
        },

        // Clean up all listeners for an element
        cleanupElement(element) {
            const toRemove = [];

            listeners.forEach((listener, key) => {
                if (listener.element === element) {
                    toRemove.push(key);
                }
            });

            toRemove.forEach(key => {
                const listener = listeners.get(key);
                this.off(listener.element, listener.event, listener.handler);
            });
        },

        // Clean up all listeners
        cleanupAll() {
            listeners.forEach(listener => {
                listener.element.removeEventListener(
                    listener.event,
                    listener.handler,
                    listener.options
                );
            });
            listeners.clear();

            delegatedHandlers.forEach(({ parent, handler }, key) => {
                const [event] = key.split(':');
                parent.removeEventListener(event, handler);
            });
            delegatedHandlers.clear();
        },

        _getKey(element, event, handler) {
            // Create unique key for element/event/handler combination
            const elementId = element.id || element.className || 'unknown';
            const handlerName = handler.name || 'anonymous';
            return `${elementId}:${event}:${handlerName}`;
        }
    };
})();

// Auto-cleanup on page unload
window.addEventListener('beforeunload', function () {
    cleanupBeforeNavigation();
    EventManager.cleanupAll();
    AppState.reset();
});