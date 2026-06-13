// models/Beneficiary.js
const mongoose = require('mongoose');
const bSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:     { type: String, required: true, trim: true },
  email:    { type: String, trim: true, lowercase: true },
  accountNumber: { type: String },
  bankName: { type: String, default: 'SmartBank' },
  isTrusted: { type: Boolean, default: false },
  transactionCount: { type: Number, default: 0 },
  totalTransferred: { type: Number, default: 0 },
  lastTransferAt:   { type: Date },
}, { timestamps: true });
module.exports = mongoose.model('Beneficiary', bSchema);
