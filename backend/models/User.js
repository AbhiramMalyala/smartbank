// models/User.js — FIXED
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, trim: true, default: '' },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, trim: true, default: '' },
  password:     { type: String, required: true, minlength: 8 },

  // FIX: sparse:true prevents duplicate-key error on null values
  accountNumber: { type: String, unique: true, sparse: true },
  accountType:   { type: String, enum: ['savings','current','premium'], default: 'savings' },
  ifscCode:      { type: String, default: 'SBNK0001234' },

  savingsBalance: { type: Number, default: 50000, min: 0 },
  currentBalance: { type: Number, default: 10000, min: 0 },
  rewardPoints:   { type: Number, default: 500 },
  tier:           { type: String, enum: ['silver','gold','platinum','diamond'], default: 'silver' },

  isActive:     { type: Boolean, default: true },
  isVerified:   { type: Boolean, default: true },
  isFrozen:     { type: Boolean, default: false },
  frozenReason: { type: String,  default: '' },

  loginAttempts:     { type: Number, default: 0 },
  lockUntil:         { type: Date },
  lastLogin:         { type: Date },
  lastLoginIP:       { type: String, default: '' },
  passwordChangedAt: { type: Date },

  kycStatus:  { type: String, enum: ['pending','submitted','verified','rejected'], default: 'verified' },
  riskScore:  { type: Number, default: 0, min: 0, max: 100 },
  riskLevel:  { type: String, enum: ['low','medium','high','critical'], default: 'low' },

  avgTransactionAmt: { type: Number, default: 0 },
  totalTransactions: { type: Number, default: 0 },
  blockedRecipients: [String],

}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// ── Virtuals ──────────────────────────────────────────────────────────────────
userSchema.virtual('totalBalance').get(function () {
  return (this.savingsBalance || 0) + (this.currentBalance || 0);
});
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName || ''}`.trim();
});
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Pre-save: hash password + generate account number ─────────────────────────
userSchema.pre('save', async function (next) {
  try {
    // Hash password whenever it changes
    if (this.isModified('password')) {
      this.password          = await bcrypt.hash(this.password, 12);
      this.passwordChangedAt = new Date();
    }

    // Generate a unique account number for new users
    if (this.isNew && !this.accountNumber) {
      // Use timestamp + random to guarantee uniqueness
      this.accountNumber = 'SB' + Date.now().toString().slice(-8)
                         + Math.floor(Math.random() * 900 + 100); // 3 digit suffix
    }

    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance methods ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// FIX: use raw field values, not the virtual, inside methods
userSchema.methods.updateTier = function () {
  const balance = (this.savingsBalance || 0) + (this.currentBalance || 0);
  if      (balance >= 1000000) this.tier = 'diamond';
  else if (balance >= 500000)  this.tier = 'platinum';
  else if (balance >= 100000)  this.tier = 'gold';
  else                         this.tier = 'silver';
};

userSchema.methods.incLoginAttempts = async function () {
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 }; // lock 30 min
  }
  return this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);