"""FastAPI adapter for the existing ARIMA food-price forecasting project.

This module calls the project's existing preprocessing and serialized ARIMA models.
It does not retrain, refit, or alter those models.
"""
from __future__ import annotations

import sys
from pathlib import Path
from functools import lru_cache
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from preprocessing import load_and_filter_data, prepare_data, create_monthly_series  # noqa: E402
from forecasting import COMMODITIES, load_model, generate_forecast  # noqa: E402

app = FastAPI(
    title="Nigeria Food Price Forecast API",
    description="API adapter for the existing ARIMA models and project reports.",
    version="1.0.0",
)

# Local Vite dev server; production frontend can be served from the same origin or
# configured through FRONTEND_ORIGINS (comma-separated URLs).
import os
origins = [x.strip() for x in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

EVALUATION_PATH = ROOT / "reports" / "model_evaluation.csv"
SUMMARY_PATH = ROOT / "reports" / "commodity_summary_statistics.csv"
SPIKES_PATH = ROOT / "reports" / "spikes" / "detected_spikes.csv"


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    safe = df.copy()
    for col in safe.columns:
        if pd.api.types.is_datetime64_any_dtype(safe[col]):
            safe[col] = safe[col].dt.strftime("%Y-%m-%d")
    safe = safe.astype(object).where(pd.notna(safe), None)
    return safe.to_dict(orient="records")


@lru_cache(maxsize=1)
def monthly_data() -> pd.DataFrame:
    raw = load_and_filter_data()
    prepared = prepare_data(raw)
    monthly = create_monthly_series(prepared)
    monthly["month"] = pd.to_datetime(monthly["month"])
    return monthly.sort_values(["commodity", "month"]).reset_index(drop=True)


def validate_commodity(commodity: str) -> str:
    if commodity not in COMMODITIES:
        raise HTTPException(status_code=404, detail=f"Unknown commodity: {commodity}")
    return commodity


def read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "arima-food-price-api"}


@app.get("/api/commodities")
def commodities() -> list[dict[str, Any]]:
    monthly = monthly_data()
    stats = read_csv(SUMMARY_PATH)
    stats_by_name = stats.set_index("commodity").to_dict(orient="index") if not stats.empty and "commodity" in stats else {}
    out = []
    for name in COMMODITIES:
        series = monthly[monthly["commodity"] == name].sort_values("month")
        if series.empty:
            out.append({"name": name, "observations": 0, "latest_price": None, "latest_date": None, "unit": "—", "change_pct": None})
            continue
        latest = series.iloc[-1]
        prior = series.iloc[-2] if len(series) > 1 else None
        change = ((float(latest.price) - float(prior.price)) / abs(float(prior.price)) * 100) if prior is not None and float(prior.price) else None
        out.append({
            "name": name,
            "observations": int(series["observation_count"].sum()),
            "months_available": int(len(series)),
            "latest_price": float(latest.price),
            "latest_date": latest.month.strftime("%Y-%m-%d"),
            "unit": str(latest.unit),
            "change_pct": round(change, 2) if change is not None else None,
            "summary": stats_by_name.get(name, {}),
        })
    return out


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    monthly = monthly_data()
    evaluation = read_csv(EVALUATION_PATH)
    commodities_payload = commodities()
    latest_dates = monthly["month"].dropna()
    return {
        "commodity_count": len(COMMODITIES),
        "monthly_points": int(len(monthly)),
        "source_observations": int(monthly["observation_count"].sum()),
        "latest_month": latest_dates.max().strftime("%Y-%m-%d") if not latest_dates.empty else None,
        "forecast_horizon_months": 12,
        "evaluation_count": int(len(evaluation)),
        "commodities": commodities_payload,
    }


@app.get("/api/history/{commodity}")
def history(commodity: str) -> list[dict[str, Any]]:
    validate_commodity(commodity)
    monthly = monthly_data()
    series = monthly[monthly["commodity"] == commodity][["month", "price", "observation_count", "unit"]].copy()
    series = series.rename(columns={"month": "date"})
    return _records(series)


@app.get("/api/forecast/{commodity}")
def forecast(commodity: str, response: Response) -> list[dict[str, Any]]:
    """Return exactly 12 consecutive monthly forecasts for the selected commodity."""
    validate_commodity(commodity)
    monthly = monthly_data()
    observed = monthly.loc[monthly["commodity"] == commodity, "month"].dropna().sort_values()
    if observed.empty:
        raise HTTPException(status_code=404, detail=f"No monthly history available for {commodity}")

    last_observed_month = pd.Timestamp(observed.iloc[-1]).to_period("M").to_timestamp()
    expected_dates = pd.date_range(
        start=last_observed_month + pd.offsets.MonthBegin(1),
        periods=12,
        freq="MS",
    )

    try:
        model = load_model(commodity)
        result = generate_forecast(model, commodity, horizon=12).copy()
        if len(result) != 12:
            raise ValueError(f"ARIMA model returned {len(result)} steps; exactly 12 are required.")
        # Some saved statsmodels objects have no monthly date frequency. Assign the
        # 12 model predictions to the next 12 calendar months after the observed data.
        result["date"] = expected_dates
        response.headers["X-Forecast-Source"] = "saved-arima-model"
        response.headers["X-Forecast-Horizon"] = "12"
        response.headers["X-Forecast-Frequency"] = "monthly"
        return _records(result)
    except Exception as exc:
        # Existing CSVs are only safe to use when they already cover the next 12
        # consecutive months. Never relabel stale reports as current forecasts.
        safe_name = commodity.lower().replace(" ", "_").replace("(", "").replace(")", "")
        saved_path = ROOT / "reports" / "forecasts" / f"{safe_name}_forecast.csv"
        if saved_path.exists():
            try:
                saved = pd.read_csv(saved_path)
                saved["date"] = pd.to_datetime(saved["date"], errors="coerce")
                saved = saved.dropna(subset=["date"]).sort_values("date").head(12).copy()
                saved_dates = pd.DatetimeIndex(saved["date"]).to_period("M").to_timestamp()
                if len(saved) == 12 and saved_dates.equals(pd.DatetimeIndex(expected_dates)):
                    response.headers["X-Forecast-Source"] = "existing-forecast-report"
                    response.headers["X-Forecast-Horizon"] = "12"
                    response.headers["X-Forecast-Frequency"] = "monthly"
                    return _records(saved)
            except Exception:
                pass
        raise HTTPException(
            status_code=503,
            detail=(
                f"A current 12-month forecast could not be produced for {commodity}. "
                f"The saved model/report may be incompatible or out of date ({exc}). "
                "No stale forecast has been presented as current. Check the API terminal and "
                "the scientific-library versions used when the model was saved."
            ),
        ) from exc


@app.get("/api/evaluation")
def evaluation() -> list[dict[str, Any]]:
    return _records(read_csv(EVALUATION_PATH))


@app.get("/api/anomalies")
def anomalies(commodity: str | None = None, limit: int = Query(default=200, ge=1, le=1000)) -> list[dict[str, Any]]:
    df = read_csv(SPIKES_PATH)
    if df.empty:
        return []
    if commodity:
        validate_commodity(commodity)
        df = df[df["commodity"] == commodity]
    if "month" in df:
        df = df.sort_values("month", ascending=False)
    return _records(df.head(limit))


@app.get("/api/data")
def data(commodity: str | None = None, limit: int = Query(default=500, ge=1, le=5000)) -> list[dict[str, Any]]:
    monthly = monthly_data()
    if commodity:
        validate_commodity(commodity)
        monthly = monthly[monthly["commodity"] == commodity]
    monthly = monthly.sort_values("month", ascending=False).head(limit)
    return _records(monthly)


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc: Exception):
    # Keep server-side diagnostics while returning a non-sensitive message.
    print(f"Unhandled API error at {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred. Check the API terminal for details."})
