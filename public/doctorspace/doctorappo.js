//doctorappo.js
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

  // التحقق من نوع الحساب
  const allowedRoles = ['دكتور', 'دكتور بشرة', 'دكتور لايزر'];
  if (!allowedRoles.includes(currentUser.role)) {
    alert('⚠️ هذه الصفحة للأطباء فقط');
    window.location.href = '/Main/main.html';
    return;
  }

  // الحصول على ID الحجز
  const bookingId = sessionStorage.getItem('current_booking_id');
  if (!bookingId) {
    alert('⚠️ لم يتم اختيار حجز');
    window.location.href = '/doctorspace/doctorspace.html';
    return;
  }

  // متغيرات عامة
  let bookingData = null;
  let sessionDetails = [];
  let products = [];

// زر الرجوع
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      // ⭐ إعادة فحص من السيرفر قبل الرجوع
      await checkUnpaidServices();
      
      // التحقق بعد إعادة التحميل
      if (bookingData && bookingData.notes && bookingData.notes.includes('[خدمات غير مدفوعة:')) {
        const match = bookingData.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
        const unpaidAmount = match ? match[1] : '---';
        
        alert(`🚫 لا يمكن مغادرة الصفحة!\n\n⚠️ يوجد خدمات إضافية غير مدفوعة\n\n💰 المبلغ المطلوب: ${unpaidAmount} ج\n\n📍 يجب الدفع أولاً من صفحة الحجوزات أو التواصل مع الاستقبال`);
        return;
      }
      window.location.href = '/doctorspace/doctorspace.html';
    });
  }
  // تحميل بيانات الحجز
  await loadBookingData();
  // تحميل تفاصيل الجلسة المحفوظة
  await loadSavedDetails();

  // تحميل المنتجات
  await loadProducts();

  // زر المخزون
  const stockBtn = document.getElementById('stockBtn');
  if (stockBtn) {
    stockBtn.addEventListener('click', openStockModal);
  }

// ⭐ فحص الخدمات الغير مدفوعة عند التحميل + التحديث التلقائي
let unpaidCheckInterval = null;

async function checkUnpaidServices() {
  // إعادة تحميل بيانات الحجز من السيرفر
  try {
    const response = await fetch(`/api/bookings/${currentUser.id}/${new Date().toISOString().split('T')[0]}`);
    if (!response.ok) return;
    
    const bookings = await response.json();
    const updatedBooking = bookings.find(b => b.id == bookingId);
    
    if (!updatedBooking) return;
    
    // تحديث bookingData
    bookingData = updatedBooking;
    
    // فحص الخدمات الغير مدفوعة
    const hasUnpaid = bookingData.notes && bookingData.notes.includes('[خدمات غير مدفوعة:');
    
    if (hasUnpaid) {
      // استخراج المبلغ
      const match = bookingData.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
      const unpaidAmount = match ? match[1] : '---';
      
      // التحقق من وجود banner سابق
      let warningBanner = document.getElementById('unpaidWarningBanner');
      
      if (!warningBanner) {
        // تشغيل الصوت لأول مرة فقط
        playWarningSound();
        
        // إظهار رسالة تنبيه لأول مرة فقط
        setTimeout(() => {
          alert(
            `🚨 تحذير: حجز يحتوي على خدمات غير مدفوعة!\n\n` +
            `💰 المبلغ المطلوب: ${unpaidAmount} ج\n\n` +
            `⚠️ يجب الدفع قبل إنهاء الجلسة\n\n` +
            `📍 اضغط "موافق" للمتابعة`
          );
        }, 500);
        
        // إنشاء banner تحذيري
        warningBanner = document.createElement('div');
        warningBanner.id = 'unpaidWarningBanner';
        warningBanner.style.cssText = `
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(220, 38, 38, 0.4);
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 16px;
          animation: shake 0.5s infinite;
          border: 3px solid #fecaca;
        `;
        
        warningBanner.innerHTML = `
          <div style="font-size: 32px;">🚨</div>
          <div>
            <strong style="font-size: 18px; display: block; margin-bottom: 4px;">
              ⚠️ خدمات غير مدفوعة - ${unpaidAmount} ج
            </strong>
            <p style="margin: 0; font-size: 14px; opacity: 0.9;">
              يجب الدفع قبل إنهاء الجلسة من صفحة الحجوزات
            </p>
          </div>
        `;
        
        document.body.appendChild(warningBanner);
        
        // إضافة animation shake
        const style = document.createElement('style');
        style.textContent = `
          @keyframes shake {
            0%, 100% { transform: translateX(-50%) rotate(0deg); }
            25% { transform: translateX(-50%) rotate(-2deg); }
            75% { transform: translateX(-50%) rotate(2deg); }
          }
        `;
        document.head.appendChild(style);
      } else {
        // تحديث المبلغ في banner الموجود
        const amountText = warningBanner.querySelector('strong');
        if (amountText) {
          amountText.textContent = `⚠️ خدمات غير مدفوعة - ${unpaidAmount} ج`;
        }
      }
      
      console.log('⚠️ لا يزال هناك خدمات غير مدفوعة:', unpaidAmount);
      
    } else {
      // ✅ تم الدفع - إزالة التحذير
      const warningBanner = document.getElementById('unpaidWarningBanner');
      if (warningBanner) {
        // animation للإزالة
        warningBanner.style.animation = 'fadeOut 0.5s ease-out';
        warningBanner.style.opacity = '0';
        
        setTimeout(() => {
          warningBanner.remove();
          
          // إظهار رسالة نجاح
          const successBanner = document.createElement('div');
          successBanner.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 16px;
            animation: slideDown 0.5s ease-out;
          `;
          
          successBanner.innerHTML = `
            <div style="font-size: 32px;">✅</div>
            <div>
              <strong style="font-size: 18px; display: block;">
                تم الدفع بنجاح!
              </strong>
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">
                يمكنك الآن إنهاء الجلسة
              </p>
            </div>
          `;
          
          document.body.appendChild(successBanner);
          
          // إخفاء رسالة النجاح بعد 5 ثواني
          setTimeout(() => {
            successBanner.style.animation = 'fadeOut 0.5s ease-out';
            successBanner.style.opacity = '0';
            setTimeout(() => successBanner.remove(), 500);
          }, 5000);
          
        }, 500);
        
        console.log('✅ تم الدفع - تم إزالة التحذير');
        
        // إيقاف التحديث التلقائي
        if (unpaidCheckInterval) {
          clearInterval(unpaidCheckInterval);
          unpaidCheckInterval = null;
          console.log('⏸️ تم إيقاف التحديث التلقائي');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ خطأ في فحص الخدمات:', error);
  }
}

// 🔄 بدء التحديث التلقائي كل 5 ثواني
unpaidCheckInterval = setInterval(checkUnpaidServices, 5000);

// تنظيف عند مغادرة الصفحة
window.addEventListener('beforeunload', () => {
  if (unpaidCheckInterval) {
    clearInterval(unpaidCheckInterval);
  }
});

// 🔊 دالة تشغيل صوت الإنذار
function playWarningSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // صوت إنذار (3 نغمات متتالية)
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
// إضافة CSS للـ animations
const animationStyle = document.createElement('style');
animationStyle.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes slideDown {
    from { 
      transform: translateX(-50%) translateY(-100px);
      opacity: 0;
    }
    to { 
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(animationStyle);

// استدعاء الفحص بعد تحميل البيانات
await checkUnpaidServices();

  // زر حفظ الجلسة الكلي
  const saveAllBtn = document.getElementById('saveAllBtn');
  if (saveAllBtn) {
    saveAllBtn.addEventListener('click', saveSession);
  }

  async function loadBookingData() {
    try {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'flex';

      const response = await fetch(`/api/bookings/${currentUser.id}/${new Date().toISOString().split('T')[0]}`);
      if (!response.ok) throw new Error('Failed to fetch bookings');

      const bookings = await response.json();
      bookingData = bookings.find(b => b.id == bookingId);

      if (!bookingData) {
        alert('⚠️ الحجز غير موجود');
        window.location.href = '/doctorspace/doctorspace.html';
        return;
      }

      renderBookingInfo();
      renderServices();

      if (loadingOverlay) loadingOverlay.style.display = 'none';

    } catch (error) {
      console.error('❌ خطأ في تحميل البيانات:', error);
      alert('⚠️ حدث خطأ في تحميل البيانات');
      window.location.href = '/doctorspace/doctorspace.html';
    }
  }
async function loadSavedDetails() {
  try {
    const response = await fetch(`/api/session-details/${bookingId}`);
    if (!response.ok) return;
    
    const savedDetails = await response.json();
    
    console.log('📥 التفاصيل المحفوظة:', savedDetails);
    
    // مسح البيانات القديمة
    sessionDetails = [];
    
    // تحويل البيانات المحفوظة
    savedDetails.forEach(detail => {
      const uniqueKey = `${bookingData.id}-${detail.service_id}-${detail.service_index}`;
      
      if (detail.detail_type === 'laser') {
        sessionDetails.push({
          type: 'laser',
          serviceId: detail.service_id,
          serviceName: detail.service_name,
          uniqueKey: uniqueKey,
          sessionNumber: detail.session_number,
          sessionType: detail.session_type,
          pulses: detail.pulses,
          power: detail.power,
          pulsDuration: detail.puls_duration,
          spotSize: detail.spot_size,
          skinType: detail.skin_type,
          notes: detail.notes
        });
      } else if (detail.detail_type === 'skin') {
        sessionDetails.push({
          type: 'skin',
          serviceId: detail.service_id,
          serviceName: detail.service_name,
          uniqueKey: uniqueKey,
          productUsed: detail.product_used,
          quantity: detail.quantity,
          notes: detail.notes
        });
      }
    });
    
    console.log('✅ sessionDetails بعد التحويل:', sessionDetails);
    
    renderServices();
    
  } catch (error) {
    console.error('❌ خطأ في تحميل التفاصيل:', error);
  }
}


  async function loadProducts() {
    try {
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      products = await response.json();
    } catch (error) {
      console.error('❌ خطأ في تحميل المنتجات:', error);
    }
  }

  function renderBookingInfo() {
    const container = document.getElementById('bookingInfoContent');
    if (!container || !bookingData) return;

    const status = bookingData.status || 'جاري';
    const statusClass = status === 'جاري' ? 'pending' : 
                       status === 'مؤكد' ? 'confirmed' : 
                       status === 'بدأت' ? 'started' : 
                       status === 'انتهت' ? 'completed' : 'pending';

    container.innerHTML = `
      <div class="info-group">
        <div class="info-label">حالة الحجز</div>
        <span class="status-badge ${statusClass}">${status}</span>
      </div>

      <div class="info-group">
        <div class="info-label">👤 اسم العميل</div>
        <div class="info-value">${escapeHtml(bookingData.client_name)}</div>
      </div>

      <div class="info-group">
        <div class="info-label">📱 رقم الهاتف</div>
        <div class="info-value" style="direction: ltr">${escapeHtml(bookingData.client_phone)}</div>
      </div>

      <div class="info-group">
        <div class="info-label">🕐 وقت الحجز</div>
        <div class="info-value">${formatTime(bookingData.start_time)} - ${formatTime(bookingData.end_time)}</div>
      </div>

      <div class="info-group">
        <div class="info-label">💰 السعر الإجمالي</div>
        <div class="info-value large">${parseFloat(bookingData.total_price).toFixed(2)} ج</div>
      </div>

      ${bookingData.balance_type ? `
        <div class="info-group">
          <div class="info-label">💳 نوع الرصيد</div>
          <div class="info-value">${escapeHtml(bookingData.balance_type)}</div>
        </div>
      ` : ''}

      ${bookingData.notes ? `
        <div class="info-group">
          <div class="info-label">📝 ملاحظات</div>
          <div class="info-value">${escapeHtml(bookingData.notes)}</div>
        </div>
      ` : ''}
    `;
  }

function renderServices() {
  const container = document.getElementById('servicesContainer');
  if (!container || !bookingData.services) return;

  container.innerHTML = '';

  bookingData.services.forEach((service, index) => {
    const card = document.createElement('div');
    card.className = 'service-card';

    // ⭐ استخدام index كـ معرّف فريد لكل خدمة في الحجز
    const uniqueKey = `${bookingData.id}-${service.service_id}-${index}`;
    
    // التحقق من وجود تفاصيل لهذه الخدمة بالذات
    const isCompleted = sessionDetails.some(d => d.uniqueKey === uniqueKey);
    
    const statusClass = isCompleted ? 'completed' : 'pending';
    const statusText = isCompleted ? 'تم التفاصيل' : 'في الانتظار';

    // طباعة للتأكد
    console.log(`🔍 الخدمة #${index + 1} [${service.service_id}] ${service.service_name}:`, {
      uniqueKey: uniqueKey,
      hasDetails: isCompleted
    });

    card.innerHTML = `
      <div class="service-header">
        <div class="service-name">${escapeHtml(service.service_name)} #${index + 1}</div>
        <span class="service-status ${statusClass}">${statusText}</span>
      </div>

      <div class="service-info">
        <div class="service-info-item">
          <strong>القسم:</strong> ${escapeHtml(service.category_name)}
        </div>
        <div class="service-info-item">
          <strong>المدة:</strong> ${service.duration} دقيقة
        </div>
        <div class="service-info-item">
          <strong>السعر:</strong> ${parseFloat(service.price).toFixed(2)} ج
        </div>
      </div>

      <div class="service-actions">
        <button class="btn ${isCompleted ? 'btn-success' : 'btn-primary'}" 
                onclick="openDetailsModal(${service.service_id}, '${escapeHtml(service.service_name).replace(/'/g, "\\'")}', ${index})">
          <span>${isCompleted ? '✅' : '📝'}</span>
          ${isCompleted ? 'تعديل التفاصيل' : 'إضافة التفاصيل'}
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

window.openDetailsModal = function(serviceId, serviceName, serviceIndex) {
  // تحديد نوع Modal بناءً على دور الدكتور
  if (currentUser.role === 'دكتور لايزر') {
    openLaserModal(serviceId, serviceName, serviceIndex);
  } else {
    openSkinModal(serviceId, serviceName, serviceIndex);
  }
};

function openLaserModal(serviceId, serviceName, serviceIndex) {
  const modal = document.getElementById('laserModal');
  if (!modal) return;

  const uniqueKey = `${bookingData.id}-${serviceId}-${serviceIndex}`;
  console.log('🔓 فتح modal ليزر للخدمة #' + (serviceIndex + 1), uniqueKey);

  // ملء البيانات الأساسية
  document.getElementById('laserServiceId').value = serviceId;
  document.getElementById('laserServiceName').value = serviceName;
  document.getElementById('laserServiceIndex').value = serviceIndex; // ⭐ جديد
  document.getElementById('laserClientName').value = bookingData.client_name;
  document.getElementById('laserClientPhone').value = bookingData.client_phone;

  const today = new Date();
  document.getElementById('laserDate').value = today.toLocaleDateString('ar-EG');
  document.getElementById('laserTime').value = formatTime(bookingData.start_time);

  // البحث عن تفاصيل بناءً على uniqueKey
  const existingData = sessionDetails.find(d => d.uniqueKey === uniqueKey);
  
  console.log('📦 البيانات الموجودة:', existingData);
  
  if (existingData && existingData.type === 'laser') {
    console.log('✅ تم العثور على تفاصيل ليزر محفوظة');
    document.getElementById('laserSessionNumber').value = existingData.sessionNumber || '';
    document.getElementById('laserSessionType').value = existingData.sessionType || '';
    document.getElementById('laserPulses').value = existingData.pulses || '';
    document.getElementById('laserPower').value = existingData.power || '';
    document.getElementById('laserPulsDuration').value = existingData.pulsDuration || '';
    document.getElementById('laserSpotSize').value = existingData.spotSize || '';
    document.getElementById('laserSkinType').value = existingData.skinType || '';
    document.getElementById('laserNotes').value = existingData.notes || '';
  } else {
    console.log('ℹ️ لا توجد تفاصيل محفوظة - form جديد');
    document.getElementById('laserSessionNumber').value = '';
    document.getElementById('laserSessionType').value = '';
    document.getElementById('laserPulses').value = '';
    document.getElementById('laserPower').value = '';
    document.getElementById('laserPulsDuration').value = '';
    document.getElementById('laserSpotSize').value = '';
    document.getElementById('laserSkinType').value = '';
    document.getElementById('laserNotes').value = '';
  }

  modal.classList.add('active');
}

function openSkinModal(serviceId, serviceName, serviceIndex) {
  const modal = document.getElementById('skinModal');
  if (!modal) return;

  const uniqueKey = `${bookingData.id}-${serviceId}-${serviceIndex}`;
  console.log('🔓 فتح modal بشرة للخدمة #' + (serviceIndex + 1), uniqueKey);

  document.getElementById('skinServiceId').value = serviceId;
  document.getElementById('skinServiceName').value = serviceName;
  document.getElementById('skinServiceIndex').value = serviceIndex; // ⭐ جديد

  // البحث عن تفاصيل بناءً على uniqueKey
  const existingData = sessionDetails.find(d => d.uniqueKey === uniqueKey);
  
  console.log('📦 البيانات الموجودة:', existingData);
  
  if (existingData && existingData.type === 'skin') {
    console.log('✅ تم العثور على تفاصيل بشرة محفوظة');
    document.getElementById('skinProductUsed').value = existingData.productUsed || '';
    document.getElementById('skinQuantity').value = existingData.quantity || '';
    document.getElementById('skinNotes').value = existingData.notes || '';
  } else {
    console.log('ℹ️ لا توجد تفاصيل محفوظة - form جديد');
    document.getElementById('skinProductUsed').value = '';
    document.getElementById('skinQuantity').value = '';
    document.getElementById('skinNotes').value = '';
  }

  modal.classList.add('active');
}

  // إغلاق Modals
  document.getElementById('closeLaserModal')?.addEventListener('click', () => {
    document.getElementById('laserModal').classList.remove('active');
  });

  document.getElementById('closeSkinModal')?.addEventListener('click', () => {
    document.getElementById('skinModal').classList.remove('active');
  });

  // حفظ تفاصيل الليزر
// حفظ تفاصيل الليزر
// حفظ تفاصيل الليزر
  const laserForm = document.getElementById('laserForm');
  if (laserForm) {
    laserForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const serviceId = parseInt(document.getElementById('laserServiceId').value);
      const serviceIndex = parseInt(document.getElementById('laserServiceIndex').value);
      const serviceName = document.getElementById('laserServiceName').value;
      const uniqueKey = `${bookingData.id}-${serviceId}-${serviceIndex}`;

      console.log('💾 حفظ تفاصيل الخدمة:', { uniqueKey, serviceId, serviceIndex });

      const data = {
        booking_id: bookingId,
        service_id: serviceId,
        service_index: serviceIndex,
        service_name: serviceName,
        detail_type: 'laser',
        session_number: document.getElementById('laserSessionNumber').value,
        session_type: document.getElementById('laserSessionType').value,
        pulses: document.getElementById('laserPulses').value,
        power: document.getElementById('laserPower').value,
        puls_duration: document.getElementById('laserPulsDuration').value,
        spot_size: document.getElementById('laserSpotSize').value,
        skin_type: document.getElementById('laserSkinType').value,
        notes: document.getElementById('laserNotes').value,
        doctor_name: currentUser.name,
        doctor_role: currentUser.role
      };

      try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        const response = await fetch('/api/session-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
          alert('⚠️ ' + result.message);
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }

        console.log('✅ تم الحفظ في السيرفر بنجاح');

        // تحديث sessionDetails المحلي باستخدام uniqueKey
        sessionDetails = sessionDetails.filter(d => d.uniqueKey !== uniqueKey);
        sessionDetails.push({
          type: 'laser',
          serviceId: serviceId,
          serviceName: serviceName,
          uniqueKey: uniqueKey,
          clientName: document.getElementById('laserClientName').value,
          clientPhone: document.getElementById('laserClientPhone').value,
          date: document.getElementById('laserDate').value,
          time: document.getElementById('laserTime').value,
          sessionNumber: data.session_number,
          sessionType: data.session_type,
          pulses: data.pulses,
          power: data.power,
          pulsDuration: data.puls_duration,
          spotSize: data.spot_size,
          skinType: data.skin_type,
          notes: data.notes
        });

        console.log('✅ sessionDetails بعد التحديث:', sessionDetails);

        alert('✅ تم حفظ التفاصيل بنجاح');
        document.getElementById('laserModal').classList.remove('active');
        renderServices();

        if (loadingOverlay) loadingOverlay.style.display = 'none';

      } catch (error) {
        console.error('❌ خطأ:', error);
        alert('⚠️ حدث خطأ في حفظ التفاصيل');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    });
  }

  // حفظ تفاصيل البشرة
  const skinForm = document.getElementById('skinForm');
  if (skinForm) {
    skinForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const serviceId = parseInt(document.getElementById('skinServiceId').value);
      const serviceIndex = parseInt(document.getElementById('skinServiceIndex').value);
      const serviceName = document.getElementById('skinServiceName').value;
      const uniqueKey = `${bookingData.id}-${serviceId}-${serviceIndex}`;

      console.log('💾 حفظ تفاصيل الخدمة:', { uniqueKey, serviceId, serviceIndex });

      const data = {
        booking_id: bookingId,
        service_id: serviceId,
        service_index: serviceIndex,
        service_name: serviceName,
        detail_type: 'skin',
        product_used: document.getElementById('skinProductUsed').value,
        quantity: document.getElementById('skinQuantity').value,
        notes: document.getElementById('skinNotes').value,
        doctor_name: currentUser.name,
        doctor_role: currentUser.role
      };

      try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        const response = await fetch('/api/session-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
          alert('⚠️ ' + result.message);
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }

        console.log('✅ تم الحفظ في السيرفر بنجاح');

        // تحديث sessionDetails المحلي باستخدام uniqueKey
        sessionDetails = sessionDetails.filter(d => d.uniqueKey !== uniqueKey);
        sessionDetails.push({
          type: 'skin',
          serviceId: serviceId,
          serviceName: serviceName,
          uniqueKey: uniqueKey,
          productUsed: data.product_used,
          quantity: data.quantity,
          notes: data.notes
        });

        console.log('✅ sessionDetails بعد التحديث:', sessionDetails);

        alert('✅ تم حفظ التفاصيل بنجاح');
        document.getElementById('skinModal').classList.remove('active');
        renderServices();

        if (loadingOverlay) loadingOverlay.style.display = 'none';

      } catch (error) {
        console.error('❌ خطأ:', error);
        alert('⚠️ حدث خطأ في حفظ التفاصيل');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    });
  }

  // فتح modal المخزون
  function openStockModal() {
    const modal = document.getElementById('stockModal');
    if (!modal) return;

    renderProductsList();
    modal.classList.add('active');
  }

  function renderProductsList(searchQuery = '') {
    const container = document.getElementById('stockProductsList');
    if (!container) return;

    let filteredProducts = products;

    if (searchQuery) {
      filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchQuery))
      );
    }

    if (filteredProducts.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #757575; padding: 40px;">لا توجد منتجات</p>';
      return;
    }

    container.innerHTML = filteredProducts.map(product => {
      const stockStatus = product.current_stock <= product.min_stock ? 'low' : 'normal';
      return `
        <div class="product-item" onclick="selectProduct(${product.id})">
          <div class="product-name">${escapeHtml(product.name)}</div>
          <div class="product-info">
            <span>الفئة: ${escapeHtml(product.category_name || '--')}</span>
            <span class="product-stock ${stockStatus}">المخزون: ${product.current_stock} ${product.unit}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  window.selectProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // تحديد المنتج المختار
    document.querySelectorAll('.product-item').forEach(item => {
      item.classList.remove('selected');
    });
    event.target.closest('.product-item').classList.add('selected');

    // عرض معلومات المنتج
    document.getElementById('selectedStockItem').style.display = 'block';
    document.getElementById('selectedItemInfo').innerHTML = `
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(product.name)}</div>
      <div style="font-size: 14px; color: #757575;">المتوفر: ${product.current_stock} ${product.unit}</div>
    `;

    document.getElementById('stockQuantity').max = product.current_stock;
    document.getElementById('stockQuantity').value = 1;

    // حفظ ID المنتج
    document.getElementById('confirmStockBtn').dataset.productId = productId;
  };

  // بحث في المنتجات
  const stockSearch = document.getElementById('stockSearch');
  if (stockSearch) {
    stockSearch.addEventListener('input', (e) => {
      renderProductsList(e.target.value);
    });
  }

  // تأكيد استخدام من المخزون
  const confirmStockBtn = document.getElementById('confirmStockBtn');
  if (confirmStockBtn) {
    confirmStockBtn.addEventListener('click', async () => {
      const productId = confirmStockBtn.dataset.productId;
      const quantity = document.getElementById('stockQuantity').value;

      if (!productId || !quantity) {
        alert('⚠️ الرجاء اختيار منتج وكمية');
        return;
      }

      try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        // خصم من المخزون
        const response = await fetch('/api/stock-movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: parseInt(productId),
            movement_type: 'سحب',
            quantity: parseInt(quantity),
            notes: `استخدام في جلسة - الحجز ${bookingId}`,
            created_by: currentUser.name
          })
        });

        const data = await response.json();

        if (!response.ok) {
          alert('⚠️ ' + data.message);
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }

        alert('✅ تم الخصم من المخزون بنجاح');
        
        // إعادة تحميل المنتجات
        await loadProducts();
        renderProductsList();

        document.getElementById('selectedStockItem').style.display = 'none';
        document.getElementById('stockModal').classList.remove('active');

        if (loadingOverlay) loadingOverlay.style.display = 'none';

      } catch (error) {
        console.error('❌ خطأ:', error);
        alert('⚠️ حدث خطأ');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    });
  }

  // إغلاق modal المخزون
  document.getElementById('closeStockModal')?.addEventListener('click', () => {
    document.getElementById('stockModal').classList.remove('active');
  });

async function saveSession() {
  if (sessionDetails.length === 0) {
    alert('⚠️ الرجاء إضافة تفاصيل للخدمات أولاً');
    return;
  }

  // ⭐ إعادة فحص الخدمات الغير مدفوعة من السيرفر
  await checkUnpaidServices();
  
  // التحقق بعد إعادة التحميل
  if (bookingData.notes && bookingData.notes.includes('[خدمات غير مدفوعة:')) {
    // استخراج المبلغ
    const match = bookingData.notes.match(/\[خدمات غير مدفوعة: ([\d.]+) ج\]/);
    const unpaidAmount = match ? match[1] : '---';
    
    alert(`🚫 لا يمكن إنهاء الجلسة!\n\n⚠️ يوجد خدمات إضافية غير مدفوعة\n\n💰 المبلغ المطلوب: ${unpaidAmount} ج\n\n📍 يجب الدفع أولاً من صفحة الحجوزات`);
    
    // تشغيل صوت تحذيري
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 400;
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    return;
  }  // التحقق من أن كل الخدمات تم إدخال تفاصيلها
  const missingServices = bookingData.services.filter(s => 
    !sessionDetails.find(d => d.serviceId === s.service_id)
  );

  if (missingServices.length > 0) {
    const serviceNames = missingServices.map(s => s.service_name).join('، ');
    const confirm = window.confirm(
      `⚠️ لم يتم إدخال تفاصيل للخدمات التالية:\n\n${serviceNames}\n\nهل تريد المتابعة؟`
    );
    if (!confirm) return;
  }

  try {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    // تحديث حالة الحجز لـ "انتهت"
    const response = await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'انتهت' })
    });

    if (!response.ok) {
      throw new Error('فشل في تحديث حالة الحجز');
    }

    alert('✅ تم حفظ الجلسة بنجاح!');
    window.location.href = '/doctorspace/doctorspace.html';

  } catch (error) {
    console.error('❌ خطأ في الحفظ:', error);
    alert('⚠️ حدث خطأ في حفظ الجلسة');
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
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
  


// ============================================
// 🔄 تزامن تلقائي مع صفحة الحجوزات
// ============================================
let doctorAutoRefreshInterval = null;

// دالة التحديث التلقائي
async function autoRefreshDoctorPage() {
  try {
    console.log('🔄 تحديث تلقائي لبيانات الحجز...');
    
    // إعادة تحميل بيانات الحجز بصمت
    const response = await fetch(`/api/bookings/${currentUser.id}/${new Date().toISOString().split('T')[0]}`);
    
    if (!response.ok) return;
    
    const bookings = await response.json();
    const updatedBooking = bookings.find(b => b.id == bookingId);
    
    if (!updatedBooking) {
      console.log('⚠️ الحجز تم حذفه - العودة للصفحة الرئيسية');
      clearInterval(doctorAutoRefreshInterval);
      alert('⚠️ تم حذف الحجز');
      window.location.href = '/doctorspace/doctorspace.html';
      return;
    }
    
    // مقارنة البيانات
    const hasChanges = JSON.stringify(bookingData) !== JSON.stringify(updatedBooking);
    
    if (hasChanges) {
      console.log('✅ تم اكتشاف تغييرات - تحديث البيانات');
      
      // حفظ الحالة القديمة
      const oldStatus = bookingData.status;
      const oldServices = bookingData.services?.length || 0;
      
      // تحديث البيانات
      bookingData = updatedBooking;
      
      // تحديث العرض
      renderBookingInfo();
      renderServices();
      
      // التحقق من إضافة خدمات جديدة
      const newServices = updatedBooking.services?.length || 0;
      if (newServices > oldServices) {
        // تشغيل صوت تنبيه
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 700;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
        
        // إظهار تنبيه
        const alertDiv = document.createElement('div');
        alertDiv.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
          z-index: 9999;
          animation: slideIn 0.5s ease-out;
        `;
        
        alertDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 28px;">✨</div>
            <div>
              <strong style="display: block; margin-bottom: 4px;">تم إضافة خدمة جديدة!</strong>
              <small style="opacity: 0.9;">تحقق من الخدمات أدناه</small>
            </div>
          </div>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
          alertDiv.style.animation = 'fadeOut 0.5s ease-out';
          alertDiv.style.opacity = '0';
          setTimeout(() => alertDiv.remove(), 500);
        }, 5000);
      }
      
      // التحقق من تغيير الحالة
      if (oldStatus !== updatedBooking.status) {
        console.log(`📊 تغيير الحالة: ${oldStatus} → ${updatedBooking.status}`);
      }
    }
    
  } catch (error) {
    console.error('❌ خطأ في التحديث التلقائي:', error);
  }
}

// بدء التحديث التلقائي كل 3 ثواني (أسرع من صفحة الحجوزات)
doctorAutoRefreshInterval = setInterval(autoRefreshDoctorPage, 3000);

// إيقاف التحديث عند مغادرة الصفحة
window.addEventListener('beforeunload', () => {
  if (doctorAutoRefreshInterval) {
    clearInterval(doctorAutoRefreshInterval);
  }
});

// إضافة CSS للـ animations
const doctorAnimationStyle = document.createElement('style');
doctorAnimationStyle.textContent = `
  @keyframes slideIn {
    from { 
      transform: translateX(100px);
      opacity: 0;
    }
    to { 
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(doctorAnimationStyle);

console.log('🔄 تم تفعيل التحديث التلقائي لصفحة الجلسة');


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
  

  console.log('✅ تم تحميل صفحة الجلسة بنجاح');
  console.log('🩺 الحجز:', bookingId);
});