import streamlit as st
import pandas as pd
from database import get_connection
from datetime import datetime, timedelta

def show():
    st.title("Annual Summary")
    conn = get_connection()

    # Date range selection
    start_date, end_date = st.date_input(
        "Select Date Range",
        [datetime.today().date() - timedelta(days=365*5), datetime.today().date()]
    )

    # Load and process transactions
    df = pd.read_sql_query(
        f"SELECT date, amount, category, vendor FROM transactions WHERE date BETWEEN '{start_date}' AND '{end_date}'",
        conn
    )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
        df["year"] = df["date"].dt.year
        pivot = df.pivot_table(index="category", columns="year", values="amount", aggfunc="sum", fill_value=0)
        st.dataframe(pivot)

        # Transaction details selector
        categories = pivot.index.tolist()
        years = pivot.columns.tolist()
        selected_category = st.selectbox("Select Category", categories)
        selected_year = st.selectbox("Select Year", years)
        trans = df[(df["category"] == selected_category) & (df["year"] == selected_year)]
        if not trans.empty:
            st.subheader(f"Transactions for {selected_category} - {selected_year}")
            st.dataframe(trans[["date", "amount", "vendor"]])

    conn.close()