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
from datetime import datetime
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
app = Flask(__name__)

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
                    
                    # Parse and format the date
                    try:
                        if isinstance(date_str, str):
                            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                            formatted_date = date_obj.strftime("%m/%d/%Y")
                            raw_date = date_str
                        else:
                            formatted_date = date_str.strftime("%m/%d/%Y")
                            raw_date = date_str.strftime("%Y-%m-%d")
                    except Exception as e:
                        logger.error(f"Error formatting date: {e}")
                        formatted_date = str(date_str)
                        raw_date = str(date_str)
                    
                    transaction_list.append({
                        'id': tx_id,
                        'date': formatted_date,
                        'raw_date': raw_date,
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