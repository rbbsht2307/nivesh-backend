require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Portfolio = require('../models/Portfolio');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for seeding...');

  // Clear existing data
  await User.deleteMany({});
  await Portfolio.deleteMany({});
  console.log('Cleared existing data.');

  // Create test users
  const users = await User.create([
    {
      name: 'Arjun Sharma',
      email: 'arjun@test.com',
      password: 'test1234',
      riskProfile: 'aggressive',
      investmentGoal: 'wealth_building',
      monthlyIncome: 50000,
    },
    {
      name: 'Priya Patel',
      email: 'priya@test.com',
      password: 'test1234',
      riskProfile: 'moderate',
      investmentGoal: 'retirement',
      monthlyIncome: 75000,
    },
  ]);

  console.log(`Created ${users.length} users.`);

  // Create portfolios for first user
  await Portfolio.create([
    {
      user: users[0]._id,
      name: 'My Growth Portfolio',
      type: 'growth',
      investedAmount: 50000,
      allocation: { equity: 80, debt: 20 },
      riskLevel: 'high',
      annualMeanReturn: 0.17,
      annualStdDev: 0.16,
      isFavorite: true,
      tags: ['long-term', 'equity-heavy'],
    },
    {
      user: users[0]._id,
      name: 'Safe Emergency Fund',
      type: 'safe_haven',
      investedAmount: 20000,
      allocation: { equity: 30, debt: 70 },
      riskLevel: 'low',
      annualMeanReturn: 0.09,
      annualStdDev: 0.05,
      tags: ['emergency', 'safe'],
    },
  ]);

  console.log('Created sample portfolios.');
  console.log('\n✅ Seed complete!');
  console.log('Test accounts:');
  console.log('  arjun@test.com / test1234');
  console.log('  priya@test.com / test1234');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
