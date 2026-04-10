const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never returned in queries by default
    },
    riskProfile: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate',
    },
    investmentGoal: {
      type: String,
      enum: ['wealth_building', 'retirement', 'short_term', 'education'],
      default: 'wealth_building',
    },
    monthlyIncome: {
      type: Number,
      default: 0,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare entered password with stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Return safe user object (no password, no tokens)
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    riskProfile: this.riskProfile,
    investmentGoal: this.investmentGoal,
    monthlyIncome: this.monthlyIncome,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
