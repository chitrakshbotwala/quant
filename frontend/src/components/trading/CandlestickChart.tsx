import { useEffect, useRef } from 'react';
import { CandlestickData, ColorType, createChart } from 'lightweight-charts';
import { Candle } from '../../types';

export default function CandlestickChart({
  candles,
  markers = []
}: {
  candles: Candle[];
  markers?: Array<{ timestamp: string; side: 'BUY' | 'SELL' }>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: '#12141a' }, textColor: '#b4bcc8' },
      grid: { vertLines: { color: '#1e2028' }, horzLines: { color: '#1e2028' } },
      width: ref.current.clientWidth,
      height: 360
    });

    const series = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff3b5c',
      borderVisible: false,
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3b5c'
    });

    const byTime = new Map<number, CandlestickData>();
    for (const c of candles) {
      const t = Math.floor(new Date(c.timestamp).getTime() / 1000);
      byTime.set(t, {
        time: t as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      });
    }

    const data: CandlestickData[] = Array.from(byTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1]);

    series.setData(data);

    const chartMarkers = markers.map((m) => ({
      time: Math.floor(new Date(m.timestamp).getTime() / 1000) as any,
      position: m.side === 'BUY' ? 'belowBar' : 'aboveBar',
      color: m.side === 'BUY' ? '#00ff88' : '#ff3b5c',
      shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: m.side
    }));
    (series as any).setMarkers?.(chartMarkers);

    const onResize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, [candles, markers]);

  return <div className="panel p-2"><div ref={ref} /></div>;
}
