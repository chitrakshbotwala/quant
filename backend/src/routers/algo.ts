import { Router } from 'express';
import { db } from '../core/db';
import { getStrategySubmission, setStrategySubmission, validateStrategyCode } from '../services/strategyRuntime';

const router = Router();

router.post('/validate', async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ ok: false, error: 'MISSING_CODE' });

  const validation = await validateStrategyCode(code);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.message, line: validation.line, column: validation.column, fields: validation.fields || [] });
  }

  return res.json({ ok: true, parameters: validation.parameters });
});

router.post('/submit', async (req, res) => {
  const userId = req.user!.userId;
  const { roundId, code } = req.body as { roundId: number; code?: string };
  if (!code) return res.status(400).json({ error: 'MISSING_CODE' });

  const validation = await validateStrategyCode(code);
  if (!validation.ok) {
    return res.status(400).json({ error: 'INVALID_CODE', detail: validation.message, line: validation.line, column: validation.column, fields: validation.fields || [] });
  }

  const round = await db.round.findUnique({ where: { id: roundId } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });

  setStrategySubmission(userId, roundId, code, validation.parameters);
  return res.json({ ok: true, parameters: validation.parameters });
});

router.get('/parameters/:roundId', async (req, res) => {
  const userId = req.user!.userId;
  const roundId = Number(req.params.roundId);
  const sub = getStrategySubmission(userId, roundId);
  if (sub) {
    return res.json(sub.parameters);
  }

  const round = await db.round.findUnique({ where: { id: roundId } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });
  return res.json(round.lockedParams || null);
});

export default router;
