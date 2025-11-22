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

  // التحقق من أن المستخدم دكتور
  const allowedRoles = ['دكتور', 'دكتور بشرة', 'دكتور لايزر'];
  if (!allowedRoles.includes(currentUser.role)) {
    alert('⚠️ هذه الصفحة للأطباء فقط');
    window.location.href = '/Main/main.html';
    return;
  }

  // عرض معلومات الدكتور
  const doctorName = document.getElementById('doctorName');
  const doctorRole = document.getElementById('doctorRole');
  const doctorAvatar = document.getElementById('doctorAvatar');

  if (doctorName) doctorName.textContent = currentUser.name;
  if (doctorRole) doctorRole.textContent = currentUser.role;

  // تخصيص الأيقونة
  let icon = '👩‍⚕️';
  let bgGradient = 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)';

  if (currentUser.role === 'دكتور بشرة') {
    icon = '✨';
    bgGradient = 'linear-gradient(135deg, #ec407a 0%, #f48fb1 100%)';
  } else if (currentUser.role === 'دكتور لايزر') {
    icon = '💫';
    bgGradient = 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)';
  }

  if (doctorAvatar) {
    doctorAvatar.textContent = icon;
    doctorAvatar.style.background = bgGradient;
  }

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // عرض التاريخ
  const dateText = document.getElementById('dateText');
  const today = new Date();
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  if (dateText) {
    dateText.textContent = `${days[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
  }

  // تحميل الحجوزات
  await loadTodayBookings();

  async function loadTodayBookings() {
    try {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'flex';

      const dateStr = today.toISOString().split('T')[0];
      const response = await fetch(`/api/bookings/${currentUser.id}/${dateStr}`);
      
      if (!response.ok) throw new Error('Failed to fetch bookings');
      
      const bookings = await response.json();
      
      // تصفية الحجوزات النشطة فقط (غير الملغاة)
      const activeBookings = bookings.filter(b => b.status !== 'ملغي');
      
      renderBookings(activeBookings);
      updateStats(activeBookings);

      if (loadingOverlay) loadingOverlay.style.display = 'none';

    } catch (error) {
      console.error('❌ خطأ في تحميل الحجوزات:', error);
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      alert('⚠️ حدث خطأ في تحميل الحجوزات');
    }
  }

  function renderBookings(bookings) {
    const bookingsGrid = document.getElementById('bookingsGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (!bookingsGrid) return;
    
    bookingsGrid.innerHTML = '';
    
    if (bookings.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // ترتيب الحجوزات حسب الوقت
    bookings.sort((a, b) => a.start_time.localeCompare(b.start_time));
    
    bookings.forEach(booking => {
      const card = createBookingCard(booking);
      bookingsGrid.appendChild(card);
    });
  }

  function createBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    
    const status = booking.status || 'جاري';
    const statusClass = status === 'جاري' ? 'pending' : 
                       status === 'مؤكد' ? 'confirmed' : 
                       status === 'بدأت' ? 'started' : 
                       status === 'انتهت' ? 'completed' : 'pending';
    
    // تنسيق الوقت
    const formattedStartTime = formatTime(booking.start_time);
    const formattedEndTime = formatTime(booking.end_time);
    
    // عرض الخدمات
    let servicesHtml = '';
    if (booking.services && booking.services.length > 0) {
      servicesHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">';
      servicesHtml += '<strong style="color: #1e293b; font-size: 14px;">📋 الخدمات:</strong><br>';
      booking.services.forEach((service, index) => {
        servicesHtml += `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">• ${escapeHtml(service.service_name)}</div>`;
      });
      servicesHtml += '</div>';
    }
    
    card.innerHTML = `
      <div class="booking-header">
        <div class="booking-time">
          🕐 ${formattedStartTime} - ${formattedEndTime}
        </div>
        <span class="booking-status ${statusClass}">${status}</span>
      </div>
      
      <div class="booking-body">
        <div class="booking-info-row">
          <strong>👤 الاسم:</strong>
          <span>${escapeHtml(booking.client_name)}</span>
        </div>
        <div class="booking-info-row">
          <strong>📱 الهاتف:</strong>
          <span style="direction: ltr">${escapeHtml(booking.client_phone)}</span>
        </div>
        <div class="booking-info-row">
          <strong>💰 السعر:</strong>
          <span>${parseFloat(booking.total_price).toFixed(2)} ج</span>
        </div>
        ${servicesHtml}
        ${booking.notes ? `
          <div style="margin-top: 12px; padding: 12px; background: #fef3c7; border-radius: 8px;">
            <strong style="font-size: 13px; color: #92400e;">📝 ملاحظات:</strong>
            <div style="font-size: 13px; color: #92400e; margin-top: 4px;">${escapeHtml(booking.notes)}</div>
          </div>
        ` : ''}
      </div>
      
      <div class="booking-actions">
        ${status === 'مؤكد' || status === 'بدأت' ? `
          <button class="btn btn-primary" onclick="startSession(${booking.id})">
            <span>▶️</span>
            بدء الجلسة
          </button>
        ` : status === 'جاري' ? `
          <button class="btn btn-info" onclick="alert('⚠️ يجب تأكيد الحجز أولاً من قبل الاستقبال')">
            <span>ℹ️</span>
            في الانتظار
          </button>
        ` : status === 'انتهت' ? `
          <button class="btn btn-success" disabled style="opacity: 0.6; cursor: not-allowed;">
            <span>✅</span>
            تمت الجلسة
          </button>
        ` : ''}
      </div>
    `;
    
    return card;
  }

  function updateStats(bookings) {
    const totalBookings = document.getElementById('totalBookings');
    const pendingBookings = document.getElementById('pendingBookings');
    const completedBookings = document.getElementById('completedBookings');
    
    if (totalBookings) totalBookings.textContent = bookings.length;
    
    const pending = bookings.filter(b => ['جاري', 'مؤكد'].includes(b.status || 'جاري')).length;
    const completed = bookings.filter(b => (b.status || 'جاري') === 'انتهت').length;
    
    if (pendingBookings) pendingBookings.textContent = pending;
    if (completedBookings) completedBookings.textContent = completed;
  }

  function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    
    if (typeof timeStr === 'string' && timeStr.includes(':') && timeStr.length <= 8) {
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0]);
      const minutes = parts[1];
      
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      
      return `${hours}:${minutes} ${period}`;
    }
    
    try {
      const date = new Date(timeStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    } catch (e) {}
    
    return timeStr;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // دالة بدء الجلسة (عامة)
  window.startSession = async function(bookingId) {
    try {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'flex';

      // تحديث حالة الحجز إلى "بدأت"
      const response = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'بدأت' })
      });

      const data = await response.json();

      if (!response.ok) {
        alert('⚠️ ' + data.message);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      }

      // حفظ بيانات الحجز في sessionStorage
      sessionStorage.setItem('current_booking_id', bookingId);
      
      // الانتقال لصفحة الجلسة
      window.location.href = '/doctorspace/doctorappo.html';

    } catch (error) {
      console.error('❌ خطأ في بدء الجلسة:', error);
      alert('⚠️ حدث خطأ في بدء الجلسة');
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  };

  console.log('✅ تم تحميل صفحة الدكتور بنجاح');
  console.log('👩‍⚕️ الدكتورة:', currentUser.name);
});