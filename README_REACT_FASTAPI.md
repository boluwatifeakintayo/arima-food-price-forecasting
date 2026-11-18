# FoodPrice Insights — React + FastAPI UI

This adds a modern React dashboard and a small FastAPI adapter to the existing ARIMA food-price forecasting project. The original Streamlit app remains available, and the existing ARIMA source modules, serialized `.pkl` models, raw dataset, reports, and forecast CSVs are retained.

## What is preserved

- Existing six saved ARIMA model files in `models/`
- Existing preprocessing functions in `src/preprocessing.py`
- Existing model-loading and forecast-generation functions in `src/forecasting.py`
- Existing evaluation, anomaly and summary reports under `reports/`
- Existing raw WFP dataset under `data/raw/`

The API calls the saved models through the project's existing `load_model()` and `generate_forecast()` functions. It does not retrain or refit models. Forecast API requests return results directly and do not overwrite the existing forecast CSVs.

## Requirements

- Python 3.10+ recommended
- Node.js 20+ and npm
- The existing project requirements in `requirements.txt`

## Run locally (Windows PowerShell)

Open two terminals in the project root.

### Terminal 1 — Python API

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If the environment already has the project's dependencies installed, activate that environment and install only `backend\requirements.txt`.

API health check: <http://127.0.0.1:8000/api/health>
Interactive API docs: <http://127.0.0.1:8000/docs>

### Terminal 2 — React frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the local Vite URL printed in the terminal (normally <http://127.0.0.1:5173>).

### macOS / Linux commands

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## Dashboard sections

- Overview: dataset coverage, selected commodity snapshot, history and forecast chart
- Price forecasts: commodity selector, 3–36 month projection horizon, confidence bounds and CSV export
- Model performance: existing MAE, RMSE, MAPE, ARIMA orders and evaluation metadata
- Price anomalies: saved spike-detection report filtered by commodity
- Data explorer: searchable monthly series and CSV export
- Theme switch: light/dark preference stored in browser local storage

## API endpoints

- `GET /api/health`
- `GET /api/overview`
- `GET /api/commodities`
- `GET /api/history/{commodity}`
- `GET /api/forecast/{commodity}?horizon=12` (horizon 1–36)
- `GET /api/evaluation`
- `GET /api/anomalies?commodity=Rice%20(local)&limit=200`
- `GET /api/data?commodity=Rice%20(local)&limit=500`

## Troubleshooting

- **API does not start:** run it from the project root, not from inside `backend/` or `frontend/`.
- **Model not found:** verify all six `.pkl` files remain under `models/`.
- **Dataset not found:** verify `data/raw/wfp_food_prices_nga.csv` exists.
- **Frontend says API is unavailable:** start the backend on port 8000, then refresh the page.
- **Python package/pickle compatibility error:** use the same Python and scientific-library versions as the original working project environment. Do not retrain the model just to resolve a UI issue.
- **Port conflict:** change the API port and update `frontend/vite.config.js` proxy target accordingly.

## Deployment later

The frontend can be built with `npm run build` inside `frontend/`; the output is `frontend/dist/`. Deploy the FastAPI service to a Python host with the `src/`, `models/`, `reports/`, and required data files available. Set `FRONTEND_ORIGINS` to the deployed frontend origin(s). Set `VITE_API_BASE_URL` in the frontend production environment to the deployed FastAPI base URL (for example, `https://your-api-host.example`) before building/publishing. Configure `FRONTEND_ORIGINS` on the API to allow the deployed frontend origin. Do not expose write endpoints or allow public uploads unless they are intentionally implemented and secured.

The local development setup is the first milestone; validate the model outputs locally before deploying publicly.
