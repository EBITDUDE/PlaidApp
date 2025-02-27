import streamlit as st
import pandas as pd
from database import get_connection
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

def show():
    st.title("Monthly Totals")
    conn = get_connection()

    # Date range selection
    option = st.selectbox("Select Range", ["Last 12 Months", "Custom Range"])
    if option == "Last 12 Months":
        end_date = datetime.today().replace(day=1) - timedelta(days=1)  # Last day of previous month
        start_date = end_date - relativedelta(months=11)
        start_date = start_date.replace(day=1)
    else:
        start_date, end_date = st.date_input(
            "Select Date Range",
            [datetime.today().date() - timedelta(days=365), datetime.today().date()]
        )

    # Load and process transactions
    df = pd.read_sql_query(
        f"SELECT date, amount, category, vendor FROM transactions WHERE date BETWEEN '{start_date}' AND '{end_date}'",
        conn
    )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
        df["month"] = df["date"].dt.to_period("M")
        pivot = df.pivot_table(index="category", columns="month", values="amount", aggfunc="sum", fill_value=0)
        pivot.columns = pivot.columns.strftime("%b-%y")
        st.dataframe(pivot)

        # Transaction details selector
        categories = pivot.index.tolist()  # Fixed from pavilion to pivot
        months = pivot.columns.tolist()
        selected_category = st.selectbox("Select Category", categories)
        selected_month = st.selectbox("Select Month", months)
        trans = df[(df["category"] == selected_category) & (df["month"].dt.strftime("%b-%y") == selected_month)]
        if not trans.empty:
            st.subheader(f"Transactions for {selected_category} - {selected_month}")
            st.dataframe(trans[["date", "amount", "vendor"]])
    else:
        st.write("No transactions found for the selected range.")

    conn.close()

if __name__ == "__main__":
    show()