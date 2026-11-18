import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3,
  CheckCircle2, ChevronDown, CircleHelp, Database, Download, LayoutDashboard,
  LineChart as LineChartIcon, Menu, Moon, RefreshCw, Search, Settings2, Sun,
  Table2, TrendingUp, Wheat, X
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis, BarChart, Bar
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const COMMODITIES = ['Rice (local)', 'Beans (red)', 'Yam', 'Gari (white)', 'Oil (palm)', 'Tomatoes']
const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'forecast', label: 'Price forecasts', icon: LineChartIcon },
  { id: 'performance', label: 'Model performance', icon: BarChart3 },
  { id: 'anomalies', label: 'Price anomalies', icon: AlertTriangle },
  { id: 'explorer', label: 'Data explorer', icon: Table2 },
]
const money = value => value == null || !Number.isFinite(Number(value)) ? '—' : `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
const compact = value => value == null ? '—' : Number(value).toLocaleString('en-NG', { notation: 'compact', maximumFractionDigits: 1 })
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
const pct = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { message = (await response.json()).detail || message } catch {}
    throw new Error(message)
  }
  return response.json()
}
function downloadCSV(rows, filename) {
  if (!rows?.length) return
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [columns.map(quote).join(','), ...rows.map(row => columns.map(col => quote(row[col])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('foodprice-theme') || 'light')
  const [page, setPage] = useState('overview')
  const [commodity, setCommodity] = useState('Rice (local)')
  const horizon = 12
  const [overview, setOverview] = useState(null)
  const [evaluation, setEvaluation] = useState([])
  const [history, setHistory] = useState([])
  const [forecast, setForecast] = useState([])
  const [selectedForecastDate, setSelectedForecastDate] = useState('')
  const [anomalies, setAnomalies] = useState([])
  const [explorer, setExplorer] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('foodprice-theme', theme) }, [theme])
  const loadBase = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [o, e] = await Promise.all([getJSON('/api/overview'), getJSON('/api/evaluation')])
      setOverview(o); setEvaluation(e)
    } catch (err) { setError(err.message || 'Could not connect to the API.'); }
    finally { setLoading(false) }
  }, [])
  const loadCommodity = useCallback(async () => {
    setDetailLoading(true); setError('')
    try {
      const [h, f] = await Promise.all([getJSON(`/api/history/${encodeURIComponent(commodity)}`), getJSON(`/api/forecast/${encodeURIComponent(commodity)}?horizon=${horizon}`)])
      setHistory(h); setForecast(f)
      setSelectedForecastDate(current => f.some(row => row.date === current) ? current : (f[0]?.date || ''))
    } catch (err) { setError(err.message || 'Could not load commodity details.'); setHistory([]); setForecast([]) }
    finally { setDetailLoading(false) }
  }, [commodity, horizon])
  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { loadCommodity() }, [loadCommodity])
  useEffect(() => {
    if (page === 'anomalies') getJSON('/api/anomalies?limit=500').then(setAnomalies).catch(e => setError(e.message))
    if (page === 'explorer') getJSON('/api/data?limit=1000').then(setExplorer).catch(e => setError(e.message))
  }, [page])

  const activeCommodity = overview?.commodities?.find(item => item.name === commodity)
  const evalForCommodity = evaluation.find(item => item.commodity === commodity)
  const mergedChart = useMemo(() => {
    const past = history.map(item => ({ date: item.date, label: fmtDate(item.date), historical: Number(item.price), observations: item.observation_count }))
    const future = forecast.map(item => ({ date: item.date, label: fmtDate(item.date), forecast: Number(item.forecast), lower: Number(item.lower_ci), upper: Number(item.upper_ci) }))
    const lastHistory = past.at(-1)
    if (lastHistory && future.length) future[0] = { ...future[0], historical: lastHistory.historical }
    return [...past, ...future]
  }, [history, forecast])
  const recentRows = useMemo(() => [...history].slice(-6).reverse(), [history])
  const filteredExplorer = useMemo(() => explorer.filter(row => (!search || `${row.commodity} ${row.unit} ${row.month}`.toLowerCase().includes(search.toLowerCase()))), [explorer, search])
  const totalAnomalies = anomalies.length
  const latestForecast = forecast[0]
  const forecastEnd = forecast.at(-1)
  const selectedForecast = forecast.find(row => row.date === selectedForecastDate) || latestForecast

  function choosePage(id) { setPage(id); setMobileNav(false) }
  const currentNav = NAV.find(item => item.id === page) || NAV[0]

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Wheat size={23}/></div><div><strong>FoodPrice<span> Insights</span></strong><small>NIGERIA · FORECASTING</small></div><button className="icon-btn mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list">{NAV.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => choosePage(item.id)} className={`nav-item ${page === item.id ? 'active' : ''}`}><Icon size={18}/><span>{item.label}</span>{item.id === 'anomalies' && <span className="nav-count">!</span>}</button> })}</nav>
      <div className="sidebar-bottom"><div className="source-card"><div className="source-icon"><Database size={17}/></div><div><strong>Data source</strong><span>WFP Nigeria food prices</span></div><CheckCircle2 size={16} className="source-check"/></div><div className="sidebar-foot"><span className="status-dot"/> Forecasting workspace</div></div>
    </aside>

    <main className="main-area">
      <header className="topbar" role="banner"><div className="topbar-left"><button className="icon-btn nav-toggle" onClick={() => { if (window.matchMedia("(max-width: 900px)").matches) setMobileNav(true); else setSidebarCollapsed(value => !value) }} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}><Menu size={20}/></button><div className="topbar-brand"><span className="topbar-brand-mark"><Wheat size={17}/></span><span>FoodPrice <strong>Insights</strong></span></div></div><div className="topbar-actions"><button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}<span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span></button><button className="icon-btn refresh-btn" onClick={() => { loadBase(); loadCommodity() }} aria-label="Refresh dashboard data" title="Refresh data"><RefreshCw size={17}/></button></div></header>

      <div className="page-content">
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> FOOD MARKET ANALYTICS</div><h1>{page === 'overview' ? 'Good insights start here.' : currentNav.label}</h1><p>{page === 'overview' ? 'Monitor historical food prices and explore ARIMA-powered forecasts for selected Nigerian staples.' : page === 'forecast' ? 'Explore historical prices, model projections and confidence intervals.' : page === 'performance' ? 'Review the saved evaluation results for each fitted ARIMA model.' : page === 'anomalies' ? 'Inspect unusual month-to-month price movements identified by the existing analysis.' : 'Search and inspect the monthly commodity price series used by the model.'}</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => downloadCSV(forecast, `${commodity.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-forecast.csv`)}><Download size={16}/> Export forecast</button><button className="button button-primary" onClick={() => choosePage('forecast')}><TrendingUp size={16}/> Explore forecasts <ArrowRight size={15}/></button></div></section>

        {error && <div className="error-banner"><AlertTriangle size={18}/><div><strong>Could not load data</strong><span>{error}. Check that the FastAPI server is running on port 8000.</span></div><button className="icon-btn" onClick={() => { setError(''); loadBase(); loadCommodity() }}><RefreshCw size={16}/></button></div>}
        {loading && !overview ? <div className="loading-panel"><div className="spinner"/><strong>Connecting to the forecasting service…</strong><span>Loading saved reports and model metadata</span></div> : <>
        {page === 'overview' && <>
          <section className="stat-grid">
            <StatCard label="COMMODITIES TRACKED" value={overview?.commodity_count ?? '—'} suffix="staple groups" icon={Wheat} tone="green" foot="Selected food commodities"/>
            <StatCard label="SOURCE OBSERVATIONS" value={compact(overview?.source_observations)} suffix="retail records" icon={Database} tone="blue" foot="Across monthly aggregation"/>
            <StatCard label="MONTHLY DATA POINTS" value={compact(overview?.monthly_points)} suffix="observations" icon={Activity} tone="purple" foot={`Latest month · ${fmtDate(overview?.latest_month)}`}/>
            <StatCard label="FORECAST WINDOW" value={overview?.forecast_horizon_months ?? 12} suffix="months ahead" icon={TrendingUp} tone="amber" foot="Saved ARIMA models"/>
          </section>
          <section className="content-grid overview-grid"><div className="panel chart-panel"><div className="panel-header"><div><div className="section-kicker">PRICE MOVEMENT</div><h2>History & forecast</h2><p>Monthly median prices with model confidence bounds</p></div><div className="chart-controls"><label className="select-wrap"><span className="sr-only">Select commodity</span><select value={commodity} onChange={e => setCommodity(e.target.value)}>{COMMODITIES.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={15}/></label></div></div><div className="chart-legend"><span><i className="legend-dot history-dot"/> Historical price</span><span><i className="legend-dot forecast-dot"/> ARIMA forecast</span><span><i className="legend-band"/> Confidence interval</span></div><div className="main-chart">{detailLoading ? <ChartLoading/> : <PriceChart data={mergedChart} theme={theme}/>}</div><div className="chart-footer"><span><span className="status-dot"/> Based on observed retail-market data</span><button className="text-button" onClick={() => choosePage('forecast')}>View forecast details <ArrowRight size={14}/></button></div></div>
            <div className="panel snapshot-panel"><div className="panel-header"><div><div className="section-kicker">COMMODITY SNAPSHOT</div><h2>Latest observations</h2><p>Most recent recorded monthly median</p></div><button className="icon-btn" onClick={() => choosePage('explorer')} aria-label="Open data explorer"><ArrowRight size={17}/></button></div><div className="snapshot-feature"><div className="snapshot-food-icon"><Wheat size={22}/></div><div className="snapshot-main"><span>{commodity}</span><strong>{money(activeCommodity?.latest_price)}</strong><small>per {activeCommodity?.unit || 'recorded unit'}</small></div><div className={`change-pill ${Number(activeCommodity?.change_pct) > 0 ? 'up' : Number(activeCommodity?.change_pct) < 0 ? 'down' : ''}`}>{Number(activeCommodity?.change_pct) > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {pct(activeCommodity?.change_pct)}</div></div><div className="snapshot-divider"/><div className="mini-metrics"><div><span>Latest month</span><strong>{fmtDate(activeCommodity?.latest_date)}</strong></div><div><span>Source observations</span><strong>{Number(activeCommodity?.observations || 0).toLocaleString()}</strong></div></div><div className="snapshot-list-title">All commodities <span>6 tracked</span></div><div className="commodity-list">{(overview?.commodities || []).map((item, index) => <button key={item.name} className={`commodity-row ${item.name === commodity ? 'selected' : ''}`} onClick={() => setCommodity(item.name)}><span className={`commodity-glyph glyph-${index}`}>{item.name === 'Rice (local)' ? 'R' : item.name === 'Beans (red)' ? 'B' : item.name === 'Yam' ? 'Y' : item.name === 'Gari (white)' ? 'G' : item.name === 'Oil (palm)' ? 'O' : 'T'}</span><span className="commodity-name">{item.name}<small>{item.unit}</small></span><strong>{money(item.latest_price)}</strong><span className={`row-change ${Number(item.change_pct) > 0 ? 'positive' : Number(item.change_pct) < 0 ? 'negative' : ''}`}>{pct(item.change_pct)}</span></button>)}</div></div></section>
          <section className="panel table-panel"><div className="panel-header"><div><div className="section-kicker">RECENT DATA</div><h2>Latest monthly observations</h2><p>Most recent records available for {commodity}</p></div><button className="button button-quiet button-small" onClick={() => choosePage('explorer')}>Open data explorer <ArrowRight size={14}/></button></div><DataTable rows={recentRows.map(row => ({ month: fmtDate(row.date), commodity, price: money(row.price), unit: row.unit, observations: row.observation_count }))} columns={[['month','Month'],['commodity','Commodity'],['price','Median price'],['unit','Unit'],['observations','Source records']]} empty="No historical records available."/></section>
        </>}

        {page === 'forecast' && <><section className="filter-panel panel"><div className="filter-field"><label>COMMODITY</label><select value={commodity} onChange={e => setCommodity(e.target.value)}>{COMMODITIES.map(c => <option key={c}>{c}</option>)}</select></div><div className="filter-field forecast-period-field"><label htmlFor="forecast-month-select">SELECT FORECAST MONTH</label><select id="forecast-month-select" value={selectedForecast?.date || ''} onChange={e => setSelectedForecastDate(e.target.value)} disabled={detailLoading || forecast.length === 0}><option value="" disabled>{detailLoading ? 'Loading forecast months…' : 'No forecast months available'}</option>{forecast.map(row => <option key={row.date} value={row.date}>{fmtDate(row.date)}</option>)}</select><small className="forecast-select-help">{forecast.length === 12 ? '12 monthly predictions from the saved ARIMA model' : `${forecast.length} forecast records returned by the backend`}</small></div><div className="filter-note"><CircleHelp size={17}/><span>Forecasts are generated from the saved model. Changing the horizon does not retrain it.</span></div></section><section className="stat-grid forecast-stats"><StatCard label="SELECTED MONTH FORECAST" value={money(selectedForecast?.forecast)} suffix={fmtDate(selectedForecast?.date)} icon={TrendingUp} tone="green"/><StatCard label="LOWER CONFIDENCE BOUND" value={money(selectedForecast?.lower_ci)} suffix={fmtDate(selectedForecast?.date)} icon={ArrowDownRight} tone="blue"/><StatCard label="UPPER CONFIDENCE BOUND" value={money(selectedForecast?.upper_ci)} suffix={fmtDate(selectedForecast?.date)} icon={ArrowUpRight} tone="purple"/><StatCard label="FORECAST END" value={fmtDate(forecastEnd?.date)} suffix={`${forecast.length} projected months`} icon={Activity} tone="amber"/></section><section className="panel chart-panel large-chart"><div className="panel-header"><div><div className="section-kicker">MODEL OUTPUT</div><h2>{commodity} · forecast projection</h2><p>Historical prices and projected median price, with lower and upper confidence bounds</p></div><button className="button button-quiet button-small" onClick={() => downloadCSV(forecast, `${commodity.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-forecast.csv`)}><Download size={15}/> Download CSV</button></div><div className="chart-legend"><span><i className="legend-dot history-dot"/> Historical</span><span><i className="legend-dot forecast-dot"/> Forecast</span><span><i className="legend-band"/> Confidence interval</span></div><div className="forecast-chart">{detailLoading ? <ChartLoading/> : <PriceChart data={mergedChart} theme={theme} large/>}</div><div className="notice"><CircleHelp size={17}/><p>Confidence intervals express uncertainty around the model's projections; they are not guarantees of future prices. Forecasts reflect the model's historical input series and may not capture sudden market or policy changes.</p></div></section><section className="panel table-panel"><div className="panel-header"><div><div className="section-kicker">FORECAST VALUES</div><h2>Projected monthly prices</h2></div></div><DataTable rows={forecast.map(row => ({ date: fmtDate(row.date), forecast: money(row.forecast), lower_ci: money(row.lower_ci), upper_ci: money(row.upper_ci) }))} columns={[['date','Forecast month'],['forecast','Predicted price'],['lower_ci','Lower bound'],['upper_ci','Upper bound']]} empty="Forecast results will appear when the API is connected."/></section></>}

        {page === 'performance' && <><section className="stat-grid"><StatCard label="EVALUATED MODELS" value={evaluation.length} suffix="commodity models" icon={BarChart3} tone="green"/><StatCard label="CURRENT MODEL" value={evalForCommodity?.arima_order || '—'} suffix={commodity} icon={Activity} tone="blue"/><StatCard label="TEST RMSE" value={evalForCommodity ? money(evalForCommodity.rmse) : '—'} suffix="lower is generally better" icon={TrendingUp} tone="purple"/><StatCard label="TEST MAPE" value={evalForCommodity?.mape != null ? `${Number(evalForCommodity.mape).toFixed(2)}%` : '—'} suffix="saved evaluation result" icon={CheckCircle2} tone="amber"/></section><section className="panel chart-panel"><div className="panel-header"><div><div className="section-kicker">MODEL COMPARISON</div><h2>Forecast error by commodity</h2><p>Values read from reports/model_evaluation.csv</p></div></div><div className="performance-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={evaluation.map(row => ({...row, rmse: Number(row.rmse), mae: Number(row.mae)}))} margin={{top:10,right:20,left:12,bottom:8}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="commodity" tick={{fill:'var(--muted)',fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'var(--muted)',fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text)'}}/><Legend/><Bar dataKey="mae" name="MAE" fill="#22a699" radius={[5,5,0,0]}/><Bar dataKey="rmse" name="RMSE" fill="#7389e8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="panel table-panel"><div className="panel-header"><div><div className="section-kicker">EVALUATION REPORT</div><h2>Saved model metrics</h2><p>These are the existing evaluation results, not metrics recalculated by the UI.</p></div><button className="button button-quiet button-small" onClick={() => downloadCSV(evaluation, 'model-evaluation.csv')}><Download size={15}/> Export results</button></div><DataTable rows={evaluation.map(row => ({ commodity: row.commodity, order: row.arima_order, d: row.differencing_order, train: row.training_observations, test: row.testing_observations, mae: money(row.mae), rmse: money(row.rmse), mape: `${Number(row.mape).toFixed(2)}%`, pvalue: Number(row.ljung_box_pvalue).toFixed(3) }))} columns={[['commodity','Commodity'],['order','ARIMA order'],['d','d'],['train','Train n'],['test','Test n'],['mae','MAE'],['rmse','RMSE'],['mape','MAPE'],['pvalue','Ljung–Box p']]} empty="No evaluation report found."/></section></>}

        {page === 'anomalies' && <><section className="stat-grid"><StatCard label="FLAGGED MOVEMENTS" value={totalAnomalies} suffix="saved detections" icon={AlertTriangle} tone="amber"/><StatCard label="COMMODITY FILTER" value={commodity} suffix="selected series" icon={Wheat} tone="green"/><StatCard label="DETECTION SOURCE" value="Existing" suffix="reports/spikes/detected_spikes.csv" icon={Database} tone="blue"/><StatCard label="INTERPRETATION" value="Review" suffix="not necessarily data errors" icon={CircleHelp} tone="purple"/></section><section className="panel table-panel"><div className="panel-header"><div><div className="section-kicker">ANOMALY REPORT</div><h2>Detected price movements</h2><p>Flags from the existing spike-detection output. Filter by commodity.</p></div><label className="select-wrap"><select value={commodity} onChange={e => setCommodity(e.target.value)}>{COMMODITIES.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={15}/></label></div><DataTable rows={anomalies.filter(row => row.commodity === commodity).map(row => ({ month: fmtDate(row.month), commodity: row.commodity, price: money(row.price), change: money(row.price_change), change_pct: pct(row.pct_change), direction: row.direction, robust_z: Number(row.robust_z).toFixed(2) }))} columns={[['month','Month'],['commodity','Commodity'],['price','Median price'],['change','Price change'],['change_pct','Change %'],['direction','Direction'],['robust_z','Robust z-score']]} empty="No flagged movements for this commodity in the saved report."/></section><div className="notice"><AlertTriangle size={17}/><p>An anomaly flag indicates a statistically unusual movement under the project's detection method. It does not, by itself, prove that a source record is incorrect or that a future price change will occur.</p></div></>}

        {page === 'explorer' && <><section className="panel explorer-panel"><div className="panel-header"><div><div className="section-kicker">MONTHLY SERIES</div><h2>Historical data explorer</h2><p>Browse the monthly median and source-observation count used in analysis.</p></div><button className="button button-quiet button-small" onClick={() => downloadCSV(filteredExplorer, 'monthly-food-price-data.csv')}><Download size={15}/> Export CSV</button></div><div className="explorer-tools"><div className="search-input"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search commodity, unit or month…"/></div><div className="result-count">{filteredExplorer.length.toLocaleString()} records</div></div><DataTable rows={filteredExplorer.map(row => ({ month: fmtDate(row.month), commodity: row.commodity, price: money(row.price), unit: row.unit, observations: Number(row.observation_count).toLocaleString() }))} columns={[['month','Month'],['commodity','Commodity'],['price','Monthly median'],['unit','Recorded unit'],['observations','Source observations']]} empty="No matching records found."/></section><div className="notice"><Database size={17}/><p>Monthly prices are medians of available retail observations, following the project's existing preprocessing logic. Different commodities may have different historical coverage and gaps.</p></div></>}
        </>}
        <footer className="page-footer"><div><span className="footer-mark"><Wheat size={14}/></span> FoodPrice Insights <span className="footer-separator">·</span> ARIMA Food Price Forecasting System</div><div>Data source: World Food Programme (WFP) Nigeria <span className="footer-separator">·</span> <span className="footer-status"><i/> API connected when backend is running</span></div></footer>
      </div>
    </main>
  </div>
}

function StatCard({label, value, suffix, icon: Icon, tone='green', foot}) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={18}/></span></div><div className="stat-value">{value}</div><div className="stat-suffix">{suffix}</div>{foot && <div className="stat-foot"><span className="tiny-check"><CheckCircle2 size={13}/></span>{foot}</div>}</div>
}
function ChartLoading() { return <div className="chart-loading"><div className="spinner"/><span>Loading series…</span></div> }
function PriceChart({data, theme, large=false}) {
  if (!data?.length) return <div className="empty-state"><LineChartIcon size={26}/><strong>No chart data</strong><span>Start the API and verify that the project dataset and saved models are present.</span></div>
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:12,right:large?20:8,left:0,bottom:8}}><defs><linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20a99a" stopOpacity={0.2}/><stop offset="95%" stopColor="#20a99a" stopOpacity={0}/></linearGradient><linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8292ee" stopOpacity={0.19}/><stop offset="100%" stopColor="#8292ee" stopOpacity={0.04}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:11}} tickLine={false} axisLine={false} minTickGap={large?30:45}/><YAxis tickFormatter={v => `₦${compact(v)}`} tick={{fill:'var(--muted)',fontSize:11}} tickLine={false} axisLine={false} width={large?70:62}/><Tooltip formatter={(value,name) => [money(value), ({historical:'Historical price',forecast:'Forecast',lower:'Lower confidence bound',upper:'Upper confidence bound'})[name] || name]} labelFormatter={label => label} contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text)',boxShadow:'var(--shadow)'}}/><Area type="monotone" dataKey="upper" stroke="none" fill="url(#confidenceFill)" connectNulls={false} legendType="none" tooltipType="none"/><Area type="monotone" dataKey="lower" stroke="none" fill="var(--panel)" connectNulls={false} legendType="none" tooltipType="none"/><Area type="monotone" dataKey="historical" name="historical" stroke="#20a99a" strokeWidth={2.3} fill="url(#historyFill)" connectNulls={false} dot={false} activeDot={{r:4,strokeWidth:0}}/><Line type="monotone" dataKey="forecast" name="forecast" stroke="#7184e8" strokeWidth={2.5} strokeDasharray="6 4" dot={{r:2.5,fill:'#7184e8',strokeWidth:0}} activeDot={{r:5}} connectNulls={false}/><Line type="monotone" dataKey="lower" name="lower" stroke="#9ba8ef" strokeWidth={1} strokeDasharray="3 5" dot={false} connectNulls={false}/><Line type="monotone" dataKey="upper" name="upper" stroke="#9ba8ef" strokeWidth={1} strokeDasharray="3 5" dot={false} connectNulls={false}/></ComposedChart></ResponsiveContainer>
}
function DataTable({rows, columns, empty}) {
  return <div className="table-scroll">{!rows?.length ? <div className="table-empty"><Table2 size={22}/><span>{empty}</span></div> : <table><thead><tr>{columns.map(([key,label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={`${index}-${row.month || row.date || row.commodity || ''}`}>{columns.map(([key]) => <td key={key}>{key === 'direction' ? <span className={`direction-badge ${String(row[key]).toLowerCase()}`}>{row[key] || '—'}</span> : row[key] ?? '—'}</td>)}</tr>)}</tbody></table>}</div>
}

export default App
