// routes/auth.js — FIXED
const express  = require('express');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const router   = express.Router();

// FIX: require models lazily inside handlers to avoid circular dep
// routes/auth.js -> middleware/auth.js -> models/User.js (circular = User = {})
function getUser()     { return require('../models/User');     }
function getAuditLog() { return require('../models/AuditLog'); }

// const genToken = id =>
//   jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '24h' });
const genToken = (id, role) =>
jwt.sign(
{ id, role },
process.env.JWT_SECRET,
{ expiresIn: process.env.JWT_EXPIRE || '24h' }
);

const audit = (userId, action, result, details, req) => {
  const AuditLog = getAuditLog();
  return AuditLog.create({
    userId, action, result, details,
    ipAddress: req.clientIP || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    severity: result === 'failure' ? 'warn' : 'info',
  }).catch(() => {});
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').optional().trim(),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password needs uppercase, lowercase and number'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const User = getUser();
    const { firstName, lastName, email, phone, password, accountType } = req.body;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });

    const user  = await User.create({
      firstName,
      lastName:    lastName || '',
      email,
      phone:       phone || '',
      password,
      accountType: accountType || 'savings',
      isVerified:  true,
    });

    // const token = genToken(user._id);
    const token = genToken(user._id, user.role);

    await audit(user._id, 'REGISTER', 'success', { email }, req);

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to SmartBank.',
      token,
      user: {
        role: user.role,
        id: user._id, firstName, lastName: user.lastName, email,
        accountNumber: user.accountNumber,
        accountType:   user.accountType,
        totalBalance:  user.totalBalance,
        tier:          user.tier,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const User = getUser();
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    if (user.isLocked) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${mins} minute(s).`,
      });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      await user.incLoginAttempts();
      await audit(user._id, 'LOGIN', 'failure', { email, reason: 'wrong_password' }, req);
      const left = Math.max(0, 5 - (user.loginAttempts + 1));
      return res.status(401).json({
        success: false,
        message: `Invalid email or password.${left > 0 ? ` ${left} attempt(s) remaining.` : ' Account will be locked.'}`,
      });
    }

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });

    await user.updateOne({
      loginAttempts: 0,
      $unset: { lockUntil: 1 },
      lastLogin:   new Date(),
      lastLoginIP: req.clientIP || '',
    });

    // const token = genToken(user._id);
    const token = genToken(user._id, user.role);

    await audit(user._id, 'LOGIN', 'success', { email }, req);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id:          user._id,
        role: user.role,
        firstName:   user.firstName,
        lastName:    user.lastName,
        email:       user.email,
        phone:       user.phone,
        accountNumber: user.accountNumber,
        accountType:   user.accountType,
        savingsBalance: user.savingsBalance,
        currentBalance: user.currentBalance,
        totalBalance:   user.totalBalance,
        rewardPoints:   user.rewardPoints,
        tier:           user.tier,
        kycStatus:      user.kycStatus,
        isFrozen:       user.isFrozen,
        riskLevel:      user.riskLevel,
        riskScore:      user.riskScore,
        createdAt:      user.createdAt,
        lastLogin:      user.lastLogin,
        avgTransactionAmt: user.avgTransactionAmt,
        totalTransactions: user.totalTransactions,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  await audit(req.user._id, 'LOGOUT', 'success', {}, req);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const User = getUser();
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, user });
});

// ── PUT /api/auth/change-password ─────────────────────────────────────────────
router.put('/change-password', protect, [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password needs uppercase, lowercase and number'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const User = getUser();
    const user  = await User.findById(req.user._id).select('+password');
    const match = await user.comparePassword(req.body.currentPassword);
    if (!match)
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    user.password = req.body.newPassword;
    await user.save();
    await audit(req.user._id, 'PASSWORD_CHANGE', 'success', {}, req);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Password change failed.' });
  }
});

module.exports = router;