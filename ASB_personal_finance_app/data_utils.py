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

def apply_rules_to_transaction(tx_data, rules=None, original_category=None, original_subcategory=None):
    """
    Apply matching rules to a transaction. Returns True if a rule was applied.
    
    Args:
        tx_data (dict): Transaction data to categorize
        rules (dict, optional): Rules dictionary, loaded if not provided
        original_category (str, optional): Original transaction category for selective matching
        original_subcategory (str, optional): Original transaction subcategory for selective matching
        
    Returns:
        bool: True if a rule was applied, False otherwise
    """
    if rules is None:
        rules = load_rules()
    
    if not rules or not tx_data:
        return False
    
    # Get transaction fields for matching
    tx_description = tx_data.get('merchant', '').lower().strip()
    try:
        tx_amount = abs(float(tx_data.get('amount', 0)))
    except (ValueError, TypeError):
        logger.warning(f"Invalid amount in transaction: {tx_data.get('amount')}")
        tx_amount = 0
    
    # If no original category is provided, use the current category as original
    if original_category is None:
        original_category = tx_data.get('category', '')
    
    if original_subcategory is None:
        original_subcategory = tx_data.get('subcategory', '')
    
    # Sort rules by specificity (more specific rules first)
    sorted_rules = sorted(
        rules.items(), 
        key=lambda x: (
            1 if x[1].get('original_category') else 0,
            1 if x[1].get('original_subcategory') else 0,
            1 if x[1].get('match_description', True) else 0,
            1 if x[1].get('match_amount', False) else 0
        ),
        reverse=True
    )
    
    for rule_id, rule in sorted_rules:
        try:
            # Skip inactive rules
            if not rule.get('active', True):
                continue
            
            # Check original category match (if specified in rule)
            if rule.get('original_category') and rule.get('original_category') != original_category:
                continue
            
            # Check original subcategory match (if specified in rule)
            if rule.get('original_subcategory') and rule.get('original_subcategory') != original_subcategory:
                continue
                
            # Check description match (if enabled)
            if rule.get('match_description', True):
                rule_description = rule.get('description', '').lower().strip()
                if not rule_description or rule_description not in tx_description:
                    continue
            
            # Check amount match (if enabled)
            if rule.get('match_amount', False):
                try:
                    rule_amount = abs(float(rule.get('amount', 0)))
                    if rule_amount != tx_amount:
                        continue
                except (ValueError, TypeError):
                    logger.warning(f"Invalid amount in rule {rule_id}: {rule.get('amount')}")
                    continue
                    
            # We have a match - apply the rule
            tx_data['category'] = rule.get('category', 'Uncategorized')
            tx_data['subcategory'] = rule.get('subcategory', '')
            
            # Update rule stats
            now = datetime.datetime.now().isoformat()
            rules[rule_id]['last_applied'] = now
            rules[rule_id]['match_count'] = rules[rule_id].get('match_count', 0) + 1
            try:
                save_rules(rules)
            except Exception as e:
                logger.error(f"Error updating rule stats: {str(e)}")
                
            return True
        except Exception as e:
            logger.error(f"Error applying rule {rule_id}: {str(e)}")
            continue
        
    return False

def apply_rule_to_past_transactions(rule_id, rule, ignore_original_category=True):
    """Apply a rule to all past transactions that match"""
    # Load saved transactions
    transactions = load_saved_transactions()
    modified_count = 0
    
    # Get rule criteria
    rule_description = rule.get('description', '').lower().strip()
    rule_amount = None
    if rule.get('match_amount', False) and rule.get('amount') is not None:
        try:
            rule_amount = abs(float(rule.get('amount')))
        except (ValueError, TypeError) as e:
            logger.error(f"Error converting rule amount: {str(e)}")
            return 0
    
    # Get original category criteria
    original_category = rule.get('original_category', '')
    original_subcategory = rule.get('original_subcategory', '')
    
    # Apply to matching transactions
    for tx_id, tx_data in transactions.items():
        try:
            # Skip deleted transactions
            if tx_data.get('deleted', False):
                continue
                
            # Check original category match (if specified and not ignoring)
            # When manually running rules, we ignore original_category to match all transactions
            if not ignore_original_category and original_category:
                tx_category = tx_data.get('category', '')
                if tx_category != original_category:
                    continue
                    
            # Check original subcategory match (if specified and not ignoring)
            if not ignore_original_category and original_subcategory:
                tx_subcategory = tx_data.get('subcategory', '')
                if tx_subcategory != original_subcategory:
                    continue
                
            # Get transaction fields for matching
            tx_description = tx_data.get('merchant', '').lower().strip()
            
            # Skip if description doesn't match (when enabled)
            if rule.get('match_description', True) and (not rule_description or rule_description not in tx_description):
                continue
            
            # Check amount match if required
            if rule.get('match_amount', False) and rule_amount is not None:
                try:
                    tx_amount = abs(float(tx_data.get('amount', 0)))
                    if tx_amount != rule_amount:
                        continue
                except (ValueError, TypeError) as e:
                    logger.error(f"Error converting transaction amount for {tx_id}: {str(e)}")
                    continue
            
            # Apply the rule
            tx_data['category'] = rule.get('category')
            tx_data['subcategory'] = rule.get('subcategory', '')
            modified_count += 1
        except Exception as e:
            logger.error(f"Error applying rule to transaction {tx_id}: {str(e)}")
            continue
    
    # Save transactions if any were modified
    if modified_count > 0:
        try:
            save_transactions(transactions)
            
            # Update rule usage statistics
            rules = load_rules()
            if rule_id in rules:
                rules[rule_id]['last_applied'] = datetime.datetime.now().isoformat()
                rules[rule_id]['match_count'] = rules[rule_id].get('match_count', 0) + modified_count
                save_rules(rules)
                
        except Exception as e:
            logger.error(f"Error saving transactions after applying rule: {str(e)}")
            return 0
        
    logger.info(f"Applied rule {rule_id} to {modified_count} past transactions")
    return modified_count

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