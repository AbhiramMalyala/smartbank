// routes/fraud.js — FIXED (lazy requires)
const express  = require('express');
const { protect } = require('../middleware/auth');
const router   = express.Router();

function getFraudAlert()  { return require('../models/FraudAlert');  }
function getTransaction() { return require('../models/Transaction'); }
function getUser()        { return require('../models/User');         }
function getAuditLog()    { return require('../models/AuditLog');    }

// GET /api/fraud/my/stats
router.get('/my/stats', protect, async (req, res) => {
  try {
    const FraudAlert = getFraudAlert();
    const User       = getUser();
    const uid = req.user._id;
    const [alerts, user] = await Promise.all([
      FraudAlert.find({ userId: uid }).sort({ createdAt: -1 }).limit(100).lean(),
      User.findById(uid).select('riskScore riskLevel avgTransactionAmt totalTransactions isFrozen tier'),
    ]);
    const stats = { total: alerts.length, critical: 0, high: 0, medium: 0, low: 0, blocked: 0, reviewed: 0 };
    alerts.forEach(a => {
      if (stats[a.riskLevel] !== undefined) stats[a.riskLevel]++;
      if (a.action === 'block') stats.blocked++;
      if (a.status !== 'open')  stats.reviewed++;
    });
    res.json({ success: true, stats, profile: user, recentAlerts: alerts.slice(0, 5) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
});

// GET /api/fraud/my/alerts
router.get('/my/alerts', protect, async (req, res) => {
  try {
    const FraudAlert = getFraudAlert();
    const { limit = 20, page = 1, level } = req.query;
    const filter = { userId: req.user._id };
    if (level) filter.riskLevel = level;
    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter).sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean(),
      FraudAlert.countDocuments(filter),
    ]);
    res.json({ success: true, alerts, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load alerts.' });
  }
});

// GET /api/fraud/admin/stats
router.get('/admin/stats', protect, async (req, res) => {
  try {
    const FraudAlert  = getFraudAlert();
    const Transaction = getTransaction();
    const [totalAlerts, byLevel, byAction, topFlags, alertsByDay, blockedVolume, recentBlocked] = await Promise.all([
      FraudAlert.countDocuments(),
      FraudAlert.aggregate([{ $group: { _id: '$riskLevel', count: { $sum: 1 } } }]),
      FraudAlert.aggregate([{ $group: { _id: '$action',    count: { $sum: 1 } } }]),
      FraudAlert.aggregate([
        { $unwind: '$triggeredRules' },
        { $group: { _id: '$triggeredRules.ruleName', count: { $sum: 1 }, avgScore: { $avg: '$triggeredRules.score' } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      FraudAlert.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 14*24*60*60*1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count:   { $sum: 1 },
            blocked: { $sum: { $cond: [{ $eq: ['$action','block'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { status: 'blocked' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      FraudAlert.find({ action: 'block' }).sort({ createdAt: -1 }).limit(8)
        .populate('userId', 'firstName lastName email accountNumber')
        .populate('transactionId', 'txnId amount').lean(),
    ]);
    res.json({ success: true, stats: { totalAlerts, byLevel, byAction, topFlags, alertsByDay,
      blockedVolume: blockedVolume[0] || { total: 0, count: 0 }, recentBlocked } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load admin stats.' });
  }
});

// GET /api/fraud/admin/alerts
router.get('/admin/alerts', protect, async (req, res) => {
  try {
    const FraudAlert = getFraudAlert();
    const { limit = 20, page = 1, level, status, action } = req.query;
    const filter = {};
    if (level)  filter.riskLevel = level;
    if (status) filter.status    = status;
    if (action) filter.action    = action;
    const [alerts, total] = await Promise.all([
      FraudAlert.find(filter)
        .populate('userId',        'firstName lastName email accountNumber tier')
        .populate('transactionId', 'txnId amount status')
        .sort({ createdAt: -1 })
        .skip((Number(page)-1)*Number(limit)).limit(Number(limit)).lean(),
      FraudAlert.countDocuments(filter),
    ]);
    res.json({ success: true, alerts, total, pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load alerts.' });
  }
});

// PUT /api/fraud/:id/review
router.put('/:id/review', protect, async (req, res) => {
  try {
    const FraudAlert = getFraudAlert();
    const User       = getUser();
    const { status, resolution, confirmedFraud } = req.body;
    const alert = await FraudAlert.findByIdAndUpdate(
      req.params.id,
      { status: status || 'resolved', resolution, confirmedFraud,
        reviewedBy: req.user.email, reviewedAt: new Date() },
      { new: true },
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });
    if (confirmedFraud)
      await User.findByIdAndUpdate(alert.userId, { isFrozen: true, frozenReason: `Confirmed fraud — Alert ${alert.alertId}` });
    res.json({ success: true, message: 'Alert reviewed.', alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update alert.' });
  }
});

// GET /api/fraud/audit-log
router.get('/audit-log', protect, async (req, res) => {
  try {
    const AuditLog = getAuditLog();
    const logs = await AuditLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(30).lean();
    res.json({ success: true, logs });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load audit log.' });
  }
});

module.exports = router;