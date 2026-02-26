import numpy as np
import pandas as pd
import streamlit as st
from datetime import date

st.set_page_config(page_title="HF Equity Screener", layout="wide")

# ---------- Deterministic synthetic dataset ----------
@st.cache_data(show_spinner=False)
def make_market_data(seed: int = 7, n_tickers: int = 200, n_days: int = 756) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generates synthetic daily prices and quarterly fundamentals.
    Deterministic (seeded) so the app behaves like a real tool but is self-contained.
    """
    rng = np.random.default_rng(seed)

    tickers = [f"T{str(i).zfill(4)}" for i in range(n_tickers)]
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=n_days)

    # Simulate daily returns with mild cross-sectional dispersion
    mu = rng.normal(0.0002, 0.00005, size=n_tickers)
    sigma = rng.uniform(0.01, 0.03, size=n_tickers)

    rets = rng.normal(mu, sigma, size=(len(dates), n_tickers))
    prices = 100 * np.exp(np.cumsum(rets, axis=0))

    prices_df = pd.DataFrame(prices, index=dates, columns=tickers).reset_index().rename(columns={"index": "date"})
    prices_long = prices_df.melt(id_vars=["date"], var_name="ticker", value_name="close")

    # Fundamentals: quarterly snapshots, value proxy + quality proxy
    q_dates = pd.date_range(dates.min(), dates.max(), freq="Q")
    fundamentals = []
    for qd in q_dates:
        pe = rng.lognormal(mean=3.2, sigma=0.4, size=n_tickers)  # proxy valuation
        margin = rng.normal(0.15, 0.05, size=n_tickers)          # proxy quality
        debt = rng.lognormal(mean=4.0, sigma=0.3, size=n_tickers) # proxy leverage
        fundamentals.append(
            pd.DataFrame({
                "asof": qd,
                "ticker": tickers,
                "pe": pe,
                "op_margin": margin,
                "net_debt": debt
            })
        )
    fundamentals_df = pd.concat(fundamentals, ignore_index=True)
    return prices_long, fundamentals_df


def compute_signals(
    prices_long: pd.DataFrame,
    fundamentals: pd.DataFrame,
    start_dt: pd.Timestamp,
    end_dt: pd.Timestamp,
    lookback_days: int,
    value_weight: float,
    momentum_weight: float,
    quality_weight: float,
) -> pd.DataFrame:
    """
    Produces a ranked signal table at end_dt:
    - Momentum: lookback return
    - Value: inverse PE
    - Quality: operating margin
    """
    px = prices_long[(prices_long["date"] >= start_dt) & (prices_long["date"] <= end_dt)].copy()
    px = px.sort_values(["ticker", "date"])
    # Compute lookback return per ticker
    px["ret"] = px.groupby("ticker")["close"].pct_change()

    # Aggregate to end date snapshot
    last = px.groupby("ticker").tail(1)[["ticker", "date", "close"]].rename(columns={"date": "asof"})
    first_idx = px.groupby("ticker").head(1)[["ticker", "close"]].rename(columns={"close": "close_start"})
    snap = last.merge(first_idx, on="ticker", how="left")
    snap["mom"] = (snap["close"] / snap["close_start"]) - 1.0

    # Fundamentals: last available quarter <= end_dt
    f = fundamentals[fundamentals["asof"] <= end_dt].copy()
    f = f.sort_values(["ticker", "asof"]).groupby("ticker").tail(1)

    snap = snap.merge(f[["ticker", "pe", "op_margin", "net_debt"]], on="ticker", how="left")
    snap["value"] = 1.0 / snap["pe"].replace(0, np.nan)
    snap["quality"] = snap["op_margin"]

    # Z-score features cross-sectionally
    for col in ["mom", "value", "quality"]:
        mu = snap[col].mean()
        sd = snap[col].std(ddof=0) if snap[col].std(ddof=0) != 0 else 1.0
        snap[f"z_{col}"] = (snap[col] - mu) / sd

    snap["signal"] = (
        momentum_weight * snap["z_mom"]
        + value_weight * snap["z_value"]
        + quality_weight * snap["z_quality"]
    )

    out = snap[["ticker", "asof", "close", "mom", "pe", "op_margin", "net_debt", "signal"]].sort_values("signal", ascending=False)
    return out


def simple_backtest(prices_long: pd.DataFrame, picks: list[str], start_dt: pd.Timestamp, end_dt: pd.Timestamp) -> pd.DataFrame:
    """
    Long-only equal-weight portfolio on selected tickers.
    Returns a daily equity curve.
    """
    px = prices_long[(prices_long["date"] >= start_dt) & (prices_long["date"] <= end_dt)].copy()
    px = px[px["ticker"].isin(picks)]
    if px.empty:
        return pd.DataFrame({"date": [], "equity": []})

    pivot = px.pivot(index="date", columns="ticker", values="close").sort_index()
    # Normalize to 1 at start
    norm = pivot / pivot.iloc[0]
    equity = norm.mean(axis=1)
    return equity.reset_index().rename(columns={0: "equity"})


# ---------- UI ----------
prices_long, fundamentals = make_market_data()

st.title("HF Equity Screener (Fixture)")

with st.sidebar:
    st.header("Universe & Params")

    universe = st.selectbox("Universe", ["US Large Cap (Synthetic)", "US Small Cap (Synthetic)"])
    max_names = st.slider("Max names (top-N)", min_value=10, max_value=50, value=25, step=5)
    lookback_days = st.slider("Momentum lookback (days)", min_value=60, max_value=252, value=126, step=21)

    start_date = st.date_input("Start date", value=date.today().replace(year=date.today().year - 2))
    end_date = st.date_input("End date", value=date.today())

    st.subheader("Factor weights")
    value_weight = st.slider("Value", 0.0, 1.0, 0.35, 0.05)
    momentum_weight = st.slider("Momentum", 0.0, 1.0, 0.45, 0.05)
    quality_weight = st.slider("Quality", 0.0, 1.0, 0.20, 0.05)

    run = st.button("Run screen")

# Main panel
start_dt = pd.Timestamp(start_date)
end_dt = pd.Timestamp(end_date)

if run:
    screen = compute_signals(
        prices_long=prices_long,
        fundamentals=fundamentals,
        start_dt=start_dt,
        end_dt=end_dt,
        lookback_days=lookback_days,
        value_weight=value_weight,
        momentum_weight=momentum_weight,
        quality_weight=quality_weight,
    )

    picks = screen.head(max_names)["ticker"].tolist()
    equity = simple_backtest(prices_long, picks, start_dt, end_dt)

    col1, col2, col3 = st.columns(3)
    col1.metric("Universe", universe)
    col2.metric("Names", len(picks))
    col3.metric("As-of", str(end_dt.date()))

    st.subheader("Top Ranked Names")
    st.dataframe(screen.head(max_names), use_container_width=True)

    st.subheader("Equity Curve (Normalized)")
    if not equity.empty:
        st.line_chart(equity.set_index("date")["equity"])
    else:
        st.info("No data in range.")
else:
    st.info("Set parameters in the sidebar and click **Run screen**.")