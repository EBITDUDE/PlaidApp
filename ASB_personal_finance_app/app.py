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
from datetime import datetime, timedelta
import json
import os
import uuid
import logging
import traceback

# Set up logging
LOG_FILE = os.path.join(os.getcwd(), 'logs_and_json', 'finance_app.log')
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
TOKEN_FILE = os.path.join(os.getcwd(), 'logs_and_json', 'tokens.json')
# File to store user-modified transactions
TRANSACTIONS_FILE = os.path.join(os.getcwd(), 'logs_and_json', 'transactions.json')

# Create the logs_and_json directory if it doesn't exist
os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)

# Helper function to load access token from file
def load_access_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'r') as f:
            data = json.load(f)
            return data.get('access_token')
    return None

# Helper function to save access token to file
def save_access_token(access_token):
    with open(TOKEN_FILE, 'w') as f:
        json.dump({'access_token': access_token}, f)

# Helper function to load saved transactions
def load_saved_transactions():
    if os.path.exists(TRANSACTIONS_FILE):
        with open(TRANSACTIONS_FILE, 'r') as f:
            return json.load(f)
    return {}

# Helper function to save modified transactions
def save_transactions(transactions):
    with open(TRANSACTIONS_FILE, 'w') as f:
        json.dump(transactions, f)

# New route to check if an access token exists
@app.route('/has_access_token', methods=['GET'])
def has_access_token():
    token = load_access_token()
    return jsonify({'has_token': bool(token)})

# New route to get connected accounts
@app.route('/get_accounts', methods=['GET'])
def get_accounts():
    try:
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
    except Exception as e:
        logger.error(f"Error getting accounts: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve accounts', 'details': str(e)}), 500

# Step 4: Route to create a link token
@app.route('/create_link_token', methods=['GET'])
def create_link_token():
    try:
        request = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="My Finance App",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id="unique-user-1")
        )
        response = client.link_token_create(request)
        logger.info("Link token created successfully")
        return jsonify({'link_token': response['link_token']})
    except Exception as e:
        logger.error(f"Error creating link token: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to create link token', 'details': str(e)}), 500

# Step 6: Route to exchange public token for access token
@app.route('/exchange_public_token', methods=['POST'])
def exchange_public_token():
    try:
        public_token = request.json['public_token']
        exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
        response = client.item_public_token_exchange(exchange_request)
        access_token = response['access_token']
        save_access_token(access_token)
        logger.info(f"Access Token exchanged successfully")
        return jsonify({'message': 'Token exchanged successfully', 'access_token': access_token})
    except KeyError as e:
        logger.error(f"Missing public token in request: {str(e)}")
        return jsonify({'error': 'Missing public token'}), 400
    except Exception as e:
        logger.error(f"Error exchanging public token: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to exchange token', 'details': str(e)}), 500

# Step 7 & 8: Route to fetch and analyze transactions
@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    try:
        access_token = load_access_token()
        transaction_list = []
        
        # Load saved transaction modifications and manual transactions
        saved_transactions = load_saved_transactions()
        
        # If we have an access token, fetch transactions from Plaid
        if access_token:
            logger.info("Fetching transactions from Plaid")
            
            # Set date range for transaction fetching
            start_date = datetime.strptime("2024-01-01", "%Y-%m-%d").date()
            end_date = datetime.strptime("2025-02-25", "%Y-%m-%d").date()

            try:
                transactions_request = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=start_date,
                    end_date=end_date
                )
                response = client.transactions_get(transactions_request)
                transactions = response['transactions']
                logger.info(f"Fetched {len(transactions)} transactions from Plaid")
                
                # Process Plaid transactions
                for tx in transactions:
                    # Generate a unique ID for the transaction if it doesn't have one
                    tx_id = tx.get('transaction_id', str(uuid.uuid4()))
                    
                    # Skip transactions marked as deleted
                    if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                        continue
                    
                    # Default values from Plaid
                    category = tx['category'][0] if tx['category'] else 'Uncategorized'
                    merchant = tx['name']
                    date_str = tx['date']
                    amount = abs(float(tx['amount']))
                    is_debit = float(tx['amount']) > 0
                    
                    # Get the account name if available
                    account_name = None
                    for account in response.get('accounts', []):
                        if account.get('account_id') == tx.get('account_id'):
                            account_name = account.get('name')
                            break
                    
                    # Check if we have saved modifications for this transaction
                    if tx_id in saved_transactions:
                        saved_tx = saved_transactions[tx_id]
                        if 'category' in saved_tx:
                            category = saved_tx['category']
                        if 'merchant' in saved_tx:
                            merchant = saved_tx['merchant']
                        if 'date' in saved_tx:
                            date_str = saved_tx['date']
                        if 'amount' in saved_tx:
                            amount = saved_tx['amount']
                        if 'is_debit' in saved_tx:
                            is_debit = saved_tx['is_debit']
                                        
                    # Parse and format the date with better error handling
                    try:
                        # First try to parse the date string
                        if isinstance(date_str, str):
                            try:
                                # Try ISO format first (YYYY-MM-DD)
                                date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                            except ValueError:
                                # Fall back to US format (MM/DD/YYYY)
                                date_obj = datetime.strptime(date_str, "%m/%d/%Y")
                            
                            # Format for display and store raw value for sorting/filtering
                            formatted_date = date_obj.strftime("%m/%d/%Y")
                            raw_date = date_obj.strftime("%Y-%m-%d")
                        elif isinstance(date_str, datetime.date):
                            # It's already a date object
                            date_obj = datetime.combine(date_str, datetime.min.time())
                            formatted_date = date_str.strftime("%m/%d/%Y")
                            raw_date = date_str.strftime("%Y-%m-%d")
                        elif isinstance(date_str, datetime):
                            # It's a datetime object
                            date_obj = date_str
                            formatted_date = date_str.strftime("%m/%d/%Y")
                            raw_date = date_str.strftime("%Y-%m-%d")
                        else:
                            # Unknown format, try to convert to string and parse
                            logger.warning(f"Unexpected date type: {type(date_str).__name__}")
                            date_str = str(date_str)
                            date_obj = parse_date(date_str)
                            formatted_date = date_obj.strftime("%m/%d/%Y")
                            raw_date = date_obj.strftime("%Y-%m-%d")
                    except Exception as e:
                        logger.error(f"Error formatting date: {e} for date: {date_str}")
                        # Use a default format but mark it as having an issue
                        formatted_date = str(date_str) + " (error)"
                        raw_date = str(date_str)
                        
                    transaction_list.append({
                        'id': tx_id,
                        'date': formatted_date,
                        'raw_date': raw_date,  # Keep the raw date for sorting/filtering
                        'amount': amount,
                        'is_debit': is_debit,
                        'merchant': merchant,
                        'category': category,
                        'account_id': tx.get('account_id', ''),
                        'account_name': account_name,
                        'manual': False
                    })

            except Exception as e:
                logger.error(f"Error fetching transactions from Plaid: {str(e)}")
                logger.error(traceback.format_exc())
                # Continue with manual transactions if Plaid fails
        
        # Add manual transactions from saved_transactions
        for tx_id, tx_data in saved_transactions.items():
            # Only process entries that are marked as manual transactions and not deleted
            if tx_data.get('manual', False) and not tx_data.get('deleted', False):
                try:
                    # Format the date for display
                    date_str = tx_data.get('date')
                    if date_str:
                        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                        formatted_date = date_obj.strftime("%m/%d/%Y")
                    else:
                        formatted_date = "Unknown"
                    
                    transaction_list.append({
                        'id': tx_id,
                        'date': formatted_date,
                        'raw_date': date_str,
                        'amount': tx_data.get('amount', 0),
                        'is_debit': tx_data.get('is_debit', True),
                        'merchant': tx_data.get('merchant', 'Unknown'),
                        'category': tx_data.get('category', 'Uncategorized'),
                        'account_id': tx_data.get('account_id', ''),
                        'account_name': tx_data.get('account_name', ''),
                        'manual': True
                    })
                except Exception as e:
                    logger.error(f"Error processing manual transaction {tx_id}: {str(e)}")
        
        # Sort transactions by date (newest first)
        transaction_list.sort(key=lambda x: x.get('raw_date', ''), reverse=True)
        
        logger.info(f"Total transactions: {len(transaction_list)}")
        
        # Process transactions for monthly category totals
        monthly_category_totals = {}
        for tx in transaction_list:
            try:
                date_str = tx.get('raw_date')
                if not date_str:
                    continue
                    
                if isinstance(date_str, str):
                    month_year = datetime.strptime(date_str, "%Y-%m-%d").strftime("%Y-%m")
                else:
                    month_year = date_str.strftime("%Y-%m")
                    
                category = tx['category']
                amount = tx['amount']
                is_debit = tx.get('is_debit', True)
                
                # For debits, count as negative in totals (money spent)
                if is_debit:
                    amount = -amount
                
                if month_year not in monthly_category_totals:
                    monthly_category_totals[month_year] = {}
                
                if category not in monthly_category_totals[month_year]:
                    monthly_category_totals[month_year][category] = 0
                    
                monthly_category_totals[month_year][category] += amount
            except Exception as e:
                logger.error(f"Error processing transaction for monthly totals: {str(e)}")
        
        # Convert to a format suitable for the frontend table
        months = sorted(monthly_category_totals.keys())
        all_categories = set()
        
        for month_data in monthly_category_totals.values():
            all_categories.update(month_data.keys())
        
        all_categories = sorted(all_categories)
        
        monthly_table = []
        for category in all_categories:
            row = {'category': category}
            
            for month in months:
                month_display = datetime.strptime(month, "%Y-%m").strftime("%b %Y")
                amount = monthly_category_totals[month].get(category, 0)
                row[month_display] = f"${abs(amount):.2f}"
                
            monthly_table.append(row)
        
        return jsonify({
            'transactions': transaction_list,
            'monthly_category_totals': monthly_table,
            'months': [datetime.strptime(m, "%Y-%m").strftime("%b %Y") for m in months]
        })
    except Exception as e:
        logger.error(f"Error in get_transactions: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve transactions', 'details': str(e)}), 500

# New route to update a transaction
@app.route('/update_transaction', methods=['POST'])
def update_transaction():
    try:
        tx_data = request.json
        tx_id = tx_data.get('id')
        
        if not tx_id:
            logger.error("Transaction update failed: No ID provided")
            return jsonify({'error': 'Transaction ID is required'}), 400
        
        # Load existing saved transactions
        saved_transactions = load_saved_transactions()
        
        # Initialize if not exists
        if tx_id not in saved_transactions:
            saved_transactions[tx_id] = {}
        
        # Update fields that are provided
        if 'category' in tx_data:
            saved_transactions[tx_id]['category'] = tx_data.get('category')
        
        if 'merchant' in tx_data:
            saved_transactions[tx_id]['merchant'] = tx_data.get('merchant')
        
        if 'date' in tx_data:
            # Validate and standardize date format
            try:
                # Parse the date string into a datetime object
                date_obj = datetime.strptime(tx_data.get('date'), "%m/%d/%Y")
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
        logger.info(f"Transaction {tx_id} updated successfully")
        
        return jsonify({'message': 'Transaction updated successfully'})
    except Exception as e:
        logger.error(f"Transaction update error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to update transaction', 'details': str(e)}), 500

# Route to add a manual transaction
@app.route('/add_transaction', methods=['POST'])
def add_transaction():
    try:
        tx_data = request.json
        
        # Validate required fields
        required_fields = ['date', 'amount', 'category', 'merchant']
        for field in required_fields:
            if field not in tx_data:
                logger.error(f"Manual transaction creation failed: Missing {field}")
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Generate a unique ID for the new transaction
        tx_id = f"manual-{str(uuid.uuid4())}"
        
        # Validate and format date
        try:
            date_obj = datetime.strptime(tx_data.get('date'), "%m/%d/%Y")
            formatted_date = date_obj.strftime("%Y-%m-%d")
        except ValueError as e:
            logger.error(f"Date formatting error: {e}")
            return jsonify({'error': 'Invalid date format. Use MM/DD/YYYY'}), 400
        
        # Validate and format amount
        try:
            amount_str = tx_data.get('amount')
            if isinstance(amount_str, str):
                # Remove $ and commas if present
                amount_str = amount_str.replace('$', '').replace(',', '')
            amount = float(amount_str)
        except ValueError as e:
            logger.error(f"Amount parsing error: {e}")
            return jsonify({'error': 'Invalid amount format'}), 400
        
        # Determine if it's a debit based on sign or explicit flag
        is_debit = tx_data.get('is_debit', True)
        if amount < 0:
            amount = abs(amount)
            is_debit = True
            
        # Create new transaction in saved transactions
        saved_transactions = load_saved_transactions()
        saved_transactions[tx_id] = {
            'date': formatted_date,
            'amount': amount,
            'is_debit': is_debit,
            'category': tx_data.get('category'),
            'merchant': tx_data.get('merchant'),
            'account_id': tx_data.get('account_id', ''),
            'manual': True
        }
        
        # Save the updated transactions
        save_transactions(saved_transactions)
        logger.info(f"Manual transaction {tx_id} created successfully")
        
        return jsonify({
            'message': 'Transaction created successfully',
            'transaction': {
                'id': tx_id,
                'date': tx_data.get('date'),
                'amount': amount,
                'is_debit': is_debit,
                'category': tx_data.get('category'),
                'merchant': tx_data.get('merchant')
            }
        })
    except Exception as e:
        logger.error(f"Manual transaction creation error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to create transaction', 'details': str(e)}), 500

# Route to delete a transaction
@app.route('/delete_transaction', methods=['POST'])
def delete_transaction():
    try:
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
            # For Plaid transactions, we can't actually delete them from the source
            # So we mark them as deleted in our saved transactions
            if tx_id not in saved_transactions:
                saved_transactions[tx_id] = {}
            
            saved_transactions[tx_id]['deleted'] = True
            logger.info(f"Plaid transaction {tx_id} marked as deleted")
        
        # Save the updated transactions
        save_transactions(saved_transactions)
        
        return jsonify({'message': 'Transaction deleted successfully'})
    except Exception as e:
        logger.error(f"Transaction deletion error: {str(e)}")
        logger.error(traceback.format_exc())

# Add these new routes to your app.py file

# New route for category management page
@app.route('/categories')
def categories_page():
    return render_template('categories.html')

# New route for annual totals page
@app.route('/annual_totals')
def annual_totals_page():
    return render_template('annual_totals.html')

# New route to get all categories
@app.route('/get_categories', methods=['GET'])
def get_categories():
    try:
        # Load saved transactions to extract categories
        saved_transactions = load_saved_transactions()
        
        # Get unique categories from saved transactions
        categories = set()
        for tx_id, tx_data in saved_transactions.items():
            if 'category' in tx_data and not tx_data.get('deleted', False):
                categories.add(tx_data['category'])
        
        # Also get categories from Plaid transactions if available
        access_token = load_access_token()
        if access_token:
            try:
                # Set date range for transaction fetching
                start_date = datetime.strptime("2020-01-01", "%Y-%m-%d").date()
                end_date = datetime.now().date()

                transactions_request = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=start_date,
                    end_date=end_date
                )
                response = client.transactions_get(transactions_request)
                transactions = response['transactions']
                
                # Extract categories from Plaid transactions
                for tx in transactions:
                    if tx['category'] and len(tx['category']) > 0:
                        categories.add(tx['category'][0])
            except Exception as e:
                logger.error(f"Error fetching categories from Plaid: {str(e)}")
        
        # Convert to sorted list
        category_list = sorted(list(categories))
        
        return jsonify({'categories': category_list})
    except Exception as e:
        logger.error(f"Error getting categories: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve categories', 'details': str(e)}), 500

# Route to add a new category
@app.route('/add_category', methods=['POST'])
def add_category():
    try:
        data = request.json
        new_category = data.get('category')
        
        if not new_category:
            return jsonify({'error': 'Category name is required'}), 400
            
        # Load saved category preferences
        categories_file = os.path.join(os.getcwd(), 'logs_and_json', 'categories.json')
        
        categories = []
        if os.path.exists(categories_file):
            with open(categories_file, 'r') as f:
                categories = json.load(f)
        
        # Check if category already exists
        if new_category in categories:
            return jsonify({'message': 'Category already exists', 'categories': categories})
        
        # Add new category
        categories.append(new_category)
        categories.sort()
        
        # Save categories
        with open(categories_file, 'w') as f:
            json.dump(categories, f)
            
        return jsonify({'message': 'Category added successfully', 'categories': categories})
    except Exception as e:
        logger.error(f"Error adding category: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to add category', 'details': str(e)}), 500

# Route to delete a category
@app.route('/delete_category', methods=['POST'])
def delete_category():
    try:
        data = request.json
        category = data.get('category')
        
        if not category:
            return jsonify({'error': 'Category name is required'}), 400
            
        # Load saved category preferences
        categories_file = os.path.join(os.getcwd(), 'logs_and_json', 'categories.json')
        
        categories = []
        if os.path.exists(categories_file):
            with open(categories_file, 'r') as f:
                categories = json.load(f)
        
        # Check if category exists
        if category not in categories:
            return jsonify({'error': 'Category not found'}), 404
        
        # Remove category
        categories.remove(category)
        
        # Save categories
        with open(categories_file, 'w') as f:
            json.dump(categories, f)
            
        return jsonify({'message': 'Category deleted successfully', 'categories': categories})
    except Exception as e:
        logger.error(f"Error deleting category: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to delete category', 'details': str(e)}), 500

# Route to export transactions as CSV
@app.route('/export_transactions', methods=['POST'])
def export_transactions():
    try:
        data = request.json
        date_range = data.get('date_range', 'all')
        
        # Get current date
        current_date = datetime.now().date()
        
        # Set date range based on selection
        start_date = None
        
        if date_range == '30':
            start_date = (current_date - timedelta(days=30))
        elif date_range == '60':
            start_date = (current_date - timedelta(days=60))
        elif date_range == '90':
            start_date = (current_date - timedelta(days=90))
        elif date_range == '365':
            start_date = (current_date - timedelta(days=365))
        elif date_range == 'ytd':
            start_date = datetime(current_date.year, 1, 1).date()
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
            start_date = (current_date - timedelta(days=365*5))
        
        # Default end date is current date if not custom
        if date_range != 'custom':
            end_date = current_date
            
        # Load all transactions
        transactions = []
        access_token = load_access_token()
        saved_transactions = load_saved_transactions()
        
        # Get Plaid transactions if token exists
        if access_token:
            try:
                # Use a wide date range and filter later (more efficient for multiple exports)
                plaid_start = datetime(2020, 1, 1).date()
                plaid_end = current_date
                
                # Cache the account data for better performance
                accounts_response = client.accounts_get(AccountsGetRequest(access_token=access_token))
                account_names = {}
                for account in accounts_response.get('accounts', []):
                    account_names[account.get('account_id')] = account.get('name', '')
                
                transactions_request = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=plaid_start,
                    end_date=plaid_end
                )
                response = client.transactions_get(transactions_request)
                plaid_txs = response['transactions']
                
                # Process transactions
                for tx in plaid_txs:
                    tx_id = tx.get('transaction_id')
                    # Skip if manually deleted
                    if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                        continue
                    
                    # Get transaction date
                    date_str = tx['date']
                    
                    # Parse date with improved error handling
                    try:
                        tx_date = parse_date(date_str)
                    except Exception as e:
                        logger.warning(f"Error parsing date {date_str}: {str(e)}")
                        # Skip transactions with unparseable dates
                        continue
                    
                    # Skip if outside filter range
                    if tx_date < start_date or tx_date > end_date:
                        continue
                    
                    # Use saved modifications if available
                    category = tx['category'][0] if tx['category'] else 'Uncategorized'
                    merchant = tx['name']
                    amount = abs(float(tx['amount']))
                    is_debit = float(tx['amount']) > 0
                    
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
                                logger.warning(f"Error parsing saved date: {str(e)}")
                                # Keep original date if saved date is invalid
                        if 'amount' in saved_tx:
                            amount = abs(float(saved_tx['amount']))
                        if 'is_debit' in saved_tx:
                            is_debit = saved_tx['is_debit']
                    
                    # Get account name - use our cached account names instead of looping
                    account_id = tx.get('account_id', '')
                    account_name = account_names.get(account_id, '')
                    
                    transactions.append({
                        'date': tx_date.strftime("%Y-%m-%d"),
                        'amount': amount,
                        'type': 'Expense' if is_debit else 'Income',
                        'category': category,
                        'merchant': merchant,
                        'account': account_name,
                        'id': tx_id
                    })
            except Exception as e:
                logger.error(f"Error processing Plaid transactions for export: {str(e)}")
                logger.error(traceback.format_exc())
        
        # Add manual transactions
        for tx_id, tx_data in saved_transactions.items():
            if tx_data.get('manual', False) and not tx_data.get('deleted', False):
                date_str = tx_data.get('date')
                if not date_str:
                    continue
                
                try:
                    tx_date = parse_date(date_str)
                    # Skip if outside filter range
                    if tx_date < start_date or tx_date > end_date:
                        continue
                except Exception as e:
                    logger.warning(f"Error parsing date for manual transaction {tx_id}: {str(e)}")
                    continue
                
                transactions.append({
                    'date': tx_date.strftime("%Y-%m-%d"),
                    'amount': tx_data.get('amount', 0),
                    'type': 'Expense' if tx_data.get('is_debit', True) else 'Income',
                    'category': tx_data.get('category', 'Uncategorized'),
                    'merchant': tx_data.get('merchant', 'Unknown'),
                    'account': tx_data.get('account_name', ''),
                    'id': tx_id
                })
        
        # Sort by date
        transactions.sort(key=lambda x: x['date'])
        
        # Convert to CSV format
        csv_data = "Date,Amount,Type,Category,Merchant,Account\n"
        
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
            
            csv_data += f"{date},{amount},{tx_type},{category},{merchant},{account}\n"
        
        # Format filename
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
        filename = f"transactions_{start_date_str}_to_{end_date_str}.csv"
        
        # Return CSV data
        return jsonify({
            'csv_data': csv_data,
            'filename': filename
        })

    except Exception as e:
        logger.error(f"Error exporting transactions: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to export transactions', 'details': str(e)}), 500

        
# Helper function to parse dates in various formats
def parse_date(date_str):
    """
    Parse date string in various formats and return a datetime.date object
    
    Parameters:
    date_str (str|datetime|date): Date to parse, can be string, datetime object, or date object
    
    Returns:
    datetime.date: The parsed date as a date object
    
    Raises:
    ValueError: If the date cannot be parsed
    """
    # If it's already a date object, return it
    if isinstance(date_str, datetime.date):
        return date_str
        
    # If it's a datetime object, return its date component
    if isinstance(date_str, datetime):
        return date_str.date()
    
    # If it's not a string, try to convert it to string
    if not isinstance(date_str, str):
        try:
            date_str = str(date_str)
        except:
            raise ValueError(f"Could not convert {type(date_str)} to string")
    
    # Try different formats
    formats = [
        "%Y-%m-%d",  # ISO format: 2023-01-31
        "%m/%d/%Y",  # US format: 01/31/2023 
        "%d/%m/%Y",  # European format: 31/01/2023
        "%b %d, %Y", # Jan 31, 2023
        "%d %b %Y"   # 31 Jan 2023
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
            
    # If we get here, none of the formats worked
    raise ValueError(f"Could not parse date string: {date_str}")

# Route to get annual category totals
@app.route('/get_annual_totals', methods=['GET'])
def get_annual_totals():
    try:
        # Load all transactions
        transactions = []
        access_token = load_access_token()
        saved_transactions = load_saved_transactions()
        
        # Get Plaid transactions if token exists
        if access_token:
            try:
                # Use a wide date range
                start_date = datetime(2020, 1, 1).date()
                end_date = datetime.now().date()
                
                transactions_request = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=start_date,
                    end_date=end_date
                )
                response = client.transactions_get(transactions_request)
                plaid_txs = response['transactions']
                
                # Process transactions
                for tx in plaid_txs:
                    tx_id = tx.get('transaction_id')
                    # Skip if manually deleted
                    if tx_id in saved_transactions and saved_transactions[tx_id].get('deleted', False):
                        continue
                    
                    # Get transaction date
                    date_str = tx['date']
                    tx_date = None
                    
                    # Improved date parsing logic
                    try:
                        # Parse the date string
                        if isinstance(date_str, str):
                            tx_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                        elif hasattr(date_str, 'date') and callable(getattr(date_str, 'date')):
                            # It's a datetime object
                            tx_date = date_str.date()
                        elif isinstance(date_str, datetime.date):
                            # It's already a date
                            tx_date = date_str
                        else:
                            # Use today as fallback
                            logger.warning(f"Couldn't determine date format for {tx_id}, using today's date")
                            tx_date = datetime.now().date()
                    except Exception as e:
                        logger.warning(f"Error parsing date {date_str} for transaction {tx_id}, using today's date: {str(e)}")
                        tx_date = datetime.now().date()
                    
                    # Use saved modifications if available
                    category = tx['category'][0] if tx['category'] else 'Uncategorized'
                    amount = abs(float(tx['amount']))
                    is_debit = float(tx['amount']) > 0
                    
                    if tx_id in saved_transactions:
                        saved_tx = saved_transactions[tx_id]
                        if 'category' in saved_tx:
                            category = saved_tx['category']
                        if 'date' in saved_tx:
                            saved_date = saved_tx['date']
                            try:
                                if isinstance(saved_date, str):
                                    tx_date = datetime.strptime(saved_date, "%Y-%m-%d").date()
                                elif hasattr(saved_date, 'date') and callable(getattr(saved_date, 'date')):
                                    tx_date = saved_date.date()
                                elif isinstance(saved_date, datetime.date):
                                    tx_date = saved_date
                            except:
                                logger.debug(f"Keeping original transaction date for {tx_id}")
                        if 'amount' in saved_tx:
                            amount = abs(float(saved_tx['amount']))
                        if 'is_debit' in saved_tx:
                            is_debit = saved_tx['is_debit']
                    
                    transactions.append({
                        'date': tx_date,
                        'amount': amount,
                        'is_debit': is_debit,
                        'category': category
                    })
            except Exception as e:
                logger.error(f"Error processing Plaid transactions for annual totals: {str(e)}")
        
        # Add manual transactions
        for tx_id, tx_data in saved_transactions.items():
            if tx_data.get('manual', False) and not tx_data.get('deleted', False):
                date_str = tx_data.get('date')
                if not date_str:
                    continue
                
                tx_date = None
                try:
                    if isinstance(date_str, str):
                        tx_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                    elif hasattr(date_str, 'date') and callable(getattr(date_str, 'date')):
                        tx_date = date_str.date()
                    elif isinstance(date_str, datetime.date):
                        tx_date = date_str
                    else:
                        # Use today as fallback
                        logger.warning(f"Couldn't determine date format for manual transaction {tx_id}, using today's date")
                        tx_date = datetime.now().date()
                except Exception as e:
                    logger.warning(f"Error parsing date for manual transaction {tx_id}, using today's date: {str(e)}")
                    tx_date = datetime.now().date()
                
                transactions.append({
                    'date': tx_date,
                    'amount': tx_data.get('amount', 0),
                    'is_debit': tx_data.get('is_debit', True),
                    'category': tx_data.get('category', 'Uncategorized')
                })
        
        # Calculate annual totals
        annual_totals = {}
        
        # Get current date for LTM calculation
        current_date = datetime.now().date()
        ltm_start_date = datetime(current_date.year - 1, current_date.month, 1).date()
        
        # Process each transaction
        for tx in transactions:
            # Verify we have a valid date object
            tx_date = tx['date']
            if not tx_date or not isinstance(tx_date, datetime.date):
                logger.warning(f"Invalid date in transaction: {tx_date} - skipping")
                continue
                
            year = tx_date.year
            category = tx['category']
            amount = tx['amount']
            is_debit = tx['is_debit']
            
            # For debits, count as negative in totals (money spent)
            if is_debit:
                amount = -amount
            
            # Add to year totals
            if year not in annual_totals:
                annual_totals[year] = {}
            
            if category not in annual_totals[year]:
                annual_totals[year][category] = 0
                
            annual_totals[year][category] += amount
            
            # Add to LTM if applicable
            if tx_date >= ltm_start_date and tx_date < current_date:
                if 'LTM' not in annual_totals:
                    annual_totals['LTM'] = {}
                
                if category not in annual_totals['LTM']:
                    annual_totals['LTM'][category] = 0
                    
                annual_totals['LTM'][category] += amount
        
        # Convert to a format suitable for the frontend table
        years = sorted([y for y in annual_totals.keys() if y != 'LTM'])
        if 'LTM' in annual_totals:
            years.append('LTM')
            
        all_categories = set()
        for year_data in annual_totals.values():
            all_categories.update(year_data.keys())
        
        all_categories = sorted(all_categories)
        
        annual_table = []
        for category in all_categories:
            row = {'category': category}
            
            for year in years:
                year_str = str(year)
                amount = annual_totals[year].get(category, 0)
                row[year_str] = f"${abs(amount):.2f}"
                
            annual_table.append(row)
        
        return jsonify({
            'annual_category_totals': annual_table,
            'years': [str(y) for y in years]
        })
        
    except Exception as e:
        logger.error(f"Error generating annual totals: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to generate annual totals', 'details': str(e)}), 500
    
# Route to view logs
@app.route('/logs')
def view_logs():
    return render_template('log_viewer.html')

# API endpoint to get logs
@app.route('/api/logs')
def get_logs():
    try:
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
    except Exception as e:
        logger.error(f"Error reading logs: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve logs', 'details': str(e)}), 500

# Step 5.2: Serve the webpage with Plaid Link
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)