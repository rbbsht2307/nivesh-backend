const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// POST /api/ai/explain  — explain a portfolio using Claude
router.post('/explain', protect, async (req, res, next) => {
  try {
    const {
      portfolioName,
      riskLevel,
      equityPct,
      debtPct,
      amount,
      gainProbability,
      lossProbability,
      worstCaseLoss,
      expectedReturn,
      years = 1,
    } = req.body;

    if (!portfolioName || !amount) {
      return res.status(400).json({ success: false, message: 'portfolioName and amount are required.' });
    }

    const prompt = `You are a friendly, warm personal finance advisor for young Indians (Gen-Z). 
Explain this investment portfolio in plain, simple English. Keep it under 130 words. 
Be honest about the risk. Use a relatable everyday analogy (cricket, food, Bollywood, college life, etc).

Portfolio: ${portfolioName}
Equity allocation: ${equityPct}%, Debt/FD: ${debtPct}%
Risk level: ${riskLevel}
Investment amount: ₹${Number(amount).toLocaleString('en-IN')}
Time period: ${years} year(s)
Probability of gain: ${gainProbability}%
Probability of loss: ${lossProbability}%
Worst-case scenario: ₹${Math.abs(worstCaseLoss).toLocaleString('en-IN')} loss
Expected return: ₹${Number(expectedReturn).toLocaleString('en-IN')} gain

Start with "So," and end with one honest risk note starting with "One thing to keep in mind:".`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 250,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Claude API error:', err);
      return res.status(502).json({ success: false, message: 'AI service unavailable. Try again.' });
    }

    const data = await response.json();
    const explanation = data.content?.map((b) => b.text || '').join('') || 'Could not generate explanation.';

    res.status(200).json({ success: true, explanation });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/behavioral-tip  — get behavioral finance insight
router.post('/behavioral-tip', protect, async (req, res, next) => {
  try {
    const { gainProbability, lossProbability, equityPct, marketMood, years } = req.body;

    const prompt = `You are a behavioral finance coach helping a young Indian investor understand their psychological biases.
In 2 sentences (max 60 words), give one insight about how this investor's brain might react to these numbers.
Reference a specific behavioral finance concept (loss aversion, anchoring, recency bias, etc.) but explain it simply.

Data: ${gainProbability}% chance of gain, ${lossProbability}% chance of loss, ${equityPct}% in equity, ${marketMood} market, ${years} year horizon.

Be direct, relatable, and end with one actionable tip.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const tip = data.content?.map((b) => b.text || '').join('') || '';

    res.status(200).json({ success: true, tip });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
