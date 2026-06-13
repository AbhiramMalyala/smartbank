// routes/transactions.js — FIXED (lazy requires)
const express  = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const router   = express.Router();

function getTransaction()  { return require('../models/Transaction');  }
function getUser()         { return require('../models/User');          }
function getBeneficiary()  { return require('../models/Beneficiary');   }
function getAuditLog()     { return require('../models/AuditLog');      }
function getFraudEngine()  { return require('../services/FraudEngine'); }

const audit = (uid, action, result, details, req) => {
  const AuditLog = getAuditLog();
  return AuditLog.create({
    userId: uid, action, result, details, entity: 'Transaction',
    ipAddress: req.clientIP, userAgent: req.headers['user-agent'],
    severity: result === 'blocked' ? 'critical' : result === 'failure' ? 'warn' : 'info',
  }).catch(() => {});
};

// ── GET /api/transactions ─────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const Transaction = getTransaction();
    const { limit = 20, page = 1, type, category, status, search } = req.query;
    const filter = { userId: req.user._id };
    if (type)     filter.type     = type;
    if (category) filter.category = category;
    if (status)   filter.status   = status;
    if (search) {
      filter.$or = [
        { counterpartyName:  new RegExp(search, 'i') },
        { counterpartyEmail: new RegExp(search, 'i') },
        { txnId:             new RegExp(search, 'i') },
        { note:              new RegExp(search, 'i') },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Transaction.countDocuments(filter),
    ]);
    res.json({ success: true, transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions.' });
  }
});

// ── GET /api/transactions/stats ───────────────────────────────────────────────
router.get('/stats', protect, async (req, res) => {
  try {
    const Transaction = getTransaction();
    const uid = req.user._id;
    const now = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrevMonth   = new Date(now.getFullYear(), now.getMonth(), 0);
    const thirtyDaysAgo  = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [monthDebits, monthCredits, prevMonthDebits, dailyTrend, topCategories] = await Promise.all([
      Transaction.aggregate([
        { $match: { userId: uid, type: 'debit', status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { userId: uid, type: 'credit', status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { userId: uid, type: 'debit', status: 'completed', createdAt: { $gte: startPrevMonth, $lte: endPrevMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { userId: uid, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            debit:  { $sum: { $cond: [{ $eq: ['$type','debit']  }, '$amount', 0] } },
            credit: { $sum: { $cond: [{ $eq: ['$type','credit'] }, '$amount', 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { userId: uid, type: 'debit', status: 'completed' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } }, { $limit: 6 },
      ]),
    ]);

    const spent     = monthDebits[0]?.total    || 0;
    const received  = monthCredits[0]?.total   || 0;
    const prevSpent = prevMonthDebits[0]?.total || 0;
    const spentChange = prevSpent > 0 ? +((spent - prevSpent) / prevSpent * 100).toFixed(1) : 0;

    res.json({
      success: true,
      stats: { monthSpent: spent, monthReceived: received, txnCount: monthDebits[0]?.count || 0,
               spentChange, dailyTrend, topCategories },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ── GET /api/transactions/:id ─────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const Transaction = getTransaction();
    const tx = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found.' });
    res.json({ success: true, transaction: tx });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch transaction.' });
  }
});

// ── POST /api/transactions/transfer ──────────────────────────────────────────
router.post('/transfer', protect, [
  body('recipientEmail').isEmail().normalizeEmail().withMessage('Valid recipient email required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least ₹1'),
  body('transferMode').optional().isIn(['IMPS','NEFT','RTGS','UPI','INTERNAL']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const Transaction  = getTransaction();
    const User         = getUser();
    const { analyse, saveAlert, updateUserProfile } = getFraudEngine();

    const { recipientEmail, amount, transferMode = 'IMPS', note, category = 'transfer', saveAsBeneficiary } = req.body;
    const numAmt = parseFloat(amount);

    if (recipientEmail === req.user.email)
      return res.status(400).json({ success: false, message: 'You cannot transfer to your own account.' });

    const [sender, recipient] = await Promise.all([
      User.findById(req.user._id),
      User.findOne({ email: recipientEmail }),
    ]);

    if (sender.isFrozen)
      return res.status(403).json({ success: false, message: `Your account is frozen: ${sender.frozenReason || 'Contact support.'}` });
    if (sender.savingsBalance < numAmt)
      return res.status(400).json({ success: false, message: `Insufficient funds. Available: ₹${sender.savingsBalance.toLocaleString('en-IN')}` });
    if (!recipient)
      return res.status(404).json({ success: false, message: 'Recipient account not found in SmartBank.' });
    if (recipient.isFrozen)
      return res.status(400).json({ success: false, message: 'Recipient account is currently unavailable.' });

    // ── Fraud Analysis ────────────────────────────────────────────────────────
    const fraudResult = await analyse({
      sender, amount: numAmt, recipientEmail, transferMode,
      ipAddress: req.clientIP, userAgent: req.headers['user-agent'],
      deviceId:  req.headers['x-device-id'] || '',
    });

    // ── BLOCK ─────────────────────────────────────────────────────────────────
    if (fraudResult.shouldBlock) {
      const blockedTx = await Transaction.create({
        userId: sender._id, type: 'debit', category,
        amount: numAmt, balanceBefore: sender.savingsBalance, balanceAfter: sender.savingsBalance,
        counterpartyName: `${recipient.firstName} ${recipient.lastName}`.trim(),
        counterpartyEmail: recipientEmail, counterpartyId: recipient._id,
        transferMode, note, status: 'blocked',
        fraudScore: fraudResult.riskScore, fraudLevel: fraudResult.riskLevel,
        fraudFlags: fraudResult.flags,
        ipAddress: req.clientIP, userAgent: req.headers['user-agent'],
        channel: 'web', completedAt: new Date(),
      });

      await Promise.all([
        saveAlert(sender._id, blockedTx._id, blockedTx.txnId, fraudResult),
        updateUserProfile(sender._id, numAmt, fraudResult.riskScore),
        audit(sender._id, 'TRANSFER_BLOCKED', 'blocked',
          { amount: numAmt, recipientEmail, fraudScore: fraudResult.riskScore, txnId: blockedTx.txnId }, req),
      ]);

      return res.status(403).json({
        success: false, blocked: true,
        message: '🚨 Transaction blocked by SmartBank Fraud Shield.',
        txnId: blockedTx.txnId,
        fraudScore: fraudResult.riskScore,
        riskLevel:  fraudResult.riskLevel,
        rules: fraudResult.triggeredRules.map(r => ({ name: r.ruleName, description: r.description })),
        supportMessage: 'If you believe this is an error, contact support: 1800-SMARTBANK',
      });
    }

    // ── Execute Transfer ───────────────────────────────────────────────────────
    const balBefore = sender.savingsBalance;
    const balAfter  = balBefore - numAmt;

    sender.savingsBalance = balAfter;
    sender.rewardPoints  += Math.floor(numAmt / 100);
    sender.updateTier();
    await sender.save();

    recipient.savingsBalance += numAmt;
    recipient.updateTier();
    await recipient.save();

    const txStatus = fraudResult.shouldReview ? 'under_review' : 'completed';

    const [debitTx] = await Promise.all([
      Transaction.create({
        userId: sender._id, type: 'debit', category,
        amount: numAmt, balanceBefore: balBefore, balanceAfter: balAfter,
        counterpartyName: `${recipient.firstName} ${recipient.lastName}`.trim(),
        counterpartyEmail: recipientEmail, counterpartyId: recipient._id,
        transferMode, note, status: txStatus,
        fraudScore: fraudResult.riskScore,
        fraudLevel: fraudResult.riskLevel === 'clean' ? 'clean' : fraudResult.riskLevel,
        fraudFlags: fraudResult.flags,
        ipAddress: req.clientIP, userAgent: req.headers['user-agent'],
        channel: 'web', completedAt: new Date(),
        reference: 'REF' + Date.now(),
      }),
      Transaction.create({
        userId: recipient._id, type: 'credit', category,
        amount: numAmt,
        balanceBefore: recipient.savingsBalance - numAmt,
        balanceAfter:  recipient.savingsBalance,
        counterpartyName: sender.fullName, counterpartyEmail: sender.email, counterpartyId: sender._id,
        transferMode, note, status: 'completed',
        fraudScore: 0, fraudLevel: 'clean',
        channel: 'web', completedAt: new Date(),
      }),
    ]);

    await Promise.all([
      fraudResult.riskLevel !== 'clean'
        ? saveAlert(sender._id, debitTx._id, debitTx.txnId, fraudResult)
        : Promise.resolve(),
      updateUserProfile(sender._id, numAmt, fraudResult.riskScore),
      audit(sender._id, 'TRANSFER', 'success',
        { amount: numAmt, recipientEmail, txnId: debitTx.txnId, fraudScore: fraudResult.riskScore }, req),
      saveAsBeneficiary
        ? getBeneficiary().findOneAndUpdate(
            { userId: sender._id, email: recipientEmail },
            { name: `${recipient.firstName} ${recipient.lastName}`.trim(),
              email: recipientEmail, accountNumber: recipient.accountNumber,
              bankName: 'SmartBank',
              $inc: { transactionCount: 1, totalTransferred: numAmt },
              lastTransferAt: new Date() },
            { upsert: true })
        : Promise.resolve(),
    ]);

    const resp = {
      success: true, message: 'Transfer completed successfully! ✓',
      txnId: debitTx.txnId, amount: numAmt,
      newBalance: sender.savingsBalance,
      rewardPointsEarned: Math.floor(numAmt / 100),
      fraud: {
        score:          fraudResult.riskScore,
        level:          fraudResult.riskLevel,
        flagged:        fraudResult.riskLevel !== 'clean',
        rulesTriggered: fraudResult.triggeredRules.length,
      },
    };
    if (fraudResult.shouldReview)
      resp.warning = '⚠️ Transaction flagged for security review.';
    else if (fraudResult.riskLevel === 'low')
      resp.notice = 'ℹ️ Minor security flags noted. Transaction completed.';

    res.json(resp);
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ success: false, message: 'Transfer failed. Please try again.' });
  }
});

// ── POST /api/transactions/deposit ────────────────────────────────────────────
router.post('/deposit', protect, [
  body('amount').isFloat({ min: 100 }).withMessage('Minimum deposit ₹100'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const Transaction = getTransaction();
    const User        = getUser();
    const { amount, source = 'External Bank Transfer', note } = req.body;
    const numAmt = parseFloat(amount);
    const user   = await User.findById(req.user._id);
    const balBefore = user.savingsBalance;
    user.savingsBalance += numAmt;
    user.updateTier();
    await user.save();
    const tx = await Transaction.create({
      userId: user._id, type: 'credit', category: 'deposit',
      amount: numAmt, balanceBefore: balBefore, balanceAfter: user.savingsBalance,
      counterpartyName: source, note: note || 'Account top-up',
      transferMode: 'NEFT', status: 'completed', channel: 'web', completedAt: new Date(),
    });
    res.json({ success: true, message: `₹${numAmt.toLocaleString('en-IN')} deposited!`,
               txnId: tx.txnId, newBalance: user.savingsBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Deposit failed.' });
  }
});

module.exports = router;