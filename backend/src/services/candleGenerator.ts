export type GBMParams = {
  drift?: number;
  volatility?: number;
};

export type GeneratedCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function normalRandom(): number {
  const u = Math.max(Math.random(), Number.EPSILON);
  const v = Math.max(Math.random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateNextCandle(lastClose: number, params: GBMParams): GeneratedCandle {
  const drift = params.drift ?? 0.0001;
  const volatility = params.volatility ?? 0.002;
  const dt = 1;

  const closeReturn = drift * dt + volatility * Math.sqrt(dt) * normalRandom();
  const close = lastClose * Math.exp(closeReturn);
  const range = lastClose * volatility * 1.5;
  const high = Math.max(lastClose, close) + Math.abs(normalRandom()) * range * 0.5;
  const low = Math.max(0.0001, Math.min(lastClose, close) - Math.abs(normalRandom()) * range * 0.5);
  const open = lastClose;
  const volume = Math.floor(1_000_000 + Math.abs(normalRandom()) * 500_000);

  return { open, high, low, close, volume };
}