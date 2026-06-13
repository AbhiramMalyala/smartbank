// routes/user.js — FIXED (lazy requires)
const express  = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const router   = express.Router();

function getUser()        { return require('../models/User');        }
function getBeneficiary() { return require('../models/Beneficiary'); }

// GET /api/user/dashboard
router.get('/dashboard', protect, async (req, res) => {
  try {
    const User = getUser();
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      user: { ...user.toObject(), totalBalance: user.totalBalance, fullName: user.fullName },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

// PUT /api/user/profile
router.put('/profile', protect, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim(),
  body('phone').optional(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const User    = getUser();
    const allowed = ['firstName', 'lastName', 'phone'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ success: true, message: 'Profile updated.', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

// GET /api/user/beneficiaries
router.get('/beneficiaries', protect, async (req, res) => {
  try {
    const Beneficiary = getBeneficiary();
    const bens = await Beneficiary.find({ userId: req.user._id }).sort({ lastTransferAt: -1 });
    res.json({ success: true, beneficiaries: bens });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load beneficiaries.' });
  }
});

// DELETE /api/user/beneficiaries/:id
router.delete('/beneficiaries/:id', protect, async (req, res) => {
  try {
    const Beneficiary = getBeneficiary();
    await Beneficiary.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Beneficiary removed.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to remove.' });
  }
});

// GET /api/user/account-summary
router.get('/account-summary', protect, async (req, res) => {
  try {
    const User = getUser();
    const user = await User.findById(req.user._id)
      .select('savingsBalance currentBalance rewardPoints tier accountNumber ifscCode accountType createdAt riskScore riskLevel');
    res.json({
      success: true,
      summary: { ...user.toObject(), totalBalance: user.savingsBalance + user.currentBalance },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch summary.' });
  }
});

module.exports = router;