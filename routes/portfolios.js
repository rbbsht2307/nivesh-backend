const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Portfolio = require('../models/Portfolio');
const { protect } = require('../middleware/auth');

// All portfolio routes require authentication
router.use(protect);

// ─── GET /api/portfolios  — list all user portfolios ─────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { favorite, type, sort = '-createdAt' } = req.query;
    const filter = { user: req.user._id };
    if (favorite === 'true') filter.isFavorite = true;
    if (type) filter.type = type;

    const portfolios = await Portfolio.find(filter).sort(sort).lean();
    res.status(200).json({ success: true, count: portfolios.length, portfolios });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/portfolios  — create new portfolio ────────────────────────────
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Portfolio name is required'),
    body('investedAmount').isNumeric().withMessage('Invested amount must be a number'),
    body('allocation.equity').isNumeric().withMessage('Equity allocation must be a number'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, type, investedAmount, allocation, riskLevel, annualMeanReturn, annualStdDev, notes, tags } = req.body;

      // Auto-calculate debt from equity
      const equity = allocation?.equity ?? 50;
      const debt = 100 - equity;

      const portfolio = await Portfolio.create({
        user: req.user._id,
        name,
        type: type || 'custom',
        investedAmount,
        allocation: { equity, debt },
        riskLevel: riskLevel || (equity >= 70 ? 'high' : equity >= 40 ? 'medium' : 'low'),
        annualMeanReturn,
        annualStdDev,
        notes,
        tags,
      });

      res.status(201).json({ success: true, portfolio });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/portfolios/:id  — get single portfolio ─────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const portfolio = await Portfolio.findOne({ _id: req.params.id, user: req.user._id });
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }
    res.status(200).json({ success: true, portfolio });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/portfolios/:id  — update portfolio ───────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'investedAmount', 'allocation', 'riskLevel', 'isFavorite', 'notes', 'tags'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }
    res.status(200).json({ success: true, portfolio });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/portfolios/:id  — delete portfolio ──────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const portfolio = await Portfolio.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }
    res.status(200).json({ success: true, message: 'Portfolio deleted.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/portfolios/:id/simulation  — save simulation result ────────────
router.post('/:id/simulation', async (req, res, next) => {
  try {
    const { gainProbability, lossProbability, worstCaseLoss, expectedReturn, buckets, horizon, marketMood } = req.body;

    const simulationResult = {
      gainProbability,
      lossProbability,
      worstCaseLoss,
      expectedReturn,
      buckets,
      horizon,
      marketMood,
      runAt: new Date(),
    };

    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        $set: { latestSimulation: simulationResult },
        $push: { simulationHistory: { $each: [simulationResult], $slice: -20 } }, // keep last 20
      },
      { new: true }
    );

    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    res.status(200).json({ success: true, simulation: simulationResult, portfolio });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/portfolios/:id/simulation-history  — get simulation history ────
router.get('/:id/simulation-history', async (req, res, next) => {
  try {
    const portfolio = await Portfolio.findOne(
      { _id: req.params.id, user: req.user._id },
      { simulationHistory: 1, name: 1 }
    );
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }
    res.status(200).json({ success: true, history: portfolio.simulationHistory });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
