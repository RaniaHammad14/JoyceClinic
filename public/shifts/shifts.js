//shifts.js
document.addEventListener('DOMContentLoaded', async () => {
  // --- تحقق من تسجيل الدخول ---
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }
  // دالة تحويل الأرقام العربية لإنجليزية
  function toEnglishNumbers(str) {
    if (!str) return str;
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const englishNums = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    let result = String(str);
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(arabicNums[i], 'g'), englishNums[i]);
    }
    return result;
  }

  const currentUser = JSON.parse(raw);
  if (!currentUser) {
    window.location.href = '/login/login.html';
    return;
  }

  // --- عرض معلومات المستخدم ---
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = currentUser.role;

  // --- المتغيرات العامة ---
  let currentShift = null;
  let shiftDurationInterval = null;

  // --- العناصر ---
  const shiftStatus = document.getElementById('shiftStatus');
  const activeShiftSection = document.getElementById('activeShiftSection');
  const closeShiftBtn = document.getElementById('closeShiftBtn');
  const refreshOpsBtn = document.getElementById('refreshOpsBtn');
  const todayReportBtn = document.getElementById('todayReportBtn');
  
  // Modals
  const closeShiftModal = document.getElementById('closeShiftModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelCloseBtn = document.getElementById('cancelCloseBtn');
  const confirmCloseBtn = document.getElementById('confirmCloseBtn');
  
  const todayReportModal = document.getElementById('todayReportModal');
  const closeTodayModalBtn = document.getElementById('closeTodayModalBtn');
  const closeTodayBtn = document.getElementById('closeTodayBtn');
  const printTodayBtn = document.getElementById('printTodayBtn');
  
  const shiftDetailsModal = document.getElementById('shiftDetailsModal');
  const closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');
  const closeDetailsBtn = document.getElementById('closeDetailsBtn');
  const printShiftBtn = document.getElementById('printShiftBtn');

  // --- بدء شيفت جديد ---
  window.startShift = async (shiftType) => {
    try {
      const response = await fetch('/api/shifts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          user_name: currentUser.name,
          shift_type: shiftType
        })
      });

      const result = await response.json();

      if (response.ok) {
        alert('✅ تم بدء الشيفت بنجاح!');
        await loadCurrentShift();
      } else {
        alert('❌ ' + (result.message || 'حدث خطأ أثناء بدء الشيفت'));
      }
    } catch (error) {
      console.error('Error starting shift:', error);
      alert('❌ حدث خطأ في الاتصال بالسيرفر');
    }
  };

  // --- جلب الشيفت الحالي ---
  async function loadCurrentShift() {
    try {
      const response = await fetch(`/api/shifts/current/${currentUser.id}`);
      
      if (!response.ok) {
        throw new Error('فشل في جلب الشيفت');
      }

      currentShift = await response.json();

      if (currentShift) {
        displayActiveShift(currentShift);
        await loadOperations();
        startDurationTimer();
        
        // مراقبة تحديث الشيفت كل 30 ثانية
        setInterval(async () => {
          await updateShiftStats();
        }, 30000);
      } else {
        displayNoShift();
      }
    } catch (error) {
      console.error('Error loading shift:', error);
      displayNoShift();
    }
  }

  // --- عرض الشيفت النشط ---
  function displayActiveShift(shift) {
    shiftStatus.style.display = 'none';
    activeShiftSection.style.display = 'flex';

    const icon = shift.shift_type === 'صباحي' ? '🌅' : '🌆';
    document.getElementById('shiftTypeIcon').textContent = icon;
    document.getElementById('shiftTypeName').textContent = shift.shift_type;

    const startTime = new Date(shift.start_time);
    document.getElementById('shiftStartTime').textContent = startTime.toLocaleString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    updateShiftDisplay(shift);
  }

// --- تحديث عرض الشيفت ---
  function updateShiftDisplay(shift) {
    document.getElementById('totalCash').textContent = toEnglishNumbers(parseFloat(shift.total_cash || 0).toFixed(2)) + ' ج';
    document.getElementById('totalWallet').textContent = toEnglishNumbers(parseFloat(shift.total_wallet || 0).toFixed(2)) + ' ج';
    document.getElementById('totalVisa').textContent = toEnglishNumbers(parseFloat(shift.total_visa || 0).toFixed(2)) + ' ج';
    document.getElementById('totalInternal').textContent = toEnglishNumbers(parseFloat(shift.total_internal || 0).toFixed(2)) + ' ج';
    document.getElementById('totalDeductions').textContent = toEnglishNumbers(parseFloat(shift.total_deductions || 0).toFixed(2)) + ' ج';
    
    const grandTotal = parseFloat(shift.total_cash || 0) + 
                      parseFloat(shift.total_wallet || 0) + 
                      parseFloat(shift.total_visa || 0);
    document.getElementById('grandTotal').textContent = toEnglishNumbers(grandTotal.toFixed(2)) + ' ج';
  }

  // --- عرض عدم وجود شيفت ---
  function displayNoShift() {
    shiftStatus.style.display = 'block';
    activeShiftSection.style.display = 'none';
    if (shiftDurationInterval) {
      clearInterval(shiftDurationInterval);
    }
  }

  // --- بدء عداد المدة ---
  function startDurationTimer() {
    if (shiftDurationInterval) {
      clearInterval(shiftDurationInterval);
    }

    shiftDurationInterval = setInterval(() => {
      if (!currentShift) return;
      
      const startTime = new Date(currentShift.start_time);
      const now = new Date();
      const diff = now - startTime;
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      document.getElementById('shiftDuration').textContent = `${hours} ساعة و ${minutes} دقيقة`;
    }, 1000);
  }

  // --- تحديث إحصائيات الشيفت ---
  async function updateShiftStats() {
    if (!currentShift) return;
    
    try {
      const response = await fetch(`/api/shifts/${currentShift.id}`);
      if (response.ok) {
        const updatedShift = await response.json();
        currentShift = updatedShift;
        updateShiftDisplay(updatedShift);
      }
    } catch (error) {
      console.error('Error updating shift stats:', error);
    }
  }

  // --- جلب العمليات ---
  async function loadOperations() {
    if (!currentShift) return;

    const operationsList = document.getElementById('operationsList');

    try {
      const response = await fetch(`/api/shifts/${currentShift.id}/operations`);
      
      if (!response.ok) {
        throw new Error('فشل في جلب العمليات');
      }

      const operations = await response.json();

      if (operations.length === 0) {
        operationsList.innerHTML = `
          <div class="empty-ops">
            <div class="empty-icon">📋</div>
            <p>لا توجد عمليات بعد</p>
            <small>جميع العمليات ستظهر هنا تلقائياً</small>
          </div>
        `;
        return;
      }

      displayOperations(operations);
    } catch (error) {
      console.error('Error loading operations:', error);
      operationsList.innerHTML = `
        <div class="empty-ops">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل العمليات</p>
        </div>
      `;
    }
  }

// --- عرض العمليات ---
  function displayOperations(operations) {
    const operationsList = document.getElementById('operationsList');

    const html = operations.map(op => {
      const time = new Date(op.operation_time).toLocaleString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const amount = toEnglishNumbers(parseFloat(op.amount || 0).toFixed(2));

      // إضافة رابط للحجز إذا كان موجوداً
      let bookingLink = '';
      if (op.booking_id) {
        bookingLink = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0;">
          🔗 <a href="/schedule/schedule.html?booking_id=${op.booking_id}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600;">
            عرض الحجز #${toEnglishNumbers(op.booking_id)}
          </a>
        </div>`;
      }

      return `
        <div class="operation-card">
          <div class="operation-header">
            <div class="operation-type">${op.operation_type}</div>
            <div class="operation-amount">${amount} ج</div>
          </div>
          <div class="operation-details">
            ${op.client_name ? `<div>👤 ${op.client_name}</div>` : ''}
            ${op.client_phone ? `<div>📱 ${toEnglishNumbers(op.client_phone)}</div>` : ''}
            ${op.payment_method ? `<div>💳 ${op.payment_method}</div>` : ''}
            ${op.balance_type ? `<div>💰 ${op.balance_type}</div>` : ''}
            ${op.description ? `<div>📝 ${op.description}</div>` : ''}
            ${bookingLink}
          </div>
          <div class="operation-time">🕐 ${toEnglishNumbers(time)}</div>
        </div>
      `;
    }).join('');

    operationsList.innerHTML = html;
  }

  // --- تحديث العمليات ---
  refreshOpsBtn.addEventListener('click', async () => {
    await loadOperations();
  });

  // --- فتح نافذة إغلاق الشيفت ---
closeShiftBtn.addEventListener('click', () => {
    if (!currentShift) return;

    // تحديث الملخص
    document.getElementById('summCash').textContent = toEnglishNumbers(parseFloat(currentShift.total_cash || 0).toFixed(2)) + ' ج';
    document.getElementById('summWallet').textContent = toEnglishNumbers(parseFloat(currentShift.total_wallet || 0).toFixed(2)) + ' ج';
    document.getElementById('summVisa').textContent = toEnglishNumbers(parseFloat(currentShift.total_visa || 0).toFixed(2)) + ' ج';
    document.getElementById('summInternal').textContent = toEnglishNumbers(parseFloat(currentShift.total_internal || 0).toFixed(2)) + ' ج';
    document.getElementById('summDeductions').textContent = toEnglishNumbers(parseFloat(currentShift.total_deductions || 0).toFixed(2)) + ' ج';
    
    const grandTotal = parseFloat(currentShift.total_cash || 0) + 
                      parseFloat(currentShift.total_wallet || 0) + 
                      parseFloat(currentShift.total_visa || 0);
    document.getElementById('summTotal').textContent = toEnglishNumbers(grandTotal.toFixed(2)) + ' ج';

    document.getElementById('closeNotes').value = '';
    document.getElementById('closeMessage').style.display = 'none';
    closeShiftModal.setAttribute('aria-hidden', 'false');
  });

  // --- تأكيد إغلاق الشيفت ---
  confirmCloseBtn.addEventListener('click', async () => {
    if (!currentShift) return;

    const notes = document.getElementById('closeNotes').value.trim();

    confirmCloseBtn.disabled = true;
    confirmCloseBtn.innerHTML = '<span>⏳</span> جاري الإغلاق...';

    try {
      const response = await fetch(`/api/shifts/${currentShift.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes })
      });

      const result = await response.json();

      if (response.ok) {
        showCloseMessage('✅ تم إغلاق الشيفت بنجاح', 'success');
        setTimeout(() => {
          closeShiftModal.setAttribute('aria-hidden', 'true');
          currentShift = null;
          displayNoShift();
        }, 1500);
      } else {
        showCloseMessage('❌ ' + (result.message || 'حدث خطأ أثناء إغلاق الشيفت'), 'error');
      }
    } catch (error) {
      console.error('Error closing shift:', error);
      showCloseMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      confirmCloseBtn.disabled = false;
      confirmCloseBtn.innerHTML = '<span>🔒</span> إغلاق الشيفت';
    }
  });

  function showCloseMessage(text, type) {
    const msg = document.getElementById('closeMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- إغلاق النوافذ ---
  closeModalBtn.addEventListener('click', () => {
    closeShiftModal.setAttribute('aria-hidden', 'true');
  });

  cancelCloseBtn.addEventListener('click', () => {
    closeShiftModal.setAttribute('aria-hidden', 'true');
  });

  closeTodayModalBtn.addEventListener('click', () => {
    todayReportModal.setAttribute('aria-hidden', 'true');
  });

  closeTodayBtn.addEventListener('click', () => {
    todayReportModal.setAttribute('aria-hidden', 'true');
  });

  closeDetailsModalBtn.addEventListener('click', () => {
    shiftDetailsModal.setAttribute('aria-hidden', 'true');
  });

  closeDetailsBtn.addEventListener('click', () => {
    shiftDetailsModal.setAttribute('aria-hidden', 'true');
  });

  // --- فتح تقرير اليوم ---
  todayReportBtn.addEventListener('click', async () => {
    const todayDate = new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    document.getElementById('todayDate').textContent = todayDate;
    document.getElementById('todayReportContent').innerHTML = '<div class="loading">⏳ جاري التحميل...</div>';
    todayReportModal.setAttribute('aria-hidden', 'false');

    try {
      const response = await fetch('/api/shifts/today');
      
      if (!response.ok) {
        throw new Error('فشل في جلب التقرير');
      }

      const shifts = await response.json();
      displayTodayReport(shifts);
    } catch (error) {
      console.error('Error loading today report:', error);
      document.getElementById('todayReportContent').innerHTML = `
        <div class="empty-ops">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل التقرير</p>
        </div>
      `;
    }
  });

  // --- عرض تقرير اليوم ---
  function displayTodayReport(shifts) {
    const content = document.getElementById('todayReportContent');

    if (shifts.length === 0) {
      content.innerHTML = `
        <div class="empty-ops">
          <div class="empty-icon">📋</div>
          <p>لا توجد شيفتات لليوم</p>
        </div>
      `;
      return;
    }

    // حساب الإجماليات
const totals = shifts.reduce((acc, shift) => {
      acc.cash += parseFloat(shift.total_cash || 0);
      acc.wallet += parseFloat(shift.total_wallet || 0);
      acc.visa += parseFloat(shift.total_visa || 0);
      acc.internal += parseFloat(shift.total_internal || 0);
      acc.deductions += parseFloat(shift.total_deductions || 0);
      return acc;
    }, { cash: 0, wallet: 0, visa: 0, internal: 0, deductions: 0 });

    const grandTotal = totals.cash + totals.wallet + totals.visa;

    const html = `
      <div class="report-summary">
        <h4>إجمالي اليوم</h4>
        <div class="summary-grid">
          <div class="summary-row">
            <span>💵 نقدي:</span>
            <strong>${toEnglishNumbers(totals.cash.toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>📱 محفظة:</span>
            <strong>${toEnglishNumbers(totals.wallet.toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>💳 فيزا:</span>
            <strong>${toEnglishNumbers(totals.visa.toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>🔄 تحويل داخلي:</span>
            <strong>${toEnglishNumbers(totals.internal.toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>➖ خصومات:</span>
            <strong>${toEnglishNumbers(totals.deductions.toFixed(2))} ج</strong>
          </div>
          <div class="summary-row total">
            <span>💰 الإجمالي:</span>
            <strong>${toEnglishNumbers(grandTotal.toFixed(2))} ج</strong>
          </div>
        </div>
      </div>
      
      <h4 style="margin-bottom: 16px;">الشيفتات (${toEnglishNumbers(shifts.length)})</h4>
      ${shifts.map(shift => {
        const startTime = new Date(shift.start_time).toLocaleString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        
        const endTime = shift.end_time ? new Date(shift.end_time).toLocaleString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }) : '--';

        const shiftTotal = parseFloat(shift.total_cash || 0) + 
                          parseFloat(shift.total_wallet || 0) + 
                          parseFloat(shift.total_visa || 0);

        const icon = shift.shift_type === 'صباحي' ? '🌅' : '🌆';
        const statusClass = shift.status === 'open' ? 'open' : 'closed';
        const statusText = shift.status === 'open' ? 'مفتوح' : 'مغلق';

        return `
          <div class="report-shift-card" onclick="viewShiftDetails(${shift.id})">
            <div class="shift-card-header">
              <div class="shift-card-title">
                <span>${icon}</span>
                ${shift.shift_type} - ${shift.user_name}
              </div>
              <span class="shift-card-status ${statusClass}">${statusText}</span>
            </div>
            <div class="shift-card-totals">
              <div><span>🕐 البداية:</span> <strong>${toEnglishNumbers(startTime)}</strong></div>
              <div><span>🕐 النهاية:</span> <strong>${toEnglishNumbers(endTime)}</strong></div>
              <div><span>💵 نقدي:</span> <strong>${toEnglishNumbers(parseFloat(shift.total_cash || 0).toFixed(2))} ج</strong></div>
              <div><span>📱 محفظة:</span> <strong>${toEnglishNumbers(parseFloat(shift.total_wallet || 0).toFixed(2))} ج</strong></div>
              <div><span>💳 فيزا:</span> <strong>${toEnglishNumbers(parseFloat(shift.total_visa || 0).toFixed(2))} ج</strong></div>
              <div><span>💰 الإجمالي:</span> <strong>${toEnglishNumbers(shiftTotal.toFixed(2))} ج</strong></div>
            </div>
          </div>
        `;
      }).join('')}
    `;
    
    content.innerHTML = html;
  }

  // --- عرض تفاصيل شيفت ---
  window.viewShiftDetails = async (shiftId) => {
    document.getElementById('shiftDetailsContent').innerHTML = '<div class="loading">⏳ جاري التحميل...</div>';
    shiftDetailsModal.setAttribute('aria-hidden', 'false');

    try {
      const [shiftRes, opsRes] = await Promise.all([
        fetch(`/api/shifts/${shiftId}`),
        fetch(`/api/shifts/${shiftId}/operations`)
      ]);

      if (!shiftRes.ok || !opsRes.ok) {
        throw new Error('فشل في جلب التفاصيل');
      }

      const shift = await shiftRes.json();
      const operations = await opsRes.json();

      displayShiftDetails(shift, operations);
    } catch (error) {
      console.error('Error loading shift details:', error);
      document.getElementById('shiftDetailsContent').innerHTML = `
        <div class="empty-ops">
          <div class="empty-icon">❌</div>
          <p>حدث خطأ أثناء تحميل التفاصيل</p>
        </div>
      `;
    }
  };
  

// --- عرض تفاصيل الشيفت ---
  function displayShiftDetails(shift, operations) {
    const content = document.getElementById('shiftDetailsContent');

    const startTime = new Date(shift.start_time).toLocaleString('ar-EG');
    const endTime = shift.end_time ? new Date(shift.end_time).toLocaleString('ar-EG') : '--';
    const icon = shift.shift_type === 'صباحي' ? '🌅' : '🌆';
    const shiftTotal = parseFloat(shift.total_cash || 0) + 
                      parseFloat(shift.total_wallet || 0) + 
                      parseFloat(shift.total_visa || 0);

    const html = `
      <div class="print-header" style="text-align: center; margin-bottom: 24px;">
        <h2>💅 Joyce Beauty Salon</h2>
        <p>تقرير شيفت ${shift.shift_type}</p>
      </div>
      
      <div class="shift-summary">
        <h4>معلومات الشيفت</h4>
        <div class="summary-grid">
          <div class="summary-row">
            <span>الموظف:</span>
            <strong>${shift.user_name}</strong>
          </div>
          <div class="summary-row">
            <span>النوع:</span>
            <strong>${icon} ${shift.shift_type}</strong>
          </div>
          <div class="summary-row">
            <span>البداية:</span>
            <strong>${toEnglishNumbers(startTime)}</strong>
          </div>
          <div class="summary-row">
            <span>النهاية:</span>
            <strong>${toEnglishNumbers(endTime)}</strong>
          </div>
        </div>
      </div>
      
      <div class="shift-summary">
        <h4>الإجماليات</h4>
        <div class="summary-grid">
          <div class="summary-row">
            <span>💵 نقدي:</span>
            <strong>${toEnglishNumbers(parseFloat(shift.total_cash || 0).toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>📱 محفظة:</span>
            <strong>${toEnglishNumbers(parseFloat(shift.total_wallet || 0).toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>💳 فيزا:</span>
            <strong>${toEnglishNumbers(parseFloat(shift.total_visa || 0).toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>🔄 تحويل داخلي:</span>
            <strong>${toEnglishNumbers(parseFloat(shift.total_internal || 0).toFixed(2))} ج</strong>
          </div>
          <div class="summary-row">
            <span>➖ خصومات:</span>
            <strong>${toEnglishNumbers(parseFloat(shift.total_deductions || 0).toFixed(2))} ج</strong>
          </div>
          <div class="summary-row total">
            <span>💰 الإجمالي:</span>
            <strong>${toEnglishNumbers(shiftTotal.toFixed(2))} ج</strong>
          </div>
        </div>
      </div>
      
      ${shift.notes ? `
        <div class="shift-summary">
          <h4>ملاحظات</h4>
          <p>${shift.notes}</p>
        </div>
      ` : ''}
      
      <div style="margin-top: 24px;">
        <h4 style="margin-bottom: 16px;">العمليات (${toEnglishNumbers(operations.length)})</h4>
        ${operations.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">لا توجد عمليات</p>' : 
          operations.map(op => {
            const time = new Date(op.operation_time).toLocaleString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
            
            // إضافة رابط للحجز إذا كان موجوداً
            let bookingLink = '';
            if (op.booking_id) {
              bookingLink = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0;">
                🔗 <a href="/schedule/schedule.html?booking_id=${op.booking_id}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600;">
                  عرض الحجز #${toEnglishNumbers(op.booking_id)}
                </a>
              </div>`;
            }
            
            return `
              <div class="operation-card">
                <div class="operation-header">
                  <div class="operation-type">${op.operation_type}</div>
                  <div class="operation-amount">${toEnglishNumbers(parseFloat(op.amount || 0).toFixed(2))} ج</div>
                </div>
                <div class="operation-details">
                  ${op.client_name ? `<div>👤 ${op.client_name}</div>` : ''}
                  ${op.client_phone ? `<div>📱 ${toEnglishNumbers(op.client_phone)}</div>` : ''}
                  ${op.payment_method ? `<div>💳 ${op.payment_method}</div>` : ''}
                  ${op.balance_type ? `<div>💰 ${op.balance_type}</div>` : ''}
                  ${op.description ? `<div>📝 ${op.description}</div>` : ''}
                  ${bookingLink}
                </div>
                <div class="operation-time">🕐 ${toEnglishNumbers(time)}</div>
              </div>
            `;
          }).join('')
        }
      </div>
    `;

    content.innerHTML = html;
  }
  

  // --- طباعة ---
  printTodayBtn.addEventListener('click', () => {
    window.print();
  });

  printShiftBtn.addEventListener('click', () => {
    window.print();
  });

  // --- حفظ تقرير اليوم في الخزنة ---
  const saveTreasuryReportBtn = document.getElementById('saveTreasuryReportBtn');

  if (saveTreasuryReportBtn) {
    saveTreasuryReportBtn.addEventListener('click', async () => {
      if (!confirm('هل تريد حفظ تقرير شيفتات اليوم في الخزنة؟')) return;

      saveTreasuryReportBtn.disabled = true;
      saveTreasuryReportBtn.innerHTML = '<span>⏳</span> جاري الحفظ...';

      try {
        // جلب شيفتات اليوم
        const shiftsRes = await fetch('/api/shifts/today');
        if (!shiftsRes.ok) throw new Error('فشل في جلب شيفتات اليوم');
        
        const shifts = await shiftsRes.json();

        if (shifts.length === 0) {
          alert('⚠️ لا توجد شيفتات لحفظها اليوم');
          return;
        }

        // حساب الإجماليات
        const totals = shifts.reduce((acc, shift) => {
          acc.cash += parseFloat(shift.total_cash || 0);
          acc.wallet += parseFloat(shift.total_wallet || 0);
          acc.visa += parseFloat(shift.total_visa || 0);
          acc.internal += parseFloat(shift.total_internal || 0);
          return acc;
        }, { cash: 0, wallet: 0, visa: 0, internal: 0 });

        // حفظ في الخزنة
        const saveRes = await fetch('/api/treasury/save-daily-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: new Date().toISOString().split('T')[0],
            total_cash: totals.cash,
            total_wallet: totals.wallet,
            total_visa: totals.visa,
            total_internal: totals.internal,
            shifts_count: shifts.length,
            saved_by: currentUser.name
          })
        });

        const result = await saveRes.json();

        if (saveRes.ok) {
          alert('✅ تم حفظ التقرير في الخزنة بنجاح!\n\n' +
                `💵 نقدي: ${totals.cash.toFixed(2)} ج\n` +
                `📱 محفظة: ${totals.wallet.toFixed(2)} ج\n` +
                `💳 فيزا: ${totals.visa.toFixed(2)} ج\n` +
                `💰 الإجمالي: ${(totals.cash + totals.wallet + totals.visa).toFixed(2)} ج`);
        } else {
          alert('❌ ' + result.message);
        }
      } catch (error) {
        console.error('Error saving to treasury:', error);
        alert('❌ حدث خطأ أثناء الحفظ في الخزنة');
      } finally {
        saveTreasuryReportBtn.disabled = false;
        saveTreasuryReportBtn.innerHTML = '<span>💾</span> حفظ في الخزنة';
      }
    });
  }

  // --- تحميل الشيفت الحالي عند فتح الصفحة ---
  await loadCurrentShift();

  console.log('✅ تم تحميل صفحة الشيفتات بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
  
});