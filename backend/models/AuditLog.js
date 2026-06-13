// models/AuditLog.js
const mongoose = require('mongoose');
const auditSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action:    { type: String, required: true },
  entity:    { type: String },
  entityId:  { type: String },
  details:   { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  result:    { type: String, enum: ['success','failure','blocked'], default: 'success' },
  severity:  { type: String, enum: ['info','warn','error','critical'], default: 'info' },
}, { timestamps: true });
auditSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('AuditLog', auditSchema);
