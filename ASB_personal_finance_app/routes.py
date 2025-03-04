from flask import jsonify, request, render_template
from flask import current_app as app
from plaid_utils import create_link_token, exchange_public_token, get_accounts, get_transactions
from data_utils import load_access_token, save_access_token, load_saved_transactions, save_transactions, parse_date
from functools import wraps
import logging
import uuid
import datetime
import math

logger = logging.getLogger(__name__)

# Decorator to handle API errors
def api_error_handler(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"API Error in {f.__name__}: {str(e)}")
            return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500
    return decorated_function

# Route to check if an access token exists
@app.route('/has_access_token', methods=['GET'])
def has_access_token():
    token = load_access_token()
    logger.debug(f"Access token check: {'exists' if token else 'not found'}")
    return jsonify({'has_token': bool(token)})

# Route to get connected accounts
@app.route('/get_accounts', methods=['GET'])
@api_error_handler
def get_accounts_route():
    access_token = load_access_token()
    if not access_token:
        logger.warning("No access token available when requesting accounts")
        return jsonify({'error': 'No access token available. Please connect a bank account.'}), 400
    accounts = get_accounts(access_token)
    return jsonify({'accounts': accounts})

# Route to create a Plaid Link token
@app.route('/create_link_token', methods=['GET'])
@api_error_handler
def create_link_token_route():
    link_token = create_link_token()
    return jsonify({'link_token': link_token})

# Route to exchange public token for access token
@app.route('/exchange_public_token', methods=['POST'])
@api_error_handler
def exchange_public_token_route():
    public_token = request.json.get('public_token')
    if not public_token:
        return jsonify({'error': 'Missing public token in request body'}), 400
    access_token = exchange_public_token(public_token)
    save_access_token(access_token)
    return jsonify({'message': 'Token exchanged successfully', 'access_token': access_token})

# Route to get transactions with filtering and pagination
@app.route('/get_transactions', methods=['GET'])
@api_error_handler
def get_transactions_route():
    # Get query parameters
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    category_filter = request.args.get('category')
    account_filter = request.args.get('account_id')
    
    # Parse dates or use defaults (last 90 days)
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
        return jsonify({'error': f'Invalid date format: {str(e)}', 'transactions': []}), 400
    
    logger.info(f"Fetching transactions from {start_date} to {end_date}")
    
    # Check access token
    access_token = load_access_token()
    if not access_token:
        logger.warning("No access token available")
        return jsonify({'error': 'No access token available. Please connect a bank account.', 'transactions': []}), 400

    # Fetch transactions from Plaid
    plaid_txs = get_transactions(access_token, start_date, end_date)
    
    # Load saved transactions (manual or modified)
    saved_transactions = load_saved_transactions()
    transaction_list = []
    deleted_tx_ids = {tx_id for tx_id, tx_data in saved_transactions.items() if tx_data.get('deleted', False)}

    # Process Plaid transactions
    for tx in plaid_txs:
        tx_id = tx.get('transaction_id')
        if tx_id in deleted_tx_ids:
            continue
        tx_dict = tx.to_dict()
        saved_tx = saved_transactions.get(tx_id, {})
        category = saved_tx.get('category', tx_dict.get('category', ['Uncategorized'])[0])
        transaction_list.append({
            'id': tx_id,
            'date': tx_dict.get('date'),
            'raw_date': tx_dict.get('date'),  # For sorting
            'amount': tx_dict.get('amount'),
            'name': tx_dict.get('name'),
            'category': category,
            'account_id': tx_dict.get('account_id'),
            'manual': False,
            'deleted': False
        })

    # Add manual transactions
    for tx_id, tx_data in saved_transactions.items():
        if tx_data.get('manual', False) and not tx_data.get('deleted', False):
            transaction_list.append({
                'id': tx_id,
                'date': tx_data.get('date'),
                'raw_date': tx_data.get('date'),
                'amount': tx_data.get('amount'),
                'name': tx_data.get('name'),
                'category': tx_data.get('category', 'Uncategorized'),
                'account_id': tx_data.get('account_id'),
                'manual': True,
                'deleted': False
            })

    # Apply filters
    if category_filter:
        transaction_list = [tx for tx in transaction_list if tx['category'] == category_filter]
    if account_filter:
        transaction_list = [tx for tx in transaction_list if tx['account_id'] == account_filter]

    # Sort by date (newest first)
    transaction_list.sort(key=lambda x: x.get('raw_date', ''), reverse=True)

    # Pagination
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('page_size', default=50, type=int)
    total_count = len(transaction_list)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total_count)
    
    return jsonify({
        'transactions': transaction_list[start_idx:end_idx],
        'pagination': {
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': math.ceil(total_count / page_size)
        }
    })

# Route for category management page
@app.route('/categories')
def categories_page():
    return render_template('categories.html')

# Route for annual totals page
@app.route('/annual_totals')
def annual_totals_page():
    return render_template('annual_totals.html')

# Root route to serve the main page
@app.route('/')
def index():
    return render_template('index.html')

