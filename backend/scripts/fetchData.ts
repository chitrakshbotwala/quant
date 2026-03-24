import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

type Interval = '1d' | '60m' | '15m';

type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toUnixSeconds(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

function toCsv(rows: Candle[]): string {
  const header = 'timestamp,open,high,low,close,volume';
  const body = rows
    .map((r) => `${r.timestamp},${r.open},${r.high},${r.low},${r.close},${Math.trunc(r.volume)}`)
    .join('\n');
  return `${header}\n${body}`;
}

async function fetchYahooChart(symbol: string, interval: Interval, start: string, end: string): Promise<Candle[]> {
  const period1 = toUnixSeconds(start);
  const period2 = toUnixSeconds(end);
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?period1=${period1}&period2=${period2}&interval=${interval}&events=history`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo request failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as any;
  const result = json?.chart?.result?.[0];
  const error = json?.chart?.error;
  if (error) {
    throw new Error(`Yahoo error: ${error.code} ${error.description}`);
  }
  if (!result) {
    throw new Error('Yahoo chart payload missing result data');
  }

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens: Array<number | null> = quote.open || [];
  const highs: Array<number | null> = quote.high || [];
  const lows: Array<number | null> = quote.low || [];
  const closes: Array<number | null> = quote.close || [];
  const volumes: Array<number | null> = quote.volume || [];

  const rows: Candle[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];
    if (
      open === null || open === undefined ||
      high === null || high === undefined ||
      low === null || low === undefined ||
      close === null || close === undefined ||
      volume === null || volume === undefined
    ) {
      continue;
    }

    rows.push({
      timestamp: new Date(timestamps[i] * 1000).toISOString(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume)
    });
  }

  return rows;
}

async function writeCsv(fileName: string, rows: Candle[]) {
  const filePath = path.join(process.cwd(), fileName);
  await fs.writeFile(filePath, toCsv(rows), 'utf8');
  console.log(`wrote ${rows.length} rows -> ${fileName}`);
}

async function main() {
  // Round I source: NASDAQ (^IXIC). Yahoo no longer allows 1h range this far back, so we use daily candles.
  const nasdaq = await fetchYahooChart('^IXIC', '1d', '2020-01-01', '2022-12-31');
  await writeCsv('nasdaq_ohlcv.csv', nasdaq);

  // Round II helper dataset
  const aapl = await fetchYahooChart('AAPL', '1d', '2022-01-01', '2023-06-30');
  await writeCsv('aapl_ohlcv.csv', aapl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
