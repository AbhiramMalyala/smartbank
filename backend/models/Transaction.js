// models/Transaction.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const txSchema = new mongoose.Schema({
  txnId:    { type: String, unique: true, default: () => 'TXN' + uuidv4().replace(/-/g,'').slice(0,12).toUpperCase() },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     { type: String, enum: ['credit','debit','reversal','fee'], required: true },
  category: { type: String, enum: ['transfer','payment','deposit','withdrawal','salary','shopping','food','travel','utility','emi','investment','refund','other'], default: 'transfer' },
  amount:   { type: Number, required: true, min: 0.01 },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  counterpartyName:  { type: String, trim: true },
  counterpartyEmail: { type: String, trim: true },
  counterpartyId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transferMode: { type: String, enum: ['IMPS','NEFT','RTGS','UPI','INTERNAL','CASH'], default: 'IMPS' },
  note:     { type: String, trim: true, maxlength: 200 },
  reference:{ type: String },
  status:   { type: String, enum: ['pending','processing','completed','failed','reversed','blocked','under_review'], default: 'completed' },
  failureReason: { type: String },
  fraudScore:   { type: Number, default: 0 },
  fraudLevel:   { type: String, enum: ['clean','low','medium','high','critical'], default: 'clean' },
  fraudFlags:   [String],
  mlFraudScore: {
  type: Number,
  default: 0
},

mlPrediction: {
  type: String,
  enum: ['legitimate', 'fraud'],
  default: 'legitimate'
},

finalRiskScore: {
  type: Number,
  default: 0
},

modelVersion: {
  type: String,
  default: 'RF-v1'
},
  isReviewed:   { type: Boolean, default: false },
  ipAddress:    { type: String },
  userAgent:    { type: String },
  channel:      { type: String, default: 'web' },
  completedAt:  { type: Date },
}, { timestamps: true });

txSchema.index({ userId: 1, createdAt: -1 });
txSchema.index({ status: 1, fraudLevel: 1 });

module.exports = mongoose.model('Transaction', txSchema);
