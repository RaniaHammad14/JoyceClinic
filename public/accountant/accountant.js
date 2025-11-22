document.addEventListener('DOMContentLoaded', async () => {
  // --- تحقق من تسجيل الدخول والصلاحيات ---
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }

  const currentUser = JSON.parse(raw);
  if (!currentUser) {
    window.location.href = '/login/login.html';
    return;
  }

  // التحقق من الصلاحيات (محاسب أو ادمن فقط)
  if (currentUser.role !== 'محاسب' && currentUser.role !== 'ادمن') {
    alert('⚠️ ليس لديك صلاحية للوصول إلى هذه الصفحة');
    window.location.href = '/Main/main.html';
    return;
  }

  // --- عرض معلومات المستخدم ---
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = currentUser.role;

  // --- إدارة التبويبات ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(targetTab + 'Tab').classList.add('active');
    });
  });

  // --- تحميل بيانات الخزنة ---
  async function loadTreasuryBalance() {
    try {
      const response = await fetch('/api/treasury/balance');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'فشل في جلب البيانات');
      }
      
      const data = await response.json();
      
      document.getElementById('statCash').textContent = data.total_cash.toFixed(2) + ' ج';
      document.getElementById('statWallet').textContent = data.total_wallet.toFixed(2) + ' ج';
      document.getElementById('statVisa').textContent = data.total_visa.toFixed(2) + ' ج';
      document.getElementById('statTotal').textContent = data.total_income.toFixed(2) + ' ج';
      document.getElementById('statCustodies').textContent = data.active_custodies.toFixed(2) + ' ج';
      document.getElementById('statExpenses').textContent = data.total_expenses.toFixed(2) + ' ج';
      document.getElementById('statAvailable').textContent = data.available_balance.toFixed(2) + ' ج';
      
    } catch (error) {
      console.error('Error loading treasury balance:', error);
      // عرض أصفار بدلاً من ترك الحقول فارغة
      document.getElementById('statCash').textContent = '0.00 ج';
      document.getElementById('statWallet').textContent = '0.00 ج';
      document.getElementById('statVisa').textContent = '0.00 ج';
      document.getElementById('statTotal').textContent = '0.00 ج';
      document.getElementById('statCustodies').textContent = '0.00 ج';
      document.getElementById('statExpenses').textContent = '0.00 ج';
      document.getElementById('statAvailable').textContent = '0.00 ج';
    }
  }

  // --- تحميل التقارير المحفوظة ---
  async function loadReports() {
    const reportsList = document.getElementById('reportsList');
    reportsList.innerHTML = '<div class="loading">⏳ جاري التحميل...</div>';

    try {
      const startDate = document.getElementById('filterStartDate').value;
      const endDate = document.getElementById('filterEndDate').value;
      
      let url = '/api/treasury/reports';
      const params = new URLSearchParams();
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('فشل في جلب التقارير');
      
      const reports = await response.json();

      if (reports.length === 0) {
        reportsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>لا توجد تقارير محفوظة</p>
            ${startDate || endDate ? '<small>جرب تغيير الفلتر</small>' : ''}
          </div>
        `;
        return;
      }

      reportsList.innerHTML = reports.map(report => {
        const date = new Date(report.report_date).toLocaleDateString('ar-EG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        const total = parseFloat(report.total_cash) + 
                     parseFloat(report.total_wallet) + 
                     parseFloat(report.total_visa);
        
        const createdAt = new Date(report.created_at).toLocaleString('ar-EG');

        return `
          <div class="report-card">
            <div class="report-header">
              <div class="report-date">📅 ${date}</div>
              <div class="report-shifts">عدد الشيفتات: ${report.shifts_count}</div>
            </div>
            <div class="report-totals">
              <div><span>💵 نقدي:</span><strong>${parseFloat(report.total_cash).toFixed(2)} ج</strong></div>
              <div><span>📱 محفظة:</span><strong>${parseFloat(report.total_wallet).toFixed(2)} ج</strong></div>
              <div><span>💳 فيزا:</span><strong>${parseFloat(report.total_visa).toFixed(2)} ج</strong></div>
              <div><span>🔄 تحويل داخلي:</span><strong>${parseFloat(report.total_internal).toFixed(2)} ج</strong></div>
              <div style="grid-column: 1 / -1; padding-top: 8px; border-top: 2px solid var(--primary); margin-top: 8px;">
                <span>💰 الإجمالي:</span><strong style="font-size: 18px;">${total.toFixed(2)} ج</strong>
              </div>
            </div>
            <div class="report-footer">
              تم الحفظ بواسطة: ${report.saved_by} • ${createdAt}
            </div>
          </div>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Error loading reports:', error);
      reportsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل التقارير</p>
        </div>
      `;
    }
  }

  // --- تحميل العهد ---
  async function loadCustodies() {
    const custodiesList = document.getElementById('custodiesList');
    custodiesList.innerHTML = '<div class="loading">⏳ جاري التحميل...</div>';

    try {
      const response = await fetch('/api/custodies');
      if (!response.ok) throw new Error('فشل في جلب العهد');
      
      const custodies = await response.json();

      if (custodies.length === 0) {
        custodiesList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔄</div>
            <p>لا توجد عهد مسجلة</p>
          </div>
        `;
        return;
      }

      custodiesList.innerHTML = custodies.map(custody => {
        const createdAt = new Date(custody.created_at).toLocaleString('ar-EG');
        const isActive = custody.status === 'active';

        return `
          <div class="custody-card ${isActive ? 'active' : 'returned'}">
            <div class="custody-info">
              <div class="custody-name">👤 ${custody.person_name}</div>
              <div class="custody-amount">${parseFloat(custody.amount).toFixed(2)} ج</div>
              ${custody.reason ? `<div class="custody-reason">📝 ${custody.reason}</div>` : ''}
              <div class="custody-meta">
                أضيفت بواسطة: ${custody.created_by} • ${createdAt}
              </div>
              ${!isActive && custody.returned_by ? `
                <div class="custody-meta" style="margin-top: 4px;">
                  استُردت بواسطة: ${custody.returned_by} • ${new Date(custody.returned_at).toLocaleString('ar-EG')}
                </div>
              ` : ''}
            </div>
            ${isActive ? 
              `<button class="return-btn" onclick="returnCustody(${custody.id})">
                <span>✅</span>
                تم الاسترداد
              </button>` : 
              `<div class="status-badge returned">
                <span>✅</span>
                تم الاسترداد
              </div>`
            }
          </div>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Error loading custodies:', error);
      custodiesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل العهد</p>
        </div>
      `;
    }
  }

  // --- تحميل المصروفات ---
  async function loadExpenses() {
    const expensesList = document.getElementById('expensesList');
    expensesList.innerHTML = '<div class="loading">⏳ جاري التحميل...</div>';

    try {
      const response = await fetch('/api/expenses');
      if (!response.ok) throw new Error('فشل في جلب المصروفات');
      
      const expenses = await response.json();

      if (expenses.length === 0) {
        expensesList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📉</div>
            <p>لا توجد مصروفات مسجلة</p>
          </div>
        `;
        return;
      }

      expensesList.innerHTML = expenses.map(expense => {
        const createdAt = new Date(expense.created_at).toLocaleString('ar-EG');

        return `
          <div class="expense-card">
            <div class="expense-amount">- ${parseFloat(expense.amount).toFixed(2)} ج</div>
            <div class="expense-reason">📝 ${expense.reason}</div>
            ${expense.taken_by ? `<div class="expense-taken">👤 أُخذ بواسطة: ${expense.taken_by}</div>` : ''}
            <div class="expense-meta">
              أضيف بواسطة: ${expense.created_by} • ${createdAt}
            </div>
          </div>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Error loading expenses:', error);
      expensesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل المصروفات</p>
        </div>
      `;
    }
  }

  // --- حفظ تقرير اليوم ---
  document.getElementById('saveDailyReportBtn').addEventListener('click', async () => {
    const modal = document.getElementById('saveDailyReportModal');
    const summary = document.getElementById('dailyReportSummary');
    modal.setAttribute('aria-hidden', 'false');
    
    summary.innerHTML = '<div class="loading">⏳ جاري جلب البيانات...</div>';

    try {
      const response = await fetch('/api/shifts/today');
      if (!response.ok) throw new Error('فشل في جلب شيفتات اليوم');
      
      const shifts = await response.json();

      if (shifts.length === 0) {
        summary.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>لا توجد شيفتات لليوم</p>
          </div>
        `;
        return;
      }

      const totals = shifts.reduce((acc, shift) => {
        acc.cash += parseFloat(shift.total_cash || 0);
        acc.wallet += parseFloat(shift.total_wallet || 0);
        acc.visa += parseFloat(shift.total_visa || 0);
        acc.internal += parseFloat(shift.total_internal || 0);
        return acc;
      }, { cash: 0, wallet: 0, visa: 0, internal: 0 });

      const grandTotal = totals.cash + totals.wallet + totals.visa;

      summary.innerHTML = `
        <h4 style="margin: 0 0 16px;">ملخص شيفتات اليوم</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 8px;">
            <span>💵 نقدي:</span><strong>${totals.cash.toFixed(2)} ج</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 8px;">
            <span>📱 محفظة:</span><strong>${totals.wallet.toFixed(2)} ج</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 8px;">
            <span>💳 فيزا:</span><strong>${totals.visa.toFixed(2)} ج</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 8px;">
            <span>🔄 تحويل داخلي:</span><strong>${totals.internal.toFixed(2)} ج</strong>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 12px; background: linear-gradient(135deg, var(--primary-light) 0%, rgba(156, 39, 176, 0.1) 100%); border-radius: 8px; font-size: 18px;">
          <span>💰 الإجمالي:</span><strong>${grandTotal.toFixed(2)} ج</strong>
        </div>
        <p style="margin-top: 12px; font-size: 14px; color: var(--text-muted);">
          عدد الشيفتات: ${shifts.length}
        </p>
      `;

      // حفظ البيانات لاستخدامها عند الحفظ
      window.todayReportData = {
        date: new Date().toISOString().split('T')[0],
        total_cash: totals.cash,
        total_wallet: totals.wallet,
        total_visa: totals.visa,
        total_internal: totals.internal,
        shifts_count: shifts.length
      };

    } catch (error) {
      console.error('Error loading today shifts:', error);
      summary.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء جلب البيانات</p>
        </div>
      `;
    }
  });

  // تأكيد حفظ التقرير
  document.getElementById('confirmSaveReportBtn').addEventListener('click', async () => {
    if (!window.todayReportData) {
      alert('⚠️ لا توجد بيانات للحفظ');
      return;
    }

    const btn = document.getElementById('confirmSaveReportBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> جاري الحفظ...';

    try {
      const response = await fetch('/api/treasury/save-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...window.todayReportData,
          saved_by: currentUser.name
        })
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('saveReportMessage', '✅ تم حفظ التقرير في الخزنة بنجاح', 'success');
        setTimeout(async () => {
          closeSaveDailyReportModal();
          await loadReports();
          await loadTreasuryBalance();
        }, 1500);
      } else {
        showMessage('saveReportMessage', '❌ ' + result.message, 'error');
      }
    } catch (error) {
      console.error('Error saving report:', error);
      showMessage('saveReportMessage', '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> حفظ في الخزنة';
    }
  });

  // --- إضافة عهدة ---
  document.getElementById('addCustodyBtn').addEventListener('click', () => {
    document.getElementById('addCustodyModal').setAttribute('aria-hidden', 'false');
  });

  document.getElementById('custodyForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const personName = document.getElementById('custodyPersonName').value.trim();
    const amount = document.getElementById('custodyAmount').value;
    const reason = document.getElementById('custodyReason').value.trim();

    if (!personName || !amount) {
      showMessage('custodyMessage', '⚠️ الاسم والمبلغ مطلوبان', 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الحفظ...';

    try {
      const response = await fetch('/api/custodies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_name: personName,
          amount: parseFloat(amount),
          reason: reason || null,
          created_by: currentUser.name
        })
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('custodyMessage', '✅ تم إضافة العهدة بنجاح', 'success');
        setTimeout(async () => {
          closeAddCustodyModal();
          await loadCustodies();
          await loadTreasuryBalance();
        }, 1500);
      } else {
        showMessage('custodyMessage', '❌ ' + result.message, 'error');
      }
    } catch (error) {
      console.error('Error adding custody:', error);
      showMessage('custodyMessage', '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💾</span> حفظ العهدة';
    }
  });

  // --- استرداد عهدة ---
  window.returnCustody = async (id) => {
    if (!confirm('هل أنت متأكد من استرداد هذه العهدة؟')) return;

    try {
      const response = await fetch(`/api/custodies/${id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returned_by: currentUser.name })
      });

      const result = await response.json();

      if (response.ok) {
        alert('✅ تم تأكيد استرداد العهدة بنجاح');
        await loadCustodies();
        await loadTreasuryBalance();
      } else {
        alert('❌ ' + result.message);
      }
    } catch (error) {
      console.error('Error returning custody:', error);
      alert('❌ حدث خطأ في الاتصال بالسيرفر');
    }
  };

  // --- إضافة مصروف ---
  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    document.getElementById('addExpenseModal').setAttribute('aria-hidden', 'false');
  });

  document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = document.getElementById('expenseAmount').value;
    const reason = document.getElementById('expenseReason').value.trim();
    const takenBy = document.getElementById('expenseTakenBy').value.trim();

    if (!amount || !reason) {
      showMessage('expenseMessage', '⚠️ المبلغ والسبب مطلوبان', 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الحفظ...';

    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          reason: reason,
          taken_by: takenBy || null,
          created_by: currentUser.name
        })
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('expenseMessage', '✅ تم إضافة المصروف بنجاح', 'success');
        setTimeout(async () => {
          closeAddExpenseModal();
          await loadExpenses();
          await loadTreasuryBalance();
        }, 1500);
      } else {
        showMessage('expenseMessage', '❌ ' + result.message, 'error');
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      showMessage('expenseMessage', '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💾</span> حفظ المصروف';
    }
  });

  // --- إغلاق النوافذ ---
  window.closeSaveDailyReportModal = () => {
    document.getElementById('saveDailyReportModal').setAttribute('aria-hidden', 'true');
    document.getElementById('saveReportMessage').style.display = 'none';
  };

  window.closeAddCustodyModal = () => {
    document.getElementById('addCustodyModal').setAttribute('aria-hidden', 'true');
    document.getElementById('custodyForm').reset();
    document.getElementById('custodyMessage').style.display = 'none';
  };

  window.closeAddExpenseModal = () => {
    document.getElementById('addExpenseModal').setAttribute('aria-hidden', 'true');
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseMessage').style.display = 'none';
  };

  // --- رسائل ---
  function showMessage(elementId, text, type) {
    const msg = document.getElementById(elementId);
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- أزرار التحديث ---
  document.getElementById('refreshReportsBtn').addEventListener('click', loadReports);
  document.getElementById('refreshCustodiesBtn').addEventListener('click', loadCustodies);
  document.getElementById('refreshExpensesBtn').addEventListener('click', loadExpenses);

  // --- أزرار الفلتر ---
  document.getElementById('applyFilterBtn').addEventListener('click', loadReports);
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    loadReports();
  });

  // --- تحميل البيانات عند فتح الصفحة ---
  await loadTreasuryBalance();
  await loadReports();
  await loadCustodies();
  await loadExpenses();

  console.log('✅ تم تحميل صفحة المحاسب بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
});