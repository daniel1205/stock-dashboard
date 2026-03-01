const stockList = document.getElementById('stockList');
const stockInput = document.getElementById('stockInput');
const addBtn = document.getElementById('addBtn');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdate = document.getElementById('lastUpdate');
const loading = document.getElementById('loading');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');

// 從 localStorage 讀取股票列表（若為空或無效則使用預設值）
let storedStocks = localStorage.getItem('stocks');
let stocks = [];
try {
    stocks = JSON.parse(storedStocks) || [];
} catch (e) {
    stocks = [];
}
// 如果 localStorage 是空陣列或無效，使用預設值
if (!Array.isArray(stocks) || stocks.length === 0) {
    stocks = ['2330', '0050', 'AAPL'];
    localStorage.setItem('stocks', JSON.stringify(stocks));
}
// 移除重複的股票代號
stocks = [...new Set(stocks)];
localStorage.setItem('stocks', JSON.stringify(stocks));

let autoRefreshInterval = null;

// CORS Proxy 列表（備援機制）
const proxyList = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];
let currentProxyIndex = 0;

function getProxyUrl() {
    return proxyList[currentProxyIndex];
}

function switchProxy() {
    currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
    console.log(`Switching to proxy: ${getProxyUrl()}`);
}

// 判斷是否為台股
function isTaiwanStock(symbol) {
    return symbol.endsWith('.TW') || /^\d{4,6}$/.test(symbol);
}

// 格式化台股代號
function formatTWSymbol(symbol) {
    if (symbol.endsWith('.TW')) {
        symbol = symbol.replace('.TW', '');
    }
    return symbol;
}

// 帶重試機制的 fetch
async function fetchWithRetry(url, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const proxyUrl = getProxyUrl();
            const response = await fetch(proxyUrl + encodeURIComponent(url), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                return response;
            }
            
            if (i < maxRetries) {
                switchProxy();
                await new Promise(r => setTimeout(r, 500)); // 等待 500ms 後重試
            }
        } catch (error) {
            console.log(`Fetch attempt ${i + 1} failed:`, error.message);
            if (i < maxRetries) {
                switchProxy();
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
    throw new Error('所有 proxy 都無法連線');
}

// 證交所 API 取得台股資料
async function fetchTWSEData(symbol) {
    try {
        const code = formatTWSymbol(symbol);
        const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${code}.tw|otc_${code}.tw`;
        
        const response = await fetchWithRetry(twseUrl, 2);
        const data = await response.json();
        
        if (!data.msgArray || data.msgArray.length === 0) {
            throw new Error('股票資料不存在');
        }
        
        const stock = data.msgArray[0];
        const price = parseFloat(stock.z) || parseFloat(stock.y);
        const previousClose = parseFloat(stock.y);
        
        if (isNaN(price) || isNaN(previousClose)) {
            throw new Error('價格資料無效');
        }
        
        const change = price - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        return {
            symbol: symbol.toUpperCase(),
            name: stock.n || stock.name || symbol,
            price: price,
            change: change,
            changePercent: changePercent,
            currency: 'TWD'
        };
    } catch (error) {
        console.error(`Error fetching TWSE ${symbol}:`, error);
        return null;
    }
}

// Yahoo Finance API 取得美股資料
async function fetchYahooData(symbol) {
    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        
        const response = await fetchWithRetry(yahooUrl, 2);
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('股票資料不存在');
        }
        
        const result = data.chart.result[0];
        const meta = result.meta;
        
        const currentPrice = meta.regularMarketPrice || meta.previousClose;
        const previousClose = meta.previousClose || meta.chartPreviousClose;
        
        if (!currentPrice || !previousClose) {
            throw new Error('價格資料無效');
        }
        
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        return {
            symbol: symbol.toUpperCase(),
            name: meta.shortName || meta.longName || symbol,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            currency: meta.currency || 'USD'
        };
    } catch (error) {
        console.error(`Error fetching Yahoo ${symbol}:`, error);
        return null;
    }
}

// 取得股票資料 (自動判斷台股或美股)
async function fetchStockData(symbol) {
    const upperSymbol = symbol.toUpperCase();
    
    if (isTaiwanStock(upperSymbol)) {
        return await fetchTWSEData(upperSymbol);
    } else {
        return await fetchYahooData(upperSymbol);
    }
}

// 渲染股票卡片
function renderStockCard(stock) {
    const changeClass = stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : 'neutral';
    const changeIcon = stock.change > 0 ? '▲' : stock.change < 0 ? '▼' : '-';
    const changeSign = stock.change > 0 ? '+' : '';
    
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

// 顯示錯誤訊息
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    stockList.insertBefore(errorDiv, stockList.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

// 新增股票
async function addStock() {
    const symbol = stockInput.value.trim();
    
    if (!symbol) {
        showError('請輸入股票代號');
        return;
    }
    
    const upperSymbol = symbol.toUpperCase();
    
    if (stocks.includes(upperSymbol)) {
        showError('此股票已在列表中');
        return;
    }
    
    loading.style.display = 'block';
    
    const data = await fetchStockData(upperSymbol);
    
    loading.style.display = 'none';
    
    if (data) {
        stocks.push(upperSymbol);
        saveStocks();
        await loadStocks();
        stockInput.value = '';
    } else {
        showError(`無法取得 ${upperSymbol} 的資料，請確認股票代號正確`);
    }
}

// 刪除股票
function deleteStock(symbol) {
    stocks = stocks.filter(s => s !== symbol);
    saveStocks();
    loadStocks();
}

// 儲存股票列表
function saveStocks() {
    localStorage.setItem('stocks', JSON.stringify(stocks));
}

// 更新自動更新狀態顯示
function updateAutoRefreshStatus() {
    if (autoRefreshStatus) {
        autoRefreshStatus.textContent = '⏱️ 每 3 分鐘自動更新';
    }
}

// 載入所有股票
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
    
    let successCount = 0;
    let failCount = 0;
    
    for (const symbol of stocks) {
        const data = await fetchStockData(symbol);
        if (data) {
            stockList.innerHTML += renderStockCard(data);
            successCount++;
        } else {
            failCount++;
        }
    }
    
    loading.style.display = 'none';
    
    if (failCount > 0 && successCount === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <p>⚠️ 無法載入股票資料</p>
                <div class="hint">請檢查網路連線或股票代號是否正確</div>
            </div>
        `;
        showError('資料載入失敗，請點擊「更新股價」重試');
    }
    
    // 更新時間
    const now = new Date();
    lastUpdate.textContent = now.toLocaleString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 啟動自動更新
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(loadStocks, 180000); // 3 分鐘
    updateAutoRefreshStatus();
}

// 事件監聽
addBtn.addEventListener('click', addStock);
refreshBtn.addEventListener('click', loadStocks);
stockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});

// 啟動自動更新
startAutoRefresh();

// 頁面載入時執行
loadStocks();
