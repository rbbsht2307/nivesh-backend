const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');

// ─── Monte Carlo simulation engine ───────────────────────────────────────────

function runMonteCarlo({ equityPct, debtPct, annualMeanReturn, annualStdDev, amount, years, simCount = 1000, marketMoodShift = 0 }) {
  const bucketThresholds = [-0.20, -0.10, 0, 0.10, 0.20];
  const buckets = [0, 0, 0, 0, 0, 0]; // <-20%, -20 to -10%, -10 to 0%, 0 to 10%, 10 to 20%, >20%
  const finalValues = [];

  // Box-Muller transform for normal distribution
  function randomNormal(mean, std) {
    let u, v;
    do { u = Math.random(); } while (u === 0);
    v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  for (let i = 0; i < simCount; i++) {
    let portfolioValue = amount;

    for (let y = 0; y < years; y++) {
      const equityReturn = randomNormal(annualMeanReturn + marketMoodShift, annualStdDev);
      const debtReturn = randomNormal(0.065, 0.01); // FD/debt ~6.5% mean

      const blendedReturn = (equityPct / 100) * equityReturn + (debtPct / 100) * debtReturn;
      portfolioValue *= (1 + blendedReturn);
    }

    finalValues.push(portfolioValue);
    const totalReturn = (portfolioValue - amount) / amount;

    if (totalReturn < -0.20) buckets[0]++;
    else if (totalReturn < -0.10) buckets[1]++;
    else if (totalReturn < 0) buckets[2]++;
    else if (totalReturn < 0.10) buckets[3]++;
    else if (totalReturn < 0.20) buckets[4]++;
    else buckets[5]++;
  }

  finalValues.sort((a, b) => a - b);

  const gainCount = buckets[3] + buckets[4] + buckets[5];
  const lossCount = buckets[0] + buckets[1] + buckets[2];
  const worstCase = finalValues[Math.floor(simCount * 0.05)]; // 5th percentile
  const bestCase = finalValues[Math.floor(simCount * 0.95)];  // 95th percentile
  const median = finalValues[Math.floor(simCount * 0.5)];
  const mean = finalValues.reduce((a, b) => a + b, 0) / simCount;

  return {
    gainProbability: Math.round((gainCount / simCount) * 100),
    lossProbability: Math.round((lossCount / simCount) * 100),
    worstCaseLoss: Math.round(worstCase - amount),
    expectedReturn: Math.round(mean - amount),
    bestCaseGain: Math.round(bestCase - amount),
    medianValue: Math.round(median),
    finalMeanValue: Math.round(mean),
    buckets: buckets.map((b) => Math.round((b / simCount) * 100)),
    bucketLabels: ['<-20%', '-20 to -10%', '-10 to 0%', '0 to 10%', '10 to 20%', '>20%'],
    simulationCount: simCount,
    inputAmount: amount,
    years,
  };
}

// Portfolio presets (same as frontend)
const PORTFOLIO_PRESETS = {
  safe_haven:  { annualMeanReturn: 0.09, annualStdDev: 0.05, equity: 30,  debt: 70  },
  balanced:    { annualMeanReturn: 0.13, annualStdDev: 0.10, equity: 50,  debt: 50  },
  growth:      { annualMeanReturn: 0.17, annualStdDev: 0.16, equity: 80,  debt: 20  },
  nifty50:     { annualMeanReturn: 0.15, annualStdDev: 0.18, equity: 100, debt: 0   },
  smallcap:    { annualMeanReturn: 0.20, annualStdDev: 0.26, equity: 100, debt: 0   },
};

const MOOD_SHIFTS = { bear: -0.06, neutral: 0, bull: 0.06 };

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/simulate  — run simulation (auth optional but recommended)
router.post('/',
  [
    body('amount').isNumeric({ min: 100 }).withMessage('Amount must be at least 100'),
    body('years').isInt({ min: 1, max: 30 }).withMessage('Years must be between 1 and 30'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        amount,
        years = 1,
        portfolioType,
        equityPct,
        annualMeanReturn,
        annualStdDev,
        marketMood = 'neutral',
        simCount = 1000,
      } = req.body;

      let config;

      if (portfolioType && PORTFOLIO_PRESETS[portfolioType]) {
        config = PORTFOLIO_PRESETS[portfolioType];
      } else if (equityPct !== undefined && annualMeanReturn !== undefined && annualStdDev !== undefined) {
        config = {
          equity: equityPct,
          debt: 100 - equityPct,
          annualMeanReturn,
          annualStdDev,
        };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Provide either portfolioType or (equityPct + annualMeanReturn + annualStdDev)',
        });
      }

      const moodShift = MOOD_SHIFTS[marketMood] ?? 0;
      const clampedSimCount = Math.min(Math.max(simCount, 100), 5000);

      const result = runMonteCarlo({
        equityPct: config.equity,
        debtPct: config.debt,
        annualMeanReturn: config.annualMeanReturn,
        annualStdDev: config.annualStdDev,
        amount: parseFloat(amount),
        years: parseInt(years),
        simCount: clampedSimCount,
        marketMoodShift: moodShift,
      });

      res.status(200).json({
        success: true,
        marketMood,
        portfolioType: portfolioType || 'custom',
        result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/simulate/compare  — compare two portfolios
router.post('/compare', async (req, res, next) => {
  try {
    const { amount = 10000, years = 3, portfolioA, portfolioB, marketMood = 'neutral' } = req.body;

    if (!portfolioA || !portfolioB) {
      return res.status(400).json({ success: false, message: 'portfolioA and portfolioB are required.' });
    }

    const configA = PORTFOLIO_PRESETS[portfolioA];
    const configB = PORTFOLIO_PRESETS[portfolioB];

    if (!configA || !configB) {
      return res.status(400).json({ success: false, message: 'Invalid portfolio type(s).' });
    }

    const moodShift = MOOD_SHIFTS[marketMood] ?? 0;

    const [resultA, resultB] = await Promise.all([
      runMonteCarlo({ ...configA, equityPct: configA.equity, debtPct: configA.debt, amount: parseFloat(amount), years: parseInt(years), simCount: 1000, marketMoodShift: moodShift }),
      runMonteCarlo({ ...configB, equityPct: configB.equity, debtPct: configB.debt, amount: parseFloat(amount), years: parseInt(years), simCount: 1000, marketMoodShift: moodShift }),
    ]);

    const winner = resultA.finalMeanValue >= resultB.finalMeanValue ? portfolioA : portfolioB;

    res.status(200).json({
      success: true,
      amount,
      years,
      marketMood,
      portfolioA: { type: portfolioA, config: configA, result: resultA },
      portfolioB: { type: portfolioB, config: configB, result: resultB },
      winner,
      difference: {
        expectedReturn: resultA.expectedReturn - resultB.expectedReturn,
        gainProbability: resultA.gainProbability - resultB.gainProbability,
        worstCaseLoss: resultA.worstCaseLoss - resultB.worstCaseLoss,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/simulate/presets  — return all portfolio presets
router.get('/presets', (req, res) => {
  res.status(200).json({ success: true, presets: PORTFOLIO_PRESETS });
});

module.exports = router;
