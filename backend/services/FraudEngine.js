// services/FraudEngine.js
/**
 * ╔══════════════════════════════════════════════════════╗
 *  SmartBank — Advanced Fraud Detection Engine v2.0
 *  24 Rules | Behavioral Profiling | Velocity Analysis
 * ╚══════════════════════════════════════════════════════╝
 *
 *  Score Bands:
 *   0  – 24  → CLEAN   → allow (no log)
 *  25  – 49  → LOW     → flag + allow
 *  50  – 74  → MEDIUM  → flag + allow + review queue
 *  75  – 89  → HIGH    → flag + allow + urgent review
 *  90  – 100 → CRITICAL→ BLOCK (money never moves)
 */

const Transaction = require('../models/Transaction');
const FraudAlert  = require('../models/FraudAlert');
const User        = require('../models/User');

// ── Configurable Thresholds ───────────────────────────────────────────────────
const T = {
  AMT_LARGE:        50000,
  AMT_VERY_LARGE:  200000,
  AMT_CRITICAL:    500000,
  RAPID_MIN:           10,   // minutes window for rapid-fire check
  RAPID_MAX:            3,   // max txns allowed in that window
  HOURLY_MAX:           6,
  DAILY_MAX_COUNT:     25,
  DAILY_MAX_VOLUME: 500000,
  OFF_HOURS_START:     23,
  OFF_HOURS_END:        5,
  DEEP_NIGHT_START:     1,
  DEEP_NIGHT_END:       4,
  NEW_ACCT_DAYS:       30,
  VERY_NEW_DAYS:        7,
  DEVIATION_MULT:       3,   // X times user's average = behavioral anomaly
  DRAIN_PCT:           70,   // draining >70% of balance
  BLOCK_SCORE:         90,
  REVIEW_SCORE:        50,
  FLAG_SCORE:          25,
};

// ── Rule Registry ─────────────────────────────────────────────────────────────
const RULES = {
  R001: { name: 'Critical Amount',          severity: 'critical' },
  R002: { name: 'Very Large Amount',        severity: 'high'     },
  R003: { name: 'Large Amount',             severity: 'medium'   },
  R004: { name: 'Round Number Suspicion',   severity: 'low'      },
  R005: { name: 'Off-Hours Transfer',       severity: 'low'      },
  R006: { name: 'Deep Night Transfer',      severity: 'medium'   },
  R007: { name: 'Rapid-Fire Velocity',      severity: 'high'     },
  R008: { name: 'High Hourly Velocity',     severity: 'medium'   },
  R009: { name: 'Daily Count Exceeded',     severity: 'medium'   },
  R010: { name: 'Daily Volume Limit',       severity: 'high'     },
  R011: { name: 'New Account Risk',         severity: 'medium'   },
  R012: { name: 'Very New Account',         severity: 'high'     },
  R013: { name: 'First-Time Recipient',     severity: 'low'      },
  R014: { name: 'Balance Drain Alert',      severity: 'high'     },
  R015: { name: 'Behavioral Anomaly',       severity: 'high'     },
  R016: { name: 'Bot/Script Detected',      severity: 'critical' },
  R017: { name: 'Blocked Recipient',        severity: 'critical' },
  R018: { name: 'Weekend Large Transfer',   severity: 'low'      },
  R019: { name: 'Frozen Account Attempt',   severity: 'critical' },
  R020: { name: 'High User Risk Profile',   severity: 'high'     },
  R021: { name: 'Account Lockout History',  severity: 'medium'   },
  R022: { name: 'Structuring Detection',    severity: 'high'     },
  R023: { name: 'Night + Large Combo',      severity: 'critical' },
  R024: { name: 'Daily Volume Surge',       severity: 'high'     },
};

// ── Helper ────────────────────────────────────────────────────────────────────
const inr = n => Number(n).toLocaleString('en-IN');

// ── Main Analyser ─────────────────────────────────────────────────────────────
async function analyse(ctx) {
  const { sender, amount, recipientEmail, transferMode, ipAddress, userAgent, deviceId } = ctx;

  const now       = new Date();
  const hour      = now.getHours();
  const dow       = now.getDay();   // 0=Sun,6=Sat
  const triggered = [];
  let   score     = 0;

  const addRule = (id, pts, desc) => {
    score += pts;
    triggered.push({
      ruleId:      id,
      ruleName:    RULES[id]?.name || id,
      description: desc,
      score:       pts,
      severity:    RULES[id]?.severity || 'medium',
    });
  };

  // ── Pre-fetch all needed data in one parallel batch ───────────────────────
  const windowAgo  = new Date(now - T.RAPID_MIN * 60 * 1000);
  const oneHrAgo   = new Date(now - 60 * 60 * 1000);
  const oneDayAgo  = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDayAgo= new Date(now - 7  * 24 * 60 * 60 * 1000);

  const [
    rapidCount, hourlyCount, dailyCount,
    dailyVolRes, prevToRecipient, recentAmts,
  ] = await Promise.all([
    Transaction.countDocuments({ userId: sender._id, type: 'debit', status: { $ne: 'blocked' }, createdAt: { $gte: windowAgo } }),
    Transaction.countDocuments({ userId: sender._id, type: 'debit', createdAt: { $gte: oneHrAgo  } }),
    Transaction.countDocuments({ userId: sender._id, type: 'debit', createdAt: { $gte: oneDayAgo } }),
    Transaction.aggregate([
      { $match: { userId: sender._id, type: 'debit', createdAt: { $gte: oneDayAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.countDocuments({ userId: sender._id, counterpartyEmail: recipientEmail }),
    Transaction.find({ userId: sender._id, type: 'debit', createdAt: { $gte: sevenDayAgo } })
               .select('amount').limit(20).lean(),
  ]);

  const dailyVolume   = dailyVolRes[0]?.total || 0;
  const accountAgeDays= (now - new Date(sender.createdAt)) / (1000 * 60 * 60 * 24);
  const totalBalance  = (sender.savingsBalance || 0) + (sender.currentBalance || 0);

  // ── R019: Frozen account ─────────────────────────────────────────────────
  if (sender.isFrozen) {
    addRule('R019', 100, `Account is frozen — ${sender.frozenReason || 'contact support'}`);
  }

  // ── R017: Blocked recipient ──────────────────────────────────────────────
  if (sender.blockedRecipients?.includes(recipientEmail)) {
    addRule('R017', 100, `${recipientEmail} is in your blocked recipients list`);
  }

  // ── R016: Bot / script detection ─────────────────────────────────────────
  if (userAgent) {
    const botRx = /curl|python-requests|python\/|wget|java\/|Scrapy|axios\/|PostmanRuntime|insomnia|httpie/i;
    if (botRx.test(userAgent)) {
      addRule('R016', 40, `Automated HTTP client detected: ${userAgent.slice(0, 60)}`);
    }
  }

  // ── R023: Deep night + large combo (must be before R006) ─────────────────
  const isDeepNight = hour >= T.DEEP_NIGHT_START && hour < T.DEEP_NIGHT_END;
  const isOffHours  = hour >= T.OFF_HOURS_START || hour < T.OFF_HOURS_END;
  if (isDeepNight && amount >= T.AMT_LARGE) {
    addRule('R023', 35, `Large transfer ₹${inr(amount)} at deep-night hour ${hour}:${String(now.getMinutes()).padStart(2,'0')}`);
  }

  // ── R001/R002/R003: Amount thresholds ────────────────────────────────────
  if      (amount >= T.AMT_CRITICAL)    addRule('R001', 45, `Critical amount ₹${inr(amount)} exceeds ₹${inr(T.AMT_CRITICAL)} threshold`);
  else if (amount >= T.AMT_VERY_LARGE)  addRule('R002', 28, `Very large amount ₹${inr(amount)} exceeds ₹${inr(T.AMT_VERY_LARGE)}`);
  else if (amount >= T.AMT_LARGE)       addRule('R003', 12, `Large amount ₹${inr(amount)} exceeds ₹${inr(T.AMT_LARGE)}`);

  // ── R004: Round number ────────────────────────────────────────────────────
  if (amount >= 10000 && amount % 1000 === 0) {
    addRule('R004', 5, `Suspicious round number: ₹${inr(amount)}`);
  }

  // ── R005/R006: Off-hours ──────────────────────────────────────────────────
  if (isDeepNight && amount < T.AMT_LARGE) {
    addRule('R006', 14, `Transfer at deep-night hour ${hour}:00 (1AM–4AM window)`);
  } else if (isOffHours && !isDeepNight) {
    addRule('R005', 8, `Transfer at off-hours ${hour}:00 (11PM–5AM window)`);
  }

  // ── R007: Rapid-fire velocity ─────────────────────────────────────────────
  if (rapidCount >= T.RAPID_MAX) {
    addRule('R007', 28, `${rapidCount} transfers in ${T.RAPID_MIN} minutes — rapid-fire pattern detected`);
  }

  // ── R008: Hourly velocity ─────────────────────────────────────────────────
  if (hourlyCount >= T.HOURLY_MAX) {
    addRule('R008', 18, `${hourlyCount} debit transactions in last hour (limit: ${T.HOURLY_MAX})`);
  }

  // ── R009: Daily count ─────────────────────────────────────────────────────
  if (dailyCount >= T.DAILY_MAX_COUNT) {
    addRule('R009', 14, `${dailyCount} debits today exceeds daily limit of ${T.DAILY_MAX_COUNT}`);
  }

  // ── R010: Daily volume ────────────────────────────────────────────────────
  if (dailyVolume + amount >= T.DAILY_MAX_VOLUME) {
    addRule('R010', 25, `Daily volume ₹${inr(dailyVolume + amount)} will exceed ₹${inr(T.DAILY_MAX_VOLUME)} daily cap`);
  }

  // ── R024: Daily surge (>50% of daily limit already hit) ──────────────────
  if (dailyVolume >= T.DAILY_MAX_VOLUME * 0.5 && dailyVolume < T.DAILY_MAX_VOLUME) {
    addRule('R024', 10, `Daily volume already at ₹${inr(dailyVolume)} — ${Math.round(dailyVolume/T.DAILY_MAX_VOLUME*100)}% of limit`);
  }

  // ── R011/R012: Account age ────────────────────────────────────────────────
  if      (accountAgeDays < T.VERY_NEW_DAYS)  addRule('R012', 22, `Very new account — only ${Math.floor(accountAgeDays)} days old`);
  else if (accountAgeDays < T.NEW_ACCT_DAYS)  addRule('R011', 10, `New account — ${Math.floor(accountAgeDays)} days old making large transfer`);

  // ── R013: First-time recipient ────────────────────────────────────────────
  if (prevToRecipient === 0) {
    addRule('R013', 8, `First ever transfer to ${recipientEmail}`);
  }

  // ── R014: Balance drain ───────────────────────────────────────────────────
  const drainPct = totalBalance > 0 ? (amount / totalBalance) * 100 : 100;
  if (drainPct >= T.DRAIN_PCT) {
    addRule('R014', 22, `Transfer drains ${drainPct.toFixed(0)}% of total balance (threshold: ${T.DRAIN_PCT}%)`);
  }

  // ── R015: Behavioral anomaly (amount >> user average) ────────────────────
  if (sender.avgTransactionAmt > 0 && amount > sender.avgTransactionAmt * T.DEVIATION_MULT) {
    const mult = (amount / sender.avgTransactionAmt).toFixed(1);
    addRule('R015', 20, `Amount ₹${inr(amount)} is ${mult}× user's average ₹${inr(Math.round(sender.avgTransactionAmt))}`);
  }

  // ── R020: High existing user risk score ───────────────────────────────────
  if (sender.riskScore >= 70) {
    addRule('R020', 14, `User has elevated risk profile (score: ${sender.riskScore}/100)`);
  }

  // ── R021: History of failed logins ───────────────────────────────────────
  if ((sender.loginAttempts || 0) >= 3) {
    addRule('R021', 10, `${sender.loginAttempts} recent failed login attempts detected`);
  }

  // ── R018: Weekend large transfer ──────────────────────────────────────────
  if ((dow === 0 || dow === 6) && amount >= T.AMT_LARGE) {
    addRule('R018', 6, `Large transfer ₹${inr(amount)} on ${dow === 0 ? 'Sunday' : 'Saturday'}`);
  }

  // ── R022: Structuring / smurfing detection ────────────────────────────────
  if (recentAmts.length >= 3) {
    const recent = recentAmts.slice(0, 6).map(t => t.amount);
    const allSimilar = recent.every(a => Math.abs(a - amount) / Math.max(amount, 1) < 0.05);
    if (allSimilar && recent.length >= 3) {
      addRule('R022', 18, `Structuring: ${recent.length} similar amounts (~₹${inr(amount)}) in 7 days — possible smurfing`);
    }
  }

  // ── Cap & classify ────────────────────────────────────────────────────────
  score = Math.min(Math.round(score), 100);

  let level, action;
  if      (score >= 90) { level = 'critical'; action = 'block';  }
  else if (score >= 75) { level = 'high';     action = 'review'; }
  else if (score >= 50) { level = 'medium';   action = 'review'; }
  else if (score >= 25) { level = 'low';      action = 'flag';   }
  else                  { level = 'clean';    action = 'allow';  }

  return {
    riskScore:      score,
    riskLevel:      level,
    action,
    shouldBlock:    action === 'block',
    shouldReview:   action === 'review',
    triggeredRules: triggered,
    flags:          triggered.map(r => r.description),
    context: {
      amount, recipientEmail, transferMode,
      hour, dayOfWeek: dow,
      ipAddress: (ipAddress || 'unknown').slice(0, 80),
      userAgent:  (userAgent  || '').slice(0, 150),
      velocityCount:  rapidCount,
      dailyVolume,
      accountAgeDays: Math.floor(accountAgeDays),
      userAvgAmount:  Math.round(sender.avgTransactionAmt || 0),
      isNewRecipient: prevToRecipient === 0,
    },
  };
}

// ── Update user behavioural profile after any transaction ─────────────────────
async function updateUserProfile(userId, amount, fraudScore) {
  const user = await User.findById(userId);
  if (!user) return;
  const n = user.totalTransactions || 0;
  user.avgTransactionAmt = ((user.avgTransactionAmt * n) + amount) / (n + 1);
  user.totalTransactions = n + 1;
  // Exponential moving average of risk score
  user.riskScore = Math.round(user.riskScore * 0.8 + fraudScore * 0.2);
  user.riskLevel = user.riskScore >= 75 ? 'critical' :
                   user.riskScore >= 50 ? 'high'     :
                   user.riskScore >= 25 ? 'medium'   : 'low';
  user.updateTier();
  await user.save();
}

// ── Persist fraud alert to DB ─────────────────────────────────────────────────
async function saveAlert(userId, transactionId, txnId, analysis) {
  if (analysis.riskLevel === 'clean') return null;
  try {
    return await FraudAlert.create({
      userId, transactionId, txnId,
      riskScore:      analysis.riskScore,
      riskLevel:      analysis.riskLevel,
      action:         analysis.action,
      triggeredRules: analysis.triggeredRules,
      flags:          analysis.flags,
      context:        analysis.context,
      status:         'open',
    });
  } catch (err) {
    console.error('FraudAlert save error:', err.message);
    return null;
  }
}

module.exports = { analyse, saveAlert, updateUserProfile };
