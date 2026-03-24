type Props = {
  capitalRemaining: number;
  bookedPnl: number;
  unrealizedPnl: number;
  openPositions: number;
  totalPortfolioValue?: number;
  previousRunBookedPnl?: number;
};

export default function PnLDashboard({ capitalRemaining, bookedPnl, unrealizedPnl, openPositions, totalPortfolioValue, previousRunBookedPnl = 0 }: Props) {
  const total = totalPortfolioValue ?? capitalRemaining + bookedPnl + unrealizedPnl;
  return (
    <div className="panel p-4 grid grid-cols-2 gap-3 text-sm font-mono">
      <div>Capital: ${capitalRemaining.toFixed(2)}</div>
      <div className={bookedPnl >= 0 ? 'text-green' : 'text-red'}>Booked: ${bookedPnl.toFixed(2)}</div>
      <div className={unrealizedPnl >= 0 ? 'text-green' : 'text-red'}>Unrealized: ${unrealizedPnl.toFixed(2)}</div>
      <div className={total >= 0 ? 'text-green' : 'text-red'}>Portfolio Value: ${total.toFixed(2)}</div>
      <div>Open Positions: {openPositions}</div>
      <div className="text-zinc-400">Prev Run Booked: ${previousRunBookedPnl.toFixed(2)}</div>
      {openPositions === 0 && <div className="col-span-2 text-zinc-500">Unrealized stays at 0.00 until at least one position is open. Realized gains/losses appear in Booked.</div>}
    </div>
  );
}
