// public/bk/bk.js
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

  // عرض معلومات المستخدم
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');

  if (userName) userName.textContent = currentUser.name || 'المستخدمة';
  if (userRole) {
    userRole.textContent = currentUser.role || 'الدور';

    // تغيير لون البادج حسب الدور
    let badgeGradient = 'linear-gradient(135deg, #e91e63 0%, #ff4081 100%)';
    switch (currentUser.role) {
      case 'ادمن':
        badgeGradient = 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)';
        break;
      case 'محاسب':
        badgeGradient = 'linear-gradient(135deg, #d81b60 0%, #f06292 100%)';
        break;
      case 'استقبال':
        badgeGradient = 'linear-gradient(135deg, #ec407a 0%, #f48fb1 100%)';
        break;
      case 'دكتور':
      case 'دكتور بشرة':
      case 'دكتور لايزر':
        badgeGradient = 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)';
        break;
    }
    userRole.style.background = badgeGradient;
  }

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // العناصر
  const loadingSection = document.getElementById('loadingSection');
  const emptySection = document.getElementById('emptySection');
  const doctorsGrid = document.getElementById('doctorsGrid');

  // تأكد من وجود العناصر الضرورية
  if (!loadingSection || !emptySection || !doctorsGrid) {
    console.error('Essential DOM elements missing: loadingSection, emptySection or doctorsGrid');
    return;
  }

  // جلب الدكاترة من قاعدة البيانات
  async function loadDoctors() {
    try {
      loadingSection.style.display = 'flex';
      emptySection.style.display = 'none';
      doctorsGrid.style.display = 'none';

      const response = await fetch('/api/accounts');

      if (!response.ok) {
        throw new Error('فشل جلب البيانات (status: ' + response.status + ')');
      }

      const accounts = await response.json();

      // فلترة الحسابات للحصول على الدكاترة فقط
      const doctors = accounts.filter(acc =>
        acc.role === 'دكتور' ||
        acc.role === 'دكتور بشرة' ||
        acc.role === 'دكتور لايزر'
      );

      loadingSection.style.display = 'none';

      if (!doctors || doctors.length === 0) {
        emptySection.style.display = 'block';
        doctorsGrid.style.display = 'none';
        return;
      }

      // عرض الدكاترة
      displayDoctors(doctors);

    } catch (error) {
      console.error('Error loading doctors:', error);
      loadingSection.style.display = 'none';
      doctorsGrid.style.display = 'none';
      emptySection.style.display = 'block';
      emptySection.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <h3>حدث خطأ أثناء تحميل البيانات</h3>
        <p>الرجاء التحقق من الاتصال بالسيرفر</p>
        <button class="btn-primary" onclick="location.reload()">
          <span>🔄</span>
          إعادة المحاولة
        </button>
      `;
    }
  }

  // عرض الدكاترة
  function displayDoctors(doctors) {
    doctorsGrid.style.display = 'grid';
    doctorsGrid.innerHTML = '';

    doctors.forEach(doctor => {
      const card = createDoctorCard(doctor);
      doctorsGrid.appendChild(card);
    });
  }

  // إنشاء بطاقة دكتور
  function createDoctorCard(doctor) {
    const card = document.createElement('div');
    card.className = 'doctor-card';

    // تحديد الأيقونة والتصنيف
    let icon = '👩‍⚕️';
    let type = 'type-doctor';
    let specialty = 'طبيبة عامة';
    let bgGradient = 'linear-gradient(135deg, #8e24aa 0%, #ab47bc 100%)';

    switch (doctor.role) {
      case 'دكتور بشرة':
        icon = '✨';
        type = 'type-skin';
        specialty = 'أخصائية بشرة';
        bgGradient = 'linear-gradient(135deg, #ec407a 0%, #f48fb1 100%)';
        break;
      case 'دكتور لايزر':
        icon = '💫';
        type = 'type-laser';
        specialty = 'أخصائية ليزر';
        bgGradient = 'linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)';
        break;
    }

    card.innerHTML = `
      <div class="doctor-header">
        <div class="doctor-avatar ${type}" style="background: ${bgGradient}">
          ${icon}
        </div>
        <div class="doctor-info">
          <h3>${escapeHtml(doctor.name)}</h3>
          <span class="doctor-role">${specialty}</span>
        </div>
      </div>

      <div class="doctor-details">
        <div class="detail-item">
          <span>📱</span>
          <span style="direction: ltr; display: inline-block">${escapeHtml(doctor.phone)}</span>
        </div>
        <div class="detail-item">
          <span>💼</span>
          <span>${escapeHtml(doctor.role)}</span>
        </div>
        <div class="detail-item">
          <span>📅</span>
          <span>متاحة للحجز</span>
        </div>
      </div>

      <button class="book-btn" data-doctor-id="${doctor.id}">
        <span>📋</span>
        عرض جدول المواعيد
      </button>
    `;

    // أضف z-index للعناصر الداخلية للتأكد أنها فوق أي pseudo-element
    Array.from(card.children).forEach(child => {
      child.style.position = 'relative';
      child.style.zIndex = '1';
    });

    // إضافة حدث الحجز - تحقق من وجود الزر أولاً
    const bookBtn = card.querySelector('.book-btn');
    if (bookBtn) {
      bookBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🔘 تم الضغط على زر الحجز للدكتور:', doctor.name);
        handleBooking(doctor);
      });
    } else {
      console.warn('bookBtn not found for doctor id:', doctor.id, 'name:', doctor.name);
    }

    return card;
  }

  // معالجة الحجز
  async function handleBooking(doctor) {
    try {
      // حفظ بيانات الدكتور المختار
      sessionStorage.setItem('selected_doctor', JSON.stringify({
        id: doctor.id,
        name: doctor.name,
        phone: doctor.phone,
        role: doctor.role
      }));

      console.log('✅ تم اختيار الدكتور:', doctor.name);

      // محاولة التحقق من وجود الصفحة باستخدام GET (أكثر توافقاً من HEAD)
      try {
        const checkResponse = await fetch('/bk/schedule.html', { method: 'GET' });
        if (checkResponse.ok) {
          window.location.href = '/bk/schedule.html';
          return;
        } else {
          console.warn('schedule.html GET returned', checkResponse.status);
        }
      } catch (innerErr) {
        console.warn('GET check for schedule.html failed:', innerErr);
      }

      // fallback: انتقل مباشرة (إن كان الملف موجوداً فعلياً على السيرفر سيعمل)
      window.location.href = '/bk/schedule.html';

    } catch (error) {
      console.error('❌ خطأ في فتح جدول المواعيد:', error);

      alert(`⚠️ عذراً! صفحة جدول المواعيد غير متوفرة حالياً.\n\n` +
        `تفاصيل الدكتور المختار:\n` +
        `📝 الاسم: ${doctor.name}\n` +
        `💼 التخصص: ${doctor.role}\n` +
        `📱 الهاتف: ${doctor.phone}\n\n` +
        `الرجاء التأكد من:\n` +
        `1. وجود ملف schedule.html في مجلد bk\n` +
        `2. وجود ملف schedule.css في مجلد bk\n` +
        `3. وجود ملف schedule.js في مجلد bk\n\n` +
        `الخطأ: ${error.message}`);
    }
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

  // تحميل الدكاترة
  await loadDoctors();

  console.log('✅ تم تحميل صفحة الحجوزات');
  console.log('👤 المستخدم:', currentUser.name);
  console.log('👑 الدور:', currentUser.role);
});
