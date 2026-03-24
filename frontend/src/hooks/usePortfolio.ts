import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

export function usePortfolio(roundId: number) {
  const [portfolio, setPortfolio] = useState<any>(null);

  useEffect(() => {
    apiGet(`/trading/portfolio?roundId=${roundId}`).then(setPortfolio).catch(() => setPortfolio(null));
  }, [roundId]);

  return { portfolio, setPortfolio };
}
