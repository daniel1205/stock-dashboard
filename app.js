const stockList = document.getElementById('stockList');
const stockInput = document.getElementById('stockInput');
const addBtn = document.getElementById('addBtn');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdate = document.getElementById('lastUpdate');
const loading = document.getElementById('loading');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');

// 從 localStorage 讀取股票列表
let stocks = JSON.parse(localStorage.getItem('stocks')) || ['2330', 'AAPL'];
stocks = [...new Set(stocks)];
localStorage.setItem('stocks', JSON.stringify(stocks));

let autoRefreshInterval = null;

// 使用 corsproxy.io（較穩定）
const PROXY_URL = 'https://corsproxy.io/?';

// 判斷是否為台股
function isTaiwanStock(symbol) {
    return /^\d{4,6}$/.test(symbol);
}

// 帶逾時的 fetch
async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Yahoo Finance API（台股美股都支援）
async function fetchYahooData(symbol) {
    try {
        let yahooSymbol = symbol;
        // 台股加上 .TW 後綴
        if (isTaiwanStock(symbol)) {
            yahooSymbol = symbol + '.TW';
        }
        
        const url = `${PROXY_URL}https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
        
        const response = await fetchWithTimeout(url, 15000);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.chart?.error) {
            throw new Error(data.chart.error.description || 'API Error');
        }
        
        if (!data.chart?.result?.[0]) {
            throw new Error('無資料');
        }
        
        const result = data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        
        // 取得最新價格
        let currentPrice = meta.regularMarketPrice;
        let previousClose = meta.previousClose || meta.chartPreviousClose;
        
        // 如果沒有即時價格，嘗試從 quote 取得最後一筆
        if (!currentPrice && quote?.close) {
            const closes = quote.close.filter(p => p !== null);
            if (closes.length > 0) {
                currentPrice = closes[closes.length - 1];
            }
        }
        
        if (!currentPrice || !previousClose) {
            throw new Error('價格資料不完整');
        }
        
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        return {
            symbol: symbol.toUpperCase(),
            name: meta.shortName || meta.longName || meta.symbol || symbol,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            currency: meta.currency || (isTaiwanStock(symbol) ? 'TWD' : 'USD')
        };
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
        return null;
    }
}

// 渲染股票卡片
function renderStockCard(stock) {
    const changeClass = stock.change >= 0 ? 'up' : 'down';
    const changeIcon = stock.change >= 0 ? '▲' : '▼';
    const changeSign = stock.change >= 0 ? '+' : '';
    
    return `
        <div class="stock-card" data-symbol="${stock.symbol}">
            <div class="stock-info">
                <h3>${stock.symbol}</h3>
                <div class="name">${stock.name}</div>
            </div>
            <div class="stock-price">
                <div class="price">${stock.currency} ${stock.price.toFixed(2)}</div>
                <div class="change ${changeClass}">
                    ${changeIcon} ${changeSign}${stock.change.toFixed(2)} (${changeSign}${stock.changePercent.toFixed(2)}%)
                    <button class="delete-btn" onclick="deleteStock('${stock.symbol}')">刪除</button>
                </div>
            </div>
        </div>
    `;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    stockList.insertBefore(errorDiv, stockList.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function addStock() {
    const symbol = stockInput.value.trim().toUpperCase();
    
    if (!symbol) {
        showError('請輸入股票代號');
        return;
    }
    
    if (stocks.includes(symbol)) {
        showError('此股票已在列表中');
        return;
    }
    
    loading.style.display = 'block';
    const data = await fetchYahooData(symbol);
    loading.style.display = 'none';
    
    if (data) {
        stocks.push(symbol);
        localStorage.setItem('stocks', JSON.stringify(stocks));
        await loadStocks();
        stockInput.value = '';
    } else {
        showError(`無法取得 ${symbol} 的資料`);
    }
}

function deleteStock(symbol) {
    stocks = stocks.filter(s => s !== symbol);
    localStorage.setItem('stocks', JSON.stringify(stocks));
    loadStocks();
}

async function loadStocks() {
    if (stocks.length === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <p>尚無股票</p>
                <div class="hint">輸入股票代號 (台股: 2330, 0050 | 美股: AAPL, TSLA)</div>
            </div>
        `;
        return;
    }
    
    loading.style.display = 'block';
    stockList.innerHTML = '';
    
    let loadedCount = 0;
    
    // 一次載入一個，避免並行請求過多
    for (const symbol of stocks) {
        const data = await fetchYahooData(symbol);
        if (data) {
            stockList.innerHTML += renderStockCard(data);
            loadedCount++;
        }
    }
    
    loading.style.display = 'none';
    
    if (loadedCount === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <p>⚠️ 無法載入資料</p>
                <div class="hint">請點擊「更新股價」重試</div>
            </div>
        `;
    }
    
    const now = new Date();
    lastUpdate.textContent = now.toLocaleString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(loadStocks, 180000); // 3分鐘
    if (autoRefreshStatus) {
        autoRefreshStatus.textContent = '⏱️ 每 3 分鐘自動更新';
    }
}

addBtn.addEventListener('click', addStock);
refreshBtn.addEventListener('click', loadStocks);
stockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});

startAutoRefresh();
loadStocks();
