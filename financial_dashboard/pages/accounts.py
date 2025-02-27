import streamlit as st
from database import get_connection
from plaid_client import client
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode

def show():
    st.title("Accounts")
    
    # Display linked accounts
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT account_id, account_name FROM accounts")
    accounts = c.fetchall()
    if accounts:
        st.write("Linked Accounts:")
        for account_id, account_name in accounts:
            st.write(f"- {account_name} (ID: {account_id})")
    else:
        st.write("No accounts linked yet.")

    # Link new account
    if st.button("Link New Account"):
        try:
            request = LinkTokenCreateRequest(
                products=[Products("transactions")],
                client_name="Financial Dashboard",
                country_codes=[CountryCode("US")],
                language="en",
                user=LinkTokenCreateRequestUser(client_user_id="unique-user-1")
            )
            link_token_response = client.link_token_create(request)
            link_token = link_token_response['link_token']
            st.session_state.link_token = link_token
            st.success("Link token generated. Click 'Open Plaid Link' below.")
        except Exception as e:
            st.error(f"Error generating link token: {str(e)}")
            return

    if 'link_token' in st.session_state:
        plaid_url = f"http://localhost:8000/plaid_link.html?token={st.session_state.link_token}"
        st.write("Click the button below to open Plaid Link in a new tab.")
        st.markdown(f'<a href="{plaid_url}" target="_blank"><button style="padding:10px; background-color:#4B8BBE; color:white; border:none; border-radius:5px; cursor:pointer;">Open Plaid Link</button></a>', unsafe_allow_html=True)

        with st.form("public_token_form"):
            public_token = st.text_input("Enter Public Token")
            submit_button = st.form_submit_button("Submit Public Token")
            if submit_button and public_token:
                try:
                    exchange_response = client.item_public_token_exchange({'public_token': public_token})
                    access_token = exchange_response['access_token']
                    item_id = exchange_response['item_id']
                    c.execute(
                        "INSERT INTO accounts (account_id, access_token, account_name) VALUES (?, ?, ?)",
                        (item_id, access_token, f"Account {item_id[-4:]}")
                    )
                    conn.commit()
                    st.success("Account linked successfully!")
                    if 'link_token' in st.session_state:
                        del st.session_state.link_token
                    st.rerun()
                except Exception as e:
                    st.error(f"Error exchanging token: {str(e)}")

    conn.close()

if __name__ == "__main__":
    show()