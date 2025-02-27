import plaid
from plaid.api import plaid_api
from plaid_client import client
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from flask import Flask, render_template, jsonify, request
from datetime import datetime
import json
import os

# Initialize Flask app
app = Flask(__name__)

# File to store the access token
TOKEN_FILE = 'tokens.json'

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

# New route to check if an access token exists
@app.route('/has_access_token', methods=['GET'])
def has_access_token():
    token = load_access_token()
    return jsonify({'has_token': bool(token)})

# Step 4: Route to create a link token
@app.route('/create_link_token', methods=['GET'])
def create_link_token():
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="My Finance App",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id="unique-user-1")
    )
    response = client.link_token_create(request)
    return jsonify({'link_token': response['link_token']})

# Step 6: Route to exchange public token for access token
@app.route('/exchange_public_token', methods=['POST'])
def exchange_public_token():
    public_token = request.json['public_token']
    exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(exchange_request)
    access_token = response['access_token']
    save_access_token(access_token)
    print(f"Access Token: {access_token}")
    return jsonify({'message': 'Token exchanged successfully', 'access_token': access_token})

# Step 7 & 8: Route to fetch and analyze transactions
@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    access_token = load_access_token()
    if not access_token:
        return jsonify({'error': 'No access token available. Please connect a bank account.'}), 400
    
    start_date = datetime.strptime("2024-01-01", "%Y-%m-%d").date()
    end_date = datetime.strptime("2025-02-25", "%Y-%m-%d").date()

    transactions_request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date
    )
    response = client.transactions_get(transactions_request)
    transactions = response['transactions']
    
    category_totals = {}
    transaction_list = []
    for tx in transactions:
        category = tx['category'][0] if tx['category'] else 'Uncategorized'
        amount = float(tx['amount'])
        category_totals[category] = category_totals.get(category, 0) + amount
        transaction_list.append({
            'date': tx['date'],
            'amount': tx['amount'],
            'merchant': tx['name'],
            'category': category
        })
    
    category_summary = [{'category': cat, 'total': f"${total:.2f}"} for cat, total in category_totals.items()]
    return jsonify({
        'transactions': transaction_list,
        'category_totals': category_summary
    })

# Step 5.2: Serve the webpage with Plaid Link
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)