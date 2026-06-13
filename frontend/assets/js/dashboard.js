// assets/js/dashboard.js
(async () => {
  // Auth guard
  const token = localStorage.getItem('sb_token');
  const userStr = localStorage.getItem('sb_user');
  if (!token || !userStr) { window.location.href = 'login.html'; return; }
  const cachedUser = JSON.parse(userStr);

  // ── Cursor ──────────────────────────────────────────
  const cur = document.getElementById('cursor');
  const cdot = document.getElementById('cursorDot');
  if (cur) document.addEventListener('mousemove', e => {
    cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
    cdot.style.left = e.clientX + 'px'; cdot.style.top = e.clientY + 'px';
  });

  // ── Sidebar toggle ──────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  document.getElementById('sidebarToggle')?.addEventListener('click', () => sidebar.classList.toggle('open'));

  // ── Logout ──────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    Api.post('/auth/logout').finally(() => {
      localStorage.clear(); window.location.href = '../index.html';
    });
  });

  // ── Tab system ──────────────────────────────────────
  const pageTitles = { overview:'Overview', transfer:'Transfer Money', transactions:'Transactions', analytics:'Analytics', security:'Security Center', fraud:'Fraud Alerts', rewards:'Rewards', profile:'Profile' };

  window.switchTab = function(name) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const pane = document.getElementById('tab-' + name);
    if (pane) pane.classList.add('active');
    const navItem = document.querySelector(`[data-tab="${name}"]`);
    if (navItem) navItem.classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[name] || name;
    if (name === 'transactions') loadAllTxns();
    if (name === 'analytics') loadAnalytics();
    if (name === 'security') loadSecurity();
    if (name === 'fraud') loadFraudAlerts();
    if (name === 'transfer') loadBeneficiaries();
    if (name === 'profile') loadProfile();
    if (name === 'rewards') loadRewards();
  };

  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); switchTab(item.dataset.tab); });
  });

  // ── Greeting ────────────────────────────────────────
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good Morning ☀' : h < 17 ? 'Good Afternoon 🌤' : 'Good Evening 🌙';
  document.getElementById('topbarGreeting').textContent = `${greeting}, ${cachedUser.firstName}`;

  // ── Gauge helper ────────────────────────────────────
  function animateGauge(fillId, needleId, scoreBigId, levelId, score) {
    const fill   = document.getElementById(fillId);
    const needle = document.getElementById(needleId);
    const scoreEl = document.getElementById(scoreBigId);
    const levelEl = document.getElementById(levelId);
    if (!fill) return;
    const totalDash = 251;
    fill.style.strokeDashoffset = totalDash - (score / 100) * totalDash;
    const deg = -90 + (score / 100) * 180;
    needle.style.transform = `rotate(${deg}deg)`;
    if (scoreEl) scoreEl.textContent = score;
    const lvls = ['Low Risk','Low Risk','Medium Risk','High Risk','Critical'];
    const colors = ['#22d47e','#22d47e','#f5a623','#ff7832','#f04a6a'];
    const idx = score >= 90 ? 4 : score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0;
    if (levelEl) { levelEl.textContent = lvls[idx]; levelEl.style.color = colors[idx]; }
    if (scoreEl) scoreEl.style.color = colors[idx];
  }

  // ── LOAD DASHBOARD DATA ─────────────────────────────
  async function loadDashboard() {
    const [dashRes, statsRes, fraudRes] = await Promise.all([
      Api.get('/user/dashboard'),
      Api.get('/transactions/stats'),
      Api.get('/fraud/my/stats')
    ]);

    if (!dashRes?.ok) return;
    const user = dashRes.data.user;
    localStorage.setItem('sb_user', JSON.stringify(user));

    // Sidebar
    const init = ((user.firstName||'U')[0] + (user.lastName||'U')[0]).toUpperCase();
    document.getElementById('sidebarAvatar').textContent = init;
    document.getElementById('sidebarName').textContent = `${user.firstName} ${user.lastName||''}`;
    document.getElementById('sidebarTier').textContent = user.tier ? (user.tier.charAt(0).toUpperCase()+user.tier.slice(1)+' Member') : '';

    // Balance
    document.getElementById('totalBalance').textContent = Number(user.totalBalance||0).toLocaleString('en-IN', {minimumFractionDigits:2});
    document.getElementById('savingsBalance').textContent = fmtINR(user.savingsBalance);
    document.getElementById('currentBalance').textContent = fmtINR(user.currentBalance);
    document.getElementById('rewardPoints').textContent = (user.rewardPoints||0) + ' pts';
    document.getElementById('accountNumber').textContent = 'Acc: ' + (user.accountNumber||'—');

    // Risk
    const riskColors = {low:'text-green',medium:'text-amber',high:'text-red',critical:'text-red',clean:'text-green'};
    const riskEl = document.getElementById('riskLevelDisplay');
    if(riskEl){riskEl.textContent=user.riskLevel||'low';riskEl.className=riskColors[user.riskLevel]||'text-green';}

    // Tier badge
    const tb = document.getElementById('tierBadge');
    if(tb){tb.textContent=(user.tier||'silver').charAt(0).toUpperCase()+(user.tier||'silver').slice(1);tb.className='badge badge-'+(user.tier||'silver');}

    // Stats
    if (statsRes?.ok) {
      const s = statsRes.data.stats;
      document.getElementById('monthSpent').textContent = fmtINR(s.monthSpent);
      document.getElementById('monthReceived').textContent = fmtINR(s.monthReceived);
      const chg = s.spentChange;
      const chgEl = document.getElementById('spentChange');
      if(chgEl){chgEl.textContent=(chg>0?'↑ '+chg+'%':'↓ '+Math.abs(chg)+'%')+' vs last month';chgEl.className='stat-sub '+(chg>0?'stat-down':'stat-up');}
    }

    // Fraud summary
    if (fraudRes?.ok) {
      const f = fraudRes.data.stats;
      document.getElementById('fraudAlertCount').textContent = f.total || 0;
      document.getElementById('blockedCount').textContent = f.blocked || 0;
      if(f.total>0){ const b = document.getElementById('alertBadge'); if(b){b.style.display='flex';b.textContent=f.total;} }
      setTimeout(() => animateGauge('gaugeFill','gaugeNeedle','riskScoreBig','riskLevelBig', fraudRes.data.profile?.riskScore||0), 500);
    }

    // Recent transactions
    loadRecentTxns();
  }

  async function loadRecentTxns() {
    const res = await Api.get('/transactions?limit=6');
    const tbody = document.getElementById('recentTxBody');
    if (!res?.ok || !res.data.transactions?.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div><p>No transactions yet</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = res.data.transactions.map(tx => `
      <tr>
        <td><div class="tx-party">${tx.counterpartyName||'—'}</div><div class="tx-id">${tx.txnId}</div></td>
        <td><span class="badge badge-${tx.type}">${tx.type}</span></td>
        <td class="amt-${tx.type}">${tx.type==='credit'?'+':'−'}${fmtINR(tx.amount)}</td>
        <td>${statusBadge(tx.status)}</td>
        <td class="tx-date">${fmtDate(tx.createdAt)}</td>
      </tr>`).join('');
  }

  // ── ALL TRANSACTIONS ─────────────────────────────────
  let txPage = 1, txTotal = 0, txPages = 1;
  let currentCat = '', currentType = '';

  async function loadAllTxns() {
    const search = document.getElementById('txSearch')?.value || '';
    const type   = document.getElementById('txFilter')?.value || '';
    const tbody  = document.getElementById('allTxBody');
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-row"><div class="spinner"></div>Loading...</div></td></tr>`;

    const params = new URLSearchParams({ limit: 15, page: txPage });
    if (type) params.set('type', type);
    if (currentCat) params.set('category', currentCat);
    if (search) params.set('search', search);

    const res = await Api.get('/transactions?' + params.toString());
    if (!res?.ok) { tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">Failed to load</td></tr>`; return; }
    txTotal = res.data.total; txPages = res.data.pages;

    if (!res.data.transactions?.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔍</div><p>No transactions found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = res.data.transactions.map(tx => `
        <tr>
          <td><div class="tx-id">${tx.txnId}</div></td>
          <td><div class="tx-party">${tx.counterpartyName||'—'}</div><div class="tx-id" style="font-size:10px">${tx.counterpartyEmail||''}</div></td>
          <td><span style="font-size:11px;color:var(--text3)">${tx.transferMode||'—'}</span></td>
          <td class="amt-${tx.type}">${tx.type==='credit'?'+':'−'}${fmtINR(tx.amount)}</td>
          <td>${scoreBar(tx.fraudScore||0)}</td>
          <td>${statusBadge(tx.status)}</td>
          <td class="tx-date">${fmtDateTime(tx.createdAt)}</td>
        </tr>`).join('');
    }

    document.getElementById('txPagination').textContent = `Showing page ${txPage} of ${txPages} (${txTotal} total)`;
    document.getElementById('txPrevBtn').disabled = txPage <= 1;
    document.getElementById('txNextBtn').disabled = txPage >= txPages;
  }

  window.changeTxPage = (dir) => { txPage = Math.max(1, Math.min(txPages, txPage + dir)); loadAllTxns(); };

  // Category chips
  document.getElementById('categoryChips')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#categoryChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active'); currentCat = chip.dataset.cat; txPage = 1; loadAllTxns();
  });
  document.getElementById('txSearch')?.addEventListener('input', () => { txPage = 1; loadAllTxns(); });
  document.getElementById('txFilter')?.addEventListener('change', () => { txPage = 1; loadAllTxns(); });

  // ── ANALYTICS ────────────────────────────────────────
  async function loadAnalytics() {
    const res = await Api.get('/transactions/stats');
    if (!res?.ok) return;
    const s = res.data.stats;
    document.getElementById('analyticsTotalSpent').textContent = fmtINR(s.monthSpent);
    document.getElementById('analyticsTotalRcvd').textContent = fmtINR(s.monthReceived);
    document.getElementById('analyticsTxnCount').textContent = s.txnCount || 0;

    const topCat = s.topCategories?.[0]?._id;
    document.getElementById('analyticsTopCat').textContent = topCat ? topCat.charAt(0).toUpperCase()+topCat.slice(1) : '—';

    const chg = s.spentChange || 0;
    const chgEl = document.getElementById('analyticsSpentChg');
    if(chgEl){chgEl.textContent=(chg>=0?'↑':'↓')+Math.abs(chg)+'% vs last month';chgEl.className='stat-sub '+(chg>0?'stat-down':'stat-up');}

    // Spend bars (30-day trend)
    const barsDiv = document.getElementById('spendBars');
    if (s.dailyTrend?.length) {
      const maxVal = Math.max(...s.dailyTrend.map(d => Math.max(d.debit||0, d.credit||0))) || 1;
      barsDiv.innerHTML = s.dailyTrend.slice(-30).map(d => {
        const h = Math.round(((d.debit||0) / maxVal) * 80);
        return `<div style="flex:1;height:${h}px;background:rgba(240,74,106,0.45);border-radius:2px 2px 0 0;min-height:2px;cursor:pointer;title='${d._id}: ₹${d.debit||0}'"></div>`;
      }).join('');
    }

    // Category breakdown
    const catDiv = document.getElementById('categoryBreakdown');
    if (s.topCategories?.length) {
      const total = s.topCategories.reduce((a,c) => a + c.total, 0) || 1;
      catDiv.innerHTML = s.topCategories.slice(0,6).map(c => {
        const pct = Math.round((c.total / total) * 100);
        return `<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span>${c._id.charAt(0).toUpperCase()+c._id.slice(1)}</span>
            <span class="text-muted">${pct}% · ${fmtINR(c.total)}</span>
          </div>
          <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px;transition:width 0.5s"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── SECURITY ─────────────────────────────────────────
  async function loadSecurity() {
    const res = await Api.get('/fraud/my/stats');
    if (!res?.ok) return;
    const { stats, profile, recentAlerts } = res.data;

    document.getElementById('secCleanCount').textContent = (stats.total - (stats.critical||0) - (stats.high||0) - (stats.medium||0)) || 0;
    document.getElementById('secFlagCount').textContent  = (stats.medium||0) + (stats.low||0);
    document.getElementById('secBlockCount').textContent = stats.blocked || 0;
    document.getElementById('secReviewCount').textContent = stats.total - stats.reviewed || 0;

    setTimeout(() => animateGauge('secGaugeFill','secGaugeNeedle','secRiskScore','secRiskLabel', profile?.riskScore||0), 300);

    const list = document.getElementById('recentAlertsList');
    if (!recentAlerts?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No recent security alerts — looking clean!</p></div>`;
      return;
    }
    list.innerHTML = recentAlerts.map(a => `
      <div class="fraud-item ${a.riskLevel}">
        <div class="fi-icon ${a.riskLevel}">${a.riskLevel==='critical'?'🚨':a.riskLevel==='high'?'⚠':'🔍'}</div>
        <div class="fi-body">
          <div class="fi-title">${(a.flags&&a.flags[0])||'Suspicious pattern detected'}</div>
          <div class="fi-meta">
            <span>${fmtDateTime(a.createdAt)}</span>
            <span>₹${(a.context?.amount||0).toLocaleString('en-IN')}</span>
            <span>${levelBadge(a.riskLevel)}</span>
          </div>
        </div>
        <div class="fi-score" style="color:${scoreColor(a.riskScore)}">${a.riskScore}/100</div>
      </div>`).join('');
  }

  // ── FRAUD ALERTS TABLE ────────────────────────────────
  let fraudLevelFilter = '';
  async function loadFraudAlerts() {
    const tbody = document.getElementById('fraudAlertsBody');
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-row"><div class="spinner"></div>Loading...</div></td></tr>`;
    const params = fraudLevelFilter ? `?level=${fraudLevelFilter}` : '';
    const res = await Api.get('/fraud/my/alerts' + params);
    if (!res?.ok || !res.data.alerts?.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">✅</div><p>No fraud alerts${fraudLevelFilter?' for '+fraudLevelFilter+' level':''}</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = res.data.alerts.map(a => `
      <tr>
        <td><div class="tx-id">${a.alertId}</div></td>
        <td class="tx-date">${fmtDateTime(a.createdAt)}</td>
        <td class="${a.action==='block'?'amt-debit':''}">${fmtINR(a.context?.amount)}</td>
        <td>${scoreBar(a.riskScore)}</td>
        <td>${levelBadge(a.riskLevel)}</td>
        <td>${actionBadge(a.action)}</td>
        <td style="max-width:200px">
          <div style="display:flex;flex-wrap:wrap;gap:3px">
            ${(a.triggeredRules||[]).slice(0,2).map(r=>`<span style="font-size:9px;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);white-space:nowrap">${r.ruleName}</span>`).join('')}
            ${(a.triggeredRules||[]).length>2?`<span style="font-size:9px;color:var(--text3)">+${a.triggeredRules.length-2}</span>`:''}
          </div>
        </td>
        <td><span class="badge ${a.status==='open'?'badge-medium':'badge-completed'}">${a.status}</span></td>
      </tr>`).join('');
  }

  // Fraud level filter chips
  document.getElementById('tab-fraud')?.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#tab-fraud .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active'); fraudLevelFilter = chip.dataset.level; loadFraudAlerts();
    });
  });

  // ── BENEFICIARIES ─────────────────────────────────────
  async function loadBeneficiaries() {
    const res = await Api.get('/user/beneficiaries');
    const div = document.getElementById('benList');
    if (!res?.ok || !res.data.beneficiaries?.length) {
      div.innerHTML = `<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">No saved beneficiaries yet.</div>`; return;
    }
    div.innerHTML = res.data.beneficiaries.slice(0,5).map(b => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:var(--radius);cursor:pointer;transition:background 0.2s"
        onclick="document.getElementById('txRecipient').value='${b.email}'"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--teal-dim);color:var(--teal);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${b.name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.name}</div>
          <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.email}</div>
        </div>
        ${b.isTrusted ? '<span style="font-size:9px;color:var(--teal)">Trusted</span>' : ''}
      </div>`).join('');
  }

  // ── TRANSFER ─────────────────────────────────────────
  document.getElementById('transferForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('txBtn');
    btn.querySelector('span').textContent = '🔍 Analysing risk...'; btn.disabled = true;
    ['txError','txSuccess','txWarn','txBlocked'].forEach(id => {
      const el = document.getElementById(id);
      if(el){el.classList.remove('show');if(el.classList.contains('alert-blocked'))el.style.display='none';}
    });
    document.getElementById('txFraudInfo').style.display = 'none';

    const body = {
      recipientEmail:   document.getElementById('txRecipient').value.trim(),
      amount:           parseFloat(document.getElementById('txAmount').value),
      transferMode:     document.getElementById('txMode').value,
      category:         document.getElementById('txCategory').value,
      note:             document.getElementById('txNote').value.trim(),
      saveAsBeneficiary: document.getElementById('saveBen').checked
    };

    const res = await Api.post('/transactions/transfer', body);
    btn.querySelector('span').textContent = 'Secure Transfer'; btn.disabled = false;

    if (!res) return;

    if (res.status === 403 && res.data.blocked) {
      // BLOCKED
      const blkEl = document.getElementById('txBlocked');
      blkEl.style.display = 'block'; blkEl.classList.add('show');
      document.getElementById('txBlockedDetails').innerHTML = `
        <div style="margin-bottom:8px;font-size:12px;color:var(--text2)">${res.data.message}</div>
        <div style="margin-bottom:6px"><strong>Risk Score:</strong> <span style="color:var(--red)">${res.data.fraudScore}/100</span> &nbsp;|&nbsp; <strong>Level:</strong> ${res.data.riskLevel?.toUpperCase()}</div>
        <strong style="display:block;margin-bottom:4px;font-size:11px">Rules Triggered:</strong>
        ${(res.data.rules||[]).map(r=>`<div style="font-size:11px;padding:3px 0;border-bottom:1px solid rgba(240,74,106,0.1)">⚡ ${r.name}: ${r.description}</div>`).join('')}
        <div style="margin-top:10px;font-size:10px;color:var(--text3)">${res.data.supportMessage}</div>
        <div style="margin-top:6px;font-size:10px;color:var(--text3)">Transaction ID: ${res.data.txnId}</div>`;
      return;
    }

    if (!res.ok) {
      showAlert('txError', res.data.message || 'Transfer failed.'); return;
    }

    // SUCCESS
    showAlert('txSuccess', `✓ ${fmtINR(body.amount)} transferred! TxnID: ${res.data.txnId} · Points earned: ${res.data.rewardPointsEarned}`, 'success');
    document.getElementById('transferForm').reset();

    // Show fraud info if flagged
    if (res.data.fraud?.flagged) {
      const fd = document.getElementById('txFraudInfo');
      fd.style.display = 'block';
      document.getElementById('txFraudDetails').innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <span>Risk Score: <strong style="color:${scoreColor(res.data.fraud.score)}">${res.data.fraud.score}/100</strong></span>
          <span>Level: ${levelBadge(res.data.fraud.level)}</span>
          <span>Rules: <strong>${res.data.fraud.rulesTriggered}</strong></span>
        </div>
        ${res.data.warning ? `<div style="margin-top:6px;color:var(--amber)">${res.data.warning}</div>` : ''}`;
    }
    loadDashboard();
  });

  // ── PROFILE ──────────────────────────────────────────
  async function loadProfile() {
    const res = await Api.get('/user/dashboard');
    if (!res?.ok) return;
    const u = res.data.user;
    document.getElementById('pfFirst').value = u.firstName || '';
    document.getElementById('pfLast').value  = u.lastName  || '';
    document.getElementById('pfEmail').value = u.email     || '';
    document.getElementById('pfPhone').value = u.phone     || '';
    document.getElementById('pfAccNum').value = u.accountNumber || '';
    document.getElementById('pfAccType').value = u.accountType || '';
    document.getElementById('pfSince').value   = fmtDate(u.createdAt);
    document.getElementById('profileFullName').textContent = `${u.firstName} ${u.lastName||''}`;
    document.getElementById('profileEmail2').textContent   = u.email;
    document.getElementById('profileAvatar').textContent   = ((u.firstName||'U')[0]+(u.lastName||'U')[0]).toUpperCase();
    document.getElementById('kycStatus').textContent       = u.kycStatus || 'pending';
    const tb = document.getElementById('profileTierBadge');
    if(tb){tb.textContent=(u.tier||'silver').charAt(0).toUpperCase()+(u.tier||'silver').slice(1);tb.className='badge badge-'+(u.tier||'silver');}
  }

  window.enableEdit = () => {
    ['pfFirst','pfLast','pfPhone'].forEach(id => document.getElementById(id).removeAttribute('readonly'));
    document.getElementById('editProfileBtn').style.display   = 'none';
    document.getElementById('saveProfileBtn').style.display   = 'inline-flex';
    document.getElementById('cancelEditBtn').style.display    = 'inline-flex';
  };
  window.cancelEdit = () => {
    ['pfFirst','pfLast','pfPhone'].forEach(id => document.getElementById(id).setAttribute('readonly',''));
    document.getElementById('editProfileBtn').style.display   = 'inline-flex';
    document.getElementById('saveProfileBtn').style.display   = 'none';
    document.getElementById('cancelEditBtn').style.display    = 'none';
  };
  window.saveProfile = async () => {
    const res = await Api.put('/user/profile', {
      firstName: document.getElementById('pfFirst').value,
      lastName:  document.getElementById('pfLast').value,
      phone:     document.getElementById('pfPhone').value
    });
    if (res?.ok) { showAlert('profileSuccess', '✓ Profile updated successfully!', 'success'); cancelEdit(); loadDashboard(); }
    else showAlert('profileError', res?.data?.message || 'Update failed.');
  };

  // Change password
  document.getElementById('changePwdForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const res = await Api.put('/auth/change-password', {
      currentPassword: document.getElementById('curPwd').value,
      newPassword:     document.getElementById('newPwd').value
    });
    if (res?.ok) { showAlert('pwdSuccess', '✓ Password changed!', 'success'); e.target.reset(); }
    else showAlert('pwdError', res?.data?.message || 'Failed to change password.');
  });

  // ── REWARDS ──────────────────────────────────────────
  async function loadRewards() {
    const res = await Api.get('/user/dashboard');
    if (!res?.ok) return;
    const u = res.data.user;
    document.getElementById('rewardPointsBig').textContent = u.rewardPoints || 0;
    const tierDiv = document.getElementById('tierDisplay');
    const tiers = [
      {name:'Silver',color:'#94a3b8',req:'₹0',pts:'1x'},
      {name:'Gold',color:'#fbbf24',req:'₹1,00,000+',pts:'1.5x'},
      {name:'Platinum',color:'#a78bfa',req:'₹5,00,000+',pts:'2x'},
      {name:'Diamond',color:'#0fd4c8',req:'₹10,00,000+',pts:'3x'}
    ];
    tierDiv.innerHTML = tiers.map(t => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div style="width:10px;height:10px;border-radius:50%;background:${t.color};flex-shrink:0"></div>
        <span style="color:${t.name.toLowerCase()===u.tier?t.color:'var(--text2)'};font-weight:${t.name.toLowerCase()===u.tier?'600':'400'}">${t.name} ${t.name.toLowerCase()===u.tier?'← You':''}</span>
        <span class="text-muted" style="margin-left:auto">${t.req}</span>
        <span style="color:${t.color}">${t.pts} pts</span>
      </div>`).join('');
  }

  // ── INIT ─────────────────────────────────────────────
  await loadDashboard();
})();
