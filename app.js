const stockList = document.getElementById('stockList');
const stockInput = document.getElementById('stockInput');
const addBtn = document.getElementById('addBtn');
const lastUpdate = document.getElementById('lastUpdate');
const loading = document.getElementById('loading');

// 從 localStorage 讀取股票列表
let stocks = JSON.parse(localStorage.getItem('stocks')) || ['AAPL', 'TSLA'];

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

// 證交所 API 取得台股資料
async function fetchTWSEData(symbol) {
    try {
        const code = formatTWSymbol(symbol);
        // 使用證交所 API (需透過 CORS 代理)
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${code}.tw|otc_${code}.tw`;
        const response = await fetch(proxyUrl + encodeURIComponent(twseUrl));
        
        if (!response.ok) {
            throw new Error('無法取得證交所資料');
        }
        
        const data = await response.json();
        
        if (!data.msgArray || data.msgArray.length === 0) {
            throw new Error('股票資料不存在');
        }
        
        const stock = data.msgArray[0];
        const price = parseFloat(stock.z) || parseFloat(stock.y); // 現價或昨收
        const previousClose = parseFloat(stock.y);
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
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const response = await fetch(proxyUrl + encodeURIComponent(yahooUrl));
        
        if (!response.ok) {
            throw new Error('無法取得 Yahoo 資料');
        }
        
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('股票資料不存在');
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
    setTimeout(() => errorDiv.remove(), 3000);
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

// 載入所有股票
async function loadStocks() {
    if (stocks.length === 0) {
        stockList.innerHTML = `
            <div class="empty-state">
                <p>尚無股票</p>
                <div class="hint">輸入股票代號 (如: AAPL, TSLA, 2330, 0050)</div>
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
