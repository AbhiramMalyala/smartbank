const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const FraudAlert = require('../models/FraudAlert');

router.get('/users', protect, adminOnly, async (req, res) => {
const users = await User.find().select('-password');
res.json({ success: true, users });
});

router.get('/transactions', protect, adminOnly, async (req, res) => {
const transactions = await Transaction.find()
.sort({ createdAt: -1 })
.limit(500);

res.json({ success: true, transactions });
});

router.get('/fraud-alerts', protect, adminOnly, async (req, res) => {
const alerts = await FraudAlert.find()
.sort({ createdAt: -1 });

res.json({ success: true, alerts });
});
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {

    const totalUsers = await User.countDocuments();

    const totalTransactions =
      await Transaction.countDocuments();

    const fraudAlerts =
      await FraudAlert.countDocuments();

    const blockedTransactions =
      await Transaction.countDocuments({
        status: 'blocked'
      });

    res.json({
      success: true,
      totalUsers,
      totalTransactions,
      fraudAlerts,
      blockedTransactions
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
router.put('/freeze-user/:id', protect, adminOnly, async (req, res) => {

    try {

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.isFrozen = true;
        user.frozenReason = 'Blocked by Admin';

        await user.save();

        res.json({
            success: true,
            message: 'User frozen successfully'
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
});
router.put('/unfreeze-user/:id', protect, adminOnly, async (req, res) => {
    try {

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.isFrozen = false;
        user.frozenReason = '';

        await user.save();

        res.json({
            success: true,
            message: 'User unfrozen successfully'
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
});
router.get('/analytics', protect, adminOnly, async (req, res) => {
    try {

        const highRisk = await Transaction.countDocuments({
            fraudLevel: 'high'
        });

        const mediumRisk = await Transaction.countDocuments({
            fraudLevel: 'medium'
        });

        const lowRisk = await Transaction.countDocuments({
            fraudLevel: 'low'
        });

        const frozenUsers = await User.countDocuments({
            isFrozen: true
        });

        res.json({
            success: true,
            highRisk,
            mediumRisk,
            lowRisk,
            frozenUsers
        });

    } catch(err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});
router.get('/audit-logs', protect, adminOnly, async (req, res) => {

    try {

        const logs = await AuditLog.find()
    .populate('userId', 'firstName email')
    .sort({ createdAt: -1 })
    .limit(100);

        res.json({
            success: true,
            logs
        });

    } catch(err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});
module.exports = router;
