// models/FraudAlert.js
const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema({
  alertId:       { type: String, unique: true, default: () => 'FRD' + Date.now() },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  txnId:         { type: String },
  riskScore:     { type: Number, required: true },
  riskLevel:     { type: String, enum: ['low','medium','high','critical'], required: true },
  action:        { type: String, enum: ['allow','flag','review','block'], required: true },
  triggeredRules: [{
    ruleId: String, ruleName: String, description: String, score: Number, severity: String
  }],
  flags: [String],
  context: {
    amount: Number, recipientEmail: String, transferMode: String,
    hour: Number, dayOfWeek: Number, ipAddress: String, userAgent: String,
    velocityCount: Number, dailyVolume: Number, accountAgeDays: Number,
    userAvgAmount: Number, isNewRecipient: Boolean,
  },
  status:     { type: String, enum: ['open','under_review','resolved','false_positive','confirmed_fraud'], default: 'open' },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  resolution: { type: String },
}, { timestamps: true });

fraudAlertSchema.index({ userId: 1, createdAt: -1 });
fraudAlertSchema.index({ riskLevel: 1, status: 1 });

module.exports = mongoose.model('FraudAlert', fraudAlertSchema);
