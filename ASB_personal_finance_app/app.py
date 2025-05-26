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
import werkzeug
from flask import Flask, render_template, jsonify, request, send_from_directory, session
from functools import wraps
from data_utils import (
    LRUCache, KeyedLRUCache, load_access_token, save_access_token,
    load_saved_transactions, save_transactions, parse_date,
    load_rules, save_rules, apply_rules_to_transaction,
    apply_rule_to_past_transactions,
    _access_token_cache, _saved_transactions_cache, 
    _account_names_cache, _transaction_cache, _category_counts_cache,
    _rules_cache
)
from error_utils import api_error_handler, AppError, AuthenticationError, ValidationError, ResourceNotFoundError, PlaidApiError
from validation_utils import InputValidator, ValidationError
from secrets import token_hex
import datetime
import time
import json
import os
import uuid
import logging
import traceback
import math
import re
import asyncio
import hashlib

# Initialize Flask app
app = Flask(__name__, static_url_path='/static', static_folder='static')

def handle_async_error(loop, context):
    # Log the error
    logger.error(f"Async error: {context}")
    
    # Don't let it crash the server
    exception = context.get('exception')
    if exception:
        logger.error(f"Exception: {exception}", exc_info=True)

# Set the error handler if using asyncio
if hasattr(asyncio, 'get_event_loop'):
    loop = asyncio.get_event_loop()
    loop.set_exception_handler(handle_async_error)

# Configure app to prevent reloader issues
app.config['EXTRA_FILES'] = []
app.config['RELOADER_TYPE'] = 'stat'

# Add secret key configuration (use environment variable in production)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', token_hex(32))
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True only in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Prevent JavaScript access to session cookie
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'  # CSRF protection

# Add the CSRF protection functions after app configuration:
def generate_csrf_token():
    """Generate a CSRF token for the session"""
    if '_csrf_token' not in session:
        session['_csrf_token'] = token_hex(16)
    return session['_csrf_token']

# Make CSRF token available in templates
app.jinja_env.globals['csrf_token'] = generate_csrf_token

# Add CSRF validation decorator:
def csrf_protect(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == "POST":
            token = session.get('_csrf_token', None)
            
            # Check form data first
            form_token = request.form.get('_csrf_token')
            
            # Check headers for AJAX requests
            header_token = request.headers.get('X-CSRF-Token')
            
            if not token or (token != form_token and token != header_token):
                return jsonify({'error': 'CSRF token missing or invalid'}), 403
                
        return f(*args, **kwargs)
    return decorated_function

def generate_cache_key(*args):
    """Generate a hash-based cache key from arguments"""
    key_parts = [str(arg) for arg in args]
    key_string = "|".join(key_parts)  # Use delimiter to prevent collision
    return hashlib.md5(key_string.encode()).hexdigest()[:16]

@app.route('/get_csrf_token', methods=['GET'])
def get_csrf_token():
    """Endpoint to get CSRF token for AJAX requests"""
    return jsonify({'csrf_token': generate_csrf_token()})

@app.route('/debug_csrf', methods=['GET'])
def debug_csrf():
    return jsonify({
        'session_csrf_token': session.get('_csrf_token', 'None'),
        'session_id': session.get('_id', 'No session ID'),
        'cookies': dict(request.cookies)
    })

# Set up logging
LOG_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'finance_app.log')
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

# File to store the access token
TOKEN_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'tokens.json')
# File to store user-modified transactions
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'transactions.json')

# Create the logs_and_json directory if it doesn't exist
os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)

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

def verify_app_setup():
    """Verify that all required directories and files exist"""
    required_dirs = [
        os.path.dirname(LOG_FILE),
        os.path.dirname(TOKEN_FILE),
        os.path.dirname(TRANSACTIONS_FILE)
    ]
    
    for dir_path in required_dirs:
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
            logger.info(f"Created directory: {dir_path}")
    
    logger.info(f"Current working directory: {os.getcwd()}")
    logger.info(f"Flask app initialized successfully")

# Verify setup
verify_app_setup()

# Handle favicon requests
@app.route('/favicon.ico')
def favicon():
    return '', 204

# Improved error handlers
@app.errorhandler(404)
def not_found(e):
    # Log the 404 but don't crash
    logger.warning(f"404 Not Found: {request.url}")
    
    # For API endpoints, return JSON
    if request.path.startswith('/api/') or request.path.startswith('/get_') or request.path.startswith('/add_'):
        return jsonify({"error": "Endpoint not found"}), 404
    
    # For other requests, you could redirect to home or show a 404 page
    return jsonify({"error": "Page not found"}), 404

# Log unhandled exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, werkzeug.exceptions.NotFound):
        return not_found(e)
    
    logger.error(f"Unhandled exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500

# File to store the access token
TOKEN_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'tokens.json')
# File to store user-modified transactions
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'transactions.json')

# Create the logs_and_json directory if it doesn't exist
os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)

# New route to check if an access token exists
@app.route('/has_access_token', methods=['GET'])
@api_error_handler
def has_access_token():
    token = load_access_token()
    logger.debug(f"Access token check: {'exists' if token else 'not found'}")
    return jsonify({'has_token': bool(token)})

@app.route('/test_plaid_connection')
@api_error_handler
def test_plaid_connection():
    """Test if Plaid connection is working"""
    access_token = load_access_token()
    if not access_token:
        return jsonify({'error': 'No access token found'}), 400
    
    try:
        # Try to get accounts as a simple test
        request = AccountsGetRequest(access_token=access_token)
        response = client.accounts_get(request)
        
        return jsonify({
            'status': 'success',
            'message': 'Plaid connection is working',
            'account_count': len(response['accounts'])
        })
    except plaid.ApiException as e:
        error_response = json.loads(e.body)
        return jsonify({
            'status': 'error',
            'error_code': error_response.get('error_code'),
            'error_message': error_response.get('error_message', 'Unknown error')
        }), 400

# New route to get connected accounts
@app.route('/get_accounts', methods=['GET'])
@api_error_handler
def get_accounts():
    access_token = load_access_token()
    if not access_token:
        logger.warning("No access token available when requesting accounts")
        return jsonify({'error': 'No access token available. Please connect a bank account.'}), 400

    try:
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
    
    except plaid.ApiException as e:
        error_response = json.loads(e.body)
        error_code = error_response.get('error_code')
        
        # Check for login required error
        if error_code == 'ITEM_LOGIN_REQUIRED':
            logger.warning("Bank login required - credentials have changed")
            return jsonify({
                'error': 'Bank login required',
                'error_code': 'ITEM_LOGIN_REQUIRED',
                'message': 'Your bank credentials have changed. Please re-authenticate.'
            }), 401
        
        # Re-raise for other errors
        raise e
    

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
@csrf_protect
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

@app.route('/create_update_link_token', methods=['GET'])
@api_error_handler
def create_update_link_token():
    """Create a link token for update mode when re-authentication is needed"""
    access_token = load_access_token()
    if not access_token:
        return jsonify({'error': 'No access token available'}), 400
    
    client_user_id = "user-" + str(uuid.uuid4())
    
    try:
        request = LinkTokenCreateRequest(
            access_token=access_token,  # This enables update mode
            client_name="My Finance App",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=client_user_id)
        )
        
        response = client.link_token_create(request)
        link_token = response['link_token']
        
        return jsonify({'link_token': link_token, 'update_mode': True})
    
    except plaid.ApiException as e:
        logger.error(f"Plaid API Exception in update mode: {str(e)}")
        error_response = json.loads(e.body)
        return jsonify({
            'error': 'Plaid API error',
            'details': error_response.get('error_message', 'Unknown Plaid error')
        }), 500

@app.route('/get_transactions', methods=['GET'])
@api_error_handler
def get_transactions():
    logger.info("=== GET TRANSACTIONS CALLED ===")
    
    # Parse query parameters
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    category_filter = request.args.get('category')
    account_filter = request.args.get('account_id')
    if account_filter and not InputValidator.is_valid_id(account_filter):
        return jsonify({'error': 'Invalid account ID'}), 400
    
    # Parse dates with validation
    try:
        start_date = parse_date(start_date_str) if start_date_str else (datetime.datetime.now() - datetime.timedelta(days=90)).date()
        end_date = parse_date(end_date_str) if end_date_str else datetime.datetime.now().date()
    except ValueError as e:
        return jsonify({'error': f'Invalid date format: {str(e)}', 'transactions': []}), 400
    
    # Create cache key
    cache_key = generate_cache_key("txn", start_date, end_date, category_filter, account_filter)
    
    # Check cache first
    cached_result = _transaction_cache.get(cache_key)
    if cached_result:
        logger.info(f"Using cached transactions for {cache_key}")
        return jsonify(cached_result)
    
    # Verify access token
    access_token = load_access_token()
    if not access_token:
        return jsonify({'error': 'No access token available. Please connect a bank account.', 'transactions': []}), 400
    
    # Load and pre-process saved transactions once
    saved_transactions = load_saved_transactions()
    deleted_ids = {tx_id for tx_id, tx_data in saved_transactions.items() if tx_data.get('deleted', False)}
    manual_txs = {tx_id: tx_data for tx_id, tx_data in saved_transactions.items() 
                  if tx_data.get('manual', False) and not tx_data.get('deleted', False)}
    modifications = {tx_id: tx_data for tx_id, tx_data in saved_transactions.items() 
                     if not tx_data.get('manual', False) and not tx_data.get('deleted', False)}
    
    transaction_list = []
    
    # Process Plaid transactions efficiently
    try:
        transactions_request = TransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date
        )
        
        response = client.transactions_get(transactions_request)
        plaid_txs = response.get('transactions', [])
        
        # Single pass through Plaid transactions
        for tx in plaid_txs:
            # Safety check to ensure tx is not None
            if tx is None:
                logger.warning("Encountered a None transaction object, skipping")
                continue

            tx_id = getattr(tx, 'transaction_id', None)
            if tx_id in deleted_ids:
                continue

            # Handle the category safely
            category = getattr(tx, 'category', None)
            category = category if category is not None else ['Uncategorized']
            tx_obj = {
                'id': tx_id,
                'date': getattr(tx, 'date', datetime.datetime.now()).strftime("%m/%d/%Y"),
                'raw_date': getattr(tx, 'date', datetime.datetime.now()).strftime("%Y-%m-%d"),
                'amount': abs(float(getattr(tx, 'amount', 0))),
                'is_debit': float(getattr(tx, 'amount', 0)) > 0,
                'merchant': getattr(tx, 'name', 'Unknown'),
                'category': category[0],  # Now safe to subscript
                'subcategory': '',
                'account_id': getattr(tx, 'account_id', ''),
                'manual': False
            }
            
            # Apply modifications if they exist
            if tx_id in modifications:
                mods = modifications[tx_id]
                for key in ['category', 'subcategory', 'merchant', 'amount', 'is_debit']:
                    if key in mods:
                        tx_obj[key] = mods[key]
                if 'date' in mods:
                    try:
                        date_obj = parse_date(mods['date'])
                        tx_obj['date'] = date_obj.strftime("%m/%d/%Y")
                        tx_obj['raw_date'] = date_obj.strftime("%Y-%m-%d")
                    except ValueError:
                        pass
            
            transaction_list.append(tx_obj)
            
    except plaid.ApiException as e:
        error_response = json.loads(e.body)
        if error_response.get('error_code') == 'ITEM_LOGIN_REQUIRED':
            return jsonify({
                'error': 'Bank login required',
                'error_code': 'ITEM_LOGIN_REQUIRED',
                'message': 'Your bank credentials have changed. Please re-authenticate.',
                'transactions': []
            }), 401
        raise e
    
    # Add manual transactions efficiently
    for tx_id, tx_data in manual_txs.items():
        try:
            date_obj = parse_date(tx_data.get('date', ''))
            if start_date <= date_obj <= end_date:
                transaction_list.append({
                    'id': tx_id,
                    'date': date_obj.strftime("%m/%d/%Y"),
                    'raw_date': date_obj.strftime("%Y-%m-%d"),
                    'amount': abs(float(tx_data.get('amount', 0))),
                    'is_debit': tx_data.get('is_debit', True),
                    'merchant': tx_data.get('merchant', 'Unknown'),
                    'category': tx_data.get('category', 'Uncategorized'),
                    'subcategory': tx_data.get('subcategory', ''),
                    'account_id': tx_data.get('account_id', ''),
                    'manual': True
                })
        except (ValueError, TypeError):
            logger.warning(f"Invalid date for manual transaction {tx_id}")
    
    # Apply filters
    if category_filter:
        transaction_list = [tx for tx in transaction_list if tx['category'] == category_filter]
    if account_filter:
        transaction_list = [tx for tx in transaction_list if tx['account_id'] == account_filter]
    
    # Sort by date
    transaction_list.sort(key=lambda x: x['raw_date'], reverse=True)
    
    # Apply rules if needed
    rules = load_rules()
    if rules:
        for tx in transaction_list:
            if tx['id'] not in saved_transactions or 'category' not in saved_transactions[tx['id']]:
                apply_rules_to_transaction(tx, rules, tx.get('category'), tx.get('subcategory'))
    
    # Pagination
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('page_size', default=50, type=int)
    total_count = len(transaction_list)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total_count)
    
    result = {
        'transactions': transaction_list[start_idx:end_idx],
        'pagination': {
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': math.ceil(total_count / page_size) if page_size > 0 else 1
        }
    }
    
    # Cache the result
    _transaction_cache.set(cache_key, result)
    
    return jsonify(result)
    
# New route to update a transaction
@app.route('/update_transaction', methods=['POST'])
@csrf_protect
@api_error_handler
def update_transaction():
    tx_data = request.json
    
    # Validate the transaction data
    try:
        InputValidator.validate_transaction(tx_data, is_update=True)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    
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
        merchant = tx_data.get('merchant', '').strip()
        merchant = re.sub('<.*?>', '', merchant)
        saved_transactions[tx_id]['merchant'] = merchant[:100]  # Limit length
    
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
    _transaction_cache.clear() 
    _category_counts_cache.clear() 
    logger.info(f"Transaction {tx_id} updated successfully")
    return jsonify({'message': 'Transaction updated successfully'})


# Route to add a manual transaction
@app.route('/add_transaction', methods=['POST'])
@csrf_protect
@api_error_handler
def add_transaction():
    tx_data = request.json
    
    # Use InputValidator instead of manual validation
    try:
        InputValidator.validate_transaction(tx_data, is_update=False)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    
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
    _transaction_cache.clear() 
    _category_counts_cache.clear()  # Clear category counts cache
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
@csrf_protect
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
    _category_counts_cache.clear()  # Clear category counts cache
    return jsonify({'message': 'Transaction deleted successfully'})

# Additional routes for enhanced functionality

# New route for category management page
@app.route('/categories')
@api_error_handler
def categories_page():
    return render_template('categories.html')

# New route for annual totals page
@app.route('/annual_totals')
@api_error_handler
def annual_totals_page():
    return render_template('annual_totals.html')

# New route for monthly totals page
@app.route('/monthly_totals')
@api_error_handler
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
            {"name": "Uncategorized", "subcategories": []}, 
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
    # Add validation for year parameters
    start_year_filter = request.args.get('start_year')
    end_year_filter = request.args.get('end_year')
    
    if start_year_filter:
        try:
            start_year = int(start_year_filter)
            if start_year < 1900 or start_year > 2100:
                raise ValueError("Year out of valid range")
        except ValueError:
            return jsonify({'error': 'Invalid start year'}), 400
    
    if end_year_filter:
        try:
            end_year = int(end_year_filter)
            if end_year < 1900 or end_year > 2100:
                raise ValueError("Year out of valid range")
        except ValueError:
            return jsonify({'error': 'Invalid end year'}), 400
    
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
@csrf_protect
@api_error_handler
def export_transactions():
    data = request.json
    date_range = data.get('date_range', 'all')
    
    # Validate date_range parameter
    valid_ranges = ['30', '60', '90', '365', 'ytd', 'all', 'custom']
    if date_range not in valid_ranges:
        return jsonify({'error': 'Invalid date range'}), 400
    
    # If custom, validate dates
    if date_range == 'custom':
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        
        if not start_date_str or not end_date_str:
            return jsonify({'error': 'Start and end dates are required for custom range'}), 400
        
        try:
            start_date = parse_date(start_date_str)
            end_date = parse_date(end_date_str)
            
            # Validate date range
            if start_date > end_date:
                return jsonify({'error': 'Start date must be before end date'}), 400
            
            # Validate reasonable date range (e.g., not more than 10 years)
            if (end_date - start_date).days > 3650:
                return jsonify({'error': 'Date range cannot exceed 10 years'}), 400
                
        except ValueError as e:
            return jsonify({'error': f'Invalid date format: {str(e)}'}), 400
    
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
                
                # Get account name from account_id using the same account_names dictionary
                account_id = tx_data.get('account_id', '')
                account_name = account_names.get(account_id, '')

                transactions.append({
                    'date': tx_date.strftime("%Y-%m-%d"),
                    'amount': abs(float(tx_data.get('amount', 0))),
                    'type': 'Expense' if tx_data.get('is_debit', True) else 'Income',
                    'category': tx_data.get('category', 'Uncategorized'),
                    'merchant': tx_data.get('merchant', 'Unknown'),
                    'account': account_name, 
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
@csrf_protect
@api_error_handler
def add_category():
    data = request.json
    
    new_category = data.get('category')
    
    if not new_category:
        return jsonify({'error': 'Category name is required'}), 400
        
    try:
        InputValidator.validate_category(data)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
        
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

@app.route('/delete_category', methods=['POST'])
@csrf_protect
@api_error_handler
def delete_category():
    data = request.json
    category = data.get('category')
    
    if not category:
        return jsonify({'error': 'Category name is required'}), 400
        
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
    
    # Remove the category
    removed_category = categories.pop(category_index)
    
    # Save categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
    
    # Also clear the counts cache to reflect this change
    _category_counts_cache.clear()
        
    return jsonify({
        'message': 'Category deleted successfully', 
        'categories': categories,
        'deleted_category': removed_category
    })

# Route to delete a category
@app.route('/delete_subcategory', methods=['POST'])
@csrf_protect
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
@api_error_handler
def view_logs():
    return render_template('log_viewer.html')

@app.route('/add_subcategory', methods=['POST'])
@csrf_protect
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

# Rule management endpoints
@app.route('/add_rule', methods=['POST'])
@csrf_protect
@api_error_handler
def add_rule():
    """Add a new transaction categorization rule"""
    rule_data = request.json
    
    # Validate required fields
    required_fields = ['category']
    missing_fields = [field for field in required_fields if field not in rule_data]
    if missing_fields:
        return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400
    
    # Create a new rule ID
    rule_id = f"rule-{str(uuid.uuid4())}"
    
    # Load existing rules
    rules = load_rules()
    
    # Add the new rule
    rules[rule_id] = {
        'description': rule_data.get('description', ''),
        'match_description': rule_data.get('match_description', True),
        'amount': rule_data.get('amount'),
        'match_amount': rule_data.get('match_amount', False),
        'original_category': rule_data.get('original_category', ''),
        'original_subcategory': rule_data.get('original_subcategory', ''),
        'category': rule_data.get('category'),
        'subcategory': rule_data.get('subcategory', ''),
        'active': True,
        'created_at': datetime.datetime.now().isoformat(),
        'last_applied': None,
        'match_count': 0
    }
    
    # Save rules
    save_rules(rules)
    
    # Apply rule to past transactions if requested
    if rule_data.get('apply_to_past', False):
        try:
            # Create a modified version of the rule without original category constraints
            # to make it apply to all matching transactions including edited ones
            run_rule = rules[rule_id].copy()
            run_rule['original_category'] = ''
            run_rule['original_subcategory'] = ''
            
            affected_count = apply_rule_to_past_transactions(rule_id, run_rule)
            logger.info(f"Rule {rule_id} applied to {affected_count} past transactions")
            
            # Clear transaction cache to ensure fresh data is loaded
            _transaction_cache.clear()
        except Exception as e:
            logger.error(f"Error applying rule to past transactions: {str(e)}")
    
    return jsonify({
        'message': 'Rule created successfully', 
        'rule_id': rule_id, 
        'rule': rules[rule_id]
    })

@app.route('/get_rules', methods=['GET'])
@api_error_handler
def get_rules():
    """Get all transaction categorization rules"""
    rules = load_rules()
    return jsonify({'rules': rules})

@app.route('/update_rule', methods=['POST'])
@csrf_protect
@api_error_handler
def update_rule():
    """Update an existing transaction categorization rule"""
    rule_data = request.json
    rule_id = rule_data.get('id')
    
    if not rule_id:
        return jsonify({'error': 'Rule ID is required'}), 400
    
    # Load existing rules
    rules = load_rules()
    
    # Check if rule exists
    if rule_id not in rules:
        return jsonify({'error': 'Rule not found'}), 404
    
    # Update rule fields
    if 'description' in rule_data:
        rules[rule_id]['description'] = rule_data['description']
    if 'match_description' in rule_data:
        rules[rule_id]['match_description'] = rule_data['match_description']
    if 'amount' in rule_data:
        rules[rule_id]['amount'] = rule_data['amount']
    if 'match_amount' in rule_data:
        rules[rule_id]['match_amount'] = rule_data['match_amount']
    if 'original_category' in rule_data:
        rules[rule_id]['original_category'] = rule_data['original_category']
    if 'original_subcategory' in rule_data:
        rules[rule_id]['original_subcategory'] = rule_data['original_subcategory']
    if 'category' in rule_data:
        rules[rule_id]['category'] = rule_data['category']
    if 'subcategory' in rule_data:
        rules[rule_id]['subcategory'] = rule_data['subcategory']
    if 'active' in rule_data:
        rules[rule_id]['active'] = rule_data['active']
    
    # Save rules
    save_rules(rules)
    
    # Apply rule to past transactions if requested
    if rule_data.get('apply_to_past', False):
        try:
            # Create a modified version of the rule without original category constraints
            # to make it apply to all matching transactions including edited ones
            run_rule = rules[rule_id].copy()
            run_rule['original_category'] = ''
            run_rule['original_subcategory'] = ''
            
            affected_count = apply_rule_to_past_transactions(rule_id, run_rule)
            logger.info(f"Rule {rule_id} applied to {affected_count} past transactions")
            
            # Clear transaction cache to ensure fresh data is loaded
            _transaction_cache.clear()
        except Exception as e:
            logger.error(f"Error applying rule to past transactions: {str(e)}")
    
    return jsonify({
        'message': 'Rule updated successfully', 
        'rule': rules[rule_id]
    })

@app.route('/delete_rule', methods=['POST'])
@csrf_protect
@api_error_handler
def delete_rule():
    """Delete a transaction categorization rule"""
    rule_data = request.json
    rule_id = rule_data.get('id')
    
    if not rule_id:
        return jsonify({'error': 'Rule ID is required'}), 400
    
    # Load existing rules
    rules = load_rules()
    
    # Check if rule exists
    if rule_id not in rules:
        return jsonify({'error': 'Rule not found'}), 404
    
    # Store for response
    deleted_rule = rules[rule_id]
    
    # Remove rule
    del rules[rule_id]
    
    # Save rules
    save_rules(rules)
    
    return jsonify({
        'message': 'Rule deleted successfully',
        'deleted_rule': deleted_rule
    })

@app.route('/toggle_rule', methods=['POST'])
@csrf_protect
@api_error_handler
def toggle_rule():
    """Toggle a rule's active status"""
    rule_data = request.json
    rule_id = rule_data.get('id')
    
    if not rule_id:
        return jsonify({'error': 'Rule ID is required'}), 400
    
    # Load existing rules
    rules = load_rules()
    
    # Check if rule exists
    if rule_id not in rules:
        return jsonify({'error': 'Rule not found'}), 404
    
    # Toggle active status
    rules[rule_id]['active'] = not rules[rule_id].get('active', True)
    
    # Save rules
    save_rules(rules)
    
    return jsonify({
        'message': f"Rule {rule_id} {'activated' if rules[rule_id]['active'] else 'deactivated'} successfully",
        'rule': rules[rule_id]
    })

# Add route for the rules management page
@app.route('/rules')
@api_error_handler
def rules_page():
    return render_template('rules.html')

def apply_rule_to_past_transactions(rule_id, rule):
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
    
    # Apply to matching transactions
    for tx_id, tx_data in transactions.items():
        try:
            # Skip deleted transactions
            if tx_data.get('deleted', False):
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
            
            # When manually running rules, we intentionally ignore original_category 
            # and original_subcategory to match all transactions with the specified 
            # description and amount
            
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

@app.route('/run_rule', methods=['POST'])
@csrf_protect
@api_error_handler
def run_rule():
    """Run a single rule against all matching transactions"""
    rule_data = request.json
    rule_id = rule_data.get('id')
    
    if not rule_id:
        return jsonify({'error': 'Rule ID is required'}), 400
    
    # Load rules
    rules = load_rules()
    
    # Check if rule exists
    if rule_id not in rules:
        return jsonify({'error': 'Rule not found'}), 404
    
    # Get the rule
    rule = rules[rule_id]
    
    # Skip inactive rules
    if not rule.get('active', True):
        return jsonify({
            'message': 'Rule is inactive. Please activate it first.',
            'affected_count': 0
        }), 200
    
    # Create a modified version of the rule with original category/subcategory removed
    run_rule = rule.copy()
    run_rule['original_category'] = ''
    run_rule['original_subcategory'] = ''
    
    # Apply rule to past transactions
    affected_count = apply_rule_to_past_transactions(rule_id, run_rule)
    
    # Clear transaction cache
    _transaction_cache.clear()
    
    # Sync categories (this is a new step)
    try:
        sync_result = sync_transaction_categories_internal()
        logger.info(f"Category sync after rule application: {sync_result}")
    except Exception as e:
        logger.error(f"Error syncing categories after rule application: {str(e)}")
    
    return jsonify({
        'message': f"Rule applied successfully. {affected_count} transaction(s) updated.",
        'affected_count': affected_count
    })

@app.route('/run_all_rules', methods=['POST'])
@csrf_protect
@api_error_handler
def run_all_rules():
    """Run all active rules against matching transactions"""
    # Load rules
    rules = load_rules()
    
    total_affected = 0
    affected_by_rule = {}
    
    # Apply each active rule in order of specificity
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
        if rule.get('active', True):
            # Create a modified version of the rule with original category/subcategory removed
            run_rule = rule.copy()
            run_rule['original_category'] = ''
            run_rule['original_subcategory'] = ''
            
            affected_count = apply_rule_to_past_transactions(rule_id, run_rule)
            total_affected += affected_count
            affected_by_rule[rule_id] = affected_count
    
    # Clear transaction cache
    _transaction_cache.clear()
    
    # ADD THIS BLOCK: Sync categories after applying all rules
    try:
        sync_result = sync_transaction_categories_internal()
        logger.info(f"Category sync after running all rules: added {sync_result[0]} categories and {sync_result[1]} subcategories")
    except Exception as e:
        logger.error(f"Error syncing categories after running all rules: {str(e)}")
    
    return jsonify({
        'message': f"All rules applied successfully. {total_affected} transaction(s) updated.",
        'total_affected': total_affected,
        'affected_by_rule': affected_by_rule
    })

@app.route('/rename_category', methods=['POST'])
@csrf_protect
@api_error_handler
def rename_category():
    data = request.json
    old_name = data.get('old_name')
    new_name = data.get('new_name')
    
    # Add validation
    if not old_name or not new_name:
        return jsonify({'error': 'Old and new category names are required'}), 400
    
    # Validate the new name
    try:
        InputValidator.validate_category({'category': new_name})
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
        
    # Validate new name - no duplicates
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    
    categories = []
    if os.path.exists(categories_file):
        with open(categories_file, 'r') as f:
            categories = json.load(f)
    
    # Check if new name already exists (case-insensitive)
    if any(c["name"].lower() == new_name.lower() for c in categories if c["name"].lower() != old_name.lower()):
        return jsonify({'error': 'Category with this name already exists'}), 400
    
    # Find the category to rename
    category_index = next((i for i, c in enumerate(categories) if c["name"].lower() == old_name.lower()), None)
    if category_index is None:
        return jsonify({'error': 'Category not found'}), 404
    
    # Get the old category with its subcategories
    old_category = categories[category_index]
    
    # Create updated category with new name but same subcategories
    updated_category = {
        "name": new_name,
        "subcategories": old_category["subcategories"]
    }
    
    # Update category in the list
    categories[category_index] = updated_category
    
    # Save updated categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
    
    # Update all transactions that use this category
    updated_count = 0
    saved_transactions = load_saved_transactions()
    
    for tx_id, tx_data in saved_transactions.items():
        # Skip deleted transactions
        if tx_data.get('deleted', False):
            continue
            
        # Check if transaction uses this category (case-insensitive)
        if tx_data.get('category', '').lower() == old_name.lower():
            # Update category name
            tx_data['category'] = new_name
            updated_count += 1
    
    # Save updated transactions
    if updated_count > 0:
        save_transactions(saved_transactions)
        
        # Invalidate caches
        _transaction_cache.clear()
        _category_counts_cache.clear()
        
        logger.info(f"Renamed category '{old_name}' to '{new_name}' and updated {updated_count} transactions")
    
    return jsonify({
        'message': f'Category renamed successfully. Updated {updated_count} transactions.',
        'categories': categories,
        'updated_count': updated_count
    })

@app.route('/rename_subcategory', methods=['POST'])
@csrf_protect
@api_error_handler
def rename_subcategory():
    """Rename a subcategory within a category and update all transactions using it"""
    data = request.json
    category_name = data.get('category')
    old_subcategory = data.get('old_subcategory')
    new_subcategory = data.get('new_subcategory')
    
    if not category_name or not old_subcategory or not new_subcategory:
        return jsonify({'error': 'Category name, old and new subcategory names are required'}), 400
        
    # Load saved category preferences
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    
    categories = []
    if os.path.exists(categories_file):
        with open(categories_file, 'r') as f:
            categories = json.load(f)
    
    # Find the category
    category_index = next((i for i, c in enumerate(categories) if c["name"] == category_name), None)
    if category_index is None:
        return jsonify({'error': 'Category not found'}), 404
    
    # Get the category
    category = categories[category_index]
    
    # Check if old subcategory exists
    subcategory_index = next((i for i, s in enumerate(category["subcategories"]) 
                            if s.lower() == old_subcategory.lower()), None)
    if subcategory_index is None:
        return jsonify({'error': 'Subcategory not found'}), 404
    
    # Check if new subcategory name already exists in this category (case-insensitive)
    if any(s.lower() == new_subcategory.lower() for s in category["subcategories"] 
          if s.lower() != old_subcategory.lower()):
        return jsonify({'error': 'Subcategory with this name already exists in this category'}), 400
    
    # Update subcategory name
    category["subcategories"][subcategory_index] = new_subcategory
    
    # Save updated categories
    with open(categories_file, 'w') as f:
        json.dump(categories, f)
    
    # Update all transactions that use this subcategory
    updated_count = 0
    saved_transactions = load_saved_transactions()
    
    for tx_id, tx_data in saved_transactions.items():
        # Skip deleted transactions
        if tx_data.get('deleted', False):
            continue
            
        # Check if transaction uses this category AND subcategory (case-insensitive)
        if (tx_data.get('category', '').lower() == category_name.lower() and 
            tx_data.get('subcategory', '').lower() == old_subcategory.lower()):
            # Update subcategory name
            tx_data['subcategory'] = new_subcategory
            updated_count += 1
    
    # Save updated transactions
    if updated_count > 0:
        save_transactions(saved_transactions)
        
        # Invalidate caches
        _transaction_cache.clear()
        _category_counts_cache.clear()
        
        logger.info(f"Renamed subcategory '{old_subcategory}' to '{new_subcategory}' in category '{category_name}' and updated {updated_count} transactions")
    
    return jsonify({
        'message': f'Subcategory renamed successfully. Updated {updated_count} transactions.',
        'category': category,
        'updated_count': updated_count
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

@app.route('/get_category_counts', methods=['GET'])
@api_error_handler
def get_category_counts():
    # Check cache first
    cached_counts = _category_counts_cache.get('category_counts')
    if cached_counts:
        return jsonify(cached_counts)
    
    # Initialize category counts
    category_counts = {}
    subcategory_counts = {}
    
    # Load all transactions
    access_token = load_access_token()
    saved_transactions = load_saved_transactions()
    
    # Process all transactions from Plaid API
    if access_token:
        try:
            # Use a wide date range to get all transactions
            start_date = datetime.datetime(2015, 1, 1).date()
            end_date = datetime.datetime.now().date()
            
            transactions_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date
            )
            response = client.transactions_get(transactions_request)
            plaid_txs = response['transactions']
            
            # Count transactions by category
            for tx in plaid_txs:
                tx_id = getattr(tx, 'transaction_id', None)
                
                # Skip if manually deleted
                if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                    continue
                
                # Get category (use modified if available)
                category = None
                if tx_id in saved_transactions and 'category' in saved_transactions[tx_id]:
                    category = saved_transactions[tx_id]['category']
                else:
                    tx_category = getattr(tx, 'category', [])
                    category = tx_category[0] if tx_category else 'Uncategorized'
                
                # Get subcategory
                subcategory = None
                if tx_id in saved_transactions and 'subcategory' in saved_transactions[tx_id]:
                    subcategory = saved_transactions[tx_id]['subcategory']
                
                # Count category
                if category not in category_counts:
                    category_counts[category] = 0
                category_counts[category] += 1
                
                # Count subcategory
                if subcategory:
                    if category not in subcategory_counts:
                        subcategory_counts[category] = {}
                    if subcategory not in subcategory_counts[category]:
                        subcategory_counts[category][subcategory] = 0
                    subcategory_counts[category][subcategory] += 1
                    
        except Exception as e:
            logger.error(f"Error processing transactions for category counts: {str(e)}")
            logger.error(traceback.format_exc())
    
    # Add manual transactions
    for tx_id, tx_data in saved_transactions.items():
        if tx_data.get('manual', False) and not tx_data.get('deleted', False):
            category = tx_data.get('category', 'Uncategorized')
            subcategory = tx_data.get('subcategory')
            
            # Count category
            if category not in category_counts:
                category_counts[category] = 0
            category_counts[category] += 1
            
            # Count subcategory
            if subcategory:
                if category not in subcategory_counts:
                    subcategory_counts[category] = {}
                if subcategory not in subcategory_counts[category]:
                    subcategory_counts[category][subcategory] = 0
                subcategory_counts[category][subcategory] += 1
    
    # Prepare result
    result = {
        'category_counts': category_counts,
        'subcategory_counts': subcategory_counts
    }
    
    # Store in cache
    _category_counts_cache.set('category_counts', result)
    
    return jsonify(result)

def sync_transaction_categories_internal():
    """
    Internal function to sync transaction categories with the categories.json file.
    Returns a tuple of (added_categories, added_subcategories)
    """
    # Load existing categories
    categories_file = os.path.join(os.getcwd(), 'ASB_personal_finance_app', 'logs_and_json', 'categories.json')
    categories = []
    
    if os.path.exists(categories_file):
        try:
            with open(categories_file, 'r') as f:
                categories = json.load(f)
        except Exception as e:
            logger.error(f"Error reading categories file: {str(e)}")
            categories = []
    
    # Create dictionary for faster lookup (case-insensitive)
    category_dict = {cat["name"].lower().strip(): cat for cat in categories}
    
    # Collect all unique categories and subcategories from transactions
    all_categories = {}
    
    # Process Plaid transactions if access token exists
    access_token = load_access_token()
    if access_token:
        try:
            # Use a wide date range to get all historical transactions
            start_date = datetime.datetime(2015, 1, 1).date()
            end_date = datetime.datetime.now().date()
            
            transactions_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date
            )
            response = client.transactions_get(transactions_request)
            plaid_txs = response['transactions']
            
            # Load saved transaction modifications
            saved_transactions = load_saved_transactions()
            
            # Process Plaid transactions
            for tx in plaid_txs:
                tx_id = getattr(tx, 'transaction_id', None)
                
                # Skip if transaction is deleted
                if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                    continue
                
                # Get category (either from saved modifications or original)
                category = None
                subcategory = None
                
                if tx_id in saved_transactions and 'category' in saved_transactions[tx_id]:
                    category = saved_transactions[tx_id]['category']
                    subcategory = saved_transactions[tx_id].get('subcategory', '')
                else:
                    tx_category = getattr(tx, 'category', [])
                    if tx_category and len(tx_category) > 0:
                        category = tx_category[0]
                
                # Add to our collection if valid
                if category and category.strip():
                    # Normalize category name
                    normalized_category = category.strip()
                    normalized_key = normalized_category.lower()
                    
                    if normalized_key not in all_categories:
                        all_categories[normalized_key] = {
                            'name': normalized_category,
                            'subcategories': set()
                        }
                    
                    # Add subcategory if provided
                    if subcategory and subcategory.strip():
                        all_categories[normalized_key]['subcategories'].add(subcategory.strip())
        except Exception as e:
            logger.error(f"Error processing Plaid transactions for category sync: {str(e)}")
    
    # Process manual transactions
    saved_transactions = load_saved_transactions()
    for tx_id, tx_data in saved_transactions.items():
        if tx_data.get('manual', False) and not tx_data.get('deleted', False):
            category = tx_data.get('category')
            subcategory = tx_data.get('subcategory', '')
            
            if category and category.strip():
                # Normalize category name
                normalized_category = category.strip()
                normalized_key = normalized_category.lower()
                
                if normalized_key not in all_categories:
                    all_categories[normalized_key] = {
                        'name': normalized_category,
                        'subcategories': set()
                    }
                
                # Add subcategory if provided
                if subcategory and subcategory.strip():
                    all_categories[normalized_key]['subcategories'].add(subcategory.strip())
    
    # Update categories with any new findings
    added_categories = 0
    added_subcategories = 0
    
    for cat_key, cat_data in all_categories.items():
        # Check if category exists in our dictionary (case-insensitive)
        if cat_key in category_dict:
            # Category exists, check for new subcategories
            existing_cat = category_dict[cat_key]
            
            # Collect existing subcategories (case-insensitive)
            existing_subcats = {s.lower().strip(): s for s in existing_cat["subcategories"]}
            
            # Check for new subcategories
            for subcat in cat_data['subcategories']:
                subcat_key = subcat.lower().strip()
                if subcat_key not in existing_subcats:
                    # Add new subcategory
                    existing_cat["subcategories"].append(subcat)
                    added_subcategories += 1
        else:
            # New category - add it
            new_cat = {
                "name": cat_data['name'],
                "subcategories": list(cat_data['subcategories'])
            }
            categories.append(new_cat)
            category_dict[cat_key] = new_cat
            added_categories += 1
    
    # Save updated categories if changes were made
    if added_categories > 0 or added_subcategories > 0:
        try:
            with open(categories_file, 'w') as f:
                json.dump(categories, f)
        except Exception as e:
            logger.error(f"Error saving updated categories: {str(e)}")
            raise
    
    return (added_categories, added_subcategories)

@app.route('/sync_transaction_categories', methods=['POST'])
@csrf_protect
@api_error_handler
def sync_transaction_categories():
    """
    Scan all transactions and ensure all categories and subcategories are
    in the categories.json file.
    """
    try:
        added_categories, added_subcategories = sync_transaction_categories_internal()
        
        return jsonify({
            'success': True,
            'added_categories': added_categories,
            'added_subcategories': added_subcategories
        })
    except Exception as e:
        logger.error(f"Error in sync_transaction_categories: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# Serve the webpage with Plaid Link
@app.route('/')
@api_error_handler
def index():
    return render_template('index.html')

if __name__ == '__main__':
    logger.info("================================")
    logger.info("Starting Personal Finance App")
    
    # Determine environment
    debug_mode = os.environ.get('FLASK_ENV', 'development') == 'development'
    env_name = 'Development' if debug_mode else 'Production'
    
    logger.info(f"Environment: {env_name}")
    logger.info(f"Token file: {TOKEN_FILE}")
    logger.info(f"Log file: {LOG_FILE}")
    logger.info("================================")
    
    # Check if token file exists
    token_exists = os.path.exists(TOKEN_FILE)
    if token_exists:
        logger.info("Access token file found")
    else:
        logger.info("No access token file found - bank connection required")
    
    app.run(debug=debug_mode)