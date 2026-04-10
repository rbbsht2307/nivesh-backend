const mongoose = require('mongoose');

const simulationResultSchema = new mongoose.Schema({
  gainProbability: Number,
  lossProbability: Number,
  worstCaseLoss: Number,
  expectedReturn: Number,
  buckets: [Number], // 6 buckets from Monte Carlo
  simulationCount: { type: Number, default: 1000 },
  horizon: Number,
  marketMood: { type: String, enum: ['bear', 'neutral', 'bull'] },
  runAt: { type: Date, default: Date.now },
});

const portfolioSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Portfolio name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      enum: ['safe_haven', 'balanced', 'growth', 'nifty50', 'smallcap', 'custom'],
      default: 'custom',
    },
    investedAmount: {
      type: Number,
      required: [true, 'Invested amount is required'],
      min: [100, 'Minimum investment is ₹100'],
    },
    allocation: {
      equity: { type: Number, min: 0, max: 100, default: 50 },
      debt: { type: Number, min: 0, max: 100, default: 50 },
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    annualMeanReturn: { type: Number }, // e.g. 0.13 = 13%
    annualStdDev: { type: Number },     // e.g. 0.10 = 10%
    latestSimulation: simulationResultSchema,
    simulationHistory: [simulationResultSchema],
    isFavorite: { type: Boolean, default: false },
    notes: { type: String, maxlength: 500 },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  }
);

// Index for fast user portfolio lookups
portfolioSchema.index({ user: 1, createdAt: -1 });
portfolioSchema.index({ user: 1, isFavorite: 1 });

module.exports = mongoose.model('Portfolio', portfolioSchema);
