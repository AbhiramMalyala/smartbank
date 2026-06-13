// middleware/auth.js — FIXED (lazy require to break circular dependency)
const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Authentication required. Please login.' });

    const token   = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // FIX: require User here (inside the function) to avoid circular dependency
    // routes/auth.js → middleware/auth.js → models/User.js → (back) causes User = {}
    const User = require('../models/User');
    const user = await User.findById(decoded.id).select('-password');

    if (!user)
      return res.status(401).json({ success: false, message: 'User not found.' });
    if (!user.isActive)
      return res.status(401).json({ success: false, message: 'Account deactivated.' });
    if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000)
      return res.status(401).json({ success: false, message: 'Password changed — please login again.' });

    req.user     = user;
    req.clientIP = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
                   .split(',')[0].trim();
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired. Please login again.'
      : 'Invalid token. Please login.';
    return res.status(401).json({ success: false, message: msg });
  }
};

module.exports = { protect };