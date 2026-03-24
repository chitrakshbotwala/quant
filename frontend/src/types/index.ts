export type Round = {
  id: number;
  name: string;
  isActive: boolean;
  splitIndex: number;
  currentCandleIndex: number;
  originalCandleCount?: number;
  dataMode?: 'LIVE_DATA' | 'SYNTHETIC_DATA';
};

export type Candle = {
  index: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PortfolioUpdate = {
  type: 'PORTFOLIO_UPDATE';
  capitalRemaining: number;
  openPositions: unknown[] | number;
  unrealizedPnl: number;
  bookedPnl: number;
  peakCapital: number;
  drawdownPct: number;
  capitalDepleted?: boolean;
};
