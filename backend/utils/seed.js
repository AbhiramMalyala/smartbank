// utils/seed.js
require('dotenv').config();
const mongoose    = require('mongoose');
const User        = require('../models/User');
const Transaction = require('../models/Transaction');
const Beneficiary = require('../models/Beneficiary');
const FraudAlert  = require('../models/FraudAlert');

const URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbank';

const rand    = (a, b) => Math.round((Math.random() * (b - a) + a) * 100) / 100;
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
const cats    = ['transfer','payment','shopping','food','travel','utility','salary','emi'];
const modes   = ['IMPS','NEFT','UPI','INTERNAL'];
const parties = ['Amazon','Zomato','Swiggy','Netflix','Uber','Ola','IRCTC','Electricity Board','Water Board','Phone Recharge'];

async function seed() {
  await mongoose.connect(URI);
  console.log('✅ Connected to MongoDB');

  await Promise.all([
    User.deleteMany({}), Transaction.deleteMany({}),
    Beneficiary.deleteMany({}), FraudAlert.deleteMany({}),
  ]);
  console.log('🗑  Cleared existing data');

  // ── Create Users ─────────────────────────────────────────────────────────
  const usersData = [
    { firstName:'Arjun',  lastName:'Mehta',   email:'arjun@demo.com',  phone:'9876543210', password:'Demo@1234', savingsBalance:285000, currentBalance:50000,  tier:'gold',     rewardPoints:2850, totalTransactions:45, avgTransactionAmt:12000, kycStatus:'verified', accountType:'savings'  },
    { firstName:'Priya',  lastName:'Sharma',  email:'priya@demo.com',  phone:'9876543211', password:'Demo@1234', savingsBalance:125000, currentBalance:20000,  tier:'silver',   rewardPoints:1250, totalTransactions:28, avgTransactionAmt:8000,  kycStatus:'verified', accountType:'savings'  },
    { firstName:'Rajan',  lastName:'Iyer',    email:'rajan@demo.com',  phone:'9876543212', password:'Demo@1234', savingsBalance:750000, currentBalance:100000, tier:'platinum', rewardPoints:7500, totalTransactions:80, avgTransactionAmt:25000, kycStatus:'verified', accountType:'premium'  },
    { firstName:'Sneha',  lastName:'Patel',   email:'sneha@demo.com',  phone:'9876543213', password:'Demo@1234', savingsBalance:45000,  currentBalance:10000,  tier:'silver',   rewardPoints:450,  totalTransactions:15, avgTransactionAmt:5000,  kycStatus:'verified', accountType:'savings'  },
    { firstName:'Vikram', lastName:'Singh',   email:'vikram@demo.com', phone:'9876543214', password:'Demo@1234', savingsBalance:520000, currentBalance:75000,  tier:'platinum', rewardPoints:5200, totalTransactions:60, avgTransactionAmt:18000, kycStatus:'verified', accountType:'current'  },
  ];

  const users = [];
  for (const ud of usersData) {
    const u = await User.create({ ...ud, isVerified: true });
    users.push(u);
    console.log(`   👤 Created: ${u.email}  (Acc: ${u.accountNumber})`);
  }

  const arjun = users[0];

  // ── Generate 60 days of realistic transactions for Arjun ─────────────────
  const txns = [];
  const baseDate = new Date();

  for (let i = 60; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const perDay = Math.floor(Math.random() * 3);

    for (let j = 0; j < perDay; j++) {
      const isDebit   = Math.random() > 0.3;
      const amt       = rand(300, 18000);
      const cat       = pick(cats);
      const opponent  = pick(users.filter(u => u._id.toString() !== arjun._id.toString()));
      const d2 = new Date(d); d2.setHours(rand(0,23), rand(0,59));

      txns.push({
        userId: arjun._id,
        type:   isDebit ? 'debit' : 'credit',
        category: cat,
        amount:  amt,
        balanceBefore: arjun.savingsBalance + (isDebit ? amt : -amt),
        balanceAfter:  arjun.savingsBalance,
        counterpartyName:  isDebit ? pick(parties) : `${opponent.firstName} ${opponent.lastName}`,
        counterpartyEmail: isDebit ? '' : opponent.email,
        counterpartyId:    isDebit ? null : opponent._id,
        transferMode: pick(modes),
        note:    cat.charAt(0).toUpperCase() + cat.slice(1),
        status:  'completed', fraudScore: Math.floor(Math.random() * 20), fraudLevel: 'clean',
        channel: 'web', createdAt: d2, completedAt: d2,
      });
    }
  }

  // ── Suspicious / blocked demo transactions ────────────────────────────────
  const now = new Date();
  const suspTxns = [
    {
      userId: arjun._id, type:'debit', category:'transfer',
      amount: 350000, balanceBefore:285000, balanceAfter:285000,
      counterpartyName:'Unknown Payee', counterpartyEmail:'unknown@suspect.io',
      transferMode:'IMPS', note:'urgent payment',
      status:'blocked', fraudScore:94, fraudLevel:'critical',
      fraudFlags:['Critical amount ₹3,50,000','Deep-night transfer at 2:14','First-time recipient','Transfer drains 88% of balance'],
      channel:'web', createdAt:new Date(now - 5*24*60*60*1000), completedAt:new Date(now - 5*24*60*60*1000),
    },
    {
      userId: arjun._id, type:'debit', category:'transfer',
      amount: 80000, balanceBefore:285000, balanceAfter:205000,
      counterpartyName:'Priya Sharma', counterpartyEmail:'priya@demo.com', counterpartyId: users[1]._id,
      transferMode:'NEFT', note:'loan',
      status:'under_review', fraudScore:62, fraudLevel:'medium',
      fraudFlags:['Large amount ₹80,000','Behavioral anomaly: 3.4× user avg'],
      channel:'web', createdAt:new Date(now - 3*24*60*60*1000), completedAt:new Date(now - 3*24*60*60*1000),
    },
    {
      userId: arjun._id, type:'debit', category:'shopping',
      amount: 32000, balanceBefore:205000, balanceAfter:173000,
      counterpartyName:'Amazon', counterpartyEmail:'',
      transferMode:'UPI', note:'Electronics',
      status:'completed', fraudScore:33, fraudLevel:'low',
      fraudFlags:['Off-hours transfer at 23:45','First-time recipient'],
      channel:'mobile', createdAt:new Date(now - 1*24*60*60*1000), completedAt:new Date(now - 1*24*60*60*1000),
    },
    // Salary credit
    {
      userId: arjun._id, type:'credit', category:'salary',
      amount: 95000, balanceBefore:173000, balanceAfter:268000,
      counterpartyName:'TechCorp Pvt Ltd', counterpartyEmail:'payroll@techcorp.com',
      transferMode:'NEFT', note:'Monthly Salary — March 2025',
      status:'completed', fraudScore:0, fraudLevel:'clean',
      channel:'web', createdAt:new Date(now - 2*24*60*60*1000), completedAt:new Date(now - 2*24*60*60*1000),
    },
  ];
  txns.push(...suspTxns);

  await Transaction.insertMany(txns);
  console.log(`   📋 Created ${txns.length} transactions for Arjun`);

  // ── Fraud Alerts ──────────────────────────────────────────────────────────
  const blockedTx  = txns.find(t => t.status === 'blocked');
  const reviewedTx = txns.find(t => t.status === 'under_review');

  await FraudAlert.insertMany([
    {
      alertId: 'FRD_DEMO_001', userId: arjun._id, txnId: 'TXN_DEMO_001',
      riskScore: 94, riskLevel: 'critical', action: 'block',
      triggeredRules: [
        { ruleId:'R001', ruleName:'Critical Amount',        description:'Critical amount ₹3,50,000 exceeds ₹5,00,000 threshold', score:45, severity:'critical' },
        { ruleId:'R023', ruleName:'Night + Large Combo',    description:'Large transfer at deep-night hour 2:14',                 score:35, severity:'critical' },
        { ruleId:'R013', ruleName:'First-Time Recipient',   description:'First ever transfer to unknown@suspect.io',              score:8,  severity:'low'      },
        { ruleId:'R014', ruleName:'Balance Drain Alert',    description:'Transfer drains 88% of total balance',                  score:22, severity:'high'     },
      ],
      flags: ['Critical amount ₹3,50,000','Deep-night transfer at 2:14','First-time recipient','Transfer drains 88% of balance'],
      context: { amount:350000, recipientEmail:'unknown@suspect.io', transferMode:'IMPS', hour:2, dayOfWeek:3, isNewRecipient:true, dailyVolume:350000, accountAgeDays:95 },
      status: 'open', createdAt: new Date(now - 5*24*60*60*1000),
    },
    {
      alertId: 'FRD_DEMO_002', userId: arjun._id, txnId: 'TXN_DEMO_002',
      riskScore: 62, riskLevel: 'medium', action: 'review',
      triggeredRules: [
        { ruleId:'R003', ruleName:'Large Amount',         description:'Large amount ₹80,000 exceeds ₹50,000 threshold', score:12, severity:'medium' },
        { ruleId:'R015', ruleName:'Behavioral Anomaly',   description:'Amount is 3.4× user average ₹12,000',            score:20, severity:'high'   },
        { ruleId:'R018', ruleName:'Weekend Large Transfer',description:'Large transfer on Saturday',                     score:6,  severity:'low'    },
      ],
      flags: ['Large amount ₹80,000','Behavioral anomaly: 3.4× avg','Weekend transfer'],
      context: { amount:80000, recipientEmail:'priya@demo.com', transferMode:'NEFT', hour:14, dayOfWeek:6, isNewRecipient:false, dailyVolume:80000, accountAgeDays:95 },
      status: 'under_review', createdAt: new Date(now - 3*24*60*60*1000),
    },
    {
      alertId: 'FRD_DEMO_003', userId: arjun._id, txnId: 'TXN_DEMO_003',
      riskScore: 33, riskLevel: 'low', action: 'flag',
      triggeredRules: [
        { ruleId:'R005', ruleName:'Off-Hours Transfer', description:'Transfer at 23:45 (off-hours window)', score:8, severity:'low' },
        { ruleId:'R013', ruleName:'First-Time Recipient',description:'First transfer to Amazon',            score:8, severity:'low' },
      ],
      flags: ['Off-hours transfer at 23:45','First-time recipient'],
      context: { amount:32000, recipientEmail:'', transferMode:'UPI', hour:23, dayOfWeek:4, isNewRecipient:true, dailyVolume:32000, accountAgeDays:95 },
      status: 'resolved', reviewedBy:'system', reviewedAt: new Date(now - 12*60*60*1000), resolution:'False positive — verified shopping',
      createdAt: new Date(now - 1*24*60*60*1000),
    },
  ]);
  console.log('   🚨 Created 3 demo fraud alerts');

  // ── Beneficiaries for Arjun ───────────────────────────────────────────────
  const bens = users.slice(1).map(u => ({
    userId: arjun._id,
    name:   `${u.firstName} ${u.lastName}`,
    email:  u.email,
    accountNumber: u.accountNumber,
    bankName: 'SmartBank',
    isTrusted: Math.random() > 0.5,
    transactionCount: Math.floor(Math.random() * 12) + 1,
    totalTransferred: Math.floor(Math.random() * 150000) + 10000,
    lastTransferAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  }));
  await Beneficiary.insertMany(bens);
  console.log(`   👥 Created ${bens.length} beneficiaries`);

  console.log('\n✅ Seed complete! Login with any of these:');
  usersData.forEach(u => console.log(`   📧 ${u.email.padEnd(22)} 🔑 ${u.password}`));
  console.log('\n   Open http://localhost:5000 in your browser\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
