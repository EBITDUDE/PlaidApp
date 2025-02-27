import streamlit as st
import pandas as pd
from database import get_connection

def show():
    st.title("Transactions")
    conn = get_connection()
    c = conn.cursor()

    # Load transactions into a DataFrame
    df = pd.read_sql_query("SELECT id, date, amount, category, vendor FROM transactions", conn, index_col="id")
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])

    # Display editable table
    edited_df = st.data_editor(
        df,
        column_config={
            "date": st.column_config.DateColumn("Date", format="MM/DD/YYYY"),
            "amount": st.column_config.NumberColumn("Amount", format="$%.2f"),
            "category": "Category",
            "vendor": "Vendor"
        },
        use_container_width=True,
        num_rows="dynamic"  # Allow adding/deleting rows
    )

    # Save changes to the database
    if st.button("Save Changes"):
        # Insert new categories if any
        categories = edited_df["category"].unique()
        for cat in categories:
            c.execute("INSERT OR IGNORE INTO categories (category_name) VALUES (?)", (cat,))

        # Process edited/new rows
        for idx in edited_df.index:
            if pd.isna(idx) or idx not in df.index:
                # New row (manual transaction)
                c.execute(
                    """INSERT INTO transactions (date, amount, category, vendor, is_manual)
                    VALUES (?, ?, ?, ?, 1)""",
                    (edited_df.loc[idx, "date"], edited_df.loc[idx, "amount"],
                     edited_df.loc[idx, "category"], edited_df.loc[idx, "vendor"])
                )
            else:
                # Update existing row
                c.execute(
                    """UPDATE transactions SET date=?, amount=?, category=?, vendor=? WHERE id=?""",
                    (edited_df.loc[idx, "date"], edited_df.loc[idx, "amount"],
                     edited_df.loc[idx, "category"], edited_df.loc[idx, "vendor"], idx)
                )
        conn.commit()
        st.success("Changes saved successfully!")
        st.experimental_rerun()  # Refresh the page to show updated data

    # Manual transaction entry form
    st.subheader("Add Manual Transaction")
    with st.form("manual_entry"):
        date = st.date_input("Date")
        amount = st.number_input("Amount", min_value=0.0, step=0.01)
        c.execute("SELECT category_name FROM categories")
        categories = [row[0] for row in c.fetchall()]
        category = st.selectbox("Category", categories + ["Other"])
        new_category = st.text_input("New Category") if category == "Other" else None
        vendor = st.text_input("Vendor")
        if st.form_submit_button("Add Transaction"):
            final_category = new_category if category == "Other" and new_category else category
            c.execute("INSERT OR IGNORE INTO categories (category_name) VALUES (?)", (final_category,))
            c.execute(
                """INSERT INTO transactions (date, amount, category, vendor, is_manual)
                VALUES (?, ?, ?, ?, 1)""",
                (date, amount, final_category, vendor)
            )
            conn.commit()
            st.success("Transaction added successfully!")
            st.experimental_rerun()

    # Refresh transactions button (for Plaid data)
    if st.button("Refresh Plaid Transactions"):
        from plaid_client import client
        from datetime import datetime, timedelta
        c.execute("SELECT account_id, access_token FROM accounts")
        accounts = c.fetchall()
        for account_id, access_token in accounts:
            start_date = (datetime.today() - timedelta(days=730)).date()  # Last 2 years
            end_date = datetime.today().date()
            response = client.transactions_get({
                'access_token': access_token,
                'start_date': start_date,
                'end_date': end_date
            })
            for tx in response['transactions']:
                category = tx['category'][0] if tx['category'] else 'Uncategorized'
                c.execute("INSERT OR IGNORE INTO categories (category_name) VALUES (?)", (category,))
                c.execute(
                    """INSERT OR IGNORE INTO transactions
                    (account_id, plaid_transaction_id, date, amount, category, vendor, is_manual)
                    VALUES (?, ?, ?, ?, ?, ?, 0)""",
                    (account_id, tx['transaction_id'], tx['date'], tx['amount'], category, tx['name'])
                )
        conn.commit()
        st.success("Transactions refreshed!")
        st.experimental_rerun()

    conn.close()