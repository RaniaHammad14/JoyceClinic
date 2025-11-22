//cancelled.js
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // التحقق من تسجيل الدخول
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }

  const currentUser = JSON.parse(raw);

  // التحقق من اختيار الدكتور
  const doctorRaw = sessionStorage.getItem('selected_doctor');
  if (!doctorRaw) {
    alert('⚠️ الرجاء اختيار دكتور أولاً');
    window.location.href = '/bk/bk.html';
    return;
  }

  const selectedDoctor = JSON.parse(doctorRaw);

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
  const doctorAvatarEl = document.getElementById('doctorAvatar');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const cancelledBookingsGrid = document.getElementById('cancelledBookingsGrid');
  const emptyState = document.getElementById('emptyState');

  // عرض معلومات الدكتور
  if (doctorNameEl) doctorNameEl.textContent = selectedDoctor.name;
  
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

  let cancelledBookings = [];
  let services = [];
  let categories = [];

  // تحميل البيانات الأساسية
  async function loadInitialData() {
    try {
      const [catRes, servRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/services')
      ]);
      
      categories = await catRes.json();
      services = await servRes.json();
      
      console.log('✅ تم تحميل البيانات الأساسية');
    } catch (err) {
      console.error('❌ خطأ في تحميل البيانات:', err);
    }
  }

  // تحميل الحجوزات الملغاة
  async function loadCancelledBookings() {
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';

      const response = await fetch(`/api/bookings/doctor/${selectedDoctor.id}/cancelled`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch cancelled bookings');
      }
      
      cancelledBookings = await response.json();
      
      renderCancelledBookings();

      if (loadingOverlay) loadingOverlay.style.display = 'none';

    } catch (error) {
      console.error('❌ خطأ في تحميل الحجوزات:', error);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }

  // عرض الحجوزات الملغاة
  function renderCancelledBookings() {
    if (!cancelledBookingsGrid) return;
    
    cancelledBookingsGrid.innerHTML = '';
    
    if (cancelledBookings.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // ترتيب حسب التاريخ (الأحدث أولاً)
    cancelledBookings.sort((a, b) => {
      const dateA = new Date(a.booking_date + 'T' + a.start_time);
      const dateB = new Date(b.booking_date + 'T' + b.start_time);
      return dateB - dateA;
    });
    
    cancelledBookings.forEach(booking => {
      const card = createCancelledBookingCard(booking);
      cancelledBookingsGrid.appendChild(card);
    });
  }

  // إنشاء كرت الحجز الملغي
  function createCancelledBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    card.style.borderColor = '#f44336';
    
    // إنشاء قائمة الخدمات
    let servicesHtml = '';
    if (booking.services && booking.services.length > 0) {
      servicesHtml = '<div class="services-list">';
      booking.services.forEach((service, index) => {
        servicesHtml += `
          <div class="service-item">
            <strong>خدمة ${toEnglishNumbers(index + 1)}:</strong> ${escapeHtml(service.service_name)}
            <br>
            <small>القسم: ${escapeHtml(service.category_name)} • المدة: ${toEnglishNumbers(service.duration)} دقيقة • السعر: ${toEnglishNumbers(parseFloat(service.price).toFixed(2))} ج</small>
          </div>
        `;
      });
      servicesHtml += '</div>';
    }
    
    // تنسيق التاريخ
    const bookingDate = new Date(booking.booking_date);
    const formattedDate = bookingDate.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    card.innerHTML = `
<div class="booking-card-header" style="background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);">
  <div class="booking-time">
    🗑️ ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}
  </div>
  <span class="cancelled-badge">ملغي</span>
</div>
${booking.cancellation_reason ? `
  <div style="padding: 12px 20px; background: #fff3e0; border-right: 4px solid #ff9800; margin: 0 -2px;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 20px;">⚠️</span>
      <div>
        <div style="font-size: 13px; color: #e65100; font-weight: 600; margin-bottom: 4px;">سبب الإلغاء:</div>
        <div style="font-size: 15px; color: #f57c00; font-weight: 700;">${escapeHtml(booking.cancellation_reason)}</div>
      </div>
    </div>
  </div>
` : ''}
      <div class="booking-card-body">
        <div class="booking-info-row">
          <strong>📅 التاريخ:</strong>
          <span>${formattedDate}</span>
        </div>
        <div class="booking-info-row">
          <strong>👤 الاسم:</strong>
          <span>${escapeHtml(booking.client_name)}</span>
        </div>
        <div class="booking-info-row">
          <strong>📱 الهاتف:</strong>
          <span style="direction: ltr; display: inline-block">${toEnglishNumbers(escapeHtml(booking.client_phone))}</span>
        </div>
        <div class="booking-info-row">
          <strong>🔢 عدد الخدمات:</strong>
          <span>${toEnglishNumbers(booking.services ? booking.services.length : 0)}</span>
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
            <span>${escapeHtml(booking.notes)}</span>
          </div>
        ` : ''}
        
        <div style="display: flex; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 2px solid #f0f0f0;">
          <button class="restore-btn" onclick="rescheduleBooking(${booking.id})">
            <span>🔄</span>
            إعادة الحجز
          </button>
          <button class="delete-permanent-btn" onclick="deletePermanent(${booking.id})">
            <span>❌</span>
            حذف نهائي
          </button>
        </div>
      </div>
    `;
    
    return card;
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

  // دالة تنسيق الوقت
  function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    
    if (typeof timeStr === 'string' && timeStr.includes(':') && timeStr.length <= 8) {
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0]);
      const minutes = parts[1];
      
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      
      return `${toEnglishNumbers(hours)}:${toEnglishNumbers(minutes)} ${period}`;
    }
    
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

  // إعادة جدولة الحجز
window.rescheduleBooking = async function(bookingId) {
  const booking = cancelledBookings.find(b => b.id === bookingId);
  if (!booking) return;
  
  const modal = document.getElementById('rescheduleModal');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px;">
      <div class="modal-header">
        <h3>🔄 إعادة جدولة الحجز</h3>
        <button class="modal-close" id="closeRescheduleModal">&times;</button>
      </div>
      
      <form id="rescheduleForm" class="modal-body">
        <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; margin-bottom: 20px;">
          <h4 style="color: #e65100; margin-bottom: 12px;">📋 بيانات الحجز الملغي</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div><strong>العميل:</strong> ${escapeHtml(booking.client_name)}</div>
            <div><strong>الهاتف:</strong> ${booking.client_phone}</div>
            <div><strong>الدكتور الحالي:</strong> ${escapeHtml(booking.doctor_name)}</div>
            <div><strong>التاريخ:</strong> ${new Date(booking.booking_date).toLocaleDateString('ar-EG')}</div>
          </div>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 2px dashed #e65100;">
            <strong>الوقت:</strong> ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}
          </div>
          ${booking.cancellation_reason ? `
            <div style="margin-top: 12px; padding: 10px; background: rgba(255,152,0,0.2); border-radius: 8px;">
              <strong style="color: #f57c00;">⚠️ سبب الإلغاء:</strong> ${escapeHtml(booking.cancellation_reason)}
            </div>
          ` : ''}
        </div>

        <!-- ⭐ خيار تغيير الدكتور -->
        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; cursor: pointer; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 2px solid #e9ecef; transition: all 0.3s;">
            <input type="checkbox" id="changeDoctorCheckbox" style="width: 20px; height: 20px; margin-left: 12px; cursor: pointer;">
            <div style="flex: 1;">
              <strong style="font-size: 17px; color: #1e40af; display: block; margin-bottom: 4px;">🔄 تغيير الدكتور</strong>
              <small style="color: #6b7280;">فعّل هذا الخيار لاختيار دكتور آخر</small>
            </div>
          </label>
        </div>

        <div id="doctorSelectSection" style="display: none; padding: 16px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; margin-bottom: 20px; border: 2px solid #3b82f6;">
          <div class="form-group">
            <label for="newDoctorSelect" style="font-size: 16px; font-weight: 600; color: #1e40af; margin-bottom: 10px; display: block;">
              👩‍⚕️ اختر الدكتور الجديد *
            </label>
            <select id="newDoctorSelect" class="form-control" style="padding: 12px; border: 2px solid #3b82f6; border-radius: 8px; font-size: 15px; width: 100%;">
              <option value="">جاري تحميل الأطباء...</option>
            </select>
          </div>
          <div id="doctorScheduleInfo" style="margin-top: 12px; padding: 12px; background: white; border-radius: 8px; display: none;">
            <p style="margin: 0; color: #059669; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">✅</span>
              تم اختيار دكتور جديد
            </p>
          </div>
        </div>
        
        <div class="form-group">
          <label for="newBookingDate">📅 التاريخ الجديد *</label>
          <input type="date" id="newBookingDate" class="date-input" required style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; width: 100%; font-size: 15px;">
        </div>
        
        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label for="newStartTime">🕐 وقت البداية *</label>
            <input type="time" id="newStartTime" required style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; width: 100%; font-size: 15px;">
          </div>
          <div class="form-group">
            <label for="newEndTime">🕐 وقت النهاية *</label>
            <input type="time" id="newEndTime" required style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; width: 100%; font-size: 15px;">
          </div>
        </div>

        <div id="conflictWarning" style="display: none; padding: 16px; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 2px solid #dc2626; border-radius: 12px; margin: 16px 0;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">⚠️</span>
            <div>
              <strong style="color: #991b1b; font-size: 16px; display: block; margin-bottom: 4px;">تعارض في المواعيد!</strong>
              <p style="margin: 0; color: #dc2626; font-size: 14px;">هذا الميعاد محجوز بالفعل - الرجاء اختيار وقت آخر</p>
            </div>
          </div>
        </div>
        
        <div class="modal-actions" style="margin-top: 24px; display: flex; gap: 12px;">
          <button type="submit" class="btn btn-success" id="confirmRescheduleBtn" style="flex: 1; padding: 14px; font-size: 16px;">
            <span>✅</span>
            تأكيد إعادة الجدولة
          </button>
          <button type="button" class="btn btn-secondary" id="cancelReschedule" style="flex: 1; padding: 14px; font-size: 16px;">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  `;
  
  modal.classList.add('active');

  // ⭐ تحميل قائمة الأطباء
  async function loadDoctors() {
    try {
      const response = await fetch('/api/accounts');
      const accounts = await response.json();
      
      const doctors = accounts.filter(acc => 
        acc.role === 'دكتور بشرة' || acc.role === 'دكتور لايزر'
      );
      
      const doctorSelect = document.getElementById('newDoctorSelect');
      doctorSelect.innerHTML = '<option value="">اختر الدكتور...</option>';
      
      doctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${doc.name} - ${doc.role}`;
        
        // تعليم الدكتور الحالي
        if (doc.id === booking.doctor_id) {
          option.textContent += ' (الحالي)';
          option.selected = true;
        }
        
        doctorSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading doctors:', error);
      const doctorSelect = document.getElementById('newDoctorSelect');
      doctorSelect.innerHTML = '<option value="">خطأ في تحميل الأطباء</option>';
    }
  }

  loadDoctors();

  // عند تفعيل/إلغاء تغيير الدكتور
  const changeDoctorCheckbox = document.getElementById('changeDoctorCheckbox');
  const doctorSelectSection = document.getElementById('doctorSelectSection');
  const doctorScheduleInfo = document.getElementById('doctorScheduleInfo');

  changeDoctorCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      doctorSelectSection.style.display = 'block';
      doctorSelectSection.style.animation = 'slideDown 0.3s ease';
      document.getElementById('newDoctorSelect').required = true;
      
      // تغيير لون الخلفية
      e.target.closest('label').style.background = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
      e.target.closest('label').style.borderColor = '#3b82f6';
    } else {
      doctorSelectSection.style.display = 'none';
      document.getElementById('newDoctorSelect').required = false;
      document.getElementById('newDoctorSelect').value = booking.doctor_id;
      doctorScheduleInfo.style.display = 'none';
      
      // إرجاع اللون الأصلي
      e.target.closest('label').style.background = '#f8f9fa';
      e.target.closest('label').style.borderColor = '#e9ecef';
    }
    checkConflict();
  });

  // عند اختيار دكتور
  document.getElementById('newDoctorSelect').addEventListener('change', () => {
    const selectedValue = document.getElementById('newDoctorSelect').value;
    if (selectedValue) {
      doctorScheduleInfo.style.display = 'block';
    } else {
      doctorScheduleInfo.style.display = 'none';
    }
    checkConflict();
  });

  // فحص التعارض عند تغيير الدكتور أو الوقت
  async function checkConflict() {
    const selectedDoctorId = document.getElementById('newDoctorSelect').value || booking.doctor_id;
    const date = document.getElementById('newBookingDate').value;
    const startTime = document.getElementById('newStartTime').value;
    const endTime = document.getElementById('newEndTime').value;
    
    if (!date || !startTime || !endTime || !selectedDoctorId) return;
    
    // التحقق من أن الوقت منطقي
    if (endTime <= startTime) {
      const conflictWarning = document.getElementById('conflictWarning');
      const confirmBtn = document.getElementById('confirmRescheduleBtn');
      
      conflictWarning.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 32px;">⚠️</span>
          <div>
            <strong style="color: #991b1b; font-size: 16px; display: block; margin-bottom: 4px;">خطأ في الأوقات!</strong>
            <p style="margin: 0; color: #dc2626; font-size: 14px;">وقت النهاية يجب أن يكون بعد وقت البداية</p>
          </div>
        </div>
      `;
      conflictWarning.style.display = 'block';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      return;
    }
    
    try {
      const response = await fetch(`/api/bookings/${selectedDoctorId}/${date}`);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const bookings = await response.json();
      
      const hasConflict = bookings.some(b => {
        if (b.id === booking.id || b.status === 'ملغي' || b.status === 'انتهت') {
          return false;
        }
        return (startTime < b.end_time && endTime > b.start_time);
      });
      
      const conflictWarning = document.getElementById('conflictWarning');
      const confirmBtn = document.getElementById('confirmRescheduleBtn');
      
      if (hasConflict) {
        const conflictingBooking = bookings.find(b => {
          if (b.id === booking.id || b.status === 'ملغي' || b.status === 'انتهت') return false;
          return (startTime < b.end_time && endTime > b.start_time);
        });
        
        conflictWarning.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">⚠️</span>
            <div>
              <strong style="color: #991b1b; font-size: 16px; display: block; margin-bottom: 4px;">تعارض في المواعيد!</strong>
              <p style="margin: 0; color: #dc2626; font-size: 14px;">
                يوجد حجز في هذا الوقت للعميل: <strong>${conflictingBooking.client_name}</strong>
              </p>
            </div>
          </div>
        `;
        conflictWarning.style.display = 'block';
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
      } else {
        conflictWarning.style.display = 'none';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
      }
    } catch (error) {
      console.error('Error checking conflict:', error);
    }
  }

  document.getElementById('newBookingDate').addEventListener('change', checkConflict);
  document.getElementById('newStartTime').addEventListener('change', checkConflict);
  document.getElementById('newEndTime').addEventListener('change', checkConflict);
  document.getElementById('newStartTime').addEventListener('input', checkConflict);
  document.getElementById('newEndTime').addEventListener('input', checkConflict);

  // Event listeners للأزرار
  document.getElementById('closeRescheduleModal')?.addEventListener('click', () => closeModal(modal));
  document.getElementById('cancelReschedule')?.addEventListener('click', () => closeModal(modal));
  
  // معالج إرسال النموذج
  const rescheduleForm = document.getElementById('rescheduleForm');
  rescheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newDate = document.getElementById('newBookingDate').value;
    const newStartTime = document.getElementById('newStartTime').value;
    const newEndTime = document.getElementById('newEndTime').value;
    const changeDoctorChecked = document.getElementById('changeDoctorCheckbox').checked;
    const newDoctorId = changeDoctorChecked ? document.getElementById('newDoctorSelect').value : null;
    
    if (!newDate || !newStartTime || !newEndTime) {
      alert('⚠️ الرجاء ملء جميع الحقول');
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      const payload = {
        booking_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        status: 'جاري'
      };

      // ⭐ إضافة doctor_id فقط إذا تم تغييره
      if (newDoctorId && parseInt(newDoctorId) !== booking.doctor_id) {
        payload.doctor_id = parseInt(newDoctorId);
        console.log('🔄 سيتم تغيير الدكتور إلى:', newDoctorId);
      }

      const response = await fetch(`/api/bookings/${bookingId}/reschedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      const successMessage = newDoctorId && parseInt(newDoctorId) !== booking.doctor_id
        ? '✅ تم إعادة الجدولة وتغيير الدكتور بنجاح!'
        : '✅ تم إعادة جدولة الحجز بنجاح!';
      
      alert(successMessage);
      closeModal(modal);
      await loadCancelledBookings();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (err) {
      console.error('❌ خطأ في إعادة الجدولة:', err);
      alert('⚠️ حدث خطأ');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
};

  // حذف نهائي
  window.deletePermanent = async function(bookingId) {
    if (!confirm('⚠️ هل أنت متأكدة من الحذف النهائي؟ لا يمكن التراجع!')) {
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }
      
      alert('✅ ' + data.message);
      await loadCancelledBookings();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
    } catch (err) {
      console.error('❌ خطأ في الحذف:', err);
      alert('⚠️ حدث خطأ');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  };

  // إغلاق Modal
  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

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

  // التهيئة
  await loadInitialData();
  await loadCancelledBookings();

  console.log('✅ تم تحميل صفحة الحجوزات الملغاة');
});
// Event listeners للفلتر
const applyFilterBtn = document.getElementById('applyFilterBtn');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const filterStartDate = document.getElementById('filterStartDate');
const filterEndDate = document.getElementById('filterEndDate');

if (applyFilterBtn) {
  applyFilterBtn.addEventListener('click', async () => {
    const startDate = filterStartDate.value;
    const endDate = filterEndDate.value;
    
    if (!startDate && !endDate) {
      alert('⚠️ الرجاء اختيار تاريخ واحد على الأقل');
      return;
    }
    
    try {
      if (loadingOverlay) loadingOverlay.style.display = 'flex';
      
      let url = `/api/bookings/doctor/${selectedDoctor.id}/cancelled?`;
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      
      cancelledBookings = await response.json();
      renderCancelledBookings();
      
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    } catch (err) {
      console.error('Error:', err);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      alert('⚠️ حدث خطأ في الفلترة');
    }
  });
}

if (clearFilterBtn) {
  clearFilterBtn.addEventListener('click', async () => {
    filterStartDate.value = '';
    filterEndDate.value = '';
    await loadCancelledBookings();
  });
}