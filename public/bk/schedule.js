//schedule.js
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // التحقق من تسجيل الدخول
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

  // التحقق من اختيار الدكتور
  const doctorRaw = sessionStorage.getItem('selected_doctor');
  if (!doctorRaw) {
    alert('⚠️ الرجاء اختيار دكتور أولاً');
    window.location.href = '/bk/bk.html';
    return;
  }

  const selectedDoctor = JSON.parse(doctorRaw);
  console.log('✅ الدكتور المختار:', selectedDoctor);

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // العناصر
  const doctorNameEl = document.getElementById('doctorName');
  const doctorRoleEl = document.getElementById('doctorRole');
  const doctorPhoneEl = document.getElementById('doctorPhone');
  const doctorAvatarEl = document.getElementById('doctorAvatar');
  const dateInput = document.getElementById('dateInput');
  const prevDayBtn = document.getElementById('prevDayBtn');
  const nextDayBtn = document.getElementById('nextDayBtn');
  const selectedDayEl = document.getElementById('selectedDay');
  const selectedDateEl = document.getElementById('selectedDate');
  const addBookingBtn = document.getElementById('addBookingBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const bookingsGrid = document.getElementById('bookingsGrid');
  const emptyState = document.getElementById('emptyState');
  
  // عناصر الإحصائيات
  const totalBookingsEl = document.getElementById('totalBookings');
  const pendingBookingsEl = document.getElementById('pendingBookings');
  const confirmedBookingsEl = document.getElementById('confirmedBookings');
  const startedBookingsEl = document.getElementById('startedBookings');
  const completedBookingsEl = document.getElementById('completedBookings');

  // عرض معلومات الدكتور
  if (doctorNameEl) doctorNameEl.textContent = selectedDoctor.name;
  if (doctorPhoneEl) doctorPhoneEl.textContent = selectedDoctor.phone || '----';
  
  // تحديد التخصص والأيقونة
  let specialty = 'طبيبة عامة';
  let icon = '👩‍⚕️';
  let bgGradient = 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)';

  switch (selectedDoctor.role) {
    case 'دكتور بشرة':
      specialty = 'أخصائية بشرة';
      icon = '✨';
      bgGradient = 'linear-gradient(135deg, #ec407a 0%, #f48fb1 100%)';
      break;
    case 'دكتور لايزر':
      specialty = 'أخصائية ليزر';
      icon = '💫';
      bgGradient = 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)';
      break;
  }

  if (doctorRoleEl) doctorRoleEl.textContent = specialty;
  if (doctorAvatarEl) {
    doctorAvatarEl.textContent = icon;
    doctorAvatarEl.style.background = bgGradient;
  }

  // متغيرات
  let currentDate = new Date();
  let bookings = [];
  let categories = [];
  let services = [];
  let clients = [];
  let selectedClient = null;

  // تحميل البيانات الأساسية
  async function loadInitialData() {
    try {
      const [catRes, servRes, clientsRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/services'),
        fetch('/api/clients')
      ]);
      
      categories = await catRes.json();
      services = await servRes.json();
      clients = await clientsRes.json();
      
      console.log('✅ تم تحميل البيانات الأساسية');
    } catch (err) {
      console.error('❌ خطأ في تحميل البيانات:', err);
    }
  }

  // تعيين التاريخ
  function setDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (dateInput) {
      dateInput.value = `${year}-${month}-${day}`;
    }
  }

  // تحديث عرض التاريخ
  function updateDateDisplay(date) {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = [
      'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    if (selectedDayEl) selectedDayEl.textContent = dayName;
    if (selectedDateEl) selectedDateEl.textContent = `${day} ${month} ${year}`;
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

// تحميل الحجوزات
async function loadSchedule() {
  if (window.isLoadingSchedule) return;
  window.isLoadingSchedule = true;
  
  try {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    const dateStr = getLocalDateString(currentDate);
    
    const response = await fetch(`/api/bookings/${selectedDoctor.id}/${dateStr}?_t=${Date.now()}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch bookings');
    }
    
    const newBookings = await response.json();
    
    // ⭐ تحديث مهم: جلب الخدمات لكل حجز من جدول booking_services
    for (let booking of newBookings) {
      try {
        const servicesResponse = await fetch(`/api/bookings/${booking.id}/services`);
        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json();
          booking.booking_services = servicesData.services || [];
        }
      } catch (error) {
        console.warn(`⚠️ لا يمكن جلب خدمات الحجز ${booking.id}:`, error);
        booking.booking_services = [];
      }
    }
    
    bookings = newBookings;

    // فحص الخدمات الغير مدفوعة
    const hasUnpaidServices = bookings.some(b => 
      b.notes && b.notes.includes('[خدمات غير مدفوعة]') && b.status !== 'انتهت' && b.status !== 'ملغي'
    );

    if (hasUnpaidServices) {
      playAlertSound();
    }
    
    renderBookings();
    updateStats();

  } catch (error) {
    console.error('❌ خطأ في تحميل المواعيد:', error);
    alert('⚠️ حدث خطأ في تحميل المواعيد');
  } finally {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    window.isLoadingSchedule = false;
  }
}
// زر تحديث يدوي
document.getElementById('manualRefreshBtn')?.addEventListener('click', async () => {
  console.log('🔄 تحديث يدوي مفعل...');
  await loadSchedule();
});

  // عرض الحجوزات
  function renderBookings() {
    if (!bookingsGrid) return;
    
    bookingsGrid.innerHTML = '';
    
    if (bookings.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // ترتيب الحجوزات حسب الوقت
// ⭐ تصفية الحجوزات الملغاة (عدم عرضها في الجدول)
const activeBookings = bookings.filter(b => b.status !== 'ملغي');

// ترتيب الحجوزات حسب الوقت
activeBookings.sort((a, b) => a.start_time.localeCompare(b.start_time));

activeBookings.forEach(booking => {      const card = createBookingCard(booking);
      bookingsGrid.appendChild(card);
    });
  }
  // ⭐ تنظيف الملاحظات من الترميز الخاطئ
function cleanNotes(notes) {
  if (!notes) return '';
  
  // إزالة علامات الخدمات الغير مدفوعة من العرض
  let cleaned = notes.replace(/\[خدمات غير مدفوعة: [\d.]+ ج\]/g, '').trim();
  
  // إزالة الترميز الخاطئ
  cleaned = cleaned.replace(/\[\?+.*?\]/g, '');
  
  return cleaned || 'لا توجد ملاحظات';
}

function createBookingCard(booking) {
  const card = document.createElement('div');
  const hasUnpaid = booking.notes && booking.notes.includes('[خدمات غير مدفوعة]');
  card.className = hasUnpaid ? 'booking-card unpaid' : 'booking-card';
  card.dataset.bookingId = booking.id;
  
  // تحديد حالة الحجز
  const status = booking.status || 'جاري';
  const statusClass = status === 'جاري' ? 'pending' : 
                     status === 'مؤكد' ? 'confirmed' : 
                     status === 'بدأت' ? 'started' : 
                     status === 'انتهت' ? 'completed' : 'pending';
  
  // تنظيف اسم العميل
  let cleanClientName = booking.client_name || '';
  if (typeof cleanClientName !== 'string') {
    cleanClientName = String(cleanClientName);
  }
  if (cleanClientName && cleanClientName.includes(',')) {
    const nameParts = cleanClientName.split(',');
    if (nameParts.length === 2 && nameParts[0].trim() === nameParts[1].trim()) {
      cleanClientName = nameParts[0].trim();
    }
  }
  
  // ⭐ تحديث مهم: إنشاء قائمة الخدمات مع دعم الخدمات من booking_services
  let servicesHtml = '';
  let servicesCount = 0;
  
  // الطريقة الأولى: إذا كانت الخدمات مخزنة في عمود services (JSON)
  if (booking.services && booking.services.length > 0) {
    servicesCount = booking.services.length;
    servicesHtml = '<div class="services-list">';
    booking.services.forEach((service, index) => {
      servicesHtml += `
        <div class="service-item">
          <strong>خدمة ${toEnglishNumbers(index + 1)}:</strong> ${escapeHtml(service.service_name || service.name)}
          <br>
          <small>المدة: ${toEnglishNumbers(service.duration)} دقيقة • السعر: ${toEnglishNumbers(parseFloat(service.price).toFixed(2))} ج</small>
        </div>
      `;
    });
    servicesHtml += '</div>';
  } 
  // الطريقة الثانية: إذا كانت الخدمات تأتي من جدول منفصل (booking_services)
  else if (booking.booking_services && booking.booking_services.length > 0) {
    servicesCount = booking.booking_services.length;
    servicesHtml = '<div class="services-list">';
    booking.booking_services.forEach((service, index) => {
      servicesHtml += `
        <div class="service-item">
          <strong>خدمة ${toEnglishNumbers(index + 1)}:</strong> ${escapeHtml(service.service_name)}
          <br>
          <small>المدة: ${toEnglishNumbers(service.duration)} دقيقة • السعر: ${toEnglishNumbers(parseFloat(service.price).toFixed(2))} ج</small>
        </div>
      `;
    });
    servicesHtml += '</div>';
  }
  
  card.innerHTML = `
    <div class="booking-card-header">
      ${hasUnpaid ? '<div class="unpaid-services-badge">⚠️ خدمات غير مدفوعة</div>' : ''}
      <div class="booking-time">
        🕐 ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}
      </div>
      <span class="booking-status ${statusClass}">${status}</span>
    </div>
    <div class="booking-card-body">
      <div class="booking-info-row">
        <strong>👤 الاسم:</strong>
        <span>${escapeHtml(cleanClientName)}</span>
      </div>
      <div class="booking-info-row">
        <strong>📱 الهاتف:</strong>
        <span style="direction: ltr; display: inline-block">${toEnglishNumbers(escapeHtml(booking.client_phone))}</span>
      </div>
      ${booking.created_by ? `
        <div class="booking-info-row">
          <strong>👩‍💼 تم الحجز بواسطة:</strong>
          <span>${escapeHtml(booking.created_by)}</span>
        </div>
      ` : ''}
      <div class="booking-info-row">
        <strong>🔢 عدد الخدمات:</strong>
        <span>${toEnglishNumbers(servicesCount)}</span>
      </div>
      ${servicesHtml}
      ${booking.balance_type ? `
        <div class="booking-info-row" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
          <strong>💳 نوع الرصيد:</strong>
          <span>${escapeHtml(booking.balance_type)}</span>
        </div>
      ` : ''}
      ${booking.notes ? `
        <div class="booking-info-row" style="margin-top: 8px;">
          <strong>📝 ملاحظات:</strong>
          <span>${escapeHtml(cleanNotes(booking.notes))}</span>
        </div>
      ` : ''}
    </div>
  `;
  
  card.addEventListener('click', () => {
    openBookingDetailsModal(booking);
  });
  
  if (hasUnpaid) {
    card.style.position = 'relative';
  }

  return card;
}
// تحديث الإحصائيات
function updateStats() {
  // ⭐ تصفية الحجوزات النشطة فقط (بدون الملغاة)
  const activeBookings = bookings.filter(b => b.status !== 'ملغي');
  
  if (totalBookingsEl) totalBookingsEl.textContent = toEnglishNumbers(activeBookings.length);
  
  const pending = activeBookings.filter(b => (b.status || 'جاري') === 'جاري').length;
  const confirmed = activeBookings.filter(b => (b.status || 'جاري') === 'مؤكد').length;
  const started = activeBookings.filter(b => (b.status || 'جاري') === 'بدأت').length;
  const completed = activeBookings.filter(b => (b.status || 'جاري') === 'انتهت').length;
  
  // ⭐ حساب الحجوزات بخدمات غير مدفوعة
  const unpaid = activeBookings.filter(b => 
    b.notes && b.notes.includes('[خدمات غير مدفوعة:') && 
    b.status !== 'انتهت' && b.status !== 'ملغي'
  ).length;

  // ⭐ تحديث جميع العناصر
  if (pendingBookingsEl) pendingBookingsEl.textContent = toEnglishNumbers(pending);
  if (confirmedBookingsEl) confirmedBookingsEl.textContent = toEnglishNumbers(confirmed);
  if (startedBookingsEl) startedBookingsEl.textContent = toEnglishNumbers(started);
  if (completedBookingsEl) completedBookingsEl.textContent = toEnglishNumbers(completed);
  
  // ⭐ إضافة عنصر الخدمات الغير مدفوعة
  const unpaidBookingsEl = document.getElementById('unpaidBookings');
  if (unpaidBookingsEl) unpaidBookingsEl.textContent = toEnglishNumbers(unpaid);

  console.log('📊 إحصائيات محدثة:', {
    إجمالي: activeBookings.length,
    جاري: pending,
    مؤكد: confirmed,
    بدأت: started,
    انتهت: completed,
    'خدمات غير مدفوعة': unpaid
  });
}

// فتح modal تفاصيل الحجز (مع زر شحن رصيد للخدمات الغير مدفوعة)
// فتح modal تفاصيل الحجز (مع زر شحن رصيد للخدمات الغير مدفوعة)
function openBookingDetailsModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  // ⭐ التحقق من الخدمات الغير مدفوعة
  const hasUnpaidServices = booking.notes && booking.notes.includes('[خدمات غير مدفوعة:');
  
  if (hasUnpaidServices) {
    // تشغيل صوت تحذيري
    playWarningSound();
    
    // رسالة تحذير
    const match = booking.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
    const unpaidAmount = match ? match[1] : '---';
    
    const userConfirmed = confirm(
      `🚨 تحذير: هذا الحجز يحتوي على خدمات غير مدفوعة!\n\n` +
      `👤 العميل: ${booking.client_name}\n` +
      `💰 المبلغ المطلوب: ${unpaidAmount} ج\n\n` +
      `⚠️ يجب الدفع قبل إنهاء الجلسة\n\n` +
      `📍 اضغط "موافق" للمتابعة والدفع`
    );
    
    if (!userConfirmed) {
      return; // إلغاء فتح الـ modal
    }
  }
  
  const status = booking.status || 'جاري';
  
  // إنشاء أزرار الإجراءات حسب الحالة
  let actionButtons = '';
  let showDeleteBtn = true;

if (status === 'جاري') {
  actionButtons = `
    <button class="btn btn-success" id="confirmBookingBtn">
      <span>✅</span>
      تأكيد الحجز
    </button>
    <button class="btn btn-info" id="editBookingTimeBtn" style="margin-top: 10px;">
      <span>🕐</span>
      تعديل الميعاد
    </button>
    <button class="btn btn-warning" id="editBookingPriceBtn" style="margin-top: 10px;">
      <span>✏️</span>
      تعديل السعر
    </button>
    <button class="btn btn-primary" id="addServiceToBookingBtn" style="margin-top: 10px;">
      <span>➕</span>
      إضافة خدمة (خصم عند التأكيد)
    </button>
  `;
    
    // ⭐ إضافة زر شحن الرصيد إذا كان العميل جديد
    const isNewClient = booking.client_id && !booking.balance_type;
    if (isNewClient || booking.is_new_client) {
      actionButtons += `
        <button class="btn btn-warning" id="chargeClientBalanceBtn" style="margin-top: 10px;">
          <span>💳</span>
          شحن رصيد العميل
        </button>
      `;
    }
} else if (status === 'مؤكد') {
  actionButtons = `
    <button class="btn btn-warning" id="startBookingBtn">
      <span>▶️</span>
      بدء الجلسة
    </button>
    <button class="btn btn-info" id="editBookingPriceBtn" style="margin-top: 10px;">
      <span>✏️</span>
      تعديل السعر
    </button>
    <button class="btn btn-primary" id="addServiceToBookingBtn" style="margin-top: 10px;">
      <span>➕</span>
      إضافة خدمة (خصم عند التأكيد)
    </button>
  `;
} else if (status === 'بدأت') {
  actionButtons = `
    <button class="btn btn-success" id="completeBookingBtn">
      <span>✔️</span>
      إنهاء الحجز
    </button>
    <button class="btn btn-primary" id="addServiceToBookingBtnInstant" style="margin-top: 10px;">
      <span>⚡</span>
      إضافة خدمة (خصم فوري)
    </button>
  `;
  showDeleteBtn = false;
} else if (status === 'انتهت') {
  actionButtons = `
    <button class="btn btn-primary" id="addServiceToBookingBtnInstant" style="margin-top: 10px;">
      <span>⚡</span>
      إضافة خدمة (خصم فوري)
    </button>
  `;
  showDeleteBtn = false;
}
  
  // إنشاء قائمة الخدمات
// في دالة openBookingDetailsModal، عدّل قسم الخدمات ليصبح:
let servicesHtml = '';
if (booking.services && booking.services.length > 0) {
  servicesHtml = booking.services.map((s, i) => `
    <div style="padding: 12px; background: #f5f5f5; border-radius: 8px; margin-bottom: 8px;">
      <strong>خدمة ${toEnglishNumbers(i + 1)}:</strong> ${escapeHtml(s.service_name || s.name)}
      <br>
      <small>المدة: ${toEnglishNumbers(s.duration)} دقيقة • السعر: ${toEnglishNumbers(parseFloat(s.price).toFixed(2))} ج</small>
    </div>
  `).join('');
} else if (booking.booking_services && booking.booking_services.length > 0) {
  servicesHtml = booking.booking_services.map((s, i) => `
    <div style="padding: 12px; background: #f5f5f5; border-radius: 8px; margin-bottom: 8px;">
      <strong>خدمة ${toEnglishNumbers(i + 1)}:</strong> ${escapeHtml(s.service_name)}
      <br>
      <small>المدة: ${toEnglishNumbers(s.duration)} دقيقة • السعر: ${toEnglishNumbers(parseFloat(s.price).toFixed(2))} ج</small>
    </div>
  `).join('');
}

  // معالجة الـ notes
  let displayNotes = booking.notes || '';
  try {
    if (booking.notes) {
      const notesObj = JSON.parse(booking.notes);
      if (notesObj.originalNotes) {
        displayNotes = notesObj.originalNotes;
      }
    }
  } catch (e) {
    // إزالة علامة الخدمات الغير مدفوعة من الملاحظات المعروضة
    displayNotes = displayNotes.replace('[خدمات غير مدفوعة]', '').trim();
  }
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>📋 تفاصيل الحجز</h3>
        <button class="modal-close" id="closeDetailsModal">&times;</button>
      </div>
      
      <div class="modal-body">
        ${hasUnpaidServices ? `
          <div style="padding: 16px; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 3px solid #dc2626; border-radius: 12px; margin-bottom: 20px; animation: alertPulse 2s infinite;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 36px;">⚠️</div>
              <div>
                <strong style="color: #dc2626; font-size: 16px; display: block; margin-bottom: 4px;">
                  يوجد خدمات غير مدفوعة!
                </strong>
                <p style="color: #991b1b; margin: 0; font-size: 14px;">
                  يجب دفع الخدمات الإضافية قبل إنهاء الجلسة
                </p>
              </div>
            </div>
          </div>
        ` : ''}
        
        <div style="padding: 16px; background: linear-gradient(135deg, #e91e63 0%, #ff4081 100%); color: white; border-radius: 12px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 18px; font-weight: 600;">🕐 ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}</span>
            <span style="padding: 6px 12px; background: rgba(255,255,255,0.3); border-radius: 20px; font-size: 14px; font-weight: 600;">${status}</span>
          </div>
        </div>
        
        <div class="form-group">
          <label>👤 اسم العميل</label>
          <input type="text" value="${escapeHtml(booking.client_name)}" readonly>
        </div>
        
        <div class="form-group">
          <label>📱 رقم الهاتف</label>
          <input type="text" value="${escapeHtml(booking.client_phone)}" readonly style="direction: ltr">
        </div>
        
        ${booking.balance_type ? `
          <div class="form-group">
            <label>💳 نوع الرصيد المستخدم</label>
            <input type="text" value="${escapeHtml(booking.balance_type)}" readonly>
          </div>
        ` : ''}
        
        <div class="form-group">
          <label>💰 السعر الإجمالي</label>
          <input type="text" value="${toEnglishNumbers(parseFloat(booking.total_price).toFixed(2))} ج" readonly>
        </div>

        <div class="form-group">
          <label>🔢 عدد الخدمات: ${toEnglishNumbers(booking.services ? booking.services.length : 0)}</label>
          ${servicesHtml}
        </div>
        
        ${displayNotes ? `
          <div class="form-group">
            <label>📝 ملاحظات</label>
            <textarea readonly rows="3">${escapeHtml(displayNotes)}</textarea>
          </div>
        ` : ''}
        
        <div class="modal-actions">
          ${actionButtons}
          
          <!-- ⭐ زر حذف الخدمة يظهر فقط عندما تكون الحالة "بدأت" أو "انتهت" ويكون عدد الخدمات أكبر من 1 -->
          ${(status === 'بدأت' || status === 'انتهت') && booking.services && booking.services.length > 1 ? `
            <button class="btn btn-danger" id="removeServiceFromDetailsBtn" style="margin-top: 10px;">
              <span>🗑️</span>
              حذف خدمة من الحجز (إرجاع الفلوس)
            </button>
          ` : ''}
          
          ${showDeleteBtn ? `
            <button class="btn btn-danger" id="deleteBookingBtn">
              <span>🗑️</span>
              حذف الحجز
            </button>
          ` : ''}
          
          <button class="btn btn-secondary" id="closeDetailsBtn">
            إغلاق
          </button>
        </div>
        
        ${hasUnpaidServices ? `
          <div style="margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border: 2px solid #f59e0b; border-radius: 12px;">
            <button class="btn btn-warning" id="payUnpaidServicesBtn" style="width: 100%; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); animation: pulse 2s infinite; font-size: 16px; padding: 14px;">
              <span style="font-size: 20px;">💳</span>
              شحن رصيد ودفع الخدمات الإضافية
            </button>
            <p style="text-align: center; margin: 12px 0 0 0; color: #ea580c; font-size: 13px; font-weight: 600;">
              ⚠️ يجب الدفع قبل إنهاء الحجز
            </p>
          </div>
        ` : ''}
      </div>
    </div>
  `;  
  
  modal.classList.add('active');
  
  // Event listeners
  document.getElementById('closeDetailsModal')?.addEventListener('click', () => closeModal(modal));
  document.getElementById('closeDetailsBtn')?.addEventListener('click', () => closeModal(modal));
  document.getElementById('deleteBookingBtn')?.addEventListener('click', () => deleteBooking(booking.id));
  
document.getElementById('confirmBookingBtn')?.addEventListener('click', () => updateBookingStatus(booking.id, 'مؤكد'));
  
  // ⭐ زر إضافة خدمة جديدة
  document.getElementById('addServiceToBookingBtn')?.addEventListener('click', () => {
    openAddServiceToBookingModal(booking);
  });
  // ⭐ زر الخدمة الفورية للحالات "بدأت" و "انتهت"
document.getElementById('addServiceToBookingBtnInstant')?.addEventListener('click', () => {
  openAddServiceToBookingModalInstant(booking);
});
  

  // ⭐ زر تعديل الميعاد
  document.getElementById('editBookingTimeBtn')?.addEventListener('click', () => {
    openEditBookingTimeModal(booking);
  });
  
  // ⭐ زر شحن الرصيد للعميل الجديد
  document.getElementById('chargeClientBalanceBtn')?.addEventListener('click', async () => {
    openChargeBalanceForNewClient(booking);
  });
  
  document.getElementById('startBookingBtn')?.addEventListener('click', () => updateBookingStatus(booking.id, 'بدأت'));
  document.getElementById('completeBookingBtn')?.addEventListener('click', () => updateBookingStatus(booking.id, 'انتهت'));
  

  // ============================================
// ➕ إضافة خدمة جديدة لحجز موجود
// ============================================
async function openAddServiceToBookingModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>➕ إضافة خدمة جديدة</h3>
        <button class="modal-close" id="closeAddServiceModal">&times;</button>
      </div>
      
      <form id="addServiceForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #1565c0; margin-bottom: 12px;">📋 معلومات الحجز</h4>
          <p><strong>العميل:</strong> ${escapeHtml(booking.client_name)}</p>
          <p><strong>الوقت:</strong> ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}</p>
          <p><strong>عدد الخدمات الحالية:</strong> ${booking.services.length}</p>
        </div>
        
        <div class="service-card-form">
          <div class="service-card-form-header">
            الخدمة الجديدة
          </div>
          <div class="service-card-form-body">
            <div class="form-group">
              <label>القسم *</label>
              <select class="service-category" id="newServiceCategory">
                <option value="">اختر القسم</option>
                ${categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}
              </select>
            </div>
            
            <div class="form-group">
              <label>الخدمة *</label>
              <select class="service-select" id="newServiceSelect">
                <option value="">اختر القسم أولاً</option>
              </select>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>المدة (دقيقة) *</label>
                <input type="number" id="newServiceDuration" min="15" step="15" value="30" readonly style="background: #f5f5f5;">
              </div>
              
              <div class="form-group">
                <label>السعر (ج) *</label>
                <input type="number" id="newServicePrice" step="0.01" readonly style="background: #f5f5f5;">
              </div>
            </div>
          </div>
        </div>
        
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin: 20px 0; text-align: center;">
          <div style="font-size: 16px; color: #e65100; font-weight: 600; margin-bottom: 8px;">
            ⚠️ ملاحظة هامة
          </div>
          <p style="margin: 0; color: #e65100; font-size: 14px;">
            سيتم إضافة علامة [خدمات غير مدفوعة] للحجز<br>
            يجب دفع قيمة الخدمة قبل إنهاء الجلسة
          </p>
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>✅</span>
            إضافة الخدمة
          </button>
          <button type="button" class="btn btn-secondary" id="cancelAddService">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');
  
  // Event listeners للأقسام
  document.getElementById('newServiceCategory').addEventListener('change', (e) => {
    const categoryId = e.target.value;
    const serviceSelect = document.getElementById('newServiceSelect');
    
    serviceSelect.innerHTML = '<option value="">اختر الخدمة</option>';
    
    if (categoryId) {
      const categoryServices = services.filter(s => s.category_id == categoryId);
      categoryServices.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        option.dataset.duration = service.duration;
        option.dataset.price = service.price;
        serviceSelect.appendChild(option);
      });
    }
  });
  
  // Event listener للخدمة
  document.getElementById('newServiceSelect').addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    
    if (selectedOption.value) {
      const duration = selectedOption.dataset.duration;
      const price = selectedOption.dataset.price;
      
      document.getElementById('newServiceDuration').value = duration;
      document.getElementById('newServicePrice').value = parseFloat(price).toFixed(2);
    } else {
      document.getElementById('newServiceDuration').value = 30;
      document.getElementById('newServicePrice').value = '';
    }
  });
  
// إرسال النموذج
  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const serviceId = document.getElementById('newServiceSelect').value;
    const categorySelect = document.getElementById('newServiceCategory');
    
    if (!serviceId) {
      alert('⚠️ الرجاء اختيار خدمة');
      return;
    }
    
    const serviceSelect = document.getElementById('newServiceSelect');
    const serviceName = serviceSelect.options[serviceSelect.selectedIndex].text;
    const duration = parseInt(document.getElementById('newServiceDuration').value);
    const price = parseFloat(document.getElementById('newServicePrice').value);
    
    // التحقق من البيانات
    if (!serviceName || !duration || !price) {
      alert('⚠️ الرجاء ملء جميع البيانات');
      return;
    }
    
    // التحقق من بيانات الحجز
    if (!booking.client_id) {
      alert('⚠️ بيانات العميل غير موجودة في الحجز');
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      // إعداد البيانات للإرسال
      const requestData = {
        service_id: parseInt(serviceId),
        service_name: serviceName,
        duration: duration,
        price: price,
        balance_type: booking.balance_type || 'رصيد أساسي',
        client_id: parseInt(booking.client_id)
      };
      
      console.log('📤 إرسال البيانات:', requestData);
      
 const response = await fetch(`/api/bookings/${booking.id}/add-service`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...requestData,
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('❌ خطأ من السيرفر:', data);
        alert('⚠️ ' + (data.message || 'حدث خطأ'));
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ ' + data.message);
      closeModal(modal);
      await loadSchedule();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (error) {
      console.error('❌ خطأ:', error);
      alert('⚠️ حدث خطأ في إضافة الخدمة');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('closeAddServiceModal').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  document.getElementById('cancelAddService').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
      openBookingDetailsModal(booking);
    }
  });
}
  
  
  // ⭐ زر تعديل السعر

document.getElementById('editBookingPriceBtn')?.addEventListener('click', () => {
  openEditPriceModal(booking);
});
  // ⭐ زر حذف الخدمة من التفاصيل
  document.getElementById('removeServiceFromDetailsBtn')?.addEventListener('click', () => {
    openRemoveServiceModal(booking);
  });
  
  // ⭐ Event listener لزر دفع الخدمات الغير مدفوعة
  document.getElementById('payUnpaidServicesBtn')?.addEventListener('click', () => {
    openPayUnpaidServicesModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });


} // ⭐ نهاية دالة openBookingDetailsModal

// ============================================
// ⚡ إضافة خدمة مع خصم فوري (للحالات "بدأت" و "انتهت")
// ============================================
async function openAddServiceToBookingModalInstant(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  // ⭐ تحميل بيانات العميل المحدثة من السيرفر
  let clientData = booking;
  try {
    const clientResponse = await fetch(`/api/clients/${booking.client_id}`);
    if (clientResponse.ok) {
      clientData = await clientResponse.json();
      window.currentClientData = clientData;
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات العميل:', error);
  }
  
  // عرض رصيد العميل
  const clientBalanceInfo = `
    <h4>💰 رصيد العميل: ${escapeHtml(clientData.name || booking.client_name)}</h4>
    <div class="balance-grid">
      <div class="balance-item">
        <strong>رصيد أساسي</strong>
        <span>${parseFloat(clientData.balance_basic || 0).toFixed(2)} ج</span>
      </div>
      <div class="balance-item">
        <strong>رصيد ليزر</strong>
        <span>${parseFloat(clientData.balance_laser || 0).toFixed(2)} ج</span>
      </div>
      <div class="balance-item">
        <strong>رصيد بشرة</strong>
        <span>${parseFloat(clientData.balance_skin || 0).toFixed(2)} ج</span>
      </div>
    </div>
  `;
  
  // تحميل الأقسام
  const [catRes, servRes] = await Promise.all([
    fetch('/api/categories'),
    fetch('/api/services')
  ]);
  
  const categories = await catRes.json();
  const allServices = await servRes.json();
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>⚡ إضافة خدمة (خصم فوري)</h3>
        <button class="modal-close" id="closeAddServiceInstantModal">&times;</button>
      </div>
      
      <form id="addServiceInstantForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #1565c0; margin-bottom: 12px;">📋 معلومات الحجز</h4>
          <p><strong>العميل:</strong> ${escapeHtml(booking.client_name)}</p>
          <p><strong>الحالة:</strong> ${booking.status}</p>
          <p><strong>عدد الخدمات الحالية:</strong> ${booking.services.length}</p>
        </div>
        
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px;">
          ${clientBalanceInfo}
        </div>
        
        <div class="service-card-form">
          <div class="service-card-form-header">
            الخدمة الجديدة
          </div>
          <div class="service-card-form-body">
            <div class="form-group">
              <label>القسم *</label>
              <select class="service-category" id="instantServiceCategory">
                <option value="">اختر القسم</option>
                ${categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}
              </select>
            </div>
            
            <div class="form-group">
              <label>الخدمة *</label>
              <select class="service-select" id="instantServiceSelect">
                <option value="">اختر القسم أولاً</option>
              </select>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>المدة (دقيقة) *</label>
                <input type="number" id="instantServiceDuration" min="15" step="15" value="30" readonly style="background: #f5f5f5;">
              </div>
              
              <div class="form-group">
                <label>السعر (ج) *</label>
                <input type="number" id="instantServicePrice" step="0.01" readonly style="background: #f5f5f5;">
              </div>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label for="instantBalanceType">💳 نوع الرصيد المستخدم *</label>
          <select id="instantBalanceType" required>
            <option value="">اختر نوع الرصيد</option>
            <option value="رصيد أساسي">رصيد أساسي</option>
            <option value="رصيد ليزر">رصيد ليزر</option>
            <option value="رصيد بشرة">رصيد بشرة</option>
          </select>
        </div>
        
        <div id="instantBalanceWarning" style="display: none; padding: 12px; background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; margin: 12px 0; color: #991b1b;">
          <strong>⚠️ تحذير:</strong> الرصيد غير كافي!
        </div>
        
        <div style="padding: 16px; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; margin: 20px 0; text-align: center;">
          <div style="font-size: 16px; color: #15803d; font-weight: 600; margin-bottom: 8px;">
            ⚡ خصم فوري
          </div>
          <p style="margin: 0; color: #15803d; font-size: 14px;">
            سيتم خصم قيمة الخدمة من رصيد العميل فوراً بعد الإضافة
          </p>
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>✅</span>
            إضافة وخصم الآن
          </button>
          <button type="button" class="btn btn-secondary" id="cancelAddServiceInstant">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');
  
  // Event listeners للأقسام
  document.getElementById('instantServiceCategory').addEventListener('change', (e) => {
    const categoryId = e.target.value;
    const serviceSelect = document.getElementById('instantServiceSelect');
    
    serviceSelect.innerHTML = '<option value="">اختر الخدمة</option>';
    
    if (categoryId) {
      const categoryServices = allServices.filter(s => s.category_id == categoryId);
      categoryServices.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        option.dataset.duration = service.duration;
        option.dataset.price = service.price;
        serviceSelect.appendChild(option);
      });
    }
  });
  
  // Event listener للخدمة
  document.getElementById('instantServiceSelect').addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    
    if (selectedOption.value) {
      const duration = selectedOption.dataset.duration;
      const price = selectedOption.dataset.price;
      
      document.getElementById('instantServiceDuration').value = duration;
      document.getElementById('instantServicePrice').value = parseFloat(price).toFixed(2);
      
      checkInstantBalance();
    } else {
      document.getElementById('instantServiceDuration').value = 30;
      document.getElementById('instantServicePrice').value = '';
    }
  });
  
  // فحص الرصيد
  document.getElementById('instantBalanceType').addEventListener('change', checkInstantBalance);
  
  function checkInstantBalance() {
    const serviceSelect = document.getElementById('instantServiceSelect');
    const balanceType = document.getElementById('instantBalanceType').value;
    const warningBox = document.getElementById('instantBalanceWarning');
    
    if (!serviceSelect.value || !balanceType) {
      warningBox.style.display = 'none';
      return;
    }
    
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    const price = parseFloat(selectedOption?.dataset?.price || 0);
    
    const data = clientData || window.currentClientData || booking;
    
    const balanceMap = {
      'رصيد أساسي': data.balance_basic,
      'رصيد ليزر': data.balance_laser,
      'رصيد بشرة': data.balance_skin
    };
    
    const clientBalance = parseFloat(balanceMap[balanceType] || 0);
    
    if (clientBalance < price) {
      warningBox.style.display = 'block';
    } else {
      warningBox.style.display = 'none';
    }
  }
  
  // إرسال النموذج
  document.getElementById('addServiceInstantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const serviceId = document.getElementById('instantServiceSelect').value;
    const balanceType = document.getElementById('instantBalanceType').value;
    const selectedOption = document.getElementById('instantServiceSelect').options[document.getElementById('instantServiceSelect').selectedIndex];
    
    if (!serviceId || !balanceType) {
      alert('⚠️ الرجاء ملء جميع البيانات');
      return;
    }
    
    const price = parseFloat(selectedOption.dataset.price);
    const serviceName = selectedOption.textContent;
    const duration = parseInt(document.getElementById('instantServiceDuration').value);
    
    // ⭐ التحقق من الرصيد
    const data = window.currentClientData || clientData || booking;
    const balanceMap = {
      'رصيد أساسي': data.balance_basic,
      'رصيد ليزر': data.balance_laser,
      'رصيد بشرة': data.balance_skin
    };
    
    const currentBalance = parseFloat(balanceMap[balanceType] || 0);
    
    if (currentBalance < price) {
      alert(
        `⚠️ الرصيد غير كافي!\n\n` +
        `💰 الرصيد الحالي: ${currentBalance.toFixed(2)} ج\n` +
        `💸 السعر المطلوب: ${price.toFixed(2)} ج\n\n` +
        `الرجاء شحن رصيد العميل أولاً`
      );
      return;
    }
    
    const confirmAdd = confirm(
      `⚡ تأكيد الخصم الفوري\n\n` +
      `📋 الخدمة: ${serviceName}\n` +
      `💰 السعر: ${price.toFixed(2)} ج\n` +
      `💳 من: ${balanceType}\n\n` +
      `✅ سيتم الخصم فوراً - هل تريد المتابعة؟`
    );
    
    if (!confirmAdd) return;
    
    try {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      const response = await fetch(`/api/bookings/${booking.id}/add-service-instant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          service_name: serviceName,
          duration: duration,
          price: price,
          balance_type: balanceType,
          client_id: booking.client_id,
          skip_shift_action: true
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + result.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
// بعد نجاح الإضافة في openAddServiceToBookingModalInstant:
alert('✅ ' + result.message);

// ⭐ تحديث بيانات الحجز محلياً مع الخدمات الجديدة
if (result.all_services) {
  booking.booking_services = result.all_services;
  booking.total_price = result.new_total_price;
  
  // تحديث الكرت مباشرة
  updateBookingCard(booking);
}

closeModal(modal);
await loadSchedule(); // إعادة تحميل للتأكد
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (error) {
      console.error('❌ خطأ:', error);
      alert('⚠️ حدث خطأ');
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('closeAddServiceInstantModal').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  document.getElementById('cancelAddServiceInstant').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
      openBookingDetailsModal(booking);
    }
  });
  // دالة لتحديث كرت حجز معين
function updateBookingCard(updatedBooking) {
  const card = document.querySelector(`.booking-card[data-booking-id="${updatedBooking.id}"]`);
  if (card) {
    const newCard = createBookingCard(updatedBooking);
    card.parentNode.replaceChild(newCard, card);
  }
}



}// دالة تعديل ميعاد الحجز
async function openEditBookingTimeModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>🕐 تعديل ميعاد الحجز</h3>
        <button class="modal-close" id="closeEditTimeModal">&times;</button>
      </div>
      
      <form id="editTimeForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #1565c0; margin-bottom: 12px;">📋 معلومات الحجز</h4>
          <p><strong>العميل:</strong> ${escapeHtml(booking.client_name)}</p>
          <p><strong>الميعاد الحالي:</strong> ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}</p>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="newStartTime">🕐 الميعاد الجديد (بداية) *</label>
            <input type="time" id="newStartTime" value="${booking.start_time}" required>
          </div>
          <div class="form-group">
            <label for="newEndTime">🕐 الميعاد الجديد (نهاية) *</label>
            <input type="time" id="newEndTime" value="${booking.end_time}" required>
          </div>
        </div>
        
        <div id="timeConflictWarning" style="display: none; padding: 12px; background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; margin: 12px 0; color: #991b1b;">
          <strong>⚠️ تحذير:</strong> هذا الميعاد يتعارض مع حجز آخر!
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-success" id="saveNewTimeBtn">
            <span>💾</span>
            حفظ الميعاد الجديد
          </button>
          <button type="button" class="btn btn-secondary" id="cancelEditTime">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');
  
  const newStartTime = document.getElementById('newStartTime');
  const newEndTime = document.getElementById('newEndTime');
  const conflictWarning = document.getElementById('timeConflictWarning');
  const saveBtn = document.getElementById('saveNewTimeBtn');
  
  // دالة التحقق من التعارض
  function checkTimeConflict() {
    const start = newStartTime.value;
    const end = newEndTime.value;
    
    if (!start || !end) return false;
    
    // التحقق من أن نهاية الميعاد بعد البداية
    if (end <= start) {
      conflictWarning.innerHTML = '<strong>⚠️ خطأ:</strong> وقت النهاية يجب أن يكون بعد وقت البداية!';
      conflictWarning.style.display = 'block';
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.5';
      return true;
    }
    
    // التحقق من التعارض مع الحجوزات الأخرى
    const hasConflict = bookings.some(b => {
      // تجاهل الحجز الحالي والحجوزات المنتهية/الملغاة
      if (b.id === booking.id || b.status === 'انتهت' || b.status === 'ملغي') {
        return false;
      }
      
      const bookingStart = b.start_time;
      const bookingEnd = b.end_time;
      
      // تحقق من التداخل
      return (start < bookingEnd && end > bookingStart);
    });
    
    if (hasConflict) {
      conflictWarning.innerHTML = '<strong>⚠️ تحذير:</strong> هذا الميعاد يتعارض مع حجز آخر!';
      conflictWarning.style.display = 'block';
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.5';
      return true;
    }
    
    conflictWarning.style.display = 'none';
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    return false;
  }
  
  // فحص عند تغيير الأوقات
  newStartTime.addEventListener('change', checkTimeConflict);
  newEndTime.addEventListener('change', checkTimeConflict);
  newStartTime.addEventListener('input', checkTimeConflict);
  newEndTime.addEventListener('input', checkTimeConflict);
  
  // إرسال النموذج
  document.getElementById('editTimeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const start = newStartTime.value;
    const end = newEndTime.value;
    
    if (checkTimeConflict()) {
      alert('⚠️ لا يمكن حفظ الميعاد بسبب تعارض مع حجز آخر');
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
const response = await fetch(`/api/bookings/${booking.id}/update-time`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    start_time: start,
    end_time: end,
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});
      
      const data = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ تم تعديل الميعاد بنجاح!');
      closeModal(modal);
      await loadSchedule();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (error) {
      console.error('❌ خطأ:', error);
      alert('⚠️ حدث خطأ في تعديل الميعاد');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('closeEditTimeModal').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  document.getElementById('cancelEditTime').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
      openBookingDetailsModal(booking);
    }
  });
  
  // فحص أولي
  checkTimeConflict();
}
// فتح modal تعديل السعر
function openEditPriceModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;

const currentPrice = parseFloat(booking.total_price);
const minPrice = 0; // أقل سعر مسموح به (صفر)
const maxPrice = 1000000; // أعلى سعر مسموح به (مليون جنيه)

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>✏️ تعديل السعر الإجمالي</h3>
        <button class="modal-close" id="closeEditPriceModal">&times;</button>
      </div>
      
      <form id="editPriceForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 14px; color: #e65100; font-weight: 600; margin-bottom: 8px;">
            🎯 يمكنك التعديل بين ${toEnglishNumbers(minPrice.toFixed(2))} ج و ${toEnglishNumbers(maxPrice.toFixed(2))} ج
          </div>
          <div style="font-size: 16px; color: #e65100; font-weight: 700;">
            السعر الحالي: ${toEnglishNumbers(currentPrice.toFixed(2))} ج
          </div>
        </div>
        
        <div class="form-group">
          <label for="newPrice">💰 السعر الجديد (ج) *</label>
          <input type="number" id="newPrice" step="0.01" min="${minPrice}" max="${maxPrice}" value="${currentPrice.toFixed(2)}" required>
        </div>

        <div class="quick-adjust-buttons">
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-10">-10%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-20">-20%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-30">-30%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-40">-40%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-50">-50%</button>
          
          <button type="button" class="btn-quick-adjust increase" data-adjust="10">+10%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="20">+20%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="30">+30%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="40">+40%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="50">+50%</button>
        </div>

        <div class="price-preview">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>السعر الحالي:</span>
            <span style="font-weight: 600;">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>السعر الجديد:</span>
            <span style="font-weight: 600; color: #1e40af;" id="newPricePreview">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span>الفرق:</span>
            <span style="font-weight: 600; color: #059669;" id="priceDifference">0.00 ج</span>
          </div>
        </div>

        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>✅</span>
            حفظ السعر
          </button>
          <button type="button" class="btn btn-secondary" id="cancelEditPrice">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;

  modal.classList.add('active');

  // Event Listeners
  const newPriceInput = document.getElementById('newPrice');
  const newPricePreview = document.getElementById('newPricePreview');
  const priceDifference = document.getElementById('priceDifference');

  // تحديث المعاينة عند تغيير السعر
  function updatePricePreview() {
    const newPrice = parseFloat(newPriceInput.value) || currentPrice;
    const difference = newPrice - currentPrice;
    
    newPricePreview.textContent = `${toEnglishNumbers(newPrice.toFixed(2))} ج`;
    priceDifference.textContent = `${toEnglishNumbers(difference.toFixed(2))} ج`;
    
    // تغيير لون الفرق
    if (difference > 0) {
      priceDifference.style.color = '#059669'; // أخضر للزيادة
    } else if (difference < 0) {
      priceDifference.style.color = '#dc2626'; // أحمر للنقصان
    } else {
      priceDifference.style.color = '#6b7280'; // رمادي
    }
  }

  newPriceInput.addEventListener('input', updatePricePreview);
  
  // أزرار التعديل السريع
  document.querySelectorAll('.btn-quick-adjust').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const adjustPercentage = parseInt(e.target.dataset.adjust);
      const adjustment = currentPrice * (adjustPercentage / 100);
      let newPrice;
      
      if (e.target.classList.contains('increase')) {
        newPrice = currentPrice + adjustment;
      } else {
        newPrice = currentPrice - adjustment;
      }
      
      // التأكد من أن السعر ضمن الحدود
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
      
      newPriceInput.value = newPrice.toFixed(2);
      updatePricePreview();
    });
  });

  document.getElementById('closeEditPriceModal').addEventListener('click', () => {
    // العودة لتفاصيل الحجز الأصلية
    openBookingDetailsModal(booking);
  });

  document.getElementById('cancelEditPrice').addEventListener('click', () => {
    // العودة لتفاصيل الحجز الأصلية
    openBookingDetailsModal(booking);
  });

  const editPriceForm = document.getElementById('editPriceForm');
  editPriceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateBookingPrice(booking.id, newPriceInput.value);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      // العودة لتفاصيل الحجز الأصلية
      openBookingDetailsModal(booking);
    }
  });

  // تحديث المعاينة الأولية
  updatePricePreview();
}
// تحديث سعر الحجز
async function updateBookingPrice(bookingId, newPrice) {
  try {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

const response = await fetch(`/api/bookings/${bookingId}/price`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    new_price: parseFloat(newPrice),
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});

    const data = await response.json();

    if (!response.ok) {
      alert('⚠️ ' + data.message);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return;
    }

    alert('✅ ' + data.message);
    
    // إعادة تحميل الجدول والعودة للقائمة الرئيسية
    closeModal(document.getElementById('bookingDetailsModal'));
    await loadSchedule();

    if (loadingOverlay) loadingOverlay.style.display = 'none';

  } catch (err) {
    console.error('❌ خطأ في تحديث السعر:', err);
    alert('⚠️ حدث خطأ في تحديث السعر');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
}
// دالة تنسيق الوقت بنظام 12 ساعة
  function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    
    // إذا كان الوقت بصيغة HH:MM
    if (typeof timeStr === 'string' && timeStr.includes(':') && timeStr.length <= 8) {
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0]);
      const minutes = parts[1];
      
      // تحويل لنظام 12 ساعة
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // الساعة 0 تصبح 12
      
      return `${toEnglishNumbers(hours)}:${toEnglishNumbers(minutes)} ${period}`;
    }
    
    // إذا كان الوقت بصيغة ISO
    try {
      const date = new Date(timeStr);
      if (!isNaN(date.getTime())) {
        const time = date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Africa/Cairo'
        });
        return toEnglishNumbers(time);
      }
    } catch (e) {
      console.error('خطأ في تنسيق الوقت:', e);
    }
    
    return toEnglishNumbers(timeStr);
  }

async function updateBookingStatus(bookingId, newStatus) {
  try {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
const response = await fetch(`/api/bookings/${bookingId}/status`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    status: newStatus,
    updated_by: currentUser.name,
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});
    
    const data = await response.json();
    
    if (!response.ok) {
      alert('⚠️ ' + data.message);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return;
    }
    
    alert('✅ ' + data.message);
    closeModal(document.getElementById('bookingDetailsModal'));
    await loadSchedule();
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    
  } catch (err) {
    console.error('❌ خطأ في تحديث الحالة:', err);
    alert('⚠️ حدث خطأ في تحديث الحالة');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
}
// في schedule.js - تحديث دالة openRemoveServiceModal
async function openRemoveServiceModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  // أضف هذا في بداية openRemoveServiceModal للتحقق
console.log('🔍 تحليل كامل لبيانات الحجز:', JSON.parse(JSON.stringify(booking)));
  
  // ⭐ تحقق مكثف من بيانات الخدمات
  console.log('🔍 فحص بيانات الحجز:', {
    booking_id: booking.id,
    services: booking.services,
    services_length: booking.services ? booking.services.length : 0,
    services_type: typeof booking.services
  });
  
  if (!booking.services || booking.services.length <= 1) {
    alert('⚠️ لا يمكن حذف جميع الخدمات!\n\nيجب أن يبقى خدمة واحدة على الأقل في الحجز.');
    return;
  }
  
  // ⭐ تحقق من أن الخدمات مصفوفة صالحة
  if (!Array.isArray(booking.services)) {
    alert('❌ بيانات الخدمات غير صالحة');
    return;
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>🗑️ حذف خدمة من الحجز</h3>
        <button class="modal-close" id="closeRemoveServiceModal">&times;</button>
      </div>
      
      <div class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: #e65100; margin-bottom: 8px;">
            ⚠️ اختر الخدمة المراد حذفها
          </div>
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            سيتم إرجاع قيمة الخدمة للعميل وتسجيل العملية في الشيفت
          </p>
        </div>
        
        <div style="padding: 16px; background: #f0f9ff; border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #1e40af; margin-bottom: 12px;">👤 معلومات الحجز</h4>
          <p><strong>العميل:</strong> ${escapeHtml(booking.client_name)}</p>
          <p><strong>نوع الرصيد:</strong> ${escapeHtml(booking.balance_type || 'غير محدد')}</p>
          <p><strong>عدد الخدمات:</strong> ${booking.services.length}</p>
        </div>
        
        <div class="services-to-remove">
          ${booking.services.map((service, index) => {
            // ⭐ معالجة آمنة لبيانات الخدمة
            const serviceName = service.service_name || service.name || `خدمة ${index + 1}`;
            const servicePrice = parseFloat(service.price) || 0;
            const categoryName = service.category_name || 'غير محدد';
            const duration = service.duration || 30;
            
            return `
              <div class="service-remove-card" 
                   style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: all 0.3s ease;" 
                   data-service-index="${index}" 
                   data-service-price="${servicePrice}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">
                      ${escapeHtml(serviceName)}
                    </div>
                    <div style="font-size: 13px; color: #64748b;">
                      ${escapeHtml(categoryName)} • ${toEnglishNumbers(duration)} دقيقة
                    </div>
                  </div>
                  <div style="text-align: left;">
                    <div style="font-size: 20px; font-weight: 700; color: #dc2626;">
                      ${toEnglishNumbers(servicePrice.toFixed(2))} ج
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                      سيتم إرجاعها
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div id="selectedServiceInfo" style="display: none; padding: 16px; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; margin-top: 16px; border: 2px solid #16a34a;">
          <h4 style="color: #15803d; margin-bottom: 8px;">✅ الخدمة المختارة للحذف</h4>
          <div id="selectedServiceDetails"></div>
        </div>
        
        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn btn-danger" id="confirmRemoveServiceBtn" disabled style="opacity: 0.5;">
            <span>✅</span>
            تأكيد الحذف وإرجاع الفلوس
          </button>
          <button type="button" class="btn btn-secondary" id="cancelRemoveService">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  let selectedServiceIndex = null;
  let selectedServicePrice = 0;

  // Event listeners لاختيار الخدمة
  document.querySelectorAll('.service-remove-card').forEach(card => {
    card.addEventListener('click', () => {
      // إلغاء التحديد السابق
      document.querySelectorAll('.service-remove-card').forEach(c => {
        c.style.borderColor = '#e5e7eb';
        c.style.background = 'white';
      });
      
      // تحديد الخدمة الجديدة
      card.style.borderColor = '#dc2626';
      card.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
      
      selectedServiceIndex = parseInt(card.dataset.serviceIndex);
      selectedServicePrice = parseFloat(card.dataset.servicePrice);
      
      console.log('✅ تم اختيار الخدمة:', {
        index: selectedServiceIndex,
        price: selectedServicePrice,
        service_data: booking.services[selectedServiceIndex]
      });
      
      // ⭐ تحقق إضافي من صحة الفهرس
      if (selectedServiceIndex < 0 || selectedServiceIndex >= booking.services.length) {
        console.error('❌ فهرس غير صالح:', {
          selectedIndex: selectedServiceIndex,
          servicesLength: booking.services.length
        });
        alert('❌ فهرس الخدمة غير صالح');
        return;
      }
      
      const service = booking.services[selectedServiceIndex];
      const serviceName = service.service_name || service.name || `خدمة ${selectedServiceIndex + 1}`;
      
      // عرض معلومات الخدمة المختارة
      document.getElementById('selectedServiceDetails').innerHTML = `
        <p style="margin: 0; color: #15803d;">
          <strong>الخدمة:</strong> ${escapeHtml(serviceName)}<br>
          <strong>السعر:</strong> ${toEnglishNumbers(selectedServicePrice.toFixed(2))} ج<br>
          <strong>سيتم إرجاعها إلى:</strong> ${escapeHtml(booking.balance_type || 'الرصيد الأساسي')}
        </p>
      `;
      document.getElementById('selectedServiceInfo').style.display = 'block';
      
      // تفعيل الزرار
      const confirmBtn = document.getElementById('confirmRemoveServiceBtn');
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
    });
  });
  
  // تأكيد الحذف
  document.getElementById('confirmRemoveServiceBtn').addEventListener('click', async () => {
    if (selectedServiceIndex === null) {
      alert('⚠️ الرجاء اختيار خدمة للحذف');
      return;
    }
    
    // ⭐ تحقق نهائي مكثف قبل الإرسال
    if (selectedServiceIndex < 0 || selectedServiceIndex >= booking.services.length) {
      alert('❌ فهرس الخدمة غير صالح');
      return;
    }
    
    const service = booking.services[selectedServiceIndex];
    const serviceName = service.service_name || service.name || `خدمة ${selectedServiceIndex + 1}`;
    
    const confirmed = confirm(
      `🗑️ هل أنت متأكد من حذف هذه الخدمة؟\n\n` +
      `الخدمة: ${serviceName}\n` +
      `السعر: ${selectedServicePrice.toFixed(2)} ج\n\n` +
      `✅ سيتم إرجاع المبلغ للعميل فوراً`
    );
    
    if (!confirmed) return;
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      console.log('📤 إرسال بيانات الحذف النهائية:', {
        booking_id: booking.id,
        service_index: selectedServiceIndex,
        service_name: serviceName,
        service_price: selectedServicePrice,
        balance_type: booking.balance_type,
        client_id: booking.client_id,
        removed_by: currentUser.name
      });
      
const response = await fetch(`/api/bookings/${booking.id}/remove-service`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    service_index: selectedServiceIndex,
    service_name: serviceName,
    service_price: selectedServicePrice,
    balance_type: booking.balance_type,
    client_id: booking.client_id,
    removed_by: currentUser.name,
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});
      
      // ⭐ معالجة الرد بشكل مفصل
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ رد الخادم (نص):', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: 'خطأ غير معروف من الخادم' };
        }
        
        throw new Error(errorData.message || `خطأ ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ نجاح:', data);
      
      alert('✅ ' + data.message);
      closeModal(modal);
      await loadSchedule();
      
    } catch (error) {
      console.error('❌ خطأ في حذف الخدمة:', error);
      alert(`⚠️ ${error.message || 'حدث خطأ في حذف الخدمة'}`);
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('closeRemoveServiceModal').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  document.getElementById('cancelRemoveService').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
      openBookingDetailsModal(booking);
    }
  });
}

// حذف/إلغاء حجز
async function deleteBooking(bookingId) {
  // فتح modal سبب الإلغاء
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  // جلب بيانات الحجز الحالي
  const booking = bookings.find(b => b.id === bookingId);
  if (!booking) {
    alert('❌ الحجز غير موجود');
    return;
  }
  
  // ⭐ التحقق من حالة الحجز
  if (booking.status === 'بدأت' || booking.status === 'انتهت') {
    alert('⚠️ لا يمكن إلغاء حجز بدأ أو انتهى!\n\nيمكنك فقط حذفه نهائياً من قائمة التفاصيل.');
    return;
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>⚠️ سبب إلغاء الحجز</h3>
        <button class="modal-close" id="closeCancelModal">&times;</button>
      </div>
      
      <form id="cancelReasonForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 12px;">🚫</div>
          <p style="font-size: 16px; color: #e65100; font-weight: 600; margin: 0;">
            الرجاء اختيار سبب الإلغاء
          </p>
        </div>
        
        <div class="form-group">
          <label style="font-size: 16px; font-weight: 700; color: #d32f2f; margin-bottom: 16px; display: block;">
            📋 اختر السبب: *
          </label>
          
          <div class="cancellation-reasons">
            <label class="reason-option">
              <input type="radio" name="cancel_reason" value="العميل مردش" required>
              <div class="reason-card">
                <div class="reason-icon">📞</div>
                <div class="reason-text">العميل مردش</div>
              </div>
            </label>
            
            <label class="reason-option">
              <input type="radio" name="cancel_reason" value="العميل مجاش" required>
              <div class="reason-card">
                <div class="reason-icon">🚶</div>
                <div class="reason-text">العميل مجاش</div>
              </div>
            </label>
            
            <label class="reason-option">
              <input type="radio" name="cancel_reason" value="سبب آخر" required>
              <div class="reason-card">
                <div class="reason-icon">✍️</div>
                <div class="reason-text">سبب آخر</div>
              </div>
            </label>
          </div>
        </div>
        
        <div id="otherReasonField" class="form-group" style="display: none;">
          <label>📝 اكتب السبب:</label>
          <textarea id="otherReasonText" rows="3" placeholder="اكتب سبب الإلغاء هنا..." style="resize: vertical;"></textarea>
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-danger">
            <span>✅</span>
            تأكيد الإلغاء
          </button>
          <button type="button" class="btn btn-secondary" id="cancelCancelModal">
            رجوع
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');
  
  // Event listeners
  const reasonRadios = document.querySelectorAll('input[name="cancel_reason"]');
  const otherReasonField = document.getElementById('otherReasonField');
  const otherReasonText = document.getElementById('otherReasonText');
  
  reasonRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'سبب آخر') {
        otherReasonField.style.display = 'block';
        otherReasonText.required = true;
      } else {
        otherReasonField.style.display = 'none';
        otherReasonText.required = false;
        otherReasonText.value = '';
      }
    });
  });
  
  document.getElementById('closeCancelModal')?.addEventListener('click', () => closeModal(modal));
  document.getElementById('cancelCancelModal')?.addEventListener('click', () => closeModal(modal));
  
  const cancelForm = document.getElementById('cancelReasonForm');
  cancelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedReason = document.querySelector('input[name="cancel_reason"]:checked');
    if (!selectedReason) {
      alert('⚠️ الرجاء اختيار سبب الإلغاء');
      return;
    }
    
    let reason = selectedReason.value;
    
    if (reason === 'سبب آخر') {
      const otherText = otherReasonText.value.trim();
      if (!otherText) {
        alert('⚠️ الرجاء كتابة سبب الإلغاء');
        return;
      }
      reason = otherText;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    status: 'ملغي',
    cancellation_reason: reason,
    skip_shift_action: true  // ⭐ عدم التسجيل في الشيفت
  })
});
      
      const data = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ تم إلغاء الحجز بنجاح');
      closeModal(modal);
      await loadSchedule();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (err) {
      console.error('❌ خطأ في إلغاء الحجز:', err);
      alert('⚠️ حدث خطأ');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });

  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
}

  // فتح modal إضافة حجز
  function openAddBookingModal() {
    const modal = document.getElementById('addBookingModal');
    if (!modal) return;
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 900px;">
        <div class="modal-header">
          <h3>➕ إضافة حجز جديد</h3>
          <button class="modal-close" id="closeAddModal">&times;</button>
        </div>
        
        <form id="addBookingForm" class="modal-body">
          <!-- نوع العميل -->
          <div class="form-group">
            <label>👤 نوع العميل *</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="client_type" value="existing" checked>
                عميل حالي
              </label>
              <label class="radio-label">
                <input type="radio" name="client_type" value="new">
                عميل جديد
              </label>
            </div>
          </div>

          <!-- قسم العميل الحالي -->
          <div id="existingClientSection">
            <div class="form-group">
              <label for="searchType">🔍 فلتر البحث *</label>
              <select id="searchType" class="form-control">
                <option value="name">الاسم</option>
                <option value="id">الرقم التعريفي</option>
                <option value="phone">رقم الهاتف</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="clientSearch">البحث عن العميل *</label>
              <input type="text" id="clientSearch" placeholder="ابدأ الكتابة للبحث..." autocomplete="off">
              <div id="clientSuggestions" style="position: relative; z-index: 10;"></div>
            </div>
            
            <div id="clientInfo" class="client-info-box" style="display: none;">
              <div class="client-info-title">معلومات العميل:</div>
              <div id="clientBalances" class="balance-grid"></div>
            </div>
          </div>

          <!-- قسم العميل الجديد -->
          <div id="newClientSection" style="display: none;">
            <div class="form-row">
              <div class="form-group">
                <label for="newClientName">اسم العميل *</label>
                <input type="text" id="newClientName" placeholder="أدخل الاسم">
              </div>
              <div class="form-group">
                <label for="newClientPhone">رقم الهاتف *</label>
                <input type="tel" id="newClientPhone" placeholder="01xxxxxxxxx" maxlength="11">
              </div>
            </div>
          </div>

<!-- نوع الرصيد -->
<div class="form-group">
  <label for="balanceType">💳 نوع الرصيد المستخدم *</label>
  <select id="balanceType" required>
    <option value="">اختر نوع الرصيد</option>
    <option value="رصيد أساسي">رصيد أساسي</option>
    <option value="رصيد عروض">رصيد عروض</option>
    <option value="رصيد ليزر">رصيد ليزر</option>
    <option value="رصيد بشرة">رصيد بشرة</option>
    <option value="حجز بدون دفع">🚫 حجز بدون دفع</option>
  </select>
</div>

          <!-- عدد الخدمات -->
          <div class="form-group">
            <label for="servicesCount">🔢 عدد الخدمات *</label>
            <select id="servicesCount">
              <option value="1">1 خدمة</option>
              <option value="2">2 خدمات</option>
              <option value="3">3 خدمات</option>
              <option value="4">4 خدمات</option>
              <option value="5">5 خدمات</option>
            </select>
          </div>

          <!-- كروت الخدمات -->
          <div id="servicesCardsContainer"></div>

          <!-- أوقات الحجز -->
          <div class="form-row">
            <div class="form-group">
              <label for="startTime">🕐 بداية الحجز *</label>
              <input type="time" id="startTime" required>
            </div>
            <div class="form-group">
              <label for="endTime">🕐 نهاية الحجز *</label>
              <input type="time" id="endTime" required>
            </div>
          </div>

// الإجمالي
<div class="total-box">
  <div class="total-row">
    <span class="total-label">💰 الإجمالي:</span>
    <span class="total-value" id="totalAmount">0.00 ج</span>
  </div>
  
  <!-- زر التعديل يظهر هنا مباشرة -->
  <div id="editButtonContainer" style="margin-top: 10px; display: none;">
    <button type="button" class="btn btn-warning" id="editTotalPriceBtn" style="width: 100%;">
      <span>✏️</span>
      تعديل السعر الإجمالي
    </button>
  </div>
  
  <div id="balanceCheckContainer"></div>
</div>


          <!-- ملاحظات -->
          <div class="form-group">
            <label for="bookingNotes">📝 ملاحظات</label>
            <textarea id="bookingNotes" rows="3" placeholder="أي ملاحظات إضافية..."></textarea>
          </div>

          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">
              <span>✅</span>
              احجز
            </button>
            <button type="button" class="btn btn-secondary" id="cancelAddBooking">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    `;
    
    modal.classList.add('active');
    
    // Event Listeners
    setupAddBookingModalEvents();
  }

  // إعداد الـ Events لـ Modal إضافة الحجز
  function setupAddBookingModalEvents() {
    const modal = document.getElementById('addBookingModal');
    document.getElementById('editBookingBtn')?.addEventListener('click', () => {
  openEditBookingModal();
});

    
    // تبديل بين عميل حالي وجديد
    const clientTypeRadios = document.querySelectorAll('input[name="client_type"]');
    clientTypeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const existingSection = document.getElementById('existingClientSection');
        const newSection = document.getElementById('newClientSection');
        
        if (e.target.value === 'existing') {
          existingSection.style.display = 'block';
          newSection.style.display = 'none';
        } else {
          existingSection.style.display = 'none';
          newSection.style.display = 'block';
          selectedClient = null;
        }
        
        updateBalanceCheck();
      });
  });
    
    // البحث عن العميل مع الاقتراحات
    const clientSearch = document.getElementById('clientSearch');
    const searchType = document.getElementById('searchType');
    const clientSuggestions = document.getElementById('clientSuggestions');
    
    clientSearch.addEventListener('input', (e) => {
      const searchValue = e.target.value.trim().toLowerCase();
      const type = searchType.value;
      
      if (searchValue.length === 0) {
        clientSuggestions.innerHTML = '';
        document.getElementById('clientInfo').style.display = 'none';
        selectedClient = null;
        updateBalanceCheck();
        return;
      }
      
      // تصفية العملاء
      let filteredClients = [];
      
      if (type === 'name') {
        filteredClients = clients.filter(c => c.name.toLowerCase().includes(searchValue));
      } else if (type === 'id') {
        filteredClients = clients.filter(c => String(c.id).includes(searchValue));
      } else if (type === 'phone') {
        filteredClients = clients.filter(c => c.phone.includes(searchValue));
      }
      
      // عرض الاقتراحات
      if (filteredClients.length > 0) {
        clientSuggestions.innerHTML = `
          <div style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); max-height: 300px; overflow-y: auto; z-index: 100; margin-top: 4px;">
            ${filteredClients.map(c => `
              <div class="client-suggestion-item" data-id="${c.id}" style="padding: 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: all 0.2s ease;">
                <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(c.name)}</div>
                <div style="font-size: 13px; color: #757575;">📱 ${c.phone} • 🆔 ${c.id}</div>
              </div>
            `).join('')}
          </div>
        `;
        
        // Event listeners للاقتراحات
        document.querySelectorAll('.client-suggestion-item').forEach(item => {
          item.addEventListener('mouseenter', (e) => {
            e.target.style.background = '#fce4ec';
          });
          item.addEventListener('mouseleave', (e) => {
            e.target.style.background = 'white';
          });
          item.addEventListener('click', () => {
            const clientId = parseInt(item.dataset.id);
            const client = clients.find(c => c.id === clientId);
            if (client) {
              clientSearch.value = client.name;
              selectedClient = client;
              showClientInfo(client);
              clientSuggestions.innerHTML = '';
              updateBalanceCheck();
            }
          });
        });
      } else {
        clientSuggestions.innerHTML = '';
      }
    });
// فتح modal تعديل الحجز
function openEditBookingModal() {
  const modal = document.getElementById('addBookingModal');
  if (!modal) return;
  
  // ⭐ جمع البيانات بدون التحقق من الصحة
  const clientType = document.querySelector('input[name="client_type"]:checked')?.value;
  let clientName = '';
  let clientId = null;

  if (clientType === 'existing' && selectedClient) {
    clientName = selectedClient.name;
    clientId = selectedClient.id;
  } else if (clientType === 'new') {
    clientName = document.getElementById('newClientName')?.value || '';
  }

  const startTime = document.getElementById('startTime')?.value || '';
  const endTime = document.getElementById('endTime')?.value || '';
  const balanceType = document.getElementById('balanceType')?.value || '';
  
  let totalPrice = 0;
  if (window.editedTotalPrice) {
    totalPrice = window.editedTotalPrice;
  } else {
    totalPrice = parseFloat(document.getElementById('totalAmount')?.textContent.replace(' ج', '')) || 0;
  }
  
  // ⭐ جمع الخدمات بدون شروط
  const services = [];
  document.querySelectorAll('.service-select').forEach((select, index) => {
    const serviceId = select.value;
    if (serviceId) {
      const categorySelect = document.querySelector(`.service-category[data-index="${index + 1}"]`);
      const categoryName = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : '';
      const duration = document.querySelector(`.service-duration[data-index="${index + 1}"]`)?.value;
      const price = document.querySelector(`.service-price[data-index="${index + 1}"]`)?.value;
      
      services.push({
        service_id: serviceId,
        service_name: select.options[select.selectedIndex].text,
        category_name: categoryName,
        duration: duration,
        price: price
      });
    }
  });

  // ⭐ حفظ البيانات بدون validation
  const formData = {
    isValid: true,
    clientName,
    clientId,
    clientType,
    startTime,
    endTime,
    totalPrice,
    services,
    balanceType: balanceType
  };

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px;">
      <div class="modal-header">
        <h3>✏️ تعديل الحجز</h3>
        <button class="modal-close" id="closeEditModal">&times;</button>
      </div>
      
      <div class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: #e65100; margin-bottom: 8px;">
            🎯 وضع التعديل
          </div>
          <p style="color: #e65100; margin: 0;">
            يمكنك الآن تعديل بيانات الحجز الحالية
          </p>
        </div>

        <div class="form-group">
          <label>👤 العميل الحالي</label>
          <input type="text" value="${escapeHtml(formData.clientName)}" readonly style="background: #f5f5f5;">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>🕐 وقت البداية الحالي</label>
            <input type="text" value="${formData.startTime}" readonly style="background: #f5f5f5;">
          </div>
          <div class="form-group">
            <label>🕐 وقت النهاية الحالي</label>
            <input type="text" value="${formData.endTime}" readonly style="background: #f5f5f5;">
          </div>
        </div>

        <div class="form-group">
          <label>💰 السعر الإجمالي الحالي</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="text" value="${formData.totalPrice.toFixed(2)} ج" readonly style="background: #f5f5f5; flex: 1;">
            <button type="button" class="btn btn-warning" id="editTotalPriceBtn" style="white-space: nowrap;">
              <span>✏️</span>
              تعديل السعر
            </button>
          </div>
        </div>

        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin: 20px 0;">
          <h4 style="color: #1565c0; margin-bottom: 15px;">⚙️ خيارات التعديل</h4>
          
          <div class="form-group">
            <label for="editAction">اختر الإجراء:</label>
            <select id="editAction" class="form-control">
              <option value="change_time">تغيير الوقت فقط</option>
              <option value="change_services">تغيير الخدمات فقط</option>
              <option value="change_both">تغيير الوقت والخدمات</option>
              <option value="change_price">تغيير السعر فقط</option>
            </select>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-success" id="confirmEditBtn">
            <span>✅</span>
            متابعة التعديل
          </button>
          <button class="btn btn-secondary" id="cancelEditBtn">
            إلغاء التعديل
          </button>
        </div>
      </div>
    </div>
  `;

  window.currentBookingData = formData;

  document.getElementById('closeEditModal')?.addEventListener('click', () => {
    openAddBookingModal();
    restoreFormData(window.currentBookingData);
  });

  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    openAddBookingModal();
    restoreFormData(window.currentBookingData);
  });

  document.getElementById('confirmEditBtn')?.addEventListener('click', () => {
    const editAction = document.getElementById('editAction').value;
    proceedWithEdit(editAction);
  });

  document.getElementById('editTotalPriceBtn')?.addEventListener('click', () => {
    openEditTotalPriceModalInEdit();
  });

  setupEditButtonListeners();
}

// دالة تعديل السعر أثناء التعديل (نسخة مخصصة للتعديل)
function openEditTotalPriceModalInEdit() {
  const modal = document.getElementById('addBookingModal');
  if (!modal) return;

  // ⭐ حساب السعر الصحيح من البيانات المحفوظة (بطريقة ذكية)
  let currentPrice = 0;
  
  // 1️⃣ حاول تقرأ من البيانات المحفوظة
  if (window.currentBookingData?.totalPrice) {
    currentPrice = window.currentBookingData.totalPrice;
    console.log('💰 السعر من currentBookingData:', currentPrice);
  } 
  // 2️⃣ لو مش موجود، حاول تقرأ من totalAmount الظاهر
  else {
    const totalAmountEl = document.getElementById('totalAmount');
    if (totalAmountEl) {
      const totalText = totalAmountEl.textContent.replace(' ج', '').trim();
      const totalFromUI = parseFloat(totalText) || 0;
      
      if (totalFromUI > 0) {
        currentPrice = totalFromUI;
        console.log('💰 السعر من totalAmount UI:', currentPrice);
      }
    }
  }
  
  if (currentPrice === 0) {
    alert('⚠️ لا يوجد سعر لتعديله');
    return;
  }

const minPrice = 0; // أقل سعر مسموح به (صفر)
const maxPrice = 1000000; // أعلى سعر مسموح به (مليون جنيه)

  // ⭐ حفظ HTML الأصلي قبل استبداله
  if (!window.originalEditFormHTML) {
    window.originalEditFormHTML = modal.innerHTML;
  }

  const modalHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>✏️ تعديل السعر الإجمالي</h3>
        <button class="modal-close" id="closeEditPriceModalInEdit">&times;</button>
      </div>
      
      <form id="editPriceFormInEdit" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 14px; color: #e65100; font-weight: 600; margin-bottom: 8px;">
            🎯 يمكنك التعديل بين ${toEnglishNumbers(minPrice.toFixed(2))} ج و ${toEnglishNumbers(maxPrice.toFixed(2))} ج
          </div>
          <div style="font-size: 16px; color: #e65100; font-weight: 700;">
            السعر الحالي: ${toEnglishNumbers(currentPrice.toFixed(2))} ج
          </div>
        </div>
        
        <div class="form-group">
          <label for="newPriceInEdit">💰 السعر الجديد (ج) *</label>
          <input type="number" id="newPriceInEdit" step="0.01" min="${minPrice}" max="${maxPrice}" value="${currentPrice.toFixed(2)}" required style="font-size: 16px; font-weight: 600;">
        </div>

        <div class="quick-adjust-buttons" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 15px 0;">
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-10">-10%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-20">-20%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-30">-30%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-40">-40%</button>
          <button type="button" class="btn-quick-adjust decrease" data-adjust="-50">-50%</button>
          
          <button type="button" class="btn-quick-adjust increase" data-adjust="10">+10%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="20">+20%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="30">+30%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="40">+40%</button>
          <button type="button" class="btn-quick-adjust increase" data-adjust="50">+50%</button>
        </div>

        <div class="price-preview" style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 15px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>السعر الحالي:</span>
            <span style="font-weight: 600;">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>السعر الجديد:</span>
            <span style="font-weight: 600; color: #1e40af;" id="newPricePreviewInEdit">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span>الفرق:</span>
            <span style="font-weight: 600; color: #059669;" id="priceDifferenceInEdit">0.00 ج</span>
          </div>
        </div>

        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>✅</span>
            حفظ السعر
          </button>
          <button type="button" class="btn btn-secondary" id="cancelEditPriceInEdit">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;

  // تعيين HTML الجديد
  modal.innerHTML = modalHTML;

  // Event Listeners
  const newPriceInput = document.getElementById('newPriceInEdit');
  const newPricePreview = document.getElementById('newPricePreviewInEdit');
  const priceDifference = document.getElementById('priceDifferenceInEdit');

  if (!newPriceInput || !newPricePreview || !priceDifference) {
    console.error('❌ عناصر التعديل غير موجودة');
    restoreEditForm();
    return;
  }

  // تحديث المعاينة عند تغيير السعر
  function updatePricePreview() {
    const newPrice = parseFloat(newPriceInput.value) || currentPrice;
    const difference = newPrice - currentPrice;
    
    newPricePreview.textContent = `${toEnglishNumbers(newPrice.toFixed(2))} ج`;
    priceDifference.textContent = `${toEnglishNumbers(difference.toFixed(2))} ج`;
    
    // تغيير لون الفرق
    if (difference > 0) {
      priceDifference.style.color = '#059669';
    } else if (difference < 0) {
      priceDifference.style.color = '#dc2626';
    } else {
      priceDifference.style.color = '#6b7280';
    }
  }

  newPriceInput.addEventListener('input', updatePricePreview);
  
  // أزرار التعديل السريع
  document.querySelectorAll('.btn-quick-adjust').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const adjustPercentage = parseInt(e.target.dataset.adjust);
      const adjustment = currentPrice * (adjustPercentage / 100);
      let newPrice;
      
      if (e.target.classList.contains('increase')) {
        newPrice = currentPrice + adjustment;
      } else {
        newPrice = currentPrice - adjustment;
      }
      
      // التأكد من أن السعر ضمن الحدود
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
      
      newPriceInput.value = newPrice.toFixed(2);
      updatePricePreview();
    });
  });

  document.getElementById('closeEditPriceModalInEdit')?.addEventListener('click', () => {
    restoreEditForm();
  });

  document.getElementById('cancelEditPriceInEdit')?.addEventListener('click', () => {
    restoreEditForm();
  });

  const editPriceForm = document.getElementById('editPriceFormInEdit');
  editPriceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPrice = parseFloat(newPriceInput.value);
    
    if (isNaN(newPrice)) {
      alert('⚠️ الرجاء إدخال سعر صحيح');
      return;
    }
    
    // ⭐ تحديث السعر في البيانات المحفوظة
    if (window.currentBookingData) {
      window.currentBookingData.totalPrice = newPrice;
    }
    
    // العودة للنموذج الأصلي
    restoreEditForm();
    
    alert('✅ تم تعديل السعر بنجاح');
  });

  // تحديث المعاينة الأولية
  updatePricePreview();
}

// دالة استعادة نموذج التعديل الأصلي
function restoreEditForm() {
  const modal = document.getElementById('addBookingModal');
  if (!modal || !window.originalEditFormHTML) return;
  
  // استعادة HTML الأصلي
  modal.innerHTML = window.originalEditFormHTML;
  
  // ⭐ تحديث عرض السعر المعدل
  const priceInput = modal.querySelector('input[readonly][style*="background: #f5f5f5"]');
  if (priceInput && window.currentBookingData) {
    priceInput.value = `${window.currentBookingData.totalPrice.toFixed(2)} ج`;
  }
  
  // حذف HTML المحفوظ
  delete window.originalEditFormHTML;
  
  // إعادة تهيئة الأحداث
  document.getElementById('closeEditModal')?.addEventListener('click', () => {
    openAddBookingModal();
    restoreFormData(window.currentBookingData);
  });

  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    openAddBookingModal();
    restoreFormData(window.currentBookingData);
  });

  document.getElementById('confirmEditBtn')?.addEventListener('click', () => {
    const editAction = document.getElementById('editAction').value;
    proceedWithEdit(editAction);
  });

  document.getElementById('editTotalPriceBtn')?.addEventListener('click', () => {
    openEditTotalPriceModalInEdit();
  });
}

function collectCurrentFormData() {
  const clientType = document.querySelector('input[name="client_type"]:checked')?.value;
  let clientName = '';
  let clientId = null;

  if (clientType === 'existing' && selectedClient) {
    clientName = selectedClient.name;
    clientId = selectedClient.id;
  } else if (clientType === 'new') {
    clientName = document.getElementById('newClientName')?.value || '';
  }

  const startTime = document.getElementById('startTime')?.value;
  const endTime = document.getElementById('endTime')?.value;
  const balanceType = document.getElementById('balanceType')?.value;
  
  // ⭐ الحساب الصحيح للسعر الإجمالي
  let totalPrice = 0;
  
  // إذا كان هناك سعر معدل، استخدمه
  if (window.editedTotalPrice) {
    totalPrice = window.editedTotalPrice;
  } else {
    totalPrice = parseFloat(document.getElementById('totalAmount')?.textContent.replace(' ج', '')) || 0;
  }

  // ⭐ جمع بيانات الخدمات بطريقة صحيحة
  const services = [];
  
  if (balanceType === 'رصيد عروض' && window.selectedOfferService) {
    // إذا كان رصيد عروض، استخدم بيانات العرض المحفوظة
    const selected = window.selectedOfferService;
    
    if (selected.isFullOffer) {
      // العرض كامل
      services.push(...selected.services);
    } else {
      // خدمة واحدة
      services.push({
        service_name: selected.serviceName,
        duration: selected.duration
      });
    }
  } else {
    // خدمات عادية
    document.querySelectorAll('.service-select').forEach((select, index) => {
      const serviceId = select.value;
      if (!serviceId) return;
      
      const categorySelect = document.querySelector(`.service-category[data-index="${index + 1}"]`);
      const categoryName = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : '';
      const duration = document.querySelector(`.service-duration[data-index="${index + 1}"]`)?.value;
      const price = document.querySelector(`.service-price[data-index="${index + 1}"]`)?.value;
      
      services.push({
        service_id: serviceId,
        service_name: select.options[select.selectedIndex].text,
        category_name: categoryName,
        duration: duration,
        price: price
      });
    });
  }

// ⭐ التحقق من البيانات الأساسية
  if (!clientName || !startTime || !endTime) {
    return { isValid: false, message: 'بيانات العميل والوقت مطلوبة' };
  }
  
  // ⭐ لو مفيش نوع رصيد، نسيب الموضوع يعدي - مش شرط دلوقتي

  // عشان نقدر نفتح الـ modal ونكمل الباقي جواه
  
  return {
    isValid: true,
    clientName,
    clientId,
    clientType,
    startTime,
    endTime,
    totalPrice,
    services,
    balanceType: balanceType
  };
}

// دالة للمتابعة حسب نوع التعديل
function proceedWithEdit(editAction) {
  const currentData = window.currentBookingData;
  
  switch(editAction) {
    case 'change_time':
      openTimeEditModal(currentData);
      break;
    case 'change_services':
      openServicesEditModal(currentData);
      break;
    case 'change_both':
      openFullEditModal(currentData);
      break;
    case 'change_price':
      openPriceEditModal(currentData);
      break;
  }
}

// دالة تعديل الوقت فقط
function openTimeEditModal(currentData) {
  const modal = document.getElementById('addBookingModal');
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>🕐 تعديل الوقت</h3>
        <button class="modal-close" id="closeTimeEditModal">&times;</button>
      </div>
      
      <form id="timeEditForm" class="modal-body">
        <div style="padding: 16px; background: #f0f9ff; border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #0369a1; margin-bottom: 10px;">البيانات الحالية</h4>
          <p><strong>العميل:</strong> ${escapeHtml(currentData.clientName)}</p>
          <p><strong>الوقت الحالي:</strong> ${currentData.startTime} - ${currentData.endTime}</p>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="newStartTime">🕐 وقت البداية الجديد *</label>
            <input type="time" id="newStartTime" value="${currentData.startTime}" required>
          </div>
          <div class="form-group">
            <label for="newEndTime">🕐 وقت النهاية الجديد *</label>
            <input type="time" id="newEndTime" value="${currentData.endTime}" required>
          </div>
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>💾</span>
            حفظ التعديل
          </button>
          <button type="button" class="btn btn-secondary" id="backToEditOptions">
            رجوع
          </button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('closeTimeEditModal')?.addEventListener('click', () => {
    openAddBookingModal();
    restoreFormData(currentData);
  });

  document.getElementById('backToEditOptions')?.addEventListener('click', () => {
    openEditBookingModal();
  });

  document.getElementById('timeEditForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newStartTime = document.getElementById('newStartTime').value;
    const newEndTime = document.getElementById('newEndTime').value;
    
    // تحديث البيانات
    currentData.startTime = newStartTime;
    currentData.endTime = newEndTime;
    
    // العودة للنموذج مع البيانات المحدثة
    openAddBookingModal();
    restoreFormData(currentData);
    
    alert('✅ تم تعديل الوقت بنجاح');
  });
}

// دالة استعادة البيانات في النموذج
function restoreFormData(data) {
  // استعادة نوع العميل
  if (data.clientType === 'existing') {
    document.querySelector('input[name="client_type"][value="existing"]').checked = true;
    if (data.clientId && selectedClient) {
      document.getElementById('clientSearch').value = selectedClient.name;
      document.getElementById('clientInfo').style.display = 'block';
    }
  } else {
    document.querySelector('input[name="client_type"][value="new"]').checked = true;
    document.getElementById('newClientName').value = data.clientName;
  }

  // استعادة الأوقات
  document.getElementById('startTime').value = data.startTime;
  document.getElementById('endTime').value = data.endTime;

  // استعادة نوع الرصيد
  if (data.balanceType) {
    document.getElementById('balanceType').value = data.balanceType;
  }

  // استعادة الخدمات (هذا يحتاج لمزيد من المعالجة)
  setTimeout(() => {
    document.getElementById('totalAmount').textContent = data.totalPrice.toFixed(2) + ' ج';
    toggleEditButton();
  }, 100);
}
    
    // إغلاق الاقتراحات عند النقر خارجها
    document.addEventListener('click', (e) => {
      if (!clientSearch.contains(e.target) && !clientSuggestions.contains(e.target)) {
        clientSuggestions.innerHTML = '';
      }
    });
    
    // عرض معلومات العميل
    function showClientInfo(client) {
      const clientInfo = document.getElementById('clientInfo');
      const clientBalances = document.getElementById('clientBalances');
      
      clientBalances.innerHTML = `
        <div class="balance-item">
          <strong>رصيد أساسي:</strong><br>
          ${parseFloat(client.balance_basic || 0).toFixed(2)} ج
        </div>
        <div class="balance-item">
          <strong>رصيد عروض:</strong><br>
          ${parseFloat(client.balance_offers || 0).toFixed(2)} ج
        </div>
        <div class="balance-item">
          <strong>رصيد ليزر:</strong><br>
          ${parseFloat(client.balance_laser || 0).toFixed(2)} ج
        </div>
        <div class="balance-item">
          <strong>رصيد بشرة:</strong><br>
          ${parseFloat(client.balance_skin || 0).toFixed(2)} ج
        </div>
      `;
      
      clientInfo.style.display = 'block';
    }
    
    // تغيير عدد الخدمات
    const servicesCount = document.getElementById('servicesCount');
    servicesCount.addEventListener('change', createServiceCards);
    
    // إنشاء كروت الخدمات
    function createServiceCards() {
      const count = parseInt(servicesCount.value);
      const container = document.getElementById('servicesCardsContainer');
      container.innerHTML = '';
      
      for (let i = 1; i <= count; i++) {
        const card = document.createElement('div');
        card.className = 'service-card-form';
        card.innerHTML = `
          <div class="service-card-form-header">
            خدمة ${i}
          </div>
          <div class="service-card-form-body">
            <div class="form-group">
              <label>القسم *</label>
              <select class="service-category" data-index="${i}">
                <option value="">اختر القسم</option>
                ${categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}
              </select>
            </div>
            
            <div class="form-group">
              <label>الخدمة *</label>
              <select class="service-select" data-index="${i}">
                <option value="">اختر القسم أولاً</option>
              </select>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>المدة (دقيقة) *</label>
                <input type="number" class="service-duration" data-index="${i}" min="15" step="15" value="30" readonly style="background: #f5f5f5;">
              </div>
              
              <div class="form-group">
                <label>السعر (ج) *</label>
                <input type="number" class="service-price" data-index="${i}" step="0.01" readonly style="background: #f5f5f5;">
              </div>
            </div>
          </div>
        `;
        container.appendChild(card);
      }
      
      // Event listeners للأقسام
      document.querySelectorAll('.service-category').forEach(select => {
        select.addEventListener('change', (e) => {
          const index = e.target.dataset.index;
          const categoryId = e.target.value;
          const serviceSelect = document.querySelector(`.service-select[data-index="${index}"]`);
          
          serviceSelect.innerHTML = '<option value="">اختر الخدمة</option>';
          
          if (categoryId) {
            const categoryServices = services.filter(s => s.category_id == categoryId);
            categoryServices.forEach(service => {
              const option = document.createElement('option');
              option.value = service.id;
              option.textContent = service.name;
              option.dataset.duration = service.duration;
              option.dataset.price = service.price;
              serviceSelect.appendChild(option);
            });
          }
          
          // إعادة حساب الإجمالي
          calculateTotal();
        });
      });
      
      // Event listeners للخدمات
      document.querySelectorAll('.service-select').forEach(select => {
        select.addEventListener('change', (e) => {
          const index = e.target.dataset.index;
          const selectedOption = e.target.options[e.target.selectedIndex];
          
          if (selectedOption.value) {
            const duration = selectedOption.dataset.duration;
            const price = selectedOption.dataset.price;
            
            document.querySelector(`.service-duration[data-index="${index}"]`).value = duration;
            document.querySelector(`.service-price[data-index="${index}"]`).value = parseFloat(price).toFixed(2);
            
            calculateTotal();
          } else {
            document.querySelector(`.service-duration[data-index="${index}"]`).value = 30;
            document.querySelector(`.service-price[data-index="${index}"]`).value = '';
            calculateTotal();
          }
        });
      });
    }

// إظهار/إخفاء زر التعديل بناءً على اكتمال البيانات
function toggleEditButton() {
  const editButtonContainer = document.getElementById('editButtonContainer');
  const clientType = document.querySelector('input[name="client_type"]:checked')?.value;
  const startTime = document.getElementById('startTime')?.value;
  const endTime = document.getElementById('endTime')?.value;
  const balanceType = document.getElementById('balanceType')?.value;
  
  // ⭐ حساب السعر بشكل صحيح (مع مراعاة السعر المعدل)
  let totalPrice = 0;
  if (window.editedTotalPrice) {
    totalPrice = window.editedTotalPrice;
  } else {
    totalPrice = parseFloat(document.getElementById('totalAmount')?.textContent.replace(' ج', '')) || 0;
  }
  
  // ⭐ التحقق من وجود خدمات بطريقة ذكية
  let hasServices = false;
  
  if (balanceType === 'رصيد عروض') {
    // رصيد عروض: لازم يكون فيه عرض محدد
    hasServices = window.selectedOfferService !== null && window.selectedOfferService !== undefined;
  } else if (balanceType) {
    // رصيد عادي: لازم يكون السعر > 0 أو فيه خدمات في الـ DOM
    const serviceSelects = document.querySelectorAll('.service-select');
    let hasSelectedServices = false;
    serviceSelects.forEach(select => {
      if (select.value) hasSelectedServices = true;
    });
    hasServices = totalPrice > 0 || hasSelectedServices;
  }
  
  let hasValidData = false;
  
  if (clientType === 'existing') {
    hasValidData = selectedClient && startTime && endTime && balanceType && hasServices;
  } else if (clientType === 'new') {
    const newClientName = document.getElementById('newClientName')?.value;
    const newClientPhone = document.getElementById('newClientPhone')?.value;
    hasValidData = newClientName && newClientPhone && startTime && endTime && balanceType && hasServices;
  }
  
  if (editButtonContainer) {
    editButtonContainer.style.display = hasValidData ? 'block' : 'none';
  }
}
// تحديث ظهور زر التعديل عند تغيير أي حقل
function setupEditButtonListeners() {
  // تحديث عند تغيير نوع العميل
  document.querySelectorAll('input[name="client_type"]').forEach(radio => {
    radio.addEventListener('change', toggleEditButton);
  });
  
  // تحديث عند تغيير بيانات العميل
  document.getElementById('clientSearch')?.addEventListener('input', toggleEditButton);
  document.getElementById('newClientName')?.addEventListener('input', toggleEditButton);
  document.getElementById('newClientPhone')?.addEventListener('input', toggleEditButton);
  
  // تحديث عند تغيير الأوقات
  document.getElementById('startTime')?.addEventListener('change', toggleEditButton);
  document.getElementById('endTime')?.addEventListener('change', toggleEditButton);
  
  // تحديث عند تغيير الخدمات
  document.getElementById('servicesCount')?.addEventListener('change', () => {
    setTimeout(toggleEditButton, 100);
  });
  
  // تحديث عند تغيير أي خدمة
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('service-category') || 
        e.target.classList.contains('service-select')) {
      setTimeout(toggleEditButton, 100);
    }
  });
}

// تحديث ظهور زر التعديل عند تغيير أي حقل
function setupEditButtonListeners() {
  // تحديث عند تغيير نوع العميل
  document.querySelectorAll('input[name="client_type"]').forEach(radio => {
    radio.addEventListener('change', toggleEditButton);
  });
  
  // تحديث عند تغيير بيانات العميل
  document.getElementById('clientSearch')?.addEventListener('input', toggleEditButton);
  document.getElementById('newClientName')?.addEventListener('input', toggleEditButton);
  document.getElementById('newClientPhone')?.addEventListener('input', toggleEditButton);
  
  // تحديث عند تغيير الأوقات
  document.getElementById('startTime')?.addEventListener('change', toggleEditButton);
  document.getElementById('endTime')?.addEventListener('change', toggleEditButton);
  
  // تحديث عند تغيير الخدمات
  document.getElementById('servicesCount')?.addEventListener('change', () => {
    setTimeout(toggleEditButton, 100);
  });
  
  // تحديث عند تغيير أي خدمة
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('service-category') || 
        e.target.classList.contains('service-select')) {
      setTimeout(toggleEditButton, 100);
    }
  });
}

// استدعاء الدالة في نهاية setupAddBookingModalEvents
setupEditButtonListeners();

// ⭐ إضافة Event Listener لزر تعديل السعر
const editTotalPriceBtn = document.getElementById('editTotalPriceBtn');
if (editTotalPriceBtn) {
  editTotalPriceBtn.addEventListener('click', () => {
    openEditTotalPriceModal();
  });
}    
    // حساب الإجمالي
function calculateTotal() {
  const balanceType = document.getElementById('balanceType')?.value;
  
  // ⭐ إذا كان حجز بدون دفع - السعر = 0
  if (balanceType === 'حجز بدون دفع') {
    document.getElementById('totalAmount').textContent = `0.00 ج`;
    updateBalanceCheck();
    toggleEditButton();
    return;
  }
  
  let totalPrice = 0;
  
  document.querySelectorAll('.service-price').forEach(input => {
    const price = parseFloat(input.value) || 0;
    totalPrice += price;
  });
  
  document.getElementById('totalAmount').textContent = `${totalPrice.toFixed(2)} ج`;
  
  updateBalanceCheck();
  toggleEditButton();
}
// فتح modal تعديل السعر الإجمالي أثناء الحجز
function openEditTotalPriceModal() {
    const modal = document.getElementById('addBookingModal');
    if (!modal) return;

    // ⭐ 1️⃣ حفظ البيانات الحالية قبل أي شيء
    const formData = collectFormData();
    
    if (!formData) {
       // alert('⚠️ الرجاء ملء البيانات الأساسية أولاً');
        return;
    }

    // ⭐ 2️⃣ حساب السعر بطريقة ذكية
    let currentPrice = 0;
    
    if (window.editedTotalPrice) {
        currentPrice = window.editedTotalPrice;
        console.log('💰 السعر من window.editedTotalPrice:', currentPrice);
    } else {
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalAmountEl) {
            const totalText = totalAmountEl.textContent.replace(' ج', '').trim();
            const totalFromUI = parseFloat(totalText) || 0;
            
            if (totalFromUI > 0) {
                currentPrice = totalFromUI;
                console.log('💰 السعر من totalAmount UI:', currentPrice);
            }
        }
        
        if (currentPrice === 0) {
            const balanceType = document.getElementById('balanceType')?.value;
            
            if (balanceType === 'رصيد عروض') {
                currentPrice = 0;
                console.log('💰 رصيد عروض - السعر = 0');
            } else {
                let totalFromServices = 0;
                document.querySelectorAll('.service-price').forEach(input => {
                    const price = parseFloat(input.value) || 0;
                    totalFromServices += price;
                });
                currentPrice = totalFromServices;
                console.log('💰 السعر من الخدمات:', currentPrice);
            }
        }
    }

if (currentPrice === 0) {
    // ⭐ لا نفعل شيء - نوقف التنفيذ فقط
    return;
}

    console.log('✅ السعر النهائي للتعديل:', currentPrice);

const minPrice = 0; // أقل سعر مسموح به (صفر)
const maxPrice = 1000000; // أعلى سعر مسموح به (مليون جنيه)

    // ⭐ 3️⃣ حفظ HTML الأصلي
    if (!window.originalBookingFormHTML) {
        window.originalBookingFormHTML = modal.innerHTML;
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>✏️ تعديل السعر الإجمالي</h3>
                <button class="modal-close" id="closeEditTotalPriceModal">&times;</button>
            </div>
            
            <form id="editTotalPriceForm" class="modal-body">
                <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
                    <div style="font-size: 14px; color: #e65100; font-weight: 600; margin-bottom: 8px;">
                        🎯 يمكنك التعديل بين ${toEnglishNumbers(minPrice.toFixed(2))} ج و ${toEnglishNumbers(maxPrice.toFixed(2))} ج
                    </div>
                    <div style="font-size: 16px; color: #e65100; font-weight: 700;">
                        السعر الحالي: ${toEnglishNumbers(currentPrice.toFixed(2))} ج
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="newTotalPrice">💰 السعر الجديد (ج) *</label>
                    <input type="number" id="newTotalPrice" step="0.01" min="${minPrice}" max="${maxPrice}" value="${currentPrice.toFixed(2)}" required>
                </div>


                <div class="price-preview">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>السعر الحالي:</span>
                        <span style="font-weight: 600;">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>السعر الجديد:</span>
                        <span style="font-weight: 600; color: #1e40af;" id="newTotalPricePreview">${toEnglishNumbers(currentPrice.toFixed(2))} ج</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                        <span>الفرق:</span>
                        <span style="font-weight: 600; color: #059669;" id="totalPriceDifference">0.00 ج</span>
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="submit" class="btn btn-success">
                        <span>✅</span>
                        حفظ السعر
                    </button>
                    <button type="button" class="btn btn-secondary" id="cancelEditTotalPrice">
                        إلغاء
                    </button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');

    const newPriceInput = document.getElementById('newTotalPrice');
    const newPricePreview = document.getElementById('newTotalPricePreview');
    const priceDifference = document.getElementById('totalPriceDifference');

    function updatePricePreview() {
        const newPrice = parseFloat(newPriceInput.value) || currentPrice;
        const difference = newPrice - currentPrice;
        
        newPricePreview.textContent = `${toEnglishNumbers(newPrice.toFixed(2))} ج`;
        priceDifference.textContent = `${toEnglishNumbers(difference.toFixed(2))} ج`;
        
        if (difference > 0) {
            priceDifference.style.color = '#059669';
        } else if (difference < 0) {
            priceDifference.style.color = '#dc2626';
        } else {
            priceDifference.style.color = '#6b7280';
        }
    }

    newPriceInput.addEventListener('input', updatePricePreview);
    
    document.querySelectorAll('.btn-quick-adjust').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const adjustPercentage = parseInt(e.target.dataset.adjust);
            const adjustment = currentPrice * (adjustPercentage / 100);
            let newPrice;
            
            if (e.target.classList.contains('increase')) {
                newPrice = currentPrice + adjustment;
            } else {
                newPrice = currentPrice - adjustment;
            }
            
            newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
            
            newPriceInput.value = newPrice.toFixed(2);
            updatePricePreview();
        });
    });

    // ⭐ 4️⃣ عند الإلغاء - استعادة البيانات
    document.getElementById('closeEditTotalPriceModal').addEventListener('click', () => {
        restoreBookingForm(formData);
    });

    document.getElementById('cancelEditTotalPrice').addEventListener('click', () => {
        restoreBookingForm(formData);
    });

    // ⭐ 5️⃣ عند الحفظ - استعادة البيانات + تحديث السعر
const editPriceForm = document.getElementById('editTotalPriceForm');
editPriceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPrice = parseFloat(newPriceInput.value);
    
    // ⭐ حفظ السعر المعدل
    window.editedTotalPrice = newPrice;
    
    // استعادة النموذج
    restoreBookingForm(formData);
    
    // ⭐ تحديث السعر في UI بعد استعادة النموذج
    setTimeout(() => {
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalAmountEl) {
            totalAmountEl.textContent = `${newPrice.toFixed(2)} ج`;
            console.log('✅ تم تحديث السعر المعدل في UI:', newPrice);
            
            // تحديث فحص الرصيد مع السعر الجديد
            updateBalanceCheck();
            
            // تحديث زر التعديل
            toggleEditButton();
        }
    }, 250); // ⭐ زودنا الوقت لـ 250ms
    
    alert('✅ تم تعديل السعر بنجاح\n\nالسعر الجديد: ' + newPrice.toFixed(2) + ' ج');
});

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            restoreBookingForm(formData);
        }
    });

    updatePricePreview();
}

// ⭐ دالة جمع بيانات النموذج
function collectFormData() {
    const clientType = document.querySelector('input[name="client_type"]:checked')?.value;
    
    if (!clientType) return null;
    
    const data = {
        clientType: clientType,
        balanceType: document.getElementById('balanceType')?.value || '',
        servicesCount: document.getElementById('servicesCount')?.value || '1',
        startTime: document.getElementById('startTime')?.value || '',
        endTime: document.getElementById('endTime')?.value || '',
        notes: document.getElementById('bookingNotes')?.value || ''
    };
    
    if (clientType === 'existing') {
        data.selectedClient = selectedClient;
        data.clientSearchValue = document.getElementById('clientSearch')?.value || '';
        data.searchType = document.getElementById('searchType')?.value || 'name';
    } else {
        data.newClientName = document.getElementById('newClientName')?.value || '';
        data.newClientPhone = document.getElementById('newClientPhone')?.value || '';
    }
    
    // حفظ بيانات الخدمات
    data.services = [];
    document.querySelectorAll('.service-card-form').forEach((card, index) => {
        const i = index + 1;
        data.services.push({
            categoryId: document.querySelector(`.service-category[data-index="${i}"]`)?.value || '',
            serviceId: document.querySelector(`.service-select[data-index="${i}"]`)?.value || '',
            duration: document.querySelector(`.service-duration[data-index="${i}"]`)?.value || '30',
            price: document.querySelector(`.service-price[data-index="${i}"]`)?.value || ''
        });
    });
    
    return data;
}

// ⭐ دالة استعادة بيانات النموذج
function restoreBookingForm(formData) {
    const modal = document.getElementById('addBookingModal');
    if (!modal || !window.originalBookingFormHTML) return;
    
    // استعادة HTML الأصلي
    modal.innerHTML = window.originalBookingFormHTML;
    delete window.originalBookingFormHTML;
    
    // إعادة تهيئة الأحداث
    setupAddBookingModalEvents();
    
    // استعادة البيانات
    setTimeout(() => {
        // نوع العميل
        const clientTypeRadio = document.querySelector(`input[name="client_type"][value="${formData.clientType}"]`);
        if (clientTypeRadio) clientTypeRadio.checked = true;
        
        if (formData.clientType === 'existing') {
            document.getElementById('existingClientSection').style.display = 'block';
            document.getElementById('newClientSection').style.display = 'none';
            
            if (formData.searchType) {
                document.getElementById('searchType').value = formData.searchType;
            }
            if (formData.clientSearchValue) {
                document.getElementById('clientSearch').value = formData.clientSearchValue;
            }
            if (formData.selectedClient) {
                selectedClient = formData.selectedClient;
                const clientInfo = document.getElementById('clientInfo');
                const clientBalances = document.getElementById('clientBalances');
                
                clientBalances.innerHTML = `
                    <div class="balance-item">
                        <strong>رصيد أساسي:</strong><br>
                        ${parseFloat(selectedClient.balance_basic || 0).toFixed(2)} ج
                    </div>
                    <div class="balance-item">
                        <strong>رصيد عروض:</strong><br>
                        ${parseFloat(selectedClient.balance_offers || 0).toFixed(2)} ج
                    </div>
                    <div class="balance-item">
                        <strong>رصيد ليزر:</strong><br>
                        ${parseFloat(selectedClient.balance_laser || 0).toFixed(2)} ج
                    </div>
                    <div class="balance-item">
                        <strong>رصيد بشرة:</strong><br>
                        ${parseFloat(selectedClient.balance_skin || 0).toFixed(2)} ج
                    </div>
                `;
                clientInfo.style.display = 'block';
            }
        } else {
            document.getElementById('existingClientSection').style.display = 'none';
            document.getElementById('newClientSection').style.display = 'block';
            
            if (formData.newClientName) {
                document.getElementById('newClientName').value = formData.newClientName;
            }
            if (formData.newClientPhone) {
                document.getElementById('newClientPhone').value = formData.newClientPhone;
            }
        }
        
        // باقي البيانات
        if (formData.balanceType) {
            document.getElementById('balanceType').value = formData.balanceType;
        }
        if (formData.servicesCount) {
            document.getElementById('servicesCount').value = formData.servicesCount;
            createServiceCards();
        }
        if (formData.startTime) {
            document.getElementById('startTime').value = formData.startTime;
        }
        if (formData.endTime) {
            document.getElementById('endTime').value = formData.endTime;
        }
        if (formData.notes) {
            document.getElementById('bookingNotes').value = formData.notes;
        }
        
        // استعادة الخدمات
        setTimeout(() => {
            formData.services.forEach((service, index) => {
                const i = index + 1;
                
                if (service.categoryId) {
                    const categorySelect = document.querySelector(`.service-category[data-index="${i}"]`);
                    if (categorySelect) {
                        categorySelect.value = service.categoryId;
                        categorySelect.dispatchEvent(new Event('change'));
                        
                        setTimeout(() => {
                            if (service.serviceId) {
                                const serviceSelect = document.querySelector(`.service-select[data-index="${i}"]`);
                                if (serviceSelect) {
                                    serviceSelect.value = service.serviceId;
                                    serviceSelect.dispatchEvent(new Event('change'));
                                }
                            }
                        }, 100);
                    }
                }
            });
            
            // ⭐ تحديث السعر المعدل في النهاية بعد استعادة كل شيء
            setTimeout(() => {
                if (window.editedTotalPrice) {
                    const totalAmountEl = document.getElementById('totalAmount');
                    if (totalAmountEl) {
                        totalAmountEl.textContent = `${window.editedTotalPrice.toFixed(2)} ج`;
                        console.log('✅ تم تحديث السعر المعدل النهائي:', window.editedTotalPrice);
                    }
                }
                
                updateBalanceCheck();
                toggleEditButton();
            }, 350); // ⭐ وقت أطول قليلاً لضمان اكتمال كل العمليات
            
        }, 200);
        
    }, 100);
}

// دالة لاستعادة بيانات الخدمات
function restoreServicesData() {
    // لا نحتاج لفعل شيء هنا لأن البيانات محفوظة في المتغيرات
    // هذه الدالة للحفاظ على تسلسل الأحداث فقط
}
    
function updateBalanceCheck() {
  const balanceCheckContainer = document.getElementById('balanceCheckContainer');
  const balanceTypeEl = document.getElementById('balanceType');
  
  if (!balanceCheckContainer || !balanceTypeEl) return;

  // 👈 اعرّف balanceType أول حاجة
  const balanceType = balanceTypeEl.value;

  // ⭐ إخفاء فحص الرصيد للحجز بدون دفع
  if (balanceType === 'حجز بدون دفع') {
    balanceCheckContainer.innerHTML = `
      <div class="balance-check sufficient">
        <span class="balance-check-icon">🚫</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">
            حجز بدون دفع
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            سيتم إضافة الحجز بدون خصم من الرصيد
          </div>
        </div>
      </div>
    `;
    return;
  }

  const totalAmountEl = document.getElementById('totalAmount');
  if (!totalAmountEl) return;
  
  const totalPrice = parseFloat(totalAmountEl.textContent.replace(' ج', ''));
  
  if (!balanceType || !selectedClient || totalPrice === 0) {
    balanceCheckContainer.innerHTML = '';
    return;
  }
  
  // تحديد الرصيد المناسب
  let clientBalance = 0;
  const balanceFieldMap = {
    'رصيد أساسي': 'balance_basic',
    'رصيد عروض': 'balance_offers',
    'رصيد ليزر': 'balance_laser',
    'رصيد بشرة': 'balance_skin'
  };
  
  const field = balanceFieldMap[balanceType];
  if (field && selectedClient) {
    clientBalance = parseFloat(selectedClient[field] || 0);
  }
  
  const isSufficient = clientBalance >= totalPrice;
  
  balanceCheckContainer.innerHTML = `
    <div class="balance-check ${isSufficient ? 'sufficient' : 'insufficient'}">
      <span class="balance-check-icon">${isSufficient ? '✅' : '❌'}</span>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          رصيد العميل الحالي: ${clientBalance.toFixed(2)} ج
        </div>
        <div style="font-size: 14px; opacity: 0.9;">
          ${isSufficient ? 'الرصيد كافي للحجز' : 'الرصيد غير كافي - يحتاج شحن'}
        </div>
      </div>
      ${!isSufficient ? `
        <button type="button" class="btn btn-warning" id="chargeBalanceBtn">
          <span>💳</span>
          شحن رصيد
        </button>
      ` : ''}
    </div>
  `;
  
  // زر شحن الرصيد
  const chargeBtn = document.getElementById('chargeBalanceBtn');
  if (chargeBtn) {
    chargeBtn.addEventListener('click', () => {
      openChargeBalanceModal();
    });
  }
}
    
    // تحديث الإجمالي عند تغيير نوع الرصيد
// تحديث الإجمالي عند تغيير نوع الرصيد
document.getElementById('balanceType').addEventListener('change', async (e) => {
  const balanceType = e.target.value;
  
  if (balanceType === 'رصيد عروض' && selectedClient) {
    // إخفاء قسم الخدمات العادي
    document.getElementById('servicesCount').closest('.form-group').style.display = 'none';
    document.getElementById('servicesCardsContainer').style.display = 'none';
    
    // عرض العروض المشتراة
    await displayPurchasedOffersForBooking();
  } else {
    // إظهار قسم الخدمات العادي
    document.getElementById('servicesCount').closest('.form-group').style.display = 'block';
    document.getElementById('servicesCardsContainer').style.display = 'block';
    
    // إخفاء قسم العروض
    const offersSection = document.getElementById('purchasedOffersForBooking');
    if (offersSection) offersSection.remove();
    
    calculateTotal();
  }
  
  updateBalanceCheck();
});    
    // إرسال النموذج
    const addBookingForm = document.getElementById('addBookingForm');
    addBookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitNewBooking();
    });
    
    // إغلاق Modal
    document.getElementById('closeAddModal').addEventListener('click', () => closeModal(modal));
    document.getElementById('cancelAddBooking').addEventListener('click', () => closeModal(modal));
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
    // دالة عرض العروض المشتراة للحجز
async function displayPurchasedOffersForBooking() {
  try {
    const response = await fetch(`/api/clients/${selectedClient.id}/purchased-offers`);
    const purchasedOffers = await response.json();
    
    // تصفية العروض النشطة فقط
    const activeOffers = purchasedOffers.filter(offer => {
      const totalRemaining = offer.service_sessions?.reduce((total, s) => 
        total + (s.remaining_sessions || 0), 0) || 0;
      return totalRemaining > 0;
    });
    
    // إزالة القسم القديم إذا كان موجوداً
    const oldSection = document.getElementById('purchasedOffersForBooking');
    if (oldSection) oldSection.remove();
    
    if (activeOffers.length === 0) {
      const container = document.getElementById('servicesCardsContainer');
      container.insertAdjacentHTML('beforebegin', `
        <div id="purchasedOffersForBooking" style="padding: 20px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <p style="color: #856404; font-weight: 600;">⚠️ لا توجد عروض متاحة للاستخدام</p>
          <small style="color: #856404;">الرجاء شراء عرض أولاً أو اختيار نوع رصيد آخر</small>
        </div>
      `);
      return;
    }
    
    // إنشاء HTML للعروض
    let offersHTML = `
      <div id="purchasedOffersForBooking" style="margin-bottom: 20px;">
        <h4 style="color: #1e40af; margin-bottom: 15px; text-align: center;">🎯 اختر خدمة من عروضك</h4>
    `;
    
    activeOffers.forEach(offer => {
      const services = offer.services || [];
      
      offersHTML += `
        <div class="offer-booking-card" style="border: 2px solid #3b82f6; border-radius: 12px; padding: 15px; margin-bottom: 15px; background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px dashed #e0f2fe;">
            <h5 style="color: #1e40af; margin: 0;">${offer.offer_name || 'عرض'}</h5>
            <span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">
              ${offer.service_sessions?.reduce((total, s) => total + (s.remaining_sessions || 0), 0) || 0} جلسة متبقية
            </span>
          </div>
          
          <div class="offer-services">
            ${services.map((service, index) => {
              const serviceSession = offer.service_sessions?.find(s => s.service_index == index);
              const remaining = serviceSession?.remaining_sessions || 0;
              const canUse = remaining > 0;
              const serviceName = service.name || service.service_name || 'خدمة';
              const safeServiceName = serviceName.replace(/'/g, "\\'");
              
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px;">
                  <div style="flex: 1;">
                    <div style="font-weight: 500; color: #1e293b;">${serviceName}</div>
                    <div style="font-size: 12px; color: ${canUse ? '#059669' : '#dc2626'};">
                      الجلسات المتبقية: ${remaining}
                    </div>
                  </div>
                  <button type="button" 
                          class="select-offer-service-btn" 
                          data-offer-id="${offer.id}"
                          data-service-index="${index}"
                          data-service-name="${safeServiceName}"
                          data-duration="${service.duration || 30}"
                          style="background: ${canUse ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#9ca3af'}; 
                                 color: white; 
                                 border: none; 
                                 padding: 8px 12px; 
                                 border-radius: 6px; 
                                 cursor: ${canUse ? 'pointer' : 'not-allowed'}; 
                                 font-size: 13px; 
                                 font-weight: 600;"
                          ${!canUse ? 'disabled' : ''}>
                    ${canUse ? '✅ استخدام هذه الخدمة فقط' : '❌ لا توجد جلسات'}
                  </button>
                </div>
              `;
            }).join('')}
            
            <div style="text-align: center; padding: 12px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 8px; margin-top: 10px;">
              <button type="button" 
                      class="select-full-offer-btn" 
                      data-offer-id="${offer.id}"
                      data-offer-name="${(offer.offer_name || 'عرض').replace(/'/g, "\\'")}"
                      data-services='${JSON.stringify(services)}'
                      style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                             color: white; 
                             border: none; 
                             padding: 12px 20px; 
                             border-radius: 8px; 
                             cursor: pointer; 
                             font-weight: 600; 
                             font-size: 14px;">
                🎯 استخدام العرض كله (-1 جلسة من كل خدمة)
              </button>
              <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                سيتم خصم جلسة واحدة من كل خدمة في العرض
              </p>
            </div>
          </div>
        </div>
      `;
    });
    
    offersHTML += `</div>`;
    
    // إضافة HTML قبل container الخدمات
    const container = document.getElementById('servicesCardsContainer');
    container.insertAdjacentHTML('beforebegin', offersHTML);
    
    // Event listeners لاختيار خدمة واحدة
    document.querySelectorAll('.select-offer-service-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const offerId = e.target.dataset.offerId;
        const serviceIndex = e.target.dataset.serviceIndex;
        const serviceName = e.target.dataset.serviceName;
        const duration = parseInt(e.target.dataset.duration) || 30;
        
        // تخزين بيانات الخدمة المختارة
        window.selectedOfferService = {
          offerId: offerId,
          serviceIndex: serviceIndex,
          serviceName: serviceName,
          duration: duration,
          isFullOffer: false
        };
        
        // تحديد الأزرار
        document.querySelectorAll('.select-offer-service-btn, .select-full-offer-btn').forEach(b => {
          b.style.opacity = '0.5';
          b.style.transform = 'scale(0.95)';
        });
        e.target.style.opacity = '1';
        e.target.style.transform = 'scale(1.05)';
        e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.3)';
        
        // تعيين الوقت
        const startTime = document.getElementById('startTime');
        const endTime = document.getElementById('endTime');
        
        if (startTime.value) {
          const [hours, minutes] = startTime.value.split(':');
          const endDate = new Date();
          endDate.setHours(parseInt(hours), parseInt(minutes) + duration, 0, 0);
          endTime.value = endDate.toTimeString().substring(0, 5);
        }
        
        document.getElementById('totalAmount').textContent = '0.00 ج';
        updateBalanceCheck();
      });
    });
    
// Event listeners لاختيار العرض كله
document.querySelectorAll('.select-full-offer-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const offerId = e.target.dataset.offerId;
    const offerName = e.target.dataset.offerName;
    const services = JSON.parse(e.target.dataset.services);
    
    // ⭐ التحقق من أن جميع الخدمات فيها جلسات متبقية
    const offerCard = e.target.closest('.offer-booking-card');
    const serviceItems = offerCard.querySelectorAll('.select-offer-service-btn');
    
    let allServicesAvailable = true;
    let unavailableServices = [];
    
    serviceItems.forEach((serviceBtn, index) => {
      if (serviceBtn.disabled) {
        allServicesAvailable = false;
        unavailableServices.push(services[index].name || services[index].service_name || `خدمة ${index + 1}`);
      }
    });
    
    // ⭐ إذا في خدمات مفيهاش جلسات - نمنع الحجز
    if (!allServicesAvailable) {
      alert(
        `⚠️ لا يمكن استخدام العرض كله!\n\n` +
        `❌ الخدمات التالية ليس لها جلسات متبقية:\n\n` +
        unavailableServices.map((name, i) => `${i + 1}. ${name}`).join('\n') +
        `\n\n💡 يرجى:\n` +
        `• اختيار الخدمات المتاحة فقط بشكل منفصل\n` +
        `• أو شراء العرض مرة أخرى لإضافة جلسات جديدة`
      );
      return; // ⭐ إيقاف العملية
    }
    
    // ⭐ إذا كل الخدمات متاحة - نكمل عادي
    const totalDuration = services.reduce((sum, s) => sum + (s.duration || 30), 0);
    
    // تخزين بيانات العرض الكامل
    window.selectedOfferService = {
      offerId: offerId,
      offerName: offerName,
      services: services,
      duration: totalDuration,
      isFullOffer: true
    };
    
    // تحديد الأزرار
    document.querySelectorAll('.select-offer-service-btn, .select-full-offer-btn').forEach(b => {
      b.style.opacity = '0.5';
      b.style.transform = 'scale(0.95)';
    });
    e.target.style.opacity = '1';
    e.target.style.transform = 'scale(1.05)';
    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
    
    // تعيين الوقت
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    
    if (startTime.value) {
      const [hours, minutes] = startTime.value.split(':');
      const endDate = new Date();
      endDate.setHours(parseInt(hours), parseInt(minutes) + totalDuration, 0, 0);
      endTime.value = endDate.toTimeString().substring(0, 5);
    }
    
    document.getElementById('totalAmount').textContent = '0.00 ج';
    updateBalanceCheck();
  });
});
    
  } catch (error) {
    console.error('Error loading offers:', error);
    alert('❌ حدث خطأ في تحميل العروض');
  }
}
    
    // إنشاء كرت واحد افتراضي
    createServiceCards();
  }

  // إرسال حجز جديد
// قم باستبدال دالة submitNewBooking الحالية في ملفك بهذه الدالة المحدثة
async function submitNewBooking() {
  try {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
    const clientType = document.querySelector('input[name="client_type"]:checked').value;
    let clientId;
    
    // ⭐ متغيرات لتخزين بيانات العميل
    let finalClientName = '';
    let finalClientPhone = '';
    
    // التعامل مع العميل
    if (clientType === 'existing') {
      if (!selectedClient) {
        alert('⚠️ الرجاء اختيار عميل');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      clientId = selectedClient.id;
      finalClientName = selectedClient.name;
      finalClientPhone = selectedClient.phone;
    } else {
      // إضافة عميل جديد
      const newClientName = document.getElementById('newClientName').value.trim();
      const newClientPhone = document.getElementById('newClientPhone').value.trim();
      
      if (!newClientName || !newClientPhone) {
        alert('⚠️ الرجاء ملء بيانات العميل الجديد');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      if (!/^01[0-9]{9}$/.test(newClientPhone)) {
        alert('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      // ⭐ حفظ بيانات العميل الجديد
      finalClientName = newClientName;
      finalClientPhone = newClientPhone;
      
      const createClientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName,
          phone: newClientPhone,
          created_by: currentUser.name
        })
      });
      
      const createClientData = await createClientRes.json();
      
      if (!createClientRes.ok) {
        alert('⚠️ ' + createClientData.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      clientId = createClientData.id;
    }
    
// جمع بيانات الخدمات
    let servicesData = [];
    const balanceType = document.getElementById('balanceType').value;

    // ⭐ إذا كان السعر معدّل، استخدم البيانات المحفوظة
    if (window.editedTotalPrice && window.currentBookingData && window.currentBookingData.services) {
      servicesData = window.currentBookingData.services.map(s => ({
        service_id: parseInt(s.service_id),
        service_name: s.service_name,
        category_name: s.category_name,
        duration: parseInt(s.duration),
        price: parseFloat(s.price)
      }));
      
      console.log('📦 استخدام بيانات الخدمات المحفوظة:', servicesData);
    }
    // إذا كان رصيد عروض واختار خدمة من عرض
    else if (balanceType === 'رصيد عروض' && window.selectedOfferService) {
      const selected = window.selectedOfferService;
      
      if (selected.isFullOffer) {
        // استخدام العرض كله
        servicesData = selected.services.map((service, index) => {
          const foundService = services.find(s => 
            s.name === (service.name || service.service_name)
          );
          
          return {
            service_id: foundService ? foundService.id : (service.service_id || service.id),
            service_name: service.name || service.service_name || `خدمة ${index + 1}`,
            category_name: service.category_name || 'من العرض',
            duration: service.duration || 30,
            price: 0
          };
        });
      } else {
        // استخدام خدمة واحدة فقط
        const foundService = services.find(s => 
          s.name === selected.serviceName
        );
        
        servicesData = [{
          service_id: foundService ? foundService.id : selected.service_id,
          service_name: selected.serviceName,
          category_name: 'من العرض',
          duration: selected.duration,
          price: 0
        }];
      }
    } else {
      // الطريقة العادية للخدمات
      document.querySelectorAll('.service-select').forEach((select) => {
        const serviceId = select.value;
        if (!serviceId) return;
        
        const index = select.dataset.index;
        const selectedOption = select.options[select.selectedIndex];
        const categorySelect = document.querySelector(`.service-category[data-index="${index}"]`);
        const categoryName = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : '';
        
        // ⭐ إضافة تحقق من وجود العناصر
        const durationEl = document.querySelector(`.service-duration[data-index="${index}"]`);
        const priceEl = document.querySelector(`.service-price[data-index="${index}"]`);
        
        if (!durationEl || !priceEl) {
          console.warn('⚠️ عناصر الخدمة غير موجودة:', index);
          return;
        }
        
        const duration = parseInt(durationEl.value);
        const price = parseFloat(priceEl.value) || 0;
        
        servicesData.push({
          service_id: parseInt(serviceId),
          service_name: selectedOption.textContent,
          category_name: categoryName,
          duration: duration,
          price: price
        });
      });
    }
    
    if (servicesData.length === 0) {
      alert('⚠️ الرجاء إضافة خدمة واحدة على الأقل');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return;
    }
    
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    if (!startTime || !endTime) {
      alert('⚠️ الرجاء تحديد أوقات البداية والنهاية');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return;
    }
    
    // التحقق من أن الوقت لم يمضي بالفعل
    //const now = new Date();
    //const selectedDate = new Date(currentDate);
    //selectedDate.setHours(parseInt(startTime.split(':')[0]), parseInt(startTime.split(':')[1]), 0, 0);
    
    //if (currentDate.toDateString() === now.toDateString()) {
      //if (selectedDate <= now) {
       // alert('⚠️ لا يمكن الحجز في وقت مضى بالفعل!\n\nالوقت الحالي: ' + now.toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'}));
       // if (loadingOverlay) loadingOverlay.style.display = 'none';
       // return;
     // }
   // }
    
    const notes = document.getElementById('bookingNotes').value.trim();
    
    // حساب السعر الإجمالي
    let totalPrice = 0;

    if (window.editedTotalPrice) {
      totalPrice = window.editedTotalPrice;
      console.log('💰 استخدام السعر المعدل:', totalPrice);
      
      if (servicesData.length > 0 && balanceType !== 'رصيد عروض') {
        const originalTotal = servicesData.reduce((sum, service) => sum + parseFloat(service.price || 0), 0);
        const ratio = totalPrice / originalTotal;
        
        servicesData.forEach(service => {
          service.price = (parseFloat(service.price || 0) * ratio).toFixed(2);
        });
        console.log('🔄 تم تعديل أسعار الخدمات لتتناسب مع السعر المعدل');
      }
    } else {
      servicesData.forEach(service => {
        totalPrice += parseFloat(service.price || 0);
      });
      console.log('💰 استخدام السعر المحسوب:', totalPrice);
    }
    
    // بناء بيانات الحجز
    let finalNotes = notes || '';
    if (balanceType === 'حجز بدون دفع') {
      finalNotes = '[حجز مؤجل الدفع]' + (finalNotes ? ' ' + finalNotes : '');
    }

    const bookingData = {
      client_id: parseInt(clientId),
      client_name: finalClientName,
      client_phone: finalClientPhone,
      is_new_client: clientType === 'new',
      doctor_id: selectedDoctor.id,
      doctor_name: selectedDoctor.name,
      booking_date: getLocalDateString(currentDate),
      start_time: startTime,
      end_time: endTime,
      total_price: totalPrice,
      balance_type: balanceType === 'حجز بدون دفع' ? null : (balanceType || null),
      services: servicesData,
      notes: finalNotes,
      status: 'جاري',
      created_by: currentUser.name
    };

    // إضافة بيانات العرض فقط إذا كان رصيد عروض
    if (balanceType === 'رصيد عروض' && window.selectedOfferService) {
      bookingData.offer_data = {
        offerId: parseInt(window.selectedOfferService.offerId),
        isFullOffer: window.selectedOfferService.isFullOffer || false,
        serviceIndex: window.selectedOfferService.serviceIndex ? parseInt(window.selectedOfferService.serviceIndex) : null
      };
    }
    
// إرسال الحجز إلى السيرفر (بدون تسجيل في إجراءات الشيفت)
console.log('📤 إرسال بيانات الحجز:', bookingData);

// ⭐ إضافة علامة لعدم التسجيل في الشيفت
bookingData.skip_shift_action = true;

const response = await fetch('/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bookingData)
});

    const data = await response.json();
    console.log('✅ رد السيرفر:', data);

    if (!response.ok) {
      const errorMsg = data.message || data.error || 'حدث خطأ غير معروف';
      console.error('❌ خطأ من السيرفر:', errorMsg);
      alert('⚠️ ' + errorMsg);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return;
    }

    console.log('🎉 تم الحجز بنجاح - سيتم تحديث الجدول');

    // ⭐ إغلاق الـ modal أولاً
    closeModal(document.getElementById('addBookingModal'));

    // ⭐ إعادة تحميل الجدول
    await loadSchedule();

    console.log('✅ تم تحديث الجدول بنجاح');

    // ⭐ إظهار رسالة النجاح بعد التحديث
alert('✅ تم إضافة الحجز بنجاح!');

// ⭐ سؤال المستخدم
const bookingDate = new Date(bookingData.booking_date + 'T00:00:00');
if (bookingDate.toDateString() !== currentDate.toDateString()) {
  const goToDate = confirm(
    `📅 الحجز تم ليوم ${bookingDate.toLocaleDateString('ar-EG')}\n\n` +
    `هل تريد الانتقال لهذا التاريخ الآن؟`
  );
  
  if (goToDate) {
    currentDate = bookingDate;
    setDateInput(currentDate);
    updateDateDisplay(currentDate);
    await loadSchedule();
  }
}
    // ⭐ تنظيف المتغيرات المؤقتة
    window.selectedOfferService = null;
    delete window.editedTotalPrice;

    if (loadingOverlay) loadingOverlay.style.display = 'none';
    
  } catch (err) {
    console.error('❌ خطأ في إضافة الحجز:', err);
    alert('⚠️ حدث خطأ في إضافة الحجز');
    
    delete window.editedTotalPrice;
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
}

  // فتح modal شحن الرصيد
  function openChargeBalanceModal() {
    const modal = document.getElementById('chargeBalanceModal');
    if (!modal || !selectedClient) return;
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>💳 شحن رصيد</h3>
          <button class="modal-close" id="closeChargeModal">&times;</button>
        </div>
        
        <form id="chargeBalanceForm" class="modal-body">
          <div style="padding: 16px; background: linear-gradient(135deg, #e91e63 0%, #ff4081 100%); color: white; border-radius: 12px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">
              👤 ${escapeHtml(selectedClient.name)}
            </div>
            <div style="font-size: 14px; opacity: 0.9;">
              📱 ${selectedClient.phone}
            </div>
          </div>
          
          <div class="form-group">
            <label for="chargeBalanceType">💳 نوع الرصيد *</label>
            <select id="chargeBalanceType" required>
              <option value="">اختر نوع الرصيد</option>
              <option value="رصيد أساسي">رصيد أساسي</option>
              <option value="رصيد عروض">رصيد عروض</option>
              <option value="رصيد ليزر">رصيد ليزر</option>
              <option value="رصيد بشرة">رصيد بشرة</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="chargeAmount">💰 المبلغ (ج) *</label>
            <input type="number" id="chargeAmount" step="0.01" min="0.01" placeholder="0.00" required>
          </div>
          
          <div class="form-group">
            <label for="chargePaymentMethod">🏦 طريقة الدفع *</label>
            <select id="chargePaymentMethod" required>
              <option value="">اختر طريقة الدفع</option>
              <option value="نقدي">نقدي</option>
              <option value="محفظة">محفظة</option>
              <option value="فيزا">فيزا</option>
            </select>
          </div>
          
          <div class="modal-actions">
            <button type="submit" class="btn btn-success">
              <span>✅</span>
              ادفع
            </button>
            <button type="button" class="btn btn-secondary" id="cancelCharge">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    `;
    
    modal.classList.add('active');
    
    // Event Listeners
    const chargeForm = document.getElementById('chargeBalanceForm');
    chargeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitChargeBalance();
    });
    
    document.getElementById('closeChargeModal').addEventListener('click', () => closeModal(modal));
    document.getElementById('cancelCharge').addEventListener('click', () => closeModal(modal));
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  }
  // زر المواعيد المتاحة
  const availableTimesBtn = document.getElementById('availableTimesBtn');
  if (availableTimesBtn) {
    availableTimesBtn.addEventListener('click', showAvailableTimes);
  }

  // دالة عرض المواعيد المتاحة

function showAvailableTimes() {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  // حساب المواعيد المتاحة
  const workStart = 0; // 12 صباحاً (منتصف الليل)
  const workEnd = 24; // 12 منتصف الليل اليوم التالي
  const slots = [];
  
  // إنشاء شرائح كل ربع ساعة
  for (let hour = workStart; hour < workEnd; hour++) {
    for (let minute of [0, 15, 30, 45,]) {
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const endHour = minute === 30 ? hour + 1 : hour;
        const endMinute = minute === 30 ? 0 : 30;
        const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
        
        // التحقق من التعارض مع الحجوزات الموجودة

const isBooked = bookings.some(booking => {
  // ⭐ تجاهل الحجوزات المنتهية أو الملغاة
  if (booking.status === 'انتهت' || booking.status === 'ملغي') {
    return false;
  }
  
  const bookingStart = booking.start_time;
  const bookingEnd = booking.end_time;
  
  // ✅ تحقق صحيح من التداخل: الفترة محجوزة فقط لو فيه تداخل حقيقي
  return (timeStr < bookingEnd && endTimeStr > bookingStart);
});
        
        slots.push({
          time: timeStr,
          endTime: endTimeStr,
          available: !isBooked
        });
      }
    }
    
    const availableSlots = slots.filter(s => s.available);
    const bookedSlots = slots.filter(s => !s.available);
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h3>🕐 المواعيد المتاحة</h3>
          <button class="modal-close" id="closeAvailableTimesModal">&times;</button>
        </div>
        
        <div class="modal-body">
          <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; color: #1565c0; margin-bottom: 8px;">
              📅 ${selectedDayEl ? selectedDayEl.textContent : ''} - ${selectedDateEl ? selectedDateEl.textContent : ''}
            </div>
<div style="display: flex; justify-content: center; gap: 32px; margin-top: 12px;">
  <div>
    <span style="font-size: 14px; color: #616161;">✅ فترات متاحة:</span>
    <strong style="font-size: 20px; color: #2e7d32; margin-right: 8px;">${toEnglishNumbers(availableSlots.length)}</strong>
  </div>
  <div>
    <span style="font-size: 14px; color: #616161;">❌ فترات محجوزة:</span>
    <strong style="font-size: 20px; color: #c62828; margin-right: 8px;">${toEnglishNumbers(bookedSlots.length)}</strong>
  </div>
  <div>
    <span style="font-size: 14px; color: #616161;">📋 عدد الحجوزات:</span>
    <strong style="font-size: 20px; color: #1565c0; margin-right: 8px;">${toEnglishNumbers(bookings.filter(b => b.status !== 'انتهت' && b.status !== 'ملغي').length)}</strong>
  </div>
</div>
          </div>
          
          ${availableSlots.length > 0 ? `
            <h4 style="color: #2e7d32; margin-bottom: 16px;">✅ المواعيد المتاحة (${toEnglishNumbers(availableSlots.length)} موعد)</h4>
            <div class="available-times-grid">
              ${availableSlots.map(slot => `
                <div class="time-slot" onclick="selectTimeSlot('${slot.time}', '${slot.endTime}')">
                  ${formatTime(slot.time)}<br>
                  <small style="font-size: 12px; opacity: 0.8;">إلى ${formatTime(slot.endTime)}</small>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="available-times-empty">
              <div class="available-times-empty-icon">😔</div>
              <p>لا توجد مواعيد متاحة في هذا اليوم</p>
            </div>
          `}
          
          ${bookedSlots.length > 0 ? `
            <h4 style="color: #c62828; margin: 24px 0 16px;">❌ المواعيد المحجوزة (${toEnglishNumbers(bookedSlots.length)} موعد)</h4>
            <div class="available-times-grid">
              ${bookedSlots.map(slot => `
                <div class="time-slot busy">
                  ${formatTime(slot.time)}<br>
                  <small style="font-size: 12px; opacity: 0.8;">إلى ${formatTime(slot.endTime)}</small>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          <div style="margin-top: 24px; text-align: center;">
            <button class="btn btn-secondary" onclick="closeModal(document.getElementById('bookingDetailsModal'))">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    `;
    
    modal.classList.add('active');
    
    document.getElementById('closeAvailableTimesModal')?.addEventListener('click', () => {
      closeModal(modal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  }
  
  // دالة اختيار موعد وفتح modal الحجز مباشرة
  window.selectTimeSlot = function(startTime, endTime) {
    closeModal(document.getElementById('bookingDetailsModal'));
    openAddBookingModal();
    
    // تعيين الأوقات في الـ modal
    setTimeout(() => {
      const startTimeInput = document.getElementById('startTime');
      const endTimeInput = document.getElementById('endTime');
      
      if (startTimeInput) startTimeInput.value = startTime;
      if (endTimeInput) endTimeInput.value = endTime;
    }, 100);
  };
  // ⭐ دالة شحن رصيد للعميل الجديد
async function openChargeBalanceForNewClient(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  // جلب بيانات العميل
  const clientRes = await fetch(`/api/clients/${booking.client_id}`);
  const client = await clientRes.json();
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>💳 شحن رصيد العميل الجديد</h3>
        <button class="modal-close" id="closeNewClientChargeModal">&times;</button>
      </div>
      
      <form id="newClientChargeForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%); color: white; border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">
            👤 ${escapeHtml(client.name)}
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            📱 ${client.phone}
          </div>
        </div>
        
        <div style="padding: 16px; background: #fff3e0; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 0; color: #e65100; font-weight: 600;">
            ℹ️ بعد الشحن، سيتم خصم قيمة الحجز (${parseFloat(booking.total_price).toFixed(2)} ج) تلقائياً من الرصيد
          </p>
        </div>
        
        <div class="form-group">
          <label for="newClientBalanceType">💳 نوع الرصيد *</label>
          <select id="newClientBalanceType" required>
            <option value="">اختر نوع الرصيد</option>
            <option value="رصيد أساسي">رصيد أساسي</option>
            <option value="رصيد عروض">رصيد عروض</option>
            <option value="رصيد ليزر">رصيد ليزر</option>
            <option value="رصيد بشرة">رصيد بشرة</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="newClientChargeAmount">💰 المبلغ (ج) *</label>
          <input type="number" id="newClientChargeAmount" step="0.01" min="${parseFloat(booking.total_price)}" value="${parseFloat(booking.total_price)}" required>
          <small style="color: #666;">الحد الأدنى: ${parseFloat(booking.total_price).toFixed(2)} ج (قيمة الحجز)</small>
        </div>
        
        <div class="form-group">
          <label for="newClientPaymentMethod">🏦 طريقة الدفع *</label>
          <select id="newClientPaymentMethod" required>
            <option value="">اختر طريقة الدفع</option>
            <option value="نقدي">نقدي</option>
            <option value="محفظة">محفظة</option>
            <option value="فيزا">فيزا</option>
          </select>
        </div>
        
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">
            <span>✅</span>
            شحن وخصم قيمة الحجز
          </button>
          <button type="button" class="btn btn-secondary" id="cancelNewClientCharge">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');
  
  const chargeForm = document.getElementById('newClientChargeForm');
  chargeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const balanceType = document.getElementById('newClientBalanceType').value;
    const amount = parseFloat(document.getElementById('newClientChargeAmount').value);
    const paymentMethod = document.getElementById('newClientPaymentMethod').value;
    
    if (amount < parseFloat(booking.total_price)) {
      alert('⚠️ المبلغ يجب أن يكون أكبر من أو يساوي قيمة الحجز');
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      // شحن الرصيد
      const chargeRes = await fetch(`/api/clients/${booking.client_id}/charge-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance_type: balanceType,
          amount: amount,
          payment_method: paymentMethod,
          created_by: currentUser.name
        })
      });
      
      const chargeData = await chargeRes.json();
      
      if (!chargeRes.ok) {
        alert('⚠️ ' + chargeData.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ تم شحن الرصيد بنجاح\n\nالآن يمكنك تأكيد الحجز لخصم القيمة');
      
      closeModal(modal);
      await loadSchedule();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (err) {
      console.error('❌ خطأ:', err);
      alert('⚠️ حدث خطأ');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('closeNewClientChargeModal').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  document.getElementById('cancelNewClientCharge').addEventListener('click', () => {
    closeModal(modal);
    openBookingDetailsModal(booking);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
      openBookingDetailsModal(booking);
    }
  });
}

  // إرسال شحن الرصيد
  async function submitChargeBalance() {
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      const balanceType = document.getElementById('chargeBalanceType').value;
      const amount = document.getElementById('chargeAmount').value;
      const paymentMethod = document.getElementById('chargePaymentMethod').value;
      
      if (!balanceType || !amount || !paymentMethod) {
        alert('⚠️ الرجاء ملء جميع الحقول');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      const response = await fetch(`/api/clients/${selectedClient.id}/charge-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance_type: balanceType,
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          created_by: currentUser.name
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ ' + data.message);
      
      // تحديث بيانات العميل
      const clientRes = await fetch(`/api/clients/${selectedClient.id}`);
      const updatedClient = await clientRes.json();
      selectedClient = updatedClient;
      
      // تحديث قائمة العملاء
      const clientIndex = clients.findIndex(c => c.id === selectedClient.id);
      if (clientIndex !== -1) {
        clients[clientIndex] = selectedClient;
      }
      
      // إغلاق modal الشحن والرجوع لـ modal الحجز
      closeModal(document.getElementById('chargeBalanceModal'));
      
      // تحديث معلومات العميل في modal الحجز
      const clientInfo = document.getElementById('clientInfo');
      const clientBalances = document.getElementById('clientBalances');
      
      if (clientInfo && clientBalances) {
        clientBalances.innerHTML = `
          <div class="balance-item">
            <strong>رصيد أساسي:</strong><br>
            ${parseFloat(selectedClient.balance_basic || 0).toFixed(2)} ج
          </div>
          <div class="balance-item">
            <strong>رصيد عروض:</strong><br>
            ${parseFloat(selectedClient.balance_offers || 0).toFixed(2)} ج
          </div>
          <div class="balance-item">
            <strong>رصيد ليزر:</strong><br>
            ${parseFloat(selectedClient.balance_laser || 0).toFixed(2)} ج
          </div>
          <div class="balance-item">
            <strong>رصيد بشرة:</strong><br>
            ${parseFloat(selectedClient.balance_skin || 0).toFixed(2)} ج
          </div>
        `;
        
        clientInfo.style.display = 'block';
      }
      
      // تحديث فحص الرصيد
      const balanceCheckContainer = document.getElementById('balanceCheckContainer');
      if (balanceCheckContainer) {
        const balanceType = document.getElementById('balanceType').value;
        const totalAmountEl = document.getElementById('totalAmount');
        const totalPrice = parseFloat(totalAmountEl.textContent.replace(' ج', ''));
        
        if (balanceType && selectedClient && totalPrice > 0) {
          const balanceFieldMap = {
            'رصيد أساسي': 'balance_basic',
            'رصيد عروض': 'balance_offers',
            'رصيد ليزر': 'balance_laser',
            'رصيد بشرة': 'balance_skin'
          };
          
          const field = balanceFieldMap[balanceType];
          const clientBalance = parseFloat(selectedClient[field] || 0);
          const isSufficient = clientBalance >= totalPrice;
          
          balanceCheckContainer.innerHTML = `
            <div class="balance-check ${isSufficient ? 'sufficient' : 'insufficient'}">
              <span class="balance-check-icon">${isSufficient ? '✅' : '❌'}</span>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">
                  رصيد العميل الحالي: ${clientBalance.toFixed(2)} ج
                </div>
                <div style="font-size: 14px; opacity: 0.9;">
                  ${isSufficient ? 'الرصيد كافي للحجز' : 'الرصيد غير كافي - يحتاج شحن'}
                </div>
              </div>
              ${!isSufficient ? `
                <button type="button" class="btn btn-warning" onclick="openChargeBalanceModal()">
                  <span>💳</span>
                  شحن رصيد
                </button>
              ` : ''}
            </div>
          `;
        }
      }
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (err) {
      console.error('❌ خطأ في شحن الرصيد:', err);
      alert('⚠️ حدث خطأ في شحن الرصيد');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }
  // زر الحجوزات الملغاة
const cancelledBookingsBtn = document.getElementById('cancelledBookingsBtn');
if (cancelledBookingsBtn) {
  cancelledBookingsBtn.addEventListener('click', () => {
    window.location.href = '/bk/cancelled.html';
  });
}

// إغلاق Modal
  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }
  
  // ⭐ جعل الدالة متاحة عالمياً
  window.closeModal = closeModal;

  // منع XSS
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // Event Listeners للتاريخ
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const selectedDate = new Date(dateInput.value + 'T00:00:00');
      if (!isNaN(selectedDate.getTime())) {
        currentDate = selectedDate;
        updateDateDisplay(currentDate);
        loadSchedule();
      }
    });
  }

  if (prevDayBtn) {
    prevDayBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() - 1);
      setDateInput(currentDate);
      updateDateDisplay(currentDate);
      loadSchedule();
    });
  }

  if (nextDayBtn) {
    nextDayBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + 1);
      setDateInput(currentDate);
      updateDateDisplay(currentDate);
      loadSchedule();
    });
  }

  // زر إضافة حجز
  if (addBookingBtn) {
    addBookingBtn.addEventListener('click', openAddBookingModal);
  }

  // التهيئة
  await loadInitialData();
  setDateInput(currentDate);
  updateDateDisplay(currentDate);
  await loadSchedule();

// ============================================
// 🔔 نظام الجرس والتنبيهات
// ============================================

// طلب صلاحية الإشعارات
if (Notification.permission === "default") {
  Notification.requestPermission();
}

// دالة تشغيل صوت الجرس
function playAlertSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // 3 نغمات متتالية
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }, i * 400);
  }

  
  // إظهار إشعار متصفح
  if (Notification.permission === "granted") {
    const notification = new Notification("⚠️ تنبيه: خدمات غير مدفوعة!", {
      body: "يوجد حجز يحتوي على خدمات إضافية غير مدفوعة - يتطلب اهتمامك الفوري",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      requireInteraction: true,
      tag: 'unpaid-services'
    });
    
    // عند النقر على الإشعار - التركيز على النافذة
    notification.onclick = function() {
      window.focus();
      notification.close();
    };
  }
}

// ============================================
// 🔄 تحديث تلقائي كل 10 ثواني
// ============================================
let lastUnpaidCheck = false;

setInterval(async () => {
  const hasUnpaid = bookings.some(b => 
    b.notes && b.notes.includes('[خدمات غير مدفوعة:') && 
    b.status !== 'انتهت' && b.status !== 'ملغي'
  );
  
  // إذا ظهرت خدمات غير مدفوعة لأول مرة - شغل الجرس
  if (hasUnpaid && !lastUnpaidCheck) {
    console.log('🚨 تم اكتشاف خدمات غير مدفوعة جديدة!');
    playAlertSound();
  }
  
  lastUnpaidCheck = hasUnpaid;
  
  // تحديث البيانات إذا كانت فيه خدمات غير مدفوعة
  if (hasUnpaid) {
    console.log('🔄 تحديث تلقائي - يوجد خدمات غير مدفوعة');
    const oldCount = bookings.length;
    await loadSchedule();
    
    // إذا تغير عدد الحجوزات أو حالتها - عرض رسالة
    if (bookings.length !== oldCount) {
      console.log('📊 تم تحديث البيانات');
    }
  }
}, 10000); // كل 10 ثواني

// فحص فوري عند التحميل
const hasUnpaidOnLoad = bookings.some(b => 
  b.notes && b.notes.includes('[خدمات غير مدفوعة:') && 
  b.status !== 'انتهت' && b.status !== 'ملغي'
);

if (hasUnpaidOnLoad) {
  console.log('⚠️ يوجد خدمات غير مدفوعة عند تحميل الصفحة');
  lastUnpaidCheck = true;
  playAlertSound();
}
// ============================================
// 💳 دفع الخدمات الغير مدفوعة
// ============================================
async function openPayUnpaidServicesModal(booking) {
  const modal = document.getElementById('bookingDetailsModal');
  if (!modal) return;
  
  try {
    // جلب بيانات العميل
    const clientRes = await fetch(`/api/clients/${booking.client_id}`);
    const client = await clientRes.json();
    
// ⭐ استخراج المبلغ الفعلي من الـ notes
let totalUnpaid = 0;
const unpaidServices = [];

// ⭐ أولاً: استخراج المبلغ من notes
if (booking.notes && booking.notes.includes('[خدمات غير مدفوعة:')) {
  const match = booking.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
  if (match) {
    totalUnpaid = parseFloat(match[1]);
  }
}

// ⭐ ثانياً: استخراج الخدمات الغير مدفوعة (للعرض فقط)
if (booking.services && booking.services.length > 0) {
  booking.services.forEach(s => {
    if (s.service_name.includes('[غير مدفوعة]')) {
      unpaidServices.push({
        ...s,
        service_name: s.service_name.replace(' [غير مدفوعة]', '')
      });
    }
  });
}

// ⭐ إذا لم نجد مبلغ في notes، نحسبه من الخدمات
if (totalUnpaid === 0 && unpaidServices.length > 0) {
  totalUnpaid = unpaidServices.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
}

console.log('💰 المبلغ الغير مدفوع:', totalUnpaid);
console.log('📋 الخدمات الغير مدفوعة:', unpaidServices);
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3>💳 دفع الخدمات الغير مدفوعة</h3>
          <button class="modal-close" id="closePayModal">&times;</button>
        </div>
        
        <form id="payUnpaidForm" class="modal-body">
          <div style="padding: 16px; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 12px; margin-bottom: 20px; border: 2px solid #dc2626;">
            <h4 style="color: #dc2626; margin-bottom: 12px;">⚠️ خدمات غير مدفوعة</h4>
            ${unpaidServices.map((s, i) => `
              <div style="padding: 8px; background: white; border-radius: 8px; margin-bottom: 8px;">
                <strong>${i + 1}. ${escapeHtml(s.service_name)}</strong> - ${parseFloat(s.price).toFixed(2)} ج
              </div>
            `).join('')}
            <div style="margin-top: 12px; padding-top: 12px; border-top: 2px dashed #dc2626; text-align: center;">
              <strong style="font-size: 20px; color: #991b1b;">
                الإجمالي: ${totalUnpaid.toFixed(2)} ج
              </strong>
            </div>
          </div>
          
          <div style="padding: 16px; background: #f0f9ff; border-radius: 12px; margin-bottom: 20px;">
            <h4 style="color: #1e40af; margin-bottom: 12px;">💰 رصيد العميل الحالي</h4>
            <div class="balance-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                <strong style="color: #1e40af; display: block; margin-bottom: 4px;">رصيد أساسي</strong>
                <span style="font-size: 18px; font-weight: 700; color: ${parseFloat(client.balance_basic || 0) >= totalUnpaid ? '#059669' : '#dc2626'}">
                  ${parseFloat(client.balance_basic || 0).toFixed(2)} ج
                </span>
              </div>
              <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                <strong style="color: #1e40af; display: block; margin-bottom: 4px;">رصيد ليزر</strong>
                <span style="font-size: 18px; font-weight: 700; color: ${parseFloat(client.balance_laser || 0) >= totalUnpaid ? '#059669' : '#dc2626'}">
                  ${parseFloat(client.balance_laser || 0).toFixed(2)} ج
                </span>
              </div>
              <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                <strong style="color: #1e40af; display: block; margin-bottom: 4px;">رصيد بشرة</strong>
                <span style="font-size: 18px; font-weight: 700; color: ${parseFloat(client.balance_skin || 0) >= totalUnpaid ? '#059669' : '#dc2626'}">
                  ${parseFloat(client.balance_skin || 0).toFixed(2)} ج
                </span>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label for="payBalanceType">💳 نوع الرصيد المستخدم *</label>
            <select id="payBalanceType" required>
              <option value="">اختر نوع الرصيد</option>
              <option value="رصيد أساسي" ${parseFloat(client.balance_basic || 0) >= totalUnpaid ? '' : 'disabled'}>
                رصيد أساسي ${parseFloat(client.balance_basic || 0) < totalUnpaid ? '(غير كافي)' : ''}
              </option>
              <option value="رصيد ليزر" ${parseFloat(client.balance_laser || 0) >= totalUnpaid ? '' : 'disabled'}>
                رصيد ليزر ${parseFloat(client.balance_laser || 0) < totalUnpaid ? '(غير كافي)' : ''}
              </option>
              <option value="رصيد بشرة" ${parseFloat(client.balance_skin || 0) >= totalUnpaid ? '' : 'disabled'}>
                رصيد بشرة ${parseFloat(client.balance_skin || 0) < totalUnpaid ? '(غير كافي)' : ''}
              </option>
            </select>
          </div>
          
          <div id="chargeOption" style="display: none; padding: 16px; background: #fff3e0; border-radius: 12px; margin-top: 16px;">
            <h4 style="color: #e65100; margin-bottom: 12px;">💳 شحن رصيد</h4>
            <div class="form-group">
              <label for="chargeAmount">المبلغ (ج) *</label>
              <input type="number" id="chargeAmount" step="0.01" min="${totalUnpaid}" value="${totalUnpaid}" placeholder="الحد الأدنى: ${totalUnpaid} ج">
            </div>
            <div class="form-group">
              <label for="chargeMethod">طريقة الدفع *</label>
              <select id="chargeMethod">
                <option value="نقدي">نقدي</option>
                <option value="محفظة">محفظة</option>
                <option value="فيزا">فيزا</option>
              </select>
            </div>
          </div>
          
          <div class="modal-actions" style="margin-top: 20px;">
            <button type="submit" class="btn btn-success" style="width: 100%;">
              <span>✅</span>
              دفع الخدمات
            </button>
            <button type="button" class="btn btn-secondary" id="cancelPay" style="width: 100%; margin-top: 10px;">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    `;
    
    modal.classList.add('active');
    
    // إظهار خيار الشحن إذا لم يكن هناك رصيد كافي
    const balanceSelect = document.getElementById('payBalanceType');
    balanceSelect.addEventListener('change', (e) => {
      const chargeOption = document.getElementById('chargeOption');
      
      if (!e.target.value) {
        chargeOption.style.display = 'none';
        return;
      }
      
      const balanceMap = {
        'رصيد أساسي': client.balance_basic,
        'رصيد ليزر': client.balance_laser,
        'رصيد بشرة': client.balance_skin
      };
      
      const selectedBalance = parseFloat(balanceMap[e.target.value] || 0);
      
      if (selectedBalance < totalUnpaid) {
        chargeOption.style.display = 'block';
      } else {
        chargeOption.style.display = 'none';
      }
    });
    
    // إرسال النموذج
    document.getElementById('payUnpaidForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const balanceType = document.getElementById('payBalanceType').value;
      if (!balanceType) {
        alert('⚠️ الرجاء اختيار نوع الرصيد');
        return;
      }
      
      const balanceMap = {
        'رصيد أساسي': client.balance_basic,
        'رصيد ليزر': client.balance_laser,
        'رصيد بشرة': client.balance_skin
      };
      
      const selectedBalance = parseFloat(balanceMap[balanceType] || 0);
      let needsCharge = selectedBalance < totalUnpaid;
      
      try {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        // إذا كان يحتاج شحن
        if (needsCharge) {
          const chargeAmount = parseFloat(document.getElementById('chargeAmount').value);
          const chargeMethod = document.getElementById('chargeMethod').value;
          
          if (chargeAmount < totalUnpaid) {
            alert('⚠️ المبلغ المشحون يجب أن يكون أكبر من أو يساوي المبلغ المطلوب');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
          }
          
          // شحن الرصيد
          const chargeRes = await fetch(`/api/clients/${booking.client_id}/charge-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              balance_type: balanceType,
              amount: chargeAmount,
              payment_method: chargeMethod,
              created_by: currentUser.name
            })
          });
          
          if (!chargeRes.ok) {
            const chargeData = await chargeRes.json();
            alert('⚠️ ' + chargeData.message);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
          }
        }
        
        // دفع الخدمات
        const payRes = await fetch(`/api/bookings/${booking.id}/pay-unpaid-services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            balance_type: balanceType,
            amount: totalUnpaid,
            client_id: booking.client_id,
            paid_by: currentUser.name
          })
        });
        
        const payData = await payRes.json();
        
        if (!payRes.ok) {
          alert('⚠️ ' + payData.message);
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }
        
        alert('✅ تم دفع الخدمات بنجاح!');
        closeModal(modal);
        await loadSchedule();
        
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        
      } catch (error) {
        console.error('❌ خطأ:', error);
        alert('⚠️ حدث خطأ في الدفع');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    });
    
    document.getElementById('closePayModal').addEventListener('click', () => {
      closeModal(modal);
      openBookingDetailsModal(booking);
    });
    
    document.getElementById('cancelPay').addEventListener('click', () => {
      closeModal(modal);
      openBookingDetailsModal(booking);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
        openBookingDetailsModal(booking);
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    alert('⚠️ حدث خطأ في تحميل البيانات');
  }
}
// ============================================
// 🚨 فحص الخدمات الغير مدفوعة عند فتح الصفحة
// ============================================

// دالة تشغيل صوت الإنذار
function playWarningSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }, i * 400);
    }
  } catch (error) {
    console.error('لم يتم تشغيل الصوت:', error);
  }
}

// فحص الخدمات الغير مدفوعة عند التحميل
async function checkUnpaidServicesOnLoad() {
  const unpaidBookings = bookings.filter(b => 
    b.notes && b.notes.includes('[خدمات غير مدفوعة:') && 
    b.status !== 'انتهت' && b.status !== 'ملغي'
  );
  
  if (unpaidBookings.length > 0) {
    // حساب المبلغ الإجمالي
    let totalUnpaid = 0;
    const bookingsList = unpaidBookings.map(b => {
      const match = b.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
      const amount = match ? parseFloat(match[1]) : 0;
      totalUnpaid += amount;
      return `- ${b.client_name} (${amount.toFixed(2)} ج)`;
    }).join('\n');
    
    // تشغيل الصوت
    playWarningSound();
    
    // إظهار رسالة تنبيه
    setTimeout(() => {
      alert(
        `🚨 تحذير: يوجد ${unpaidBookings.length} حجز يحتوي على خدمات غير مدفوعة!\n\n` +
        `📋 الحجوزات:\n${bookingsList}\n\n` +
        `💰 الإجمالي: ${totalUnpaid.toFixed(2)} ج\n\n` +
        `⚠️ يجب الدفع قبل إنهاء الجلسات\n\n` +
        `📍 اضغط "موافق" لعرض التفاصيل`
      );
    }, 500);
  }
}
// ============================================
// 🔄 تزامن تلقائي مع صفحة الجلسة
// ============================================
let autoRefreshInterval = null;
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const dateStr = getLocalDateString(currentDate);

// 🔧 دالة تحديث آمنة بدون تداخل
let isRefreshing = false;

async function autoRefreshSchedule() {
  if (isRefreshing) return; // منع التداخل
  
  try {
    isRefreshing = true;
    console.log('🔄 تحديث تلقائي آمن...');
    
    // ⭐ استخدم نفس الدالة
    const dateStr = getLocalDateString(currentDate);
    const response = await fetch(`/api/bookings/${selectedDoctor.id}/${dateStr}?_t=${Date.now()}`);
    
    if (!response.ok) return;
    
    const newBookings = await response.json();
    
    // ⭐ مقارنة ذكية للتغييرات
    const oldIds = bookings.map(b => b.id).sort().join(',');
    const newIds = newBookings.map(b => b.id).sort().join(',');
    
    if (oldIds !== newIds) {
      console.log('✅ تم اكتشاف تغييرات - تحديث الجدول');
      bookings = newBookings;
      renderBookings();
      updateStats();
    }
    
  } catch (error) {
    console.error('❌ خطأ في التحديث التلقائي:', error);
  } finally {
    isRefreshing = false;
  }
}

// بدء التحديث التلقائي كل 5 ثواني
autoRefreshInterval = setInterval(autoRefreshSchedule, 5000);

// إيقاف التحديث عند مغادرة الصفحة
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});

console.log('🔄 تم تفعيل التحديث التلقائي للجدول');

// تشغيل الفحص بعد تحميل البيانات
await checkUnpaidServicesOnLoad();


  console.log('✅ تم تحميل صفحة الجدول الجديدة بالكامل');
  console.log('👩‍⚕️ الدكتورة:', selectedDoctor.name);
  console.log('📅 التاريخ:', currentDate.toLocaleDateString('ar-EG'));
  console.log('📊 عدد الحجوزات:', bookings.length);
});