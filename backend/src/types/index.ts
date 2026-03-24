export type RoundStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export type TickPayload = {
  type: 'TICK';
  round: number;
  candle: {
    index: number;
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  indicators: {
    emaFast: number;
    emaSlow: number;
    rsi: number;
  };
};

export type AlgoSignal = {
  action: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE_ALL';
  sizePct: number;
};
