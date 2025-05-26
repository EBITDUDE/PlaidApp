// Application state management
const AppState = (function () {
    'use strict';

    // Private state
    const state = {
        accounts: new Map(),
        categories: [],
        currentUser: null,
        filters: {
            date: 'all',
            category: 'all',
            subcategory: 'all',
            type: 'all',
            search: ''
        },
        components: new Map()
    };

    // Event emitter for state changes
    const events = new EventTarget();

    // Public API
    return {
        // Account management
        setAccounts(accounts) {
            state.accounts.clear();
            accounts.forEach(acc => state.accounts.set(acc.id, acc));
            this.emit('accounts:updated', accounts);
        },

        getAccount(id) {
            return state.accounts.get(id);
        },

        getAllAccounts() {
            return Array.from(state.accounts.values());
        },

        setAccountsMap(accountsMap) {
            state.accountsMap = new Map(Object.entries(accountsMap));
            this.emit('accountsMap:updated', accountsMap);
        },

        getAccountsMap() {
            return Object.fromEntries(state.accountsMap || new Map());
        },

        // Component registry
        registerComponent(name, component) {
            state.components.set(name, component);
            this.emit('component:registered', { name, component });
        },

        getComponent(name) {
            return state.components.get(name);
        },

        // Filter management
        updateFilter(filterType, value) {
            if (state.filters.hasOwnProperty(filterType)) {
                state.filters[filterType] = value;
                this.emit('filter:changed', { type: filterType, value });
            }
        },

        getFilters() {
            return { ...state.filters };
        },

        // Event handling
        on(event, handler) {
            events.addEventListener(event, handler);
        },

        off(event, handler) {
            events.removeEventListener(event, handler);
        },

        emit(event, data) {
            events.dispatchEvent(new CustomEvent(event, { detail: data }));
        },

        // Cleanup
        reset() {
            state.accounts.clear();
            state.components.clear();
            state.categories = [];
            state.filters = {
                date: 'all',
                category: 'all',
                subcategory: 'all',
                type: 'all',
                search: ''
            };
        }
    };
})();