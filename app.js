const stockList = document.getElementById('stockList');
const stockInput = document.getElementById('stockInput');
const addBtn = document.getElementById('addBtn');
const lastUpdate = document.getElementById('lastUpdate');
const loading = document.getElementById('loading');

// 從 localStorage 讀取股票列表
let stocks = JSON.parse(localStorage.getItem('stocks')) || ['AAPL', 'TSLA'];

// Yahoo Finance API 取得股票資料
async function fetchStockData(symbol) {
    try {
        // 使用 CORS 代理呼叫 Yahoo Finance API
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const response = await fetch(proxyUrl + encodeURIComponent(yahooUrl));
        
        if (!response.ok) {
            throw new Error('股票代號不存在或無法取得資料');
        }
        
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('無法取得股票資料');
        }
        
        const result = data.chart.result[0];
        const meta = result.meta;
        
        const currentPrice = meta.regularMarketPrice || meta.previousClose;
        const previousClose = meta.previousClose || meta.chartPreviousClose;
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
        console.error(`Error fetching ${symbol}:`, error);
        return null;
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
    setTimeout(() => errorDiv.remove(), 3000);
}

// 新增股票
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
    
    const data = await fetchStockData(symbol);
    
    loading.style.display = 'none';
    
    if (data) {
        stocks.push(symbol);
        saveStocks();
        await loadStocks();
        stockInput.value = '';
    } else {
        showError(`無法取得 ${symbol} 的資料，請確認股票代號正確`);
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

// 載入所有股票
async function loadStocks() {
    if (stocks.length === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <p>尚無股票</p>
                <div class="hint">輸入股票代號 (如: AAPL, TSLA, 2330.TW, 0050.TW)</div>
            </div>
        `;
        return;
    }
    
    loading.style.display = 'block';
    stockList.innerHTML = '';
    
    const stockData = await Promise.all(stocks.map(fetchStockData));
    
    loading.style.display = 'none';
    
    stockData.forEach(data => {
        if (data) {
            stockList.innerHTML += renderStockCard(data);
        }
    });
    
    // 更新時間
    const now = new Date();
    lastUpdate.textContent = now.toLocaleString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 事件監聽
addBtn.addEventListener('click', addStock);
stockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});

// 自動更新 (每 30 秒)
setInterval(loadStocks, 30000);

// 頁面載入時執行
loadStocks();
