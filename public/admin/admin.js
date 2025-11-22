//admin.js
// التحقق من تسجيل الدخول
document.addEventListener('DOMContentLoaded', async () => {
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }

  const currentUser = JSON.parse(raw);
  
  // التحقق من أن المستخدم أدمن
  if (currentUser.role !== 'ادمن') {
    alert('⚠️ هذه الصفحة مخصصة للأدمن فقط!');
    window.location.href = '/Main/main.html';
    return;
  }

  // عرض معلومات الأدمن
  const adminName = document.getElementById('adminName');
  if (adminName) {
    adminName.textContent = currentUser.name || 'الأدمن';
  }

  // زر العودة
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = '/Main/main.html';
    });
  }

  // تحميل الحسابات
  await loadAccounts();

  // البحث والفلترة
  setupSearchAndFilter();

  // نافذة التقارير
  setupReportsModal();
});

// متغيرات عامة
let allAccounts = [];
let currentFilter = 'all';
let currentEmployeeId = null;
let currentEmployeeName = '';
let currentReportData = null;
let currentEmployeeRole = '';
// تحميل الحسابات
async function loadAccounts() {
  const accountsList = document.getElementById('accountsList');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const noResults = document.getElementById('noResults');
  
  try {
    loadingSpinner.style.display = 'block';
    accountsList.innerHTML = '';
    noResults.style.display = 'none';

    const response = await fetch('/api/accounts');
    if (!response.ok) throw new Error('فشل تحميل الحسابات');

    allAccounts = await response.json();
    
    loadingSpinner.style.display = 'none';

    if (allAccounts.length === 0) {
      noResults.style.display = 'block';
      return;
    }

    // تحديث الإحصائيات
    updateStats(allAccounts);

    // عرض الحسابات
    displayAccounts(allAccounts);

  } catch (error) {
    console.error('Error loading accounts:', error);
    loadingSpinner.style.display = 'none';
    noResults.style.display = 'block';
    alert('❌ حدث خطأ أثناء تحميل الحسابات');
  }
}

// تحديث الإحصائيات
function updateStats(accounts) {
  const total = accounts.length;
  const doctors = accounts.filter(a => a.role && a.role.includes('دكتور')).length;
  const reception = accounts.filter(a => a.role === 'استقبال').length;
  const accountants = accounts.filter(a => a.role === 'محاسب').length;

  document.getElementById('totalAccounts').textContent = total;
  document.getElementById('totalDoctors').textContent = doctors;
  document.getElementById('totalReception').textContent = reception;
  document.getElementById('totalAccountants').textContent = accountants;
}

// عرض الحسابات
function displayAccounts(accounts) {
  const accountsList = document.getElementById('accountsList');
  const noResults = document.getElementById('noResults');

  if (accounts.length === 0) {
    accountsList.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  accountsList.innerHTML = accounts.map(account => {
    const roleIcon = getRoleIcon(account.role);
    const roleColor = getRoleColor(account.role);
    const showReportsBtn = account.role === 'استقبال' || 
                       account.role === 'دكتور' || 
                       account.role === 'دكتور بشرة' || 
                       account.role === 'دكتور لايزر';

    return `
      <div class="account-card" data-role="${account.role}">
        <div class="account-header">
          <div class="account-avatar">${roleIcon}</div>
          <div class="account-info">
            <h3>${account.name}</h3>
            <span class="role-badge" style="background: ${roleColor}">${roleIcon} ${account.role}</span>
          </div>
        </div>
        <div class="account-details">
          <div class="detail-row">
            <span class="detail-icon">📱</span>
            <span class="detail-label">رقم الهاتف:</span>
            <span class="detail-value">${account.phone}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">🆔</span>
            <span class="detail-label">رقم الحساب:</span>
            <span class="detail-value">#${account.id}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">👑</span>
            <span class="detail-label">الوظيفة:</span>
            <span class="detail-value">${account.role}</span>
          </div>
        </div>
        ${showReportsBtn ? `
          <div class="account-actions">
            <button class="action-btn reports-btn" 
                    data-id="${account.id}" 
                    data-name="${account.name}" 
                    data-role="${account.role}">
              <span>📊</span>
              <span>التقارير الشهرية</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // إضافة event listeners لأزرار التقارير بعد إنشاء الـ HTML
  setTimeout(() => {
    document.querySelectorAll('.reports-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const employeeId = parseInt(this.getAttribute('data-id'));
        const employeeName = this.getAttribute('data-name');
        const employeeRole = this.getAttribute('data-role');
        openReportsModal(employeeId, employeeName, employeeRole);
      });
    });
  }, 0);
}
// أيقونات الأدوار
function getRoleIcon(role) {
  const icons = {
    'ادمن': '👑',
    'دكتور': '👩‍⚕️',
    'دكتور بشرة': '👩‍⚕️',
    'دكتور لايزر': '👩‍⚕️',
    'استقبال': '📋',
    'محاسب': '💰'
  };
  return icons[role] || '👤';
}

// ألوان الأدوار
function getRoleColor(role) {
  const colors = {
    'ادمن': 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)',
    'دكتور': 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)',
    'دكتور بشرة': 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)',
    'دكتور لايزر': 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)',
    'استقبال': 'linear-gradient(135deg, #ec407a 0%, #f48fb1 100%)',
    'محاسب': 'linear-gradient(135deg, #d81b60 0%, #f06292 100%)'
  };
  return colors[role] || 'linear-gradient(135deg, #e91e63 0%, #ff4081 100%)';
}

// البحث والفلترة
function setupSearchAndFilter() {
  const searchInput = document.getElementById('searchInput');
  const filterButtons = document.querySelectorAll('.filter-btn');

  // البحث
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      filterAccounts(query, currentFilter);
    });
  }

  // الفلتر
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentFilter = btn.getAttribute('data-filter');
      const query = searchInput.value.trim().toLowerCase();
      filterAccounts(query, currentFilter);
    });
  });
}

// فلترة الحسابات
function filterAccounts(searchQuery, roleFilter) {
  let filtered = allAccounts;

  // فلتر حسب الدور
  if (roleFilter !== 'all') {
    filtered = filtered.filter(account => account.role === roleFilter);
  }

  // فلتر حسب البحث
  if (searchQuery) {
    filtered = filtered.filter(account => {
      return account.name.toLowerCase().includes(searchQuery) ||
             account.phone.includes(searchQuery) ||
             account.role.toLowerCase().includes(searchQuery);
    });
  }

  displayAccounts(filtered);
}

// فتح نافذة التقارير
function openReportsModal(employeeId, employeeName, employeeRole) {
  currentEmployeeId = employeeId;
  currentEmployeeName = employeeName;
  // جلب المرتب المحفوظ
loadSavedSalary(employeeId);
  currentEmployeeRole = employeeRole; // إضافة الدور

  currentReportData = null;

  const modal = document.getElementById('reportsModal');
  const employeeNameEl = document.getElementById('employeeName');
  const monthSelect = document.getElementById('monthSelect');
  const reportContent = document.getElementById('reportContent');
  const emptyReport = document.getElementById('emptyReport');

  if (employeeNameEl) {
const roleText = currentEmployeeRole === 'استقبال' ? 'موظفة الاستقبال' : 
                 currentEmployeeRole === 'دكتور' ? 'الدكتور/ة' :
                 currentEmployeeRole === 'دكتور بشرة' ? 'دكتور/ة البشرة' :
                 currentEmployeeRole === 'دكتور لايزر' ? 'دكتور/ة الليزر' : 'الموظف/ة';
employeeNameEl.textContent = `${roleText}: ${employeeName}`;  }

  // تعيين الشهر الحالي
  const today = new Date();
  const currentMonth = today.toISOString().slice(0, 7);
  if (monthSelect) {
    monthSelect.value = currentMonth;
    monthSelect.max = currentMonth;
  }

  // إخفاء جميع الأقسام
  hideAllReportSections();
  if (emptyReport) emptyReport.style.display = 'block';

  modal.setAttribute('aria-hidden', 'false');
}

// إعداد نافذة التقارير
function setupReportsModal() {
  const modal = document.getElementById('reportsModal');
  const closeBtn = document.getElementById('closeReportsModal');
  const loadReportBtn = document.getElementById('loadReportBtn');
  const calculateCommissionBtn = document.getElementById('calculateCommission');
  const saveSalaryBtn = document.getElementById('saveSalary');

  // إغلاق النافذة
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.setAttribute('aria-hidden', 'true');
      resetReportModal();
    });
  }

  // إغلاق عند الضغط على الخلفية
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.setAttribute('aria-hidden', 'true');
        resetReportModal();
      }
    });
  }

  // تحميل التقرير
  if (loadReportBtn) {
    loadReportBtn.addEventListener('click', loadMonthlyReport);
  }

  // حساب العمولة
  if (calculateCommissionBtn) {
    calculateCommissionBtn.addEventListener('click', calculateCommission);
  }

  // حفظ المرتب
  if (saveSalaryBtn) {
    saveSalaryBtn.addEventListener('click', saveSalary);
  }
}
// فتح نافذة التقارير مع التحقق من البيانات
function openReportsModal(employeeId, employeeName, employeeRole) {
  // ✅ التحقق من صحة البيانات
  if (!employeeId || !employeeName || !employeeRole) {
    alert('⚠️ بيانات الموظف غير مكتملة');
    return;
  }

  const idNumber = parseInt(employeeId);
  if (isNaN(idNumber) || idNumber <= 0) {
    alert('⚠️ رقم الموظف غير صحيح: ' + employeeId);
    return;
  }

  currentEmployeeId = idNumber; // ✅ استخدم الرقم بعد التحقق
  currentEmployeeName = employeeName;
  currentEmployeeRole = employeeRole;

  // جلب المرتب المحفوظ
  loadSavedSalary(currentEmployeeId);

  currentReportData = null;

  const modal = document.getElementById('reportsModal');
  const employeeNameEl = document.getElementById('employeeName');
  const monthSelect = document.getElementById('monthSelect');
  const reportContent = document.getElementById('reportContent');
  const emptyReport = document.getElementById('emptyReport');

  if (employeeNameEl) {
    const roleText = currentEmployeeRole === 'استقبال' ? 'موظفة الاستقبال' : 
                   currentEmployeeRole === 'دكتور' ? 'الدكتور/ة' :
                   currentEmployeeRole === 'دكتور بشرة' ? 'دكتور/ة البشرة' :
                   currentEmployeeRole === 'دكتور لايزر' ? 'دكتور/ة الليزر' : 'الموظف/ة';
    employeeNameEl.textContent = `${roleText}: ${employeeName}`;
  }

  // تعيين الشهر الحالي
  const today = new Date();
  const currentMonth = today.toISOString().slice(0, 7);
  if (monthSelect) {
    monthSelect.value = currentMonth;
    monthSelect.max = currentMonth;
  }

  // إخفاء جميع الأقسام
  hideAllReportSections();
  if (emptyReport) emptyReport.style.display = 'block';

  modal.setAttribute('aria-hidden', 'false');
}

async function loadMonthlyReport() {
  const monthSelect = document.getElementById('monthSelect');
  const loadReportBtn = document.getElementById('loadReportBtn');
  const selectedMonth = monthSelect.value;

  if (!selectedMonth) {
    alert('⚠️ يرجى اختيار الشهر');
    return;
  }

  try {
    loadReportBtn.disabled = true;
    loadReportBtn.innerHTML = '<span>⏳</span><span>جاري التحميل...</span>';

    const [year, month] = selectedMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;

    let bookings = [];
    let response;

    // تحديد نوع الاستعلام حسب الدور
    if (currentEmployeeRole === 'استقبال') {
      response = await fetch(`/api/bookings/by-creator?startDate=${startDate}&endDate=${endDate}&created_by=${encodeURIComponent(currentEmployeeName)}`);
    } else {
      // ✅ استخدام الـ endpoint البديل للأطباء
      const doctorIdNumber = parseInt(currentEmployeeId);
      console.log('🔄 استخدام الـ endpoint البديل للدكتور:', doctorIdNumber);
      
      response = await fetch(`/api/v2/bookings/doctor/${doctorIdNumber}?startDate=${startDate}&endDate=${endDate}`);
    }
    
    if (!response.ok) {
      throw new Error(`فشل تحميل التقرير: ${response.status}`);
    }

    bookings = await response.json();
    
    // ⭐ تصفية الحجوزات حسب الشروط
    if (currentEmployeeRole === 'استقبال') {
      // موظفة الاستقبال: كل الحجوزات اللي عملتها
      bookings = bookings.filter(b => {
        // ⭐ الحجوزات العادية (كلها تتحسب)
        const isNormalBooking = !b.notes || !b.notes.includes('[حجز مؤجل الدفع]');
        
        // ⭐ الحجوزات المؤجلة (تتحسب بس لو تم تأكيدها أو بعد التأكيد)
        const isDeferredConfirmed = b.notes && 
                                   b.notes.includes('[حجز مؤجل الدفع]') && 
                                   (b.status === 'مؤكد' || b.status === 'بدأت' || b.status === 'انتهت');
        
        return isNormalBooking || isDeferredConfirmed;
      });
    } else {
      // الأطباء: الحجوزات المنتهية فقط
      bookings = bookings.filter(b => {
        // ⭐ الحجوزات العادية المنتهية
        const isNormalCompleted = (!b.notes || !b.notes.includes('[حجز مؤجل الدفع]')) && 
                                  b.status === 'انتهت';
        
        // ⭐ الحجوزات المؤجلة المنتهية (وكانت مؤكدة قبل كده)
        const isDeferredCompleted = b.notes && 
                                   b.notes.includes('[حجز مؤجل الدفع]') && 
                                   b.status === 'انتهت';
        
        return isNormalCompleted || isDeferredCompleted;
      });
    }

    currentReportData = { bookings };
    displayReportData(currentReportData);

    loadReportBtn.disabled = false;
    loadReportBtn.innerHTML = '<span>📈</span><span>عرض التقرير</span>';

  } catch (error) {
    console.error('❌ Error loading report:', error);
    
    currentReportData = { bookings: [] };
    displayReportData(currentReportData);
    
    loadReportBtn.disabled = false;
    loadReportBtn.innerHTML = '<span>📈</span><span>عرض التقرير</span>';
    
    alert('⚠️ تم تحميل تقرير تجريبي بسبب مشكلة تقنية');
  }
}
// عرض بيانات التقرير
function displayReportData(data) {
  const emptyReport = document.getElementById('emptyReport');
  const totalBookingsEl = document.getElementById('totalBookings');
  const totalRevenueEl = document.getElementById('totalRevenue');

  if (emptyReport) emptyReport.style.display = 'none';

  // حساب الإحصائيات
  const bookings = data.bookings || [];
  const totalBookings = bookings.length;
  const totalRevenue = bookings.reduce((sum, booking) => {
    return sum + parseFloat(booking.total_price || 0);
  }, 0);

  // عرض الإحصائيات
  if (totalBookingsEl) {
    totalBookingsEl.textContent = totalBookings;
  }

  if (totalRevenueEl) {
    totalRevenueEl.textContent = `${totalRevenue.toFixed(2)} ج`;
  }

  // إظهار أقسام الحساب
  document.querySelector('.commission-section').style.display = 'block';
  document.querySelector('.salary-section').style.display = 'block';

  // إعادة تعيين حقول الإدخال
  document.getElementById('commissionRate').value = '';
  document.getElementById('fixedSalary').value = '';
  document.getElementById('commissionResult').style.display = 'none';
  document.getElementById('salaryDisplay').style.display = 'none';
  document.getElementById('totalSalarySection').style.display = 'none';
}

// حساب العمولة
function calculateCommission() {
  if (!currentReportData) {
    alert('⚠️ يرجى تحميل التقرير أولاً');
    return;
  }

  const commissionRate = parseFloat(document.getElementById('commissionRate').value);
  
  if (!commissionRate || commissionRate < 0 || commissionRate > 100) {
    alert('⚠️ يرجى إدخال نسبة صحيحة من 0 إلى 100');
    return;
  }

  // حساب الإيرادات
  const bookings = currentReportData.bookings || [];
  const totalRevenue = bookings.reduce((sum, booking) => {
    return sum + parseFloat(booking.total_price || 0);
  }, 0);

  // حساب العمولة
  const commission = (totalRevenue * commissionRate) / 100;

  // عرض النتيجة
  const commissionResult = document.getElementById('commissionResult');
  const commissionValue = document.getElementById('commissionValue');

  if (commissionResult && commissionValue) {
    commissionValue.textContent = `${commission.toFixed(2)} ج`;
    commissionResult.style.display = 'flex';
  }

  // تحديث الراتب الإجمالي إذا كان المرتب محفوظاً
  updateTotalSalary();
}

// حفظ المرتب
async function saveSalary() {
  const fixedSalary = parseFloat(document.getElementById('fixedSalary').value);
  
  if (!fixedSalary || fixedSalary < 0) {
    alert('⚠️ يرجى إدخال مرتب صحيح');
    return;
  }

  try {
    // حفظ المرتب في قاعدة البيانات
    const response = await fetch(`/api/accounts/${currentEmployeeId}/salary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixed_salary: fixedSalary })
    });

    if (!response.ok) {
      throw new Error('فشل حفظ المرتب');
    }

    const data = await response.json();
    
    // عرض المرتب المحفوظ
    const salaryDisplay = document.getElementById('salaryDisplay');
    const savedSalaryValue = document.getElementById('savedSalaryValue');

    if (salaryDisplay && savedSalaryValue) {
      savedSalaryValue.textContent = `${fixedSalary.toFixed(2)} ج`;
      salaryDisplay.style.display = 'flex';
    }

    // تحديث الراتب الإجمالي
    updateTotalSalary();
    
    alert('✅ تم حفظ المرتب بنجاح');

  } catch (error) {
    console.error('Error saving salary:', error);
    alert('❌ حدث خطأ أثناء حفظ المرتب');
  }
}
// تحديث الراتب الإجمالي
function updateTotalSalary() {
  const fixedSalary = parseFloat(document.getElementById('fixedSalary').value) || 0;
  const commissionValue = document.getElementById('commissionValue');
  
  if (!commissionValue) return;

  const commissionText = commissionValue.textContent;
  const commission = parseFloat(commissionText.replace(/[^\d.]/g, '')) || 0;

  if (fixedSalary === 0 && commission === 0) {
    document.getElementById('totalSalarySection').style.display = 'none';
    return;
  }

  const total = fixedSalary + commission;

  // عرض التفاصيل
  document.getElementById('breakdownFixed').textContent = `${fixedSalary.toFixed(2)} ج`;
  document.getElementById('breakdownCommission').textContent = `${commission.toFixed(2)} ج`;
  document.getElementById('breakdownTotal').textContent = `${total.toFixed(2)} ج`;
  document.getElementById('totalSalarySection').style.display = 'block';
}

// إخفاء جميع أقسام التقرير
function hideAllReportSections() {
  document.querySelector('.commission-section').style.display = 'none';
  document.querySelector('.salary-section').style.display = 'none';
  document.getElementById('totalSalarySection').style.display = 'none';
  document.getElementById('commissionResult').style.display = 'none';
  document.getElementById('salaryDisplay').style.display = 'none';
}

// إعادة تعيين نافذة التقرير
function resetReportModal() {
  currentEmployeeId = null;
  currentEmployeeName = '';
  currentReportData = null;
  
  document.getElementById('monthSelect').value = '';
  document.getElementById('commissionRate').value = '';
  document.getElementById('fixedSalary').value = '';
  
  hideAllReportSections();
  document.getElementById('emptyReport').style.display = 'block';
}

// جلب المرتب المحفوظ من قاعدة البيانات
async function loadSavedSalary(employeeId) {
  try {
    const response = await fetch(`/api/accounts/${employeeId}/salary`);
    
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const savedSalary = data.fixed_salary || 0;
    
    if (savedSalary > 0) {
      // عرض المرتب المحفوظ
      document.getElementById('fixedSalary').value = savedSalary;
      document.getElementById('savedSalaryValue').textContent = `${savedSalary.toFixed(2)} ج`;
      document.getElementById('salaryDisplay').style.display = 'flex';
    }

  } catch (error) {
    console.error('Error loading saved salary:', error);
  }
}
// جعل الدوال متاحة عالمياً
window.openReportsModal = openReportsModal;