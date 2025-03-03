import plaid
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid_client import client  # Assumes plaid_client.py defines the Plaid client
import logging
import uuid

logger = logging.getLogger(__name__)

def create_link_token():
    """
    Create a Plaid Link token for connecting a bank account.
    """
    client_user_id = f"user-{uuid.uuid4()}"
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="My Finance App",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=client_user_id)
    )
    try:
        response = client.link_token_create(request)
        return response['link_token']
    except Exception as e:
        logger.error(f"Error creating link token: {str(e)}")
        raise

def exchange_public_token(public_token):
    """
    Exchange a public token for an access token.
    """
    exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
    try:
        response = client.item_public_token_exchange(exchange_request)
        return response['access_token']
    except Exception as e:
        logger.error(f"Error exchanging public token: {str(e)}")
        raise

def get_accounts(access_token):
    """
    Fetch connected bank accounts using the access token.
    """
    request = AccountsGetRequest(access_token=access_token)
    try:
        response = client.accounts_get(request)
        accounts = response['accounts']
        account_list = []
        for account in accounts:
            account_dict = account.to_dict()
            account_list.append({
                'id': account_dict.get('account_id'),
                'name': account_dict.get('name'),
                'type': str(account_dict.get('type')),
                'subtype': str(account_dict.get('subtype')),
                'balance': {
                    'current': account_dict.get('balances', {}).get('current', 0),
                    'available': account_dict.get('balances', {}).get('available', 0)
                }
            })
        return account_list
    except Exception as e:
        logger.error(f"Error fetching accounts: {str(e)}")
        raise

def get_transactions(access_token, start_date, end_date):
    """
    Fetch transactions from Plaid for the given date range.
    """
    transactions_request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date
    )
    try:
        response = client.transactions_get(transactions_request)
        return response['transactions']
    except Exception as e:
        logger.error(f"Error fetching transactions: {str(e)}")
        raise