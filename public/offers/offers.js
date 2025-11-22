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

  // التحقق من صلاحية الأدمن فقط
  if (currentUser.role !== 'ادمن') {
    alert('⚠️ هذه الصفحة متاحة للأدمن فقط');
    window.location.href = '/Main/main.html';
    return;
  }

  // --- عناصر DOM ---
  const offerForm = document.getElementById('offerForm');
  const offerType = document.getElementById('offerType');
  const offerName = document.getElementById('offerName');
  const servicesCountRow = document.getElementById('servicesCountRow');
  const servicesCount = document.getElementById('servicesCount');
  const servicesCards = document.getElementById('servicesCards');
  const servicesCardsContainer = document.getElementById('servicesCardsContainer');
  const sessionsInfo = document.getElementById('sessionsInfo');
  const sessionsCount = document.getElementById('sessionsCount');
  const totalOriginalPrice = document.getElementById('totalOriginalPrice');
  const offerPrice = document.getElementById('offerPrice');
  const discountPercentage = document.getElementById('discountPercentage');
  const durationRow = document.getElementById('durationRow');
  const statusRow = document.getElementById('statusRow');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const offerStatus = document.getElementById('offerStatus');
  const offerDescription = document.getElementById('offerDescription');
  const offerMsg = document.getElementById('offerMsg');
  const resetForm = document.getElementById('resetForm');
  const offersGrid = document.getElementById('offersGrid');
  const filterStatus = document.getElementById('filterStatus');
  const filterType = document.getElementById('filterType');

  // Modals
  const editOfferModal = document.getElementById('editOfferModal');
  const closeEditOffer = document.getElementById('closeEditOffer');
  const cancelEditOffer = document.getElementById('cancelEditOffer');
  const editOfferForm = document.getElementById('editOfferForm');
  const deleteOfferModal = document.getElementById('deleteOfferModal');
  const closeDeleteOffer = document.getElementById('closeDeleteOffer');
  const cancelDeleteOffer = document.getElementById('cancelDeleteOffer');
  const confirmDeleteOffer = document.getElementById('confirmDeleteOffer');

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // متغيرات
  let allCategories = [];
  let allServices = [];
  let allOffers = [];
  let offerToDelete = null;

  // --- جلب الأقسام والخدمات ---
  async function loadData() {
    try {
      const [catRes, srvRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/services')
      ]);

      if (catRes.ok) {
        allCategories = await catRes.json();
      }

      if (srvRes.ok) {
        allServices = await srvRes.json();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  // --- عرض نموذج بناءً على نوع العرض ---
  offerType.addEventListener('change', () => {
    const type = offerType.value;
    
    if (!type) {
      servicesCountRow.style.display = 'none';
      servicesCards.style.display = 'none';
      sessionsInfo.style.display = 'none';
      durationRow.style.display = 'none';
      statusRow.style.display = 'none';
      return;
    }

    servicesCountRow.style.display = 'block';
    servicesCards.style.display = 'block';
    durationRow.style.display = 'block';
    statusRow.style.display = 'block';

    if (type === 'sessions') {
      sessionsInfo.style.display = 'block';
    } else {
      sessionsInfo.style.display = 'none';
    }

    renderServiceCards();
  });

  // --- عرض عدد كروت الخدمات ---
  servicesCount.addEventListener('change', renderServiceCards);

  function renderServiceCards() {
    const type = offerType.value;
    if (!type) return;

    const count = parseInt(servicesCount.value);
    servicesCardsContainer.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'service-card';
      card.innerHTML = `
        <div class="service-card-header">
          <h4>خدمة ${i + 1}</h4>
          ${i > 0 ? `<button type="button" onclick="removeServiceCard(${i})">حذف</button>` : ''}
        </div>
        <div class="service-card-body">
          <div class="form-group">
            <label>القسم *</label>
            <select class="service-category" data-index="${i}" required>
              <option value="">-- اختاري القسم --</option>
              ${allCategories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>الخدمة *</label>
            <select class="service-select" data-index="${i}" required disabled>
              <option value="">-- اختاري الخدمة --</option>
            </select>
          </div>
          ${type === 'price' ? `
            <div class="form-group">
              <label>السعر في العرض *</label>
              <input type="number" class="service-price" data-index="${i}" step="0.01" min="0" placeholder="السعر" required />
            </div>
          ` : ''}
        </div>
      `;
      servicesCardsContainer.appendChild(card);
    }

    // إضافة مستمعات لاختيار القسم
    document.querySelectorAll('.service-category').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = e.target.dataset.index;
        const categoryId = e.target.value;
        const serviceSelect = document.querySelector(`.service-select[data-index="${index}"]`);
        
        serviceSelect.innerHTML = '<option value="">-- اختاري الخدمة --</option>';
        
        if (categoryId) {
          const filteredServices = allServices.filter(s => s.category_id == categoryId);
          filteredServices.forEach(srv => {
            serviceSelect.innerHTML += `<option value="${srv.id}" data-price="${srv.price}">${srv.name}</option>`;
          });
          serviceSelect.disabled = false;
        } else {
          serviceSelect.disabled = true;
        }
      });
    });

    // حساب السعر الأصلي عند التغيير
    if (type === 'sessions') {
      document.querySelectorAll('.service-select').forEach(select => {
        select.addEventListener('change', calculateOriginalPrice);
      });
    }
  }

  // --- حساب السعر الأصلي ---
  function calculateOriginalPrice() {
    const type = offerType.value;
    if (type !== 'sessions') return;

    const sessions = parseInt(sessionsCount.value) || 0;
    if (sessions <= 0) {
      totalOriginalPrice.value = '';
      return;
    }

    let total = 0;
    const serviceSelects = document.querySelectorAll('.service-select');
    
    serviceSelects.forEach(select => {
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption && selectedOption.value) {
        const price = parseFloat(selectedOption.dataset.price) || 0;
        total += price * sessions;
      }
    });

    totalOriginalPrice.value = total.toFixed(2) + ' ج';
    calculateDiscount();
  }

  // --- حساب نسبة الخصم ---
  function calculateDiscount() {
    const originalPrice = parseFloat(totalOriginalPrice.value) || 0;
    const newPrice = parseFloat(offerPrice.value) || 0;

    if (originalPrice > 0 && newPrice > 0) {
      const discount = ((originalPrice - newPrice) / originalPrice) * 100;
      discountPercentage.value = discount.toFixed(1) + '%';
    } else {
      discountPercentage.value = '';
    }
  }

  sessionsCount.addEventListener('input', calculateOriginalPrice);
  offerPrice.addEventListener('input', calculateDiscount);

  // --- إرسال النموذج ---
  offerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    offerMsg.style.display = 'none';

    const type = offerType.value;
    const name = offerName.value.trim();
    const start = startDate.value;
    const end = endDate.value;
    const status = offerStatus.value;
    const description = offerDescription.value.trim();

    if (!type || !name || !start || !end) {
      showMessage('❌ الرجاء ملء جميع الحقول المطلوبة', 'error');
      return;
    }

    // جمع بيانات الخدمات
    const services = [];
    const serviceSelects = document.querySelectorAll('.service-select');
    
    for (let i = 0; i < serviceSelects.length; i++) {
      const select = serviceSelects[i];
      const serviceId = select.value;
      
      if (!serviceId) {
        showMessage(`❌ الرجاء اختيار الخدمة ${i + 1}`, 'error');
        return;
      }

      const serviceData = {
        service_id: serviceId,
        service_name: select.options[select.selectedIndex].text
      };

      if (type === 'price') {
        const priceInput = document.querySelector(`.service-price[data-index="${i}"]`);
        const price = parseFloat(priceInput.value);
        
        if (!price || price <= 0) {
          showMessage(`❌ الرجاء إدخال سعر صحيح للخدمة ${i + 1}`, 'error');
          return;
        }
        
        serviceData.offer_price = price;
      }

      services.push(serviceData);
    }

    const offerData = {
      type,
      name,
      services,
      start_date: start,
      end_date: end,
      status,
      description,
      created_by: currentUser.name
    };

    if (type === 'sessions') {
      const sessions = parseInt(sessionsCount.value);
      const price = parseFloat(offerPrice.value);

      if (!sessions || sessions <= 0) {
        showMessage('❌ الرجاء إدخال عدد الجلسات', 'error');
        return;
      }

      if (!price || price <= 0) {
        showMessage('❌ الرجاء إدخال سعر العرض', 'error');
        return;
      }

      offerData.sessions_count = sessions;
      offerData.offer_price = price;
      offerData.original_price = parseFloat(totalOriginalPrice.value) || 0;
    }

    showMessage('⏳ جارٍ الحفظ...', 'info');

    try {
      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offerData)
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('✅ ' + result.message, 'success');
        offerForm.reset();
        servicesCountRow.style.display = 'none';
        servicesCards.style.display = 'none';
        sessionsInfo.style.display = 'none';
        durationRow.style.display = 'none';
        statusRow.style.display = 'none';
        await loadOffers();
      } else {
        showMessage('❌ ' + (result.message || 'حدث خطأ'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    }
  });

  // --- إعادة تعيين النموذج ---
  resetForm.addEventListener('click', () => {
    offerForm.reset();
    servicesCountRow.style.display = 'none';
    servicesCards.style.display = 'none';
    sessionsInfo.style.display = 'none';
    durationRow.style.display = 'none';
    statusRow.style.display = 'none';
    offerMsg.style.display = 'none';
  });

  // --- عرض الرسائل ---
  function showMessage(text, type) {
    offerMsg.textContent = text;
    offerMsg.className = `message ${type}`;
    offerMsg.style.display = 'block';
  }

  // --- جلب العروض ---
  async function loadOffers() {
    offersGrid.innerHTML = `
      <div class="loading-box">
        <div class="loader"></div>
        <p>جارٍ تحميل العروض...</p>
      </div>
    `;

    try {
      const response = await fetch('/api/offers');
      
      if (response.ok) {
        allOffers = await response.json();
        renderOffers();
      } else {
        offersGrid.innerHTML = `
          <div class="loading-box">
            <p style="color: var(--error);">❌ فشل تحميل العروض</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error:', error);
      offersGrid.innerHTML = `
        <div class="loading-box">
          <p style="color: var(--error);">❌ حدث خطأ في تحميل العروض</p>
        </div>
      `;
    }
  }

  // --- عرض العروض ---
  function renderOffers(filteredOffers = null) {
    const offersToShow = filteredOffers !== null ? filteredOffers : allOffers;
    offersGrid.innerHTML = '';

    if (offersToShow.length === 0) {
      offersGrid.innerHTML = `
        <div class="loading-box">
          <div style="font-size:64px;margin-bottom:16px">🏷️</div>
          <p>لا توجد عروض حتى الآن</p>
          <small style="color: var(--text-muted);">قومي بإضافة عرض جديد من النموذج أعلاه</small>
        </div>
      `;
      return;
    }

    offersToShow.forEach(offer => {
      const card = createOfferCard(offer);
      offersGrid.appendChild(card);
    });
  }

  // --- إنشاء كرت عرض ---
  function createOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'offer-card';

    const services = JSON.parse(offer.services || '[]');
    const isExpired = new Date(offer.end_date) < new Date();
    const status = isExpired ? 'expired' : offer.status;
    
    let statusText = '';
    switch(status) {
      case 'active': statusText = 'نشط'; break;
      case 'inactive': statusText = 'غير نشط'; break;
      case 'expired': statusText = 'منتهي'; break;
    }

    const typeText = offer.type === 'sessions' ? 'عرض جلسات' : 'عرض سعر';

    let priceInfo = '';
    if (offer.type === 'sessions') {
      const discount = offer.original_price > 0 
        ? (((offer.original_price - offer.offer_price) / offer.original_price) * 100).toFixed(1)
        : 0;
      
      priceInfo = `
        <div class="offer-price-info">
          <div class="original-price">السعر الأصلي: ${offer.original_price?.toFixed(2) || 0} ج</div>
          <div class="offer-price">${offer.offer_price?.toFixed(2) || 0} ج</div>
          <div class="discount">خصم ${discount}%</div>
        </div>
      `;
    } else {
      priceInfo = `
        <div class="offer-price-info">
          <div class="offer-price">${offer.offer_price?.toFixed(2) || 0} ج</div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="offer-card-header">
        <div class="offer-card-title">
          <h4>${escapeHtml(offer.name)}</h4>
          <span class="offer-type-badge">${typeText}</span>
        </div>
        <span class="status-badge ${status}">${statusText}</span>
      </div>

      <div class="offer-card-body">
        ${offer.type === 'sessions' ? `
          <div class="offer-detail">
            <span>🎫</span>
            <strong>عدد الجلسات:</strong> ${offer.sessions_count} جلسة لكل خدمة
          </div>
        ` : ''}
        
        <div class="offer-detail">
          <span>📅</span>
          <strong>من:</strong> ${new Date(offer.start_date).toLocaleDateString('ar-EG')}
        </div>
        
        <div class="offer-detail">
          <span>📅</span>
          <strong>إلى:</strong> ${new Date(offer.end_date).toLocaleDateString('ar-EG')}
        </div>

        ${offer.description ? `
          <div class="offer-detail">
            <span>📝</span>
            ${escapeHtml(offer.description)}
          </div>
        ` : ''}

        <div class="offer-services-list">
          <h5>الخدمات المضمنة (${services.length}):</h5>
          <ul>
            ${services.map(s => `
              <li>
                • ${escapeHtml(s.service_name)}
                ${offer.type === 'price' && s.offer_price ? ` - ${s.offer_price.toFixed(2)} ج` : ''}
              </li>
            `).join('')}
          </ul>
        </div>

        ${priceInfo}
      </div>

      <div class="offer-card-actions">
        <button class="action-btn edit" data-id="${offer.id}">
          <span>✏️</span>
          تعديل
        </button>
        <button class="action-btn delete" data-id="${offer.id}" data-name="${escapeHtml(offer.name)}">
          <span>🗑️</span>
          حذف
        </button>
      </div>
    `;

    // مستمعات الأزرار
    card.querySelector('.action-btn.edit').addEventListener('click', () => {
      openEditModal(offer);
    });

    card.querySelector('.action-btn.delete').addEventListener('click', (e) => {
      openDeleteModal(e.target.closest('button').dataset.id, e.target.closest('button').dataset.name);
    });

    return card;
  }

  // --- فلترة العروض ---
  filterStatus.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);

  function applyFilters() {
    const statusFilter = filterStatus.value;
    const typeFilter = filterType.value;

    let filtered = allOffers;

    if (statusFilter) {
      filtered = filtered.filter(offer => {
        const isExpired = new Date(offer.end_date) < new Date();
        const status = isExpired ? 'expired' : offer.status;
        return status === statusFilter;
      });
    }

    if (typeFilter) {
      filtered = filtered.filter(offer => offer.type === typeFilter);
    }

    renderOffers(filtered);
  }

  // --- فتح modal التعديل ---
  function openEditModal(offer) {
    document.getElementById('editOfferId').value = offer.id;
    document.getElementById('editOfferName').value = offer.name;
    document.getElementById('editOfferPrice').value = offer.offer_price;
    document.getElementById('editStartDate').value = offer.start_date.split('T')[0];
    document.getElementById('editEndDate').value = offer.end_date.split('T')[0];
    document.getElementById('editOfferStatus').value = offer.status;
    document.getElementById('editOfferDescription').value = offer.description || '';
    
    document.getElementById('editOfferMsg').style.display = 'none';
    editOfferModal.setAttribute('aria-hidden', 'false');
  }

  // --- تعديل العرض ---
  editOfferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('editOfferId').value;
    const data = {
      name: document.getElementById('editOfferName').value.trim(),
      offer_price: parseFloat(document.getElementById('editOfferPrice').value),
      start_date: document.getElementById('editStartDate').value,
      end_date: document.getElementById('editEndDate').value,
      status: document.getElementById('editOfferStatus').value,
      description: document.getElementById('editOfferDescription').value.trim()
    };

    try {
      const response = await fetch(`/api/offers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        const msg = document.getElementById('editOfferMsg');
        msg.textContent = '✅ ' + result.message;
        msg.className = 'message success';
        msg.style.display = 'block';

        setTimeout(() => {
          editOfferModal.setAttribute('aria-hidden', 'true');
          loadOffers();
        }, 1500);
      } else {
        const msg = document.getElementById('editOfferMsg');
        msg.textContent = '❌ ' + (result.message || 'حدث خطأ');
        msg.className = 'message error';
        msg.style.display = 'block';
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

  // --- فتح modal الحذف ---
  function openDeleteModal(id, name) {
    offerToDelete = id;
    document.getElementById('deleteOfferName').textContent = name;
    document.getElementById('deleteOfferMsg').style.display = 'none';
    deleteOfferModal.setAttribute('aria-hidden', 'false');
  }

  // --- حذف العرض ---
  confirmDeleteOffer.addEventListener('click', async () => {
    if (!offerToDelete) return;

    try {
      const response = await fetch(`/api/offers/${offerToDelete}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok) {
        const msg = document.getElementById('deleteOfferMsg');
        msg.textContent = '✅ ' + result.message;
        msg.className = 'message success';
        msg.style.display = 'block';

        setTimeout(() => {
          deleteOfferModal.setAttribute('aria-hidden', 'true');
          offerToDelete = null;
          loadOffers();
        }, 1500);
      } else {
        const msg = document.getElementById('deleteOfferMsg');
        msg.textContent = '❌ ' + (result.message || 'حدث خطأ');
        msg.className = 'message error';
        msg.style.display = 'block';
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

  // --- إغلاق Modals ---
  closeEditOffer.addEventListener('click', () => {
    editOfferModal.setAttribute('aria-hidden', 'true');
  });

  cancelEditOffer.addEventListener('click', () => {
    editOfferModal.setAttribute('aria-hidden', 'true');
  });

  closeDeleteOffer.addEventListener('click', () => {
    deleteOfferModal.setAttribute('aria-hidden', 'true');
    offerToDelete = null;
  });

  cancelDeleteOffer.addEventListener('click', () => {
    deleteOfferModal.setAttribute('aria-hidden', 'true');
    offerToDelete = null;
  });

  // --- منع XSS ---
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // --- تحميل البيانات ---
  await loadData();
  await loadOffers();

  console.log('✅ تم تحميل صفحة العروض بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
});