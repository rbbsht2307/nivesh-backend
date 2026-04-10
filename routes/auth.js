const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ─── Helpers ────────────────────────────────────────────────────────────────

const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });

const sendTokens = (res, user, statusCode = 200) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Store refresh token in DB
  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  user.loginCount += 1;
  user.save({ validateBeforeSave: false });

  return res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: user.toPublicJSON(),
  });
};

// ─── Validation rules ────────────────────────────────────────────────────────

const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, riskProfile, investmentGoal, monthlyIncome } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({
      name,
      email,
      password,
      riskProfile: riskProfile || 'moderate',
      investmentGoal: investmentGoal || 'wealth_building',
      monthlyIncome: monthlyIncome || 0,
    });

    return sendTokens(res, user, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    return sendTokens(res, user, 200);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', protect, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh  — issue new access token using refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const newAccessToken = signAccessToken(user._id);
    const newRefreshToken = signRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Refresh token expired. Please log in again.' });
    }
    next(err);
  }
});

// GET /api/auth/me  — get current user profile
router.get('/me', protect, async (req, res) => {
  res.status(200).json({ success: true, user: req.user.toPublicJSON() });
});

// PATCH /api/auth/me  — update profile
router.patch('/me', protect, async (req, res, next) => {
  try {
    const allowed = ['name', 'riskProfile', 'investmentGoal', 'monthlyIncome'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/change-password
router.patch('/change-password', protect,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select('+password');

      if (!(await user.comparePassword(currentPassword))) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }

      user.password = newPassword;
      await user.save();

      res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/auth/me  — deactivate account
router.delete('/me', protect, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isActive: false, refreshToken: null });
    res.status(200).json({ success: true, message: 'Account deactivated.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
