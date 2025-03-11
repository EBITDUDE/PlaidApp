import os
import json
import time
import logging
import datetime

logger = logging.getLogger(__name__)

# File paths for storing tokens and transactions
TOKEN_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'tokens.json')
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'transactions.json')
RULES_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'rules.json')

class Cache:
    """
    Simple time-based cache with expiration.
    """
    def __init__(self, expiration_seconds=300):  # Default: 5 minutes
        self.data = None
        self.timestamp = 0
        self.expiration_seconds = expiration_seconds

    def get(self):
        """Return cached data if not expired."""
        if self.data and time.time() - self.timestamp <= self.expiration_seconds:
            return self.data
        return None

    def set(self, data):
        """Store data in cache with current timestamp."""
        self.data = data
        self.timestamp = time.time()
        return data

    def clear(self):
        """Clear the cache."""
        self.data = None
        self.timestamp = 0

class KeyedCache(Cache):
    """
    Cache with multiple key support
    """
    def __init__(self, expiration_seconds=300):
        super().__init__(expiration_seconds)
        self.data = {}  # Dictionary instead of single value
    
    def get(self, key):
        """Get cached data for key if not expired"""
        cache_data = super().get()
        if not cache_data or not isinstance(cache_data, dict):
            return None
        return cache_data.get(key)
    
    def set(self, key, value):
        """Set data for key in cache"""
        cache_data = super().get() or {}
        if not isinstance(cache_data, dict):
            cache_data = {}
        cache_data[key] = value
        super().set(cache_data)
        return value
    
    def delete(self, key):
        """Remove a key from cache"""
        cache_data = super().get()
        if cache_data and isinstance(cache_data, dict) and key in cache_data:
            del cache_data[key]
            super().set(cache_data)

# Initialize caches
_access_token_cache = Cache(expiration_seconds=3600)  # 1 hour  
_saved_transactions_cache = Cache(expiration_seconds=600)  # 10 minutes
_account_names_cache = Cache(expiration_seconds=1800)  # 30 minutes
_transaction_cache = KeyedCache(expiration_seconds=300)  # 5 minutes
_category_counts_cache = Cache(expiration_seconds=300)  # 5 minutes
_rules_cache = Cache(expiration_seconds=600)  # 10 minutes

def load_access_token():
    """
    Load the Plaid access token from cache or file.
    """
    token = _access_token_cache.get()
    if token:
        return token
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, 'r') as f:
                data = json.load(f)
                token = data.get('access_token')
                _access_token_cache.set(token)
                return token
        except Exception as e:
            logger.error(f"Error loading access token: {str(e)}")
    return None

def save_access_token(access_token):
    """
    Save the Plaid access token to cache and file.
    """
    _access_token_cache.set(access_token)
    try:
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'w') as f:
            json.dump({'access_token': access_token}, f)
        return True
    except Exception as e:
        logger.error(f"Error saving access token: {str(e)}")
        return False

def load_saved_transactions():
    """
    Load saved transactions (manual or modified) from cache or file.
    """
    transactions = _saved_transactions_cache.get()
    if transactions:
        return transactions
    if os.path.exists(TRANSACTIONS_FILE):
        try:
            with open(TRANSACTIONS_FILE, 'r') as f:
                transactions = json.load(f)
                _saved_transactions_cache.set(transactions)
                return transactions
        except Exception as e:
            logger.error(f"Error loading transactions: {str(e)}")
    transactions = {}
    _saved_transactions_cache.set(transactions)
    return transactions

def save_transactions(transactions):
    """
    Save transactions to cache and file.
    """
    _saved_transactions_cache.set(transactions)
    try:
        os.makedirs(os.path.dirname(TRANSACTIONS_FILE), exist_ok=True)
        with open(TRANSACTIONS_FILE, 'w') as f:
            json.dump(transactions, f)
        return True
    except Exception as e:
        logger.error(f"Error saving transactions: {str(e)}")
        return False

def load_rules():
    """
    Load transaction categorization rules from cache or file.
    """
    rules = _rules_cache.get()
    if rules:
        return rules
    if os.path.exists(RULES_FILE):
        try:
            with open(RULES_FILE, 'r') as f:
                rules = json.load(f)
                _rules_cache.set(rules)
                return rules
        except Exception as e:
            logger.error(f"Error loading rules: {str(e)}")
    rules = {}
    _rules_cache.set(rules)
    return rules

def save_rules(rules):
    """
    Save transaction categorization rules to cache and file.
    """
    _rules_cache.set(rules)
    try:
        os.makedirs(os.path.dirname(RULES_FILE), exist_ok=True)
        with open(RULES_FILE, 'w') as f:
            json.dump(rules, f)
        return True
    except Exception as e:
        logger.error(f"Error saving rules: {str(e)}")
        return False

def apply_rules_to_transaction(tx_data, rules=None):
    """
    Apply matching rules to a transaction. Returns True if a rule was applied.
    
    Args:
        tx_data (dict): Transaction data to categorize
        rules (dict, optional): Rules dictionary, loaded if not provided
        
    Returns:
        bool: True if a rule was applied, False otherwise
    """
    if rules is None:
        rules = load_rules()
    
    if not rules or not tx_data:
        return False
    
    # Get transaction fields for matching
    tx_description = tx_data.get('merchant', '').lower().strip()
    tx_amount = abs(float(tx_data.get('amount', 0)))
    
    for rule_id, rule in rules.items():
        # Skip inactive rules
        if not rule.get('active', True):
            continue
            
        # Check description match (required)
        if rule.get('match_description', True):
            rule_description = rule.get('description', '').lower().strip()
            if not rule_description or rule_description not in tx_description:
                continue
        
        # Check amount match (optional)
        if rule.get('match_amount', False):
            rule_amount = abs(float(rule.get('amount', 0)))
            if rule_amount != tx_amount:
                continue
                
        # We have a match - apply the rule
        tx_data['category'] = rule.get('category', 'Uncategorized')
        tx_data['subcategory'] = rule.get('subcategory', '')
        return True
        
    return False

def parse_date(date_str):
    """
    Parse date string in various formats and return a datetime.date object
    Handles more formats and provides better error messages
    """
    # If it's already a date object, return it
    if isinstance(date_str, datetime.date):
        return date_str
        
    # If it's a datetime object, return its date component
    if isinstance(date_str, datetime.datetime):
        return date_str.date()
    
    # If it's not a string, try to convert it to string
    if not isinstance(date_str, str):
        try:
            date_str = str(date_str)
        except:
            raise ValueError(f"Could not convert {type(date_str).__name__} to string")
    
    # Handle empty strings
    date_str = date_str.strip()
    if not date_str:
        raise ValueError("Empty date string")
    
    # Try different formats
    formats = [
        # ISO format variations
        "%Y-%m-%d",    # 2023-01-31
        "%Y/%m/%d",    # 2023/01/31
        
        # US format variations
        "%m/%d/%Y",    # 01/31/2023
        "%m-%d-%Y",    # 01-31-2023
        "%m/%d/%y",    # 01/31/23
        
        # European format variations
        "%d/%m/%Y",    # 31/01/2023
        "%d-%m-%Y",    # 31-01-2023
        
        # Month name formats
        "%b %d, %Y",   # Jan 31, 2023
        "%B %d, %Y",   # January 31, 2023
        "%d %b %Y",    # 31 Jan 2023
        "%d %B %Y",    # 31 January 2023
        
        # Month-year only formats (defaulting to 1st of month)
        "%m/%Y",       # 01/2023
        "%b %Y",       # Jan 2023
        "%B %Y"        # January 2023
    ]
    
    # Try each format
    for fmt in formats:
        try:
            dt = datetime.datetime.strptime(date_str, fmt)
            return dt.date()
        except ValueError:
            continue
            
    # Try dateutil parser as fallback
    try:
        from dateutil import parser
        dt = parser.parse(date_str)
        return dt.date()
    except (ImportError, ValueError):
        pass
            
    # If we get here, none of the formats worked
    raise ValueError(f"Could not parse date string: '{date_str}'")