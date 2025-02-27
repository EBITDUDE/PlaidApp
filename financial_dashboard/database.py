import sqlite3

def get_connection():
    """Create and return a connection to the SQLite database."""
    conn = sqlite3.connect('finance.db', check_same_thread=False)
    return conn

def init_db():
    """Initialize the database with tables and initial categories."""
    conn = get_connection()
    c = conn.cursor()

    # Create categories table
    c.execute('''CREATE TABLE IF NOT EXISTS categories
                 (category_name TEXT PRIMARY KEY)''')

    # Create accounts table for Plaid-linked accounts
    c.execute('''CREATE TABLE IF NOT EXISTS accounts
                 (account_id TEXT PRIMARY KEY,
                  access_token TEXT,
                  account_name TEXT)''')

    # Create transactions table
    c.execute('''CREATE TABLE IF NOT EXISTS transactions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  account_id TEXT,
                  plaid_transaction_id TEXT,
                  date DATE,
                  amount REAL,
                  category TEXT,
                  vendor TEXT,
                  is_manual BOOLEAN,
                  UNIQUE(account_id, plaid_transaction_id))''')

    # Insert initial categories from image 3
    initial_categories = [
        "Dining", "Amazon", "Gas", "Housing", "Goods", "Childcare", "Income",
        "Groceries", "Car Payment", "Doctor", "Venmo", "Miscellaneous", "All Other",
        "Travel", "Transfer to", "All Credit", "Bonus", "Large One"
    ]
    for cat in initial_categories:
        c.execute("INSERT OR IGNORE INTO categories (category_name) VALUES (?)", (cat,))

    conn.commit()
    conn.close()