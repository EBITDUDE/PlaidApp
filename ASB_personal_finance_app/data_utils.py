import os
import json
import time
import logging
import datetime

logger = logging.getLogger(__name__)

# File paths for storing tokens and transactions
TOKEN_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'tokens.json')
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'transactions.json')

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

# Initialize caches
_access_token_cache = Cache(expiration_seconds=3600)  # 1 hour
_saved_transactions_cache = Cache(expiration_seconds=600)  # 10 minutes

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

def parse_date(date_str):
    """
    Parse a date string into a datetime.date object, supporting multiple formats.
    """
    if isinstance(date_str, datetime.date):
        return date_str
    if isinstance(date_str, datetime.datetime):
        return date_str.date()
    if not isinstance(date_str, str):
        try:
            date_str = str(date_str)
        except:
            raise ValueError(f"Could not convert {type(date_str)} to string")
    formats = [
        "%Y-%m-%d",  # 2023-01-31
        "%m/%d/%Y",  # 01/31/2023
        "%d/%m/%Y",  # 31/01/2023
        "%b %d, %Y", # Jan 31, 2023
        "%d %b %Y"   # 31 Jan 2023
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Could not parse date string: {date_str}")