export interface StockData {
  code: string;
  name: string;
  open: string;
  yestclose: string;
  price: string;
  high: string;
  low: string;
  volume: string;
  amount: string;
  time: string;
}

const SINA_URL = 'http://hq.sinajs.cn/list=';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

export async function fetchStocks(codes: string[]): Promise<StockData[]> {
  if (codes.length === 0) {
    return [];
  }

  const response = await fetch(`${SINA_URL}${codes.join(',')}`, {
    headers: {
      Referer: 'http://finance.sina.com.cn',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`行情接口返回 HTTP ${response.status}`);
  }

  const text = new TextDecoder('gb18030').decode(await response.arrayBuffer());

  if (!text || text.includes('FAILED')) {
    throw new Error('行情接口返回无效数据');
  }

  const results: StockData[] = [];

  for (const stock of text.split(';\n').filter(Boolean)) {
    const [code, data] = stock.split('=');
    if (!data) {
      continue;
    }

    const values = data.replace(/^"|"$/g, '').split(',');
    const stockCode = code.replace('var hq_str_', '');

    if (values.length <= 1) {
      continue;
    }

    let stockData: StockData | null = null;

    if (/^(sh|sz|bj)/.test(stockCode)) {
      // A 股
      stockData = {
        code: stockCode,
        name: values[0],
        open: values[1],
        yestclose: values[2],
        price: values[3],
        high: values[4],
        low: values[5],
        volume: values[8],
        amount: values[9],
        time: `${values[30]} ${values[31]}`,
      };
    } else if (/^gb_/.test(stockCode)) {
      // 港股
      stockData = {
        code: stockCode,
        name: values[0],
        open: values[5],
        yestclose: values[26],
        price: values[1],
        high: values[6],
        low: values[7],
        volume: values[10],
        amount: 'No Data',
        time: values[3],
      };
    } else if (/^usr_/.test(stockCode)) {
      // 美股
      stockData = {
        code: stockCode,
        name: values[0],
        open: values[5],
        yestclose: values[26],
        price: values[1],
        high: values[6],
        low: values[7],
        volume: values[10],
        amount: 'No Data',
        time: values[3],
      };
    } else if (/^nf_/.test(stockCode)) {
      // 国内期货
      const isStockIndexFuture = /nf_(IC|IF|IH|IM|TF|TS|T\d+|TL)/.test(
        stockCode
      );

      if (isStockIndexFuture) {
        // 股指期货
        stockData = {
          code: stockCode,
          name: values[49].slice(0, -1),
          open: values[0],
          yestclose: values[13],
          price: values[3],
          high: values[1],
          low: values[2],
          volume: values[4],
          amount: 'No Data',
          time: `${values[values.length - 2]} ${values[values.length - 1]}`,
        };
      } else {
        // 商品期货
        stockData = {
          code: stockCode,
          name: values[0],
          open: values[2],
          yestclose: values[10],
          price: values[8],
          high: values[3],
          low: values[4],
          volume: values[14],
          amount: 'No Data',
          time: values[values.length - 2],
        };
      }
    } else if (/^hf_/.test(stockCode)) {
      // 国际期货
      stockData = {
        code: stockCode,
        name: values[13],
        open: values[8],
        yestclose: values[7],
        price: values[0],
        high: values[4],
        low: values[5],
        volume: values[14].slice(0, -1),
        amount: 'No Data',
        time: values[6],
      };
    }

    if (stockData) {
      results.push(stockData);
    }
  }

  return results;
}
