import { Router } from 'express';
import { db } from '../core/db';

const router = Router();

router.get('/', async (_req, res) => {
  const rounds = await db.round.findMany({ orderBy: { id: 'asc' } });
  return res.json(rounds);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const round = await db.round.findUnique({ where: { id } });
  if (!round) return res.status(404).json({ error: 'ROUND_NOT_FOUND' });
  return res.json(round);
});

export default router;
