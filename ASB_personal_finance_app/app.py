import plaid
from plaid.api import plaid_api
from plaid_client import client
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from flask import Flask, render_template, jsonify, request
from functools import wraps
from data_utils import (
    Cache, KeyedCache, load_access_token, save_access_token,
    load_saved_transactions, save_transactions, parse_date,
    _access_token_cache, _saved_transactions_cache, 
    _account_names_cache, _transaction_cache
)
import datetime
import time
import json
import os
import uuid
import logging
import traceback
import math

# Set up logging
LOG_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'finance_app.log')
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_url_path='/static', static_folder='static')

# Log unhandled exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500

# File to store the access token
TOKEN_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'tokens.json')
# File to store user-modified transactions
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'transactions.json')

# Create the logs_and_json directory if it doesn't exist
os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)

class AppError(Exception):
    """Base exception for application errors"""
    status_code = 500
    
    def __init__(self, message, status_code=None, details=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}
    
    def to_dict(self):
        return {
            'error': self.message,
            'details': self.details
        }

class AuthenticationError(AppError):
    """Exception for authentication failures"""
    status_code = 401

class ValidationError(AppError):
    """Exception for validation failures"""
    status_code = 400

class ResourceNotFoundError(AppError):
    """Exception for missing resources"""
    status_code = 404

class PlaidApiError(AppError):
    """Exception for Plaid API errors"""
    status_code = 502  # Bad Gateway

# Replace the existing api_error_handler with this improved version
def api_error_handler(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except AppError as e:
            logger.error(f"Application error in {f.__name__}: {str(e)}")
            return jsonify(e.to_dict()), e.status_code
        except plaid.ApiException as e:
            logger.error(f"Plaid API error in {f.__name__}: {str(e)}")
            error_response = json.loads(e.body) if hasattr(e, 'body') else {'error_message': str(e)}
            details = {'plaid_error': error_response.get('error_message', 'Unknown Plaid error')}
            return jsonify(PlaidApiError('Error communicating with Plaid', details=details).to_dict()), 502
        except ValueError as e:
            logger.error(f"Validation error in {f.__name__}: {str(e)}")
            return jsonify(ValidationError(str(e)).to_dict()), 400
        except Exception as e:
            logger.error(f"Unexpected error in {f.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({
                'error': 'An unexpected error occurred',
                'details': {'message': str(e)}
            }), 500
    return decorated_function

# New route to check if an access token exists
@app.route('/has_access_token', methods=['GET'])
def has_access_token():
    token = load_access_token()
    # FIX: Added logging for token check
    logger.debug(f"Access token check: {'exists' if token else 'not found'}")
    return jsonify({'has_token': bool(token)})

# New route to get connected accounts
@app.route('/get_accounts', methods=['GET'])
@api_error_handler
def get_accounts():
    access_token = load_access_token()
    if not access_token:
        logger.warning("No access token available when requesting accounts")
        return jsonify({'error': 'No access token available. Please connect a bank account.'}), 400

    
    request = AccountsGetRequest(access_token=access_token)
    response = client.accounts_get(request)
    accounts = response['accounts']
    
    # Debug the raw response structure - safely check account properties
    logger.debug(f"Number of accounts: {len(accounts)}")
    
    account_list = []
    for i, account in enumerate(accounts):
        # Plaid objects are not dictionaries, so we need to access them with dot notation
        # or by using the to_dict() method if available
        
        logger.debug(f"Processing account {i}")
        
        try:
            # Try using to_dict() if it exists
            if hasattr(account, 'to_dict'):
                account_dict = account.to_dict()
                logger.debug(f"Successfully converted account {i} to dictionary")
            else:
                # Otherwise create a dictionary manually with the attributes we need
                account_dict = {}
                logger.debug(f"Manually building dictionary for account {i}")
        except Exception as e:
            logger.error(f"Error converting account to dictionary: {str(e)}")
            account_dict = {}
        
        # Safely extract account properties
        try:
            account_id = getattr(account, 'account_id', None)
            name = getattr(account, 'name', None)
            account_type = getattr(account, 'type', None)
            subtype = getattr(account, 'subtype', None)
            balances = getattr(account, 'balances', {})
            
            # Convert type and subtype to strings
            if account_type and not isinstance(account_type, str):
                account_type = str(account_type)
            
            if subtype and not isinstance(subtype, str):
                subtype = str(subtype)
            
            # Extract balances safely
            current_balance = getattr(balances, 'current', 0) if balances else 0
            available_balance = getattr(balances, 'available', 0) if balances else 0
            
            # Create a serializable account object
            serializable_account = {
                'id': account_id,
                'name': name,
                'type': account_type,
                'subtype': subtype,
                'balance': {
                    'current': current_balance,
                    'available': available_balance
                }
            }
            
            logger.debug(f"Created serializable account: {serializable_account['name']}, {serializable_account['type']}")
            account_list.append(serializable_account)
        except Exception as e:
            logger.error(f"Error extracting account properties for account {i}: {str(e)}")
            logger.error(traceback.format_exc())
    
    logger.info(f"Retrieved {len(account_list)} accounts")
    
    # Final check for any non-serializable types in the entire account list
    try:
        import json
        json.dumps(account_list)
        logger.debug("Account list successfully serialized in pre-check")
    except TypeError as e:
        logger.error(f"JSON serialization pre-check failed: {str(e)}")
        
        # Try to fix any remaining serialization issues
        for account in account_list:
            for key, value in list(account.items()):
                if not isinstance(value, (str, int, float, bool, list, dict, type(None))):
                    logger.warning(f"Converting non-serializable {type(value).__name__} to string: {key}")
                    account[key] = str(value)
            
            for key, value in list(account['balance'].items()):
                if not isinstance(value, (str, int, float, bool, list, dict, type(None))):
                    logger.warning(f"Converting non-serializable balance {type(value).__name__} to number: {key}")
                    account['balance'][key] = float(value) if value is not None else 0
    
    return jsonify({'accounts': account_list})

# Step 4: Route to create a link token
@app.route('/create_link_token', methods=['GET'])
@api_error_handler
def create_link_token():
    # Ensure client_user_id is truly unique
    client_user_id = "user-" + str(uuid.uuid4())
    
    try:
        request = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="My Finance App",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=client_user_id)
        )
        
        # Add more detailed logging
        logger.debug(f"Creating link token for user ID: {client_user_id}")
        
        response = client.link_token_create(request)
        
        # Ensure response contains link_token
        if not response or 'link_token' not in response:
            logger.error("No link token in Plaid response")
            return jsonify({'error': 'Failed to generate link token'}), 500
        
        link_token = response['link_token']
        logger.info(f"Link token created successfully: {link_token[:10]}...")
        
        return jsonify({'link_token': link_token})
    
    except plaid.ApiException as e:
        # More detailed Plaid-specific error handling
        logger.error(f"Plaid API Exception: {str(e)}")
        error_response = json.loads(e.body)
        return jsonify({
            'error': 'Plaid API error',
            'details': error_response.get('error_message', 'Unknown Plaid error')
        }), 500

# Route to exchange public token for access token
@app.route('/exchange_public_token', methods=['POST'])
@api_error_handler
def exchange_public_token():
    # Handle the specific KeyError case
    try:
        public_token = request.json['public_token']
    except KeyError as e:
        logger.error(f"Missing public token in request: {str(e)}")
        return jsonify({'error': 'Missing public token in request body'}), 400
        
    # Rest of the code without try-except
    exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(exchange_request)
    access_token = response['access_token']
    
    # FIX: Log the access token (partially masked for security)
    masked_token = access_token[:10] + "..." if access_token else "None"
    logger.info(f"Access Token exchanged successfully: {masked_token}")
    
    save_access_token(access_token)
    return jsonify({'message': 'Token exchanged successfully', 'access_token': access_token})

@app.route('/get_transactions', methods=['GET'])
@api_error_handler
def get_transactions():
    # Get query parameters for filtering
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    category_filter = request.args.get('category')
    account_filter = request.args.get('account_id')
    
    # Parse dates or use defaults
    try:
        if start_date_str:
            start_date = parse_date(start_date_str)
        else:
            start_date = (datetime.datetime.now() - datetime.timedelta(days=90)).date()
            
        if end_date_str:
            end_date = parse_date(end_date_str)
        else:
            end_date = datetime.datetime.now().date()
    except ValueError as e:
        return jsonify({
            'error': f'Invalid date format: {str(e)}',
            'transactions': []
        }), 400
    
    # Create a cache key based on parameters
    cache_key = f"txn_{start_date}_{end_date}_{category_filter}_{account_filter}"
    cached_transactions = _transaction_cache.get(cache_key)
    # logger.debug(f"Cached transactions retrieved: type={type(cached_transactions)}, value={cached_transactions}")
    
    if cached_transactions:
        logger.info(f"Using cached transactions for {cache_key}")
        transaction_list = cached_transactions
    else:
        # Verify access token
        access_token = load_access_token()
        if not access_token:
            return jsonify({
                'error': 'No access token available. Please connect a bank account.',
                'transactions': []
            }), 400

        # Create transactions request - Plaid API doesn't support all our filtering options,
        # so we'll filter the results after fetching
        try:
            transactions_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date
            )

            # Fetch transactions
            response = client.transactions_get(transactions_request)
            
            # Extract transactions safely
            transactions = response.get('transactions', [])
            logger.info(f"Total transactions retrieved from Plaid: {len(transactions)}")

        except Exception as plaid_error:
            logger.error(f"Plaid Transaction Fetch Error: {str(plaid_error)}")
            logger.error(traceback.format_exc())
            return jsonify({
                'error': f'Failed to fetch transactions: {str(plaid_error)}',
                'transactions': []
            }), 500

        # Process transactions more efficiently
        transaction_list = []
        saved_transactions = load_saved_transactions()
        
        # Use a set for faster lookups of deleted transaction IDs
        deleted_tx_ids = {tx_id for tx_id, tx_data in saved_transactions.items() 
                            if tx_data.get('deleted', False)}
        
        for tx in transactions:
            try:
                # Skip if manually deleted
                tx_id = getattr(tx, 'transaction_id', None)
                if tx_id and tx_id in deleted_tx_ids:
                    continue
                
                # Extract and convert date safely
                tx_date = getattr(tx, 'date', None)
                if not isinstance(tx_date, datetime.date):
                    if isinstance(tx_date, str):
                        try:
                            tx_date = parse_date(tx_date)
                        except ValueError:
                            logger.warning(f"Invalid date format: {tx_date}")
                            tx_date = datetime.datetime.now().date()
                    else:
                        logger.warning(f"Using current date for transaction {tx_id}: invalid date type {type(tx_date)}")
                        tx_date = datetime.datetime.now().date()
                
                # Default values for transaction
                tx_amount = getattr(tx, 'amount', 0.0)
                tx_name = getattr(tx, 'name', 'Unknown')
                tx_category = getattr(tx, 'category', [])
                tx_account_id = getattr(tx, 'account_id', '')
                
                # Use first category or default
                category = tx_category[0] if tx_category else 'Uncategorized'
                amount = abs(float(tx_amount))
                is_debit = float(tx_amount) > 0
                
                # Apply updates from saved modifications
                if tx_id in saved_transactions:
                    saved_tx = saved_transactions[tx_id]
                    if 'category' in saved_tx:
                        category = saved_tx['category']
                    if 'merchant' in saved_tx:
                        tx_name = saved_tx['merchant']
                    if 'date' in saved_tx:
                        try:
                            tx_date = parse_date(saved_tx['date'])
                        except ValueError:
                            # Keep original if saved date is invalid
                            logger.debug(f"Invalid saved date format for {tx_id}: {saved_tx['date']}")
                    if 'amount' in saved_tx:
                        amount = abs(float(saved_tx['amount']))
                    if 'is_debit' in saved_tx:
                        is_debit = saved_tx['is_debit']
                
                # Add to transaction list
                transaction_list.append({
                    'id': tx_id,
                    'date': tx_date.strftime("%m/%d/%Y"),
                    'raw_date': tx_date.strftime("%Y-%m-%d"),
                    'amount': amount,
                    'is_debit': is_debit,
                    'merchant': tx_name,
                    'category': category,
                    'subcategory': saved_transactions[tx_id].get('subcategory', '') if tx_id in saved_transactions else '',
                    'account_id': tx_account_id,
                    'manual': False
                })

            except Exception as tx_error:
                logger.error(f"Error processing transaction: {str(tx_error)}")
                logger.error(traceback.format_exc())

        # Add manual transactions with the same filtering
        for tx_id, tx_data in saved_transactions.items():
            if tx_data.get('manual', False) and not tx_data.get('deleted', False):
                try:
                    date_str = tx_data.get('date')
                    if not date_str:
                        continue
                    
                    try:
                        tx_date = parse_date(date_str)
                        
                        # Apply date filter to manual transactions
                        if tx_date < start_date or tx_date > end_date:
                            continue
                    except ValueError:
                        logger.warning(f"Invalid date format for manual transaction {tx_id}: {date_str}")
                        continue
                    
                    # Extract category for filtering
                    category = tx_data.get('category', 'Uncategorized')
                    account_id = tx_data.get('account_id', '')
                    
                    # Apply category filter
                    if category_filter and category != category_filter:
                        continue
                    
                    # Apply account filter
                    if account_filter and account_id != account_filter:
                        continue
                    
                    transaction_list.append({
                        'id': tx_id,
                        'date': tx_date.strftime("%m/%d/%Y"),
                        'raw_date': tx_date.strftime("%Y-%m-%d"),
                        'amount': abs(float(tx_data.get('amount', 0))),
                        'is_debit': tx_data.get('is_debit', True),
                        'merchant': tx_data.get('merchant', 'Unknown'),
                        'category': category,
                        'subcategory': tx_data.get('subcategory', ''),
                        'account_id': account_id,
                        'manual': True
                    })
                except Exception as manual_tx_error:
                    logger.error(f"Error processing manual transaction: {str(manual_tx_error)}")

        # ADD THIS LINE to cache the result before pagination:
        _transaction_cache.set(cache_key, transaction_list)

    # After the if-else block, before sorting
    if category_filter:
        transaction_list = [tx for tx in transaction_list if tx['category'] == category_filter]
    if account_filter:
        transaction_list = [tx for tx in transaction_list if tx['account_id'] == account_filter]
    
    # Sort transactions by date (newest first)
    transaction_list.sort(key=lambda x: x.get('raw_date', ''), reverse=True)
    
    
    # Client-side pagination parameters
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('page_size', default=50, type=int)
    
    # Calculate total and paged results
    total_count = len(transaction_list)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total_count)
    
    # Return paginated results
    return jsonify({
        'transactions': transaction_list[start_idx:end_idx],
        'pagination': {
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': math.ceil(total_count / page_size)
        }
    })
    
# New route to update a transaction
@app.route('/update_transaction', methods=['POST'])
@api_error_handler
def update_transaction():
    tx_data = request.json
    tx_id = tx_data.get('id')
    
    if not tx_id:
        return jsonify({'error': 'Transaction ID is required'}), 400
    
    # Load existing saved transactions
    saved_transactions = load_saved_transactions()
    
    # Initialize if not exists
    if tx_id not in saved_transactions:
        saved_transactions[tx_id] = {}
    
    # Update fields that are provided
    if 'category' in tx_data:
        saved_transactions[tx_id]['category'] = tx_data.get('category')
    
    if 'subcategory' in tx_data:
        saved_transactions[tx_id]['subcategory'] = tx_data.get('subcategory')
    
    if 'merchant' in tx_data:
        saved_transactions[tx_id]['merchant'] = tx_data.get('merchant')
    
    if 'date' in tx_data:
        # Validate and standardize date format
        try:
            # Parse the date string into a datetime object
            date_obj = datetime.datetime.strptime(tx_data.get('date'), "%m/%d/%Y")
            # Store in ISO format for consistency
            saved_transactions[tx_id]['date'] = date_obj.strftime("%Y-%m-%d")
        except ValueError as e:
            logger.error(f"Date formatting error: {e}")
            return jsonify({'error': 'Invalid date format. Use MM/DD/YYYY'}), 400
    
    if 'amount' in tx_data:
        try:
            # Parse and store the amount
            amount_str = tx_data.get('amount')
            if isinstance(amount_str, str):
                # Remove $ and commas if present
                amount_str = amount_str.replace('$', '').replace(',', '')
            amount = float(amount_str)
            saved_transactions[tx_id]['amount'] = amount
            saved_transactions[tx_id]['is_debit'] = tx_data.get('is_debit', True)
        except ValueError as e:
            logger.error(f"Amount parsing error: {e}")
            return jsonify({'error': 'Invalid amount format'}), 400
    
    # Save the updated transactions
    save_transactions(saved_transactions)
    _transaction_cache.clear()  # Add this line
    logger.info(f"Transaction {tx_id} updated successfully")
    return jsonify({'message': 'Transaction updated successfully'})


# Route to add a manual transaction
@app.route('/add_transaction', methods=['POST'])
@api_error_handler
def add_transaction():
    tx_data = request.json
    
    # Validate required fields
    required_fields = ['date', 'amount', 'category', 'merchant']
    missing_fields = [field for field in required_fields if field not in tx_data]
    if missing_fields:
        raise ValidationError(f'Missing required fields: {", ".join(missing_fields)}')
    
    # Validate date format
    date_str = tx_data.get('date')
    try:
        date_obj = datetime.datetime.strptime(date_str, "%m/%d/%Y")
        formatted_date = date_obj.strftime("%Y-%m-%d")
    except ValueError:
        raise ValidationError('Invalid date format. Use MM/DD/YYYY')
    
    # Validate amount
    try:
        amount_str = tx_data.get('amount')
        if isinstance(amount_str, str):
            # Remove $ and commas if present
            amount_str = amount_str.replace('$', '').replace(',', '')
        amount = float(amount_str)
        if amount <= 0:
            raise ValidationError('Amount must be greater than zero')
    except ValueError:
        raise ValidationError('Invalid amount format')
    
    # Validate category (non-empty string)
    category = tx_data.get('category')
    if not isinstance(category, str) or not category.strip():
        raise ValidationError('Category must be a non-empty string')
    
    # Validate merchant (non-empty string)
    merchant = tx_data.get('merchant')
    if not isinstance(merchant, str) or not merchant.strip():
        raise ValidationError('Merchant must be a non-empty string')
    
    # Generate a unique ID for the new transaction
    tx_id = f"manual-{str(uuid.uuid4())}"
    
    # Determine if it's a debit based on sign or explicit flag
    is_debit = tx_data.get('is_debit', True)
    
    # Create new transaction in saved transactions
    saved_transactions = load_saved_transactions()
    saved_transactions[tx_id] = {
        'date': formatted_date,
        'amount': abs(amount),
        'is_debit': is_debit,
        'category': category,
        'subcategory': tx_data.get('subcategory', ''), 
        'merchant': merchant,
        'account_id': tx_data.get('account_id', ''),
        'manual': True
    }
    
    # Save the updated transactions
    save_transactions(saved_transactions)
    _transaction_cache.clear()  # Add this line
    logger.info(f"Manual transaction {tx_id} created successfully")
    return jsonify({
        'message': 'Transaction created successfully',
        'transaction': {
            'id': tx_id,
            'date': tx_data.get('date'),
            'amount': abs(amount),
            'is_debit': is_debit,
            'category': category,
            'subcategory': tx_data.get('subcategory', ''),
            'merchant': merchant
        }
    })

# Route to delete a transaction
@app.route('/delete_transaction', methods=['POST'])
@api_error_handler
def delete_transaction():
    tx_data = request.json
    tx_id = tx_data.get('id')
    
    if not tx_id:
        logger.error("Transaction deletion failed: No ID provided")
        return jsonify({'error': 'Transaction ID is required'}), 400
    
    # Load saved transactions
    saved_transactions = load_saved_transactions()
    
    # If this is a manually added transaction, remove it completely
    if tx_id.startswith('manual-') and tx_id in saved_transactions:
        # For manual transactions, we remove the entire entry
        if saved_transactions[tx_id].get('manual', False):
            del saved_transactions[tx_id]
            logger.info(f"Manual transaction {tx_id} deleted")
        else:
            logger.warning(f"Attempted to delete non-manual transaction as manual: {tx_id}")
            return jsonify({'error': 'Invalid transaction ID'}), 400
    else:
        # For Plaid transactions, mark as deleted
        if tx_id not in saved_transactions:
            saved_transactions[tx_id] = {}
        saved_transactions[tx_id]['deleted'] = True
        logger.info(f"Plaid transaction {tx_id} marked as deleted")
    
    # Save the updated transactions and clear the cache
    save_transactions(saved_transactions)
    _transaction_cache.clear()  # Add this line to invalidate the cache
    return jsonify({'message': 'Transaction deleted successfully'})

# Additional routes for enhanced functionality

# New route for category management page
@app.route('/categories')
def categories_page():
    return render_template('categories.html')

# New route for annual totals page
@app.route('/annual_totals')
def annual_totals_page():
    return render_template('annual_totals.html')

# New route for monthly totals page
@app.route('/monthly_totals')
def monthly_totals_page():
    return render_template('monthly_totals.html')

# Route to get all categories
@app.route('/get_categories', methods=['GET'])
@api_error_handler
def get_categories():
    # Load custom categories from categories.json
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    categories = []
    
    if os.path.exists(categories_file):
        try:
            with open(categories_file, 'r') as f:
                categories = json.load(f)
                
            # Check if migration is needed (old format)
            if categories and isinstance(categories, list) and all(isinstance(c, str) for c in categories):
                # Migrate old format to new format
                new_categories = []
                for category in categories:
                    new_categories.append({
                        "name": category,
                        "subcategories": []
                    })
                categories = new_categories
                
                # Save migrated format
                with open(categories_file, 'w') as f:
                    json.dump(categories, f)
        except Exception as e:
            logger.error(f"Error reading categories file: {str(e)}")
    
    # Always include some default categories if none exist
    if not categories:
        default_categories = [
            {"name": "Food and Drink", "subcategories": ["Restaurant", "Groceries", "Coffee Shop"]},
            {"name": "Transportation", "subcategories": ["Gas", "Public Transit", "Parking"]},
            {"name": "Housing", "subcategories": ["Rent", "Mortgage", "Utilities"]},
            {"name": "Entertainment", "subcategories": ["Movies", "Games", "Music"]},
            {"name": "Shopping", "subcategories": ["Clothing", "Electronics", "Home"]},
            {"name": "Medical", "subcategories": ["Doctor", "Pharmacy", "Insurance"]},
            {"name": "Travel", "subcategories": ["Flights", "Hotels", "Car Rental"]},
            {"name": "Education", "subcategories": ["Tuition", "Books", "Courses"]},
            {"name": "Income", "subcategories": ["Salary", "Bonus", "Interest"]},
            {"name": "Utilities", "subcategories": ["Electric", "Water", "Gas", "Internet"]},
            {"name": "Subscriptions", "subcategories": ["Streaming", "Software", "Memberships"]}
        ]
        categories = default_categories
        
        # Save default categories
        with open(categories_file, 'w') as f:
            json.dump(categories, f)
    
    # Extract just category names for backward compatibility
    category_names = [category["name"] for category in categories]
    
    return jsonify({
        'categories': categories,
        'category_names': category_names  # For backward compatibility
    })

# Route to get annual category totals
@app.route('/get_annual_totals', methods=['GET'])
@api_error_handler
def get_annual_totals():
    """
    Generate annual category totals with improved efficiency
    """
    # Get year range filters
    start_year_filter = request.args.get('start_year')
    end_year_filter = request.args.get('end_year')
    
    start_year = None
    end_year = None
    
    # Parse year filters if provided
    if start_year_filter:
        try:
            start_year = int(start_year_filter)
        except ValueError:
            return jsonify({'error': 'Start year must be a valid number'}), 400
            
    if end_year_filter:
        try:
            end_year = int(end_year_filter)
        except ValueError:
            return jsonify({'error': 'End year must be a valid number'}), 400
    
    # Load all transactions
    transactions = []
    access_token = load_access_token()
    saved_transactions = load_saved_transactions()
    
    # Create a set of deleted transaction IDs for faster lookups
    deleted_tx_ids = {tx_id for tx_id, tx_data in saved_transactions.items() 
                     if tx_data.get('deleted', False)}
    
    # Modified transaction details by ID
    modified_tx_details = {}
    for tx_id, tx_data in saved_transactions.items():
        if 'deleted' not in tx_data:
            # Store only required fields
            tx_details = {}
            if 'category' in tx_data:
                tx_details['category'] = tx_data['category']
            if 'date' in tx_data:
                tx_details['date'] = tx_data['date']
            if 'amount' in tx_data:
                tx_details['amount'] = tx_data['amount']
            if 'is_debit' in tx_data:
                tx_details['is_debit'] = tx_data['is_debit']
            
            if tx_details:  # Only store if it has modifications
                modified_tx_details[tx_id] = tx_details
    
    # Get Plaid transactions if token exists
    if access_token:
        try:
            # Use a wide date range
            start_date = datetime.datetime(2015, 1, 1).date()
            end_date = datetime.datetime.now().date()
            
            transactions_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date
            )
            response = client.transactions_get(transactions_request)
            plaid_txs = response['transactions']
            
            # First pass: collect years and categories for pre-allocating data structures
            all_years = set()
            all_categories = set()
            
            # Current date for LTM calculations
            current_date = datetime.datetime.now().date()
            current_year = current_date.year
            
            # Process transactions more efficiently
            for tx in plaid_txs:
                tx_id = getattr(tx, 'transaction_id', None)
                
                # Skip if manually deleted
                if tx_id in deleted_tx_ids:
                    continue
                
                # Get transaction date (use modified date if available)
                tx_date = None
                if tx_id in modified_tx_details and 'date' in modified_tx_details[tx_id]:
                    # Use modified date
                    try:
                        tx_date = parse_date(modified_tx_details[tx_id]['date'])
                    except ValueError:
                        logger.warning(f"Invalid modified date for {tx_id}: {modified_tx_details[tx_id]['date']}")
                        tx_date = getattr(tx, 'date', None)
                else:
                    # Use original date
                    tx_date = getattr(tx, 'date', None)
                
                # Parse and validate date
                if not isinstance(tx_date, datetime.date):
                    try:
                        tx_date = parse_date(tx_date)
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid date for transaction {tx_id}: {tx_date}")
                        continue
                
                # Extract year for filtering
                year = tx_date.year
                
                # Apply year range filter if specified
                if start_year and year < start_year:
                    continue
                if end_year and year > end_year:
                    continue
                
                # Add year to our set
                all_years.add(year)
                
                # Get category (use modified if available)
                if tx_id in modified_tx_details and 'category' in modified_tx_details[tx_id]:
                    category = modified_tx_details[tx_id]['category']
                else:
                    tx_category = getattr(tx, 'category', None)
                    category = tx_category[0] if tx_category else 'Uncategorized'
                
                # Add category to our set
                all_categories.add(category)
            
            # Add LTM if the end year includes the current year
            include_ltm = (not end_year or end_year >= current_year)
            if include_ltm:
                all_years.add('LTM')  # Special "year" for Last Twelve Months

            # Normalize all years to integers except for 'LTM'
            normalized_years = {'LTM'} if 'LTM' in all_years else set()
            for year in all_years:
                if year != 'LTM':
                    if isinstance(year, str) and year.isdigit():
                        normalized_years.add(int(year))
                    elif isinstance(year, int):
                        normalized_years.add(year)

            # Pre-allocate the totals dictionary for all year-category combinations
            annual_totals = {year: {category: 0 for category in all_categories} for year in normalized_years}
            
            # Second pass: calculate the totals with the optimized structure
            ltm_start_date = datetime.datetime(current_date.year - 1, current_date.month, 1).date()
            
            for tx in plaid_txs:
                tx_id = getattr(tx, 'transaction_id', None)
                
                # Skip if manually deleted
                if tx_id in deleted_tx_ids:
                    continue
                
                # Get transaction date (use modified date if available)
                tx_date = None
                if tx_id in modified_tx_details and 'date' in modified_tx_details[tx_id]:
                    # Use modified date
                    try:
                        tx_date = parse_date(modified_tx_details[tx_id]['date'])
                    except ValueError:
                        # Skip transaction with invalid date
                        continue
                else:
                    # Use original date
                    tx_date = getattr(tx, 'date', None)
                    if not isinstance(tx_date, datetime.date):
                        try:
                            tx_date = parse_date(tx_date)
                        except (ValueError, TypeError):
                            # Skip transaction with invalid date
                            continue
                
                # Extract year for filtering and calculations
                year = tx_date.year
                
                # Apply year range filter if specified
                if start_year and year < start_year:
                    continue
                if end_year and year > end_year:
                    continue
                
                # Get category (use modified if available)
                if tx_id in modified_tx_details and 'category' in modified_tx_details[tx_id]:
                    category = modified_tx_details[tx_id]['category']
                else:
                    tx_category = getattr(tx, 'category', None)
                    category = tx_category[0] if tx_category else 'Uncategorized'
                
                # Get amount and is_debit (use modified if available)
                if tx_id in modified_tx_details:
                    if 'amount' in modified_tx_details[tx_id]:
                        amount = float(modified_tx_details[tx_id]['amount'])
                    else:
                        amount = float(getattr(tx, 'amount', 0))
                    
                    if 'is_debit' in modified_tx_details[tx_id]:
                        is_debit = modified_tx_details[tx_id]['is_debit']
                    else:
                        is_debit = float(getattr(tx, 'amount', 0)) > 0
                else:
                    amount = float(getattr(tx, 'amount', 0))
                    is_debit = amount > 0
                
                # Convert to signed amount (negative for expenses)
                signed_amount = -amount if is_debit else amount
                
                # Add to year totals
                annual_totals[year][category] += signed_amount
                
                # Add to LTM if applicable and LTM is included
                if include_ltm and tx_date >= ltm_start_date and tx_date < current_date:
                    annual_totals['LTM'][category] += signed_amount
            
        except Exception as e:
            logger.error(f"Error processing Plaid transactions: {str(e)}")
            logger.error(traceback.format_exc())
    
    # Add manual transactions
    for tx_id, tx_data in saved_transactions.items():
        if tx_data.get('manual', False) and not tx_data.get('deleted', False):
            try:
                # Parse date
                date_str = tx_data.get('date')
                if not date_str:
                    continue
                
                try:
                    tx_date = parse_date(date_str)
                except ValueError:
                    logger.warning(f"Invalid date for manual transaction {tx_id}: {date_str}")
                    continue
                
                # Extract year
                year = tx_date.year
                
                # Apply year range filter if specified
                if start_year and year < start_year:
                    continue
                if end_year and year > end_year:
                    continue
                
                # Get category
                category = tx_data.get('category', 'Uncategorized')
                
                # Get amount (negative for debits/expenses)
                amount = float(tx_data.get('amount', 0))
                is_debit = tx_data.get('is_debit', True)
                signed_amount = -amount if is_debit else amount
                
                # Ensure the category exists in the annual totals
                if category not in annual_totals.get(year, {}):
                    if year not in annual_totals:
                        annual_totals[year] = {}
                    annual_totals[year][category] = 0
                
                # Add to year totals
                annual_totals[year][category] += signed_amount
                
                # Add to LTM if applicable and LTM is included
                if include_ltm:
                    current_date = datetime.datetime.now().date()
                    ltm_start_date = datetime.datetime(current_date.year - 1, current_date.month, 1).date()
                    
                    if tx_date >= ltm_start_date and tx_date < current_date:
                        if 'LTM' not in annual_totals:
                            annual_totals['LTM'] = {}
                        if category not in annual_totals['LTM']:
                            annual_totals['LTM'][category] = 0
                        annual_totals['LTM'][category] += signed_amount
                
            except Exception as e:
                logger.error(f"Error processing manual transaction {tx_id}: {str(e)}")
    
    # FIX: Handle empty result
    if not annual_totals:
        logger.warning("No transactions found for annual totals")
        return jsonify({
            'annual_category_totals': [],
            'years': []
        })
    
    # Filter years based on year range and sort them
    numeric_years = []
    for year in annual_totals.keys():
        if year == 'LTM':
            continue
        if isinstance(year, (int, str)) and str(year).isdigit():
            year_int = int(year)
            if (not start_year or year_int >= start_year) and (not end_year or year_int <= end_year):
                numeric_years.append(year_int)

    # Sort the filtered years
    numeric_years.sort()
    years = [str(y) for y in numeric_years]

    # Add LTM at the end if included
    if include_ltm and 'LTM' in annual_totals:
        years.append('LTM')
    
    # Get unique categories across all years
    all_categories = set()
    for year_data in annual_totals.values():
        all_categories.update(year_data.keys())
    
    all_categories = sorted(all_categories)
    
    annual_table = []
    for category in all_categories:
        row = {'category': category}
        
        for year in years:
            year_str = str(year)
            # Try to get amount with both string and integer versions of the year
            amount = 0
            if year_str == 'LTM':
                amount = annual_totals.get('LTM', {}).get(category, 0)
            else:
                # First try with year as integer
                year_int = int(year_str) if year_str.isdigit() else 0
                amount = annual_totals.get(year_int, {}).get(category, 0)
                
                # If amount is 0, try with year as string
                if amount == 0:
                    amount = annual_totals.get(year_str, {}).get(category, 0)
            
            row[year_str] = f"${abs(amount):.2f}"
            
        annual_table.append(row)
    
    return jsonify({
        'annual_category_totals': annual_table,
        'years': years
    })
    
# Route to export transactions as CSV with improved error handling and debugging
@app.route('/export_transactions', methods=['POST'])
@api_error_handler
def export_transactions():
    data = request.json
    date_range = data.get('date_range', 'all')
    
    # Get current date
    current_date = datetime.datetime.now().date()
    
    # Set date range based on selection
    start_date = None
    
    if date_range == '30':
        start_date = (current_date - datetime.timedelta(days=30))
    elif date_range == '60':
        start_date = (current_date - datetime.timedelta(days=60))
    elif date_range == '90':
        start_date = (current_date - datetime.timedelta(days=90))
    elif date_range == '365':
        start_date = (current_date - datetime.timedelta(days=365))
    elif date_range == 'ytd':
        start_date = datetime.datetime(current_date.year, 1, 1).date()
    elif date_range == 'custom':
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        if not start_date_str or not end_date_str:
            return jsonify({'error': 'Start and end dates are required for custom range'}), 400
            
        try:
            # Try to parse the date strings
            start_date = parse_date(start_date_str)
            end_date = parse_date(end_date_str)
        except Exception as e:
            return jsonify({'error': f'Invalid date format: {str(e)}'}), 400
    else:
        # All history - use a reasonable default of 5 years
        start_date = (current_date - datetime.timedelta(days=365*10))
    
    # Default end date is current date if not custom
    if date_range != 'custom':
        end_date = current_date
    
    logger.info(f"Exporting transactions from {start_date} to {end_date}")
    
    # Load all transactions
    transactions = []
    access_token = load_access_token()
    saved_transactions = load_saved_transactions()
    
    # Track counts for debugging
    plaid_count = 0
    manual_count = 0
    
    # Get Plaid transactions if token exists
    if access_token:
        try:
            logger.info("Access token found, fetching Plaid transactions")
            
            # Use existing account name cache or initialize it
            account_names = {}
            try:
                accounts_response = client.accounts_get(AccountsGetRequest(access_token=access_token))
                for account in accounts_response.get('accounts', []):
                    account_id = account.get('account_id', '')
                    if account_id:
                        account_names[account_id] = account.get('name', '')
                
                logger.info(f"Found {len(account_names)} accounts")
            except Exception as account_err:
                logger.error(f"Error fetching accounts: {str(account_err)}")
            
            # Use a wide date range and filter later (more efficient for multiple exports)
            plaid_start = datetime.datetime(2015, 1, 1).date()
            plaid_end = current_date
            
            logger.info(f"Requesting Plaid transactions from {plaid_start} to {plaid_end}")
            
            transactions_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=plaid_start, 
                end_date=plaid_end
            )
            
            response = client.transactions_get(transactions_request)
            plaid_txs = response.get('transactions', [])
            
            logger.info(f"Received {len(plaid_txs)} transactions from Plaid")
            
            # Process transactions
            for tx in plaid_txs:
                try:
                    tx_id = tx.get('transaction_id')
                    if not tx_id:
                        logger.warning("Skipping transaction without ID")
                        continue
                        
                    # Skip if manually deleted
                    if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                        continue
                    
                    # Get transaction date
                    date_str = tx.get('date')
                    if not date_str:
                        logger.warning(f"Transaction {tx_id} has no date, skipping")
                        continue
                    
                    # Parse date with improved error handling
                    try:
                        tx_date = parse_date(date_str)
                    except Exception as date_err:
                        logger.warning(f"Error parsing date {date_str} for transaction {tx_id}: {str(date_err)}")
                        continue
                    
                    # Skip if outside filter range
                    if tx_date < start_date or tx_date > end_date:
                        continue
                    
                    # Use saved modifications if available
                    category = 'Uncategorized'
                    if tx.get('category') and len(tx.get('category')) > 0:
                        category = tx.get('category')[0]
                        
                    merchant = tx.get('name', 'Unknown')
                    amount = abs(float(tx.get('amount', 0)))
                    is_debit = float(tx.get('amount', 0)) > 0
                    
                    if tx_id in saved_transactions:
                        saved_tx = saved_transactions[tx_id]
                        if 'category' in saved_tx:
                            category = saved_tx['category']
                        if 'merchant' in saved_tx:
                            merchant = saved_tx['merchant']
                        if 'date' in saved_tx:
                            try:
                                tx_date = parse_date(saved_tx['date'])
                                # Check if still in range after modification
                                if tx_date < start_date or tx_date > end_date:
                                    continue
                            except Exception as e:
                                logger.warning(f"Error parsing saved date for {tx_id}: {str(e)}")
                        if 'amount' in saved_tx:
                            amount = abs(float(saved_tx['amount']))
                        if 'is_debit' in saved_tx:
                            is_debit = saved_tx['is_debit']
                    
                    # Get account name
                    account_id = tx.get('account_id', '')
                    account_name = account_names.get(account_id, '')
                    
                    transactions.append({
                        'date': tx_date.strftime("%Y-%m-%d"),
                        'amount': amount,
                        'type': 'Expense' if is_debit else 'Income',
                        'category': category,
                        'merchant': merchant,
                        'account': account_name,
                        'id': tx_id,
                        'source': 'plaid'
                    })
                    
                    plaid_count += 1
                except Exception as tx_err:
                    logger.error(f"Error processing individual Plaid transaction: {str(tx_err)}")
            
            logger.info(f"Successfully processed {plaid_count} Plaid transactions for export")
                
        except Exception as plaid_err:
            logger.error(f"Error processing Plaid transactions for export: {str(plaid_err)}")
            logger.error(traceback.format_exc())
    else:
        logger.info("No access token available, skipping Plaid transactions")
    
    # Add manual transactions
    logger.info(f"Processing saved transactions for export, count: {len(saved_transactions)}")
    for tx_id, tx_data in saved_transactions.items():
        try:
            if tx_data.get('manual', False) and not tx_data.get('deleted', False):
                date_str = tx_data.get('date')
                if not date_str:
                    logger.warning(f"Manual transaction {tx_id} has no date, skipping")
                    continue
                
                try:
                    tx_date = parse_date(date_str)
                    # Skip if outside filter range
                    if tx_date < start_date or tx_date > end_date:
                        continue
                except Exception as date_err:
                    logger.warning(f"Error parsing date for manual transaction {tx_id}: {str(date_err)}")
                    continue
                
                transactions.append({
                    'date': tx_date.strftime("%Y-%m-%d"),
                    'amount': abs(float(tx_data.get('amount', 0))),
                    'type': 'Expense' if tx_data.get('is_debit', True) else 'Income',
                    'category': tx_data.get('category', 'Uncategorized'),
                    'merchant': tx_data.get('merchant', 'Unknown'),
                    'account': tx_data.get('account_name', ''),
                    'id': tx_id,
                    'source': 'manual'
                })
                
                manual_count += 1
        except Exception as manual_err:
            logger.error(f"Error processing manual transaction {tx_id}: {str(manual_err)}")
    
    logger.info(f"Successfully processed {manual_count} manual transactions for export")
    logger.info(f"Total transactions for export: {len(transactions)} (Plaid: {plaid_count}, Manual: {manual_count})")
    
    # Sort by date
    transactions.sort(key=lambda x: x['date'])
    
    # Convert to CSV format
    csv_data = "Date,Amount,Type,Category,Merchant,Account,Source\n"
    
    # Define a helper function to properly escape CSV fields
    def escape_csv_field(field):
        if isinstance(field, str) and (',' in field or '"' in field or '\n' in field):
            # Escape quotes by doubling them and wrap in quotes
            return '"' + field.replace('"', '""') + '"'
        return str(field)
    
    for tx in transactions:
        # Format amount (positive number regardless of type)
        amount_str = f"{tx['amount']:.2f}"
        
        # Properly escape all fields
        date = escape_csv_field(tx['date'])
        amount = escape_csv_field(amount_str)
        tx_type = escape_csv_field(tx['type'])
        category = escape_csv_field(tx['category'])
        merchant = escape_csv_field(tx['merchant'])
        account = escape_csv_field(tx['account'])
        source = escape_csv_field(tx.get('source', 'unknown'))
        
        csv_data += f"{date},{amount},{tx_type},{category},{merchant},{account},{source}\n"
    
    # Format filename
    start_date_str = start_date.strftime("%Y-%m-%d")
    end_date_str = end_date.strftime("%Y-%m-%d")
    filename = f"txns_{start_date_str}_to_{end_date_str}.csv"
    
    # Return CSV data
    return jsonify({
        'csv_data': csv_data,
        'filename': filename,
        'transaction_count': len(transactions),
        'plaid_count': plaid_count,
        'manual_count': manual_count
    })

@app.route('/add_category', methods=['POST'])
@api_error_handler
def add_category():
    data = request.json
    new_category = data.get('category')
    
    if not new_category:
        return jsonify({'error': 'Category name is required'}), 400
        
    # Load saved category preferences
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    
    categories = []
    if os.path.exists(categories_file):
        with open(categories_file, 'r') as f:
            categories = json.load(f)
    
    # Check if category already exists
    if any(c["name"] == new_category for c in categories):
        return jsonify({'message': 'Category already exists', 'categories': categories})
    
    # Add new category
    categories.append({
        "name": new_category,
        "subcategories": []
    })
    
    # Save categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
        
    return jsonify({'message': 'Category added successfully', 'categories': categories})

# Route to delete a category
@app.route('/delete_subcategory', methods=['POST'])
@api_error_handler
def delete_subcategory():
    data = request.json
    category = data.get('category')
    subcategory = data.get('subcategory')
    
    if not category or not subcategory:
        return jsonify({'error': 'Category and subcategory names are required'}), 400
        
    # Load saved category preferences
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    
    categories = []
    if os.path.exists(categories_file):
        with open(categories_file, 'r') as f:
            categories = json.load(f)
    
    # Find the category
    category_index = next((i for i, c in enumerate(categories) if c["name"] == category), None)
    if category_index is None:
        return jsonify({'error': 'Category not found'}), 404
    
    # Check if subcategory exists
    if subcategory not in categories[category_index]["subcategories"]:
        return jsonify({'error': 'Subcategory not found'}), 404
    
    # Remove subcategory
    categories[category_index]["subcategories"].remove(subcategory)
    
    # Save categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
        
    return jsonify({
        'message': 'Subcategory deleted successfully', 
        'categories': categories,
        'category': categories[category_index]
    })
    
# Route to view logs
@app.route('/logs')
def view_logs():
    return render_template('log_viewer.html')

@app.route('/add_subcategory', methods=['POST'])
@api_error_handler
def add_subcategory():
    data = request.json
    category = data.get('category')
    subcategory = data.get('subcategory')
    
    if not category or not subcategory:
        return jsonify({'error': 'Category and subcategory names are required'}), 400
        
    # Load saved category preferences
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    
    categories = []
    if os.path.exists(categories_file):
        with open(categories_file, 'r') as f:
            categories = json.load(f)
    
    # Find the category
    category_index = next((i for i, c in enumerate(categories) if c["name"] == category), None)
    if category_index is None:
        return jsonify({'error': 'Category not found'}), 404
    
    # Check if subcategory already exists
    if subcategory in categories[category_index]["subcategories"]:
        return jsonify({'message': 'Subcategory already exists', 'categories': categories})
    
    # Add subcategory
    categories[category_index]["subcategories"].append(subcategory)
    categories[category_index]["subcategories"].sort()  # Keep alphabetical order
    
    # Save categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
        
    return jsonify({
        'message': 'Subcategory added successfully', 
        'categories': categories,
        'category': categories[category_index]
    })

# API endpoint to get logs
@app.route('/api/logs')
@api_error_handler
def get_logs():
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'r') as f:
            log_contents = f.readlines()
        
        # Parse log lines into structured data
        parsed_logs = []
        for line in log_contents:
            try:
                # Example log format: 2023-02-28 12:34:56,789 [ERROR] This is an error message
                parts = line.split(' [', 1)
                if len(parts) >= 2:
                    timestamp = parts[0]
                    level_and_message = parts[1].split('] ', 1)
                    
                    if len(level_and_message) >= 2:
                        level = level_and_message[0]
                        message = level_and_message[1]
                        
                        parsed_logs.append({
                            'timestamp': timestamp,
                            'level': level,
                            'message': message
                        })
                    else:
                        # If we can't parse it properly, add it as is
                        parsed_logs.append({
                            'timestamp': timestamp,
                            'level': 'INFO',
                            'message': parts[1]
                        })
                else:
                    # Handle lines that don't match our expected format
                    parsed_logs.append({
                        'timestamp': '',
                        'level': 'INFO',
                        'message': line
                    })
            except Exception as e:
                logger.error(f"Error parsing log line: {str(e)}")
                # Add the problematic line as is
                parsed_logs.append({
                    'timestamp': '',
                    'level': 'ERROR',
                    'message': f"Error parsing log line: {line}"
                })
        
        # Return the logs in reverse order (newest first)
        return jsonify({'logs': parsed_logs[::-1]})
    else:
        return jsonify({'logs': [], 'message': 'No log file found'})

# FIX: Add a debug endpoint to check environment
@app.route('/debug_info')
@api_error_handler
def debug_info():
    """Endpoint to help with troubleshooting - returns basic app info"""
    # Check if token file exists
    token_exists = os.path.exists(TOKEN_FILE)
    token_content = None
    if token_exists:
        with open(TOKEN_FILE, 'r') as f:
            token_content = json.load(f)
    
    # Check transactions file
    tx_exists = os.path.exists(TRANSACTIONS_FILE)
    tx_count = 0
    if tx_exists:
        with open(TRANSACTIONS_FILE, 'r') as f:
            tx_data = json.load(f)
            tx_count = len(tx_data)
    
    # Check directories
    logs_dir_exists = os.path.exists(os.path.dirname(LOG_FILE))
    
    # Check plaid client is working
    plaid_client_ok = False
    try:
        # Make a simple call to check connectivity
        if client:
            plaid_client_ok = True
    except Exception as e:
        logger.error(f"Error checking Plaid client: {str(e)}")
    
    # Return basic info
    info = {
        'app_status': 'running',
        'token_file_exists': token_exists,
        'token_present': bool(token_content.get('access_token')) if token_content else False,
        'transaction_file_exists': tx_exists,
        'transaction_count': tx_count,
        'logs_directory_exists': logs_dir_exists,
        'plaid_client_initialized': plaid_client_ok,
        'app_version': '1.0.1',  # Version with fixes
        'timestamp': datetime.datetime.now().isoformat()
    }
    
    return jsonify(info)

# Serve the webpage with Plaid Link
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # FIX: Log startup message
    logger.info("================================")
    logger.info("Starting Personal Finance App")
    logger.info(f"Environment: {'Development' if app.debug else 'Production'}")
    logger.info(f"Token file: {TOKEN_FILE}")
    logger.info(f"Log file: {LOG_FILE}")
    logger.info("================================")
    
    # Check if token file exists
    token_exists = os.path.exists(TOKEN_FILE)
    if token_exists:
        logger.info("Access token file found")
    else:
        logger.info("No access token file found - bank connection required")
    
    app.run(debug=True)        