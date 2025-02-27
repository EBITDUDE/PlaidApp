import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from database import get_connection
from datetime import datetime, timedelta

def show():
    st.title("Category Graphs")
    conn = get_connection()

    # Date range selection
    start_date, end_date = st.date_input(
        "Select Date Range",
        [datetime.today().date() - timedelta(days=365), datetime.today().date()]
    )

    # Load transactions
    df = pd.read_sql_query(
        f"SELECT date, amount, category FROM transactions WHERE date BETWEEN '{start_date}' AND '{end_date}'",
        conn
    )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
        categories = df["category"].unique()

        # Create subplots
        rows = (len(categories) + 2) // 3  # 3 columns
        fig = go.Figure()

        for i, cat in enumerate(categories):
            cat_df = df[df["category"] == cat]
            monthly = cat_df.resample("M", on="date")["amount"].sum()
            if not monthly.empty:
                avg = monthly.rolling(12, min_periods=1).mean().iloc[-1]
                # Add bar chart
                fig.add_trace(
                    go.Bar(x=monthly.index, y=monthly.values, name=cat),
                    row=(i // 3) + 1,
                    col=(i % 3) + 1
                )
                # Add average line
                fig.add_trace(
                    go.Scatter(
                        x=[monthly.index[0], monthly.index[-1]],
                        y=[avg, avg],
                        mode="lines",
                        line=dict(color="red"),
                        name=f"{cat} Avg"
                    ),
                    row=(i // 3) + 1,
                    col=(i % 3) + 1
                )

        fig.update_layout(
            height=300 * rows,
            showlegend=False,
            title_text="Category Spending Over Time"
        )
        st.plotly_chart(fig, use_container_width=True)

    conn.close()