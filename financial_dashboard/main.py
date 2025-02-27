import streamlit as st
from database import init_db
from pages import transactions, monthly_totals, annual_summary, category_graphs, accounts

# Initialize the database when the app starts
init_db()

# Sidebar navigation
st.sidebar.title("Financial Dashboard")
page = st.sidebar.selectbox(
    "Choose a page",
    ["Transactions", "Monthly Totals", "Annual Summary", "Category Graphs", "Accounts"]
)

# Route to the selected page
if page == "Transactions":
    transactions.show()
elif page == "Monthly Totals":
    monthly_totals.show()
elif page == "Annual Summary":
    annual_summary.show()
elif page == "Category Graphs":
    category_graphs.show()
elif page == "Accounts":
    accounts.show()

if __name__ == "__main__":
    # This block is redundant since Streamlit runs the script directly,
    # but included for traditional Python script completeness
    pass