import { Router } from 'express';
import { getCombinedLeaderboard, getRoundLeaderboard } from '../services/leaderboardService';

const router = Router();

router.get('/round/:roundId', async (req, res) => {
  try {
    const roundId = Number(req.params.roundId);
    const rows = await getRoundLeaderboard(roundId);
    return res.json(rows);
  } catch (error) {
    console.error('leaderboard round route failed', error);
    return res.status(500).json({ error: 'LEADERBOARD_ROUND_FAILED' });
  }
});

router.get('/combined', async (_req, res) => {
  try {
    const rows = await getCombinedLeaderboard();
    return res.json(rows);
  } catch (error) {
    console.error('leaderboard combined route failed', error);
    return res.status(500).json({ error: 'LEADERBOARD_COMBINED_FAILED' });
  }
});

export default router;
