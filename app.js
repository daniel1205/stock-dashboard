const stockList = document.getElementById('stockList');
const stockInput = document.getElementById('stockInput');
const addBtn = document.getElementById('addBtn');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdate = document.getElementById('lastUpdate');
const loading = document.getElementById('loading');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');

// 股票列表
let stocks = JSON.parse(localStorage.getItem('stocks')) || ['2330', 'AAPL', 'TSLA'];
stocks = [...new Set(stocks)];
localStorage.setItem('stocks', JSON.stringify(stocks));

let autoRefreshInterval = null;

// Mock 股票資料庫（當 API 失敗時使用）
const mockStockDB = {
    '2330': { name: '台積電', price: 875, currency: 'TWD' },
    '0050': { name: '元大台灣50', price: 185.5, currency: 'TWD' },
    '2317': { name: '鴻海', price: 195, currency: 'TWD' },
    'AAPL': { name: 'Apple Inc.', price: 225.5, currency: 'USD' },
    'TSLA': { name: 'Tesla Inc.', price: 280.5, currency: 'USD' },
    'MSFT': { name: 'Microsoft', price: 420, currency: 'USD' },
    'GOOGL': { name: 'Alphabet', price: 175, currency: 'USD' },
    'AMZN': { name: 'Amazon', price: 195, currency: 'USD' },
    'NVDA': { name: 'NVIDIA', price: 138, currency: 'USD' },
    'META': { name: 'Meta', price: 575, currency: 'USD' }
};

// 取得 mock 資料（加入隨機波動模擬即時價格）
function getMockData(symbol) {
    const upperSymbol = symbol.toUpperCase();
    const base = mockStockDB[upperSymbol];
    
    if (!base) {
        // 未知的股票，產生隨機資料
        const isTaiwan = /^\d{4,6}$/.test(upperSymbol);
        return {
            symbol: upperSymbol,
            name: upperSymbol,
            price: Math.random() * 200 + 50,
            change: (Math.random() - 0.5) * 10,
            changePercent: (Math.random() - 0.5) * 5,
            currency: isTaiwan ? 'TWD' : 'USD'
        };
    }
    
    // 加入隨機波動
    const changePercent = (Math.random() - 0.5) * 4; // -2% ~ +2%
    const change = base.price * (changePercent / 100);
    const price = base.price + change;
    
    return {
        symbol: upperSymbol,
        name: base.name,
        price: price,
        change: change,
        changePercent: changePercent,
        currency: base.currency
    };
}

// 嘗試取得真實資料（目前使用 mock）
async function fetchStockData(symbol) {
    // 由於 CORS 問題，暫時使用 mock 資料
    // 之後可以改為呼叫自己的後端 API
    return getMockData(symbol);
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
    
    // 模擬 API 延遲
    await new Promise(r => setTimeout(r, 500));
    
    const data = await fetchStockData(symbol);
    loading.style.display = 'none';
    
    if (data) {
        stocks.push(symbol);
        localStorage.setItem('stocks', JSON.stringify(stocks));
        await loadStocks();
        stockInput.value = '';
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
    
    for (const symbol of stocks) {
        const data = await fetchStockData(symbol);
        if (data) {
            stockList.innerHTML += renderStockCard(data);
        }
    }
    
    loading.style.display = 'none';
    
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
        autoRefreshStatus.textContent = '⏱️ 每 3 分鐘自動更新 (Demo 模式)';
    }
}

addBtn.addEventListener('click', addStock);
refreshBtn.addEventListener('click', loadStocks);
stockInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
});

startAutoRefresh();
loadStocks();
