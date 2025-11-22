// public/services/services.js
document.addEventListener('DOMContentLoaded', () => {
  // --- تحقق من تسجيل الدخول ---
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

  // --- عناصر DOM ---
  // الأقسام
  const categoryForm = document.getElementById('categoryForm');
  const categoryName = document.getElementById('categoryName');
  const categoryMsg = document.getElementById('categoryMsg');
  const categoriesGrid = document.getElementById('categoriesGrid');

  // الخدمات
  const serviceForm = document.getElementById('serviceForm');
  const serviceCategory = document.getElementById('serviceCategory');
  const serviceName = document.getElementById('serviceName');
  const serviceDuration = document.getElementById('serviceDuration');
  const servicePrice = document.getElementById('servicePrice');
  const serviceMsg = document.getElementById('serviceMsg');

  // قائمة الخدمات
  const servicesTableBody = document.querySelector('#servicesTable tbody');
  const servicesMsg = document.getElementById('servicesMsg');
  const filterCategory = document.getElementById('filterCategory');

  // Modals
  const editServiceModal = document.getElementById('editServiceModal');
  const closeEditService = document.getElementById('closeEditService');
  const cancelEditService = document.getElementById('cancelEditService');
  const editServiceForm = document.getElementById('editServiceForm');
  const editServiceId = document.getElementById('editServiceId');
  const editServiceName = document.getElementById('editServiceName');
  const editServiceDuration = document.getElementById('editServiceDuration');
  const editServicePrice = document.getElementById('editServicePrice');
  const editServiceMsg = document.getElementById('editServiceMsg');

  const deleteServiceModal = document.getElementById('deleteServiceModal');
  const closeDeleteService = document.getElementById('closeDeleteService');
  const cancelDeleteService = document.getElementById('cancelDeleteService');
  const confirmDeleteService = document.getElementById('confirmDeleteService');
  const deleteServiceName = document.getElementById('deleteServiceName');
  const deleteServiceMsg = document.getElementById('deleteServiceMsg');

  const deleteCategoryModal = document.getElementById('deleteCategoryModal');
  const closeDeleteCategory = document.getElementById('closeDeleteCategory');
  const cancelDeleteCategory = document.getElementById('cancelDeleteCategory');
  const confirmDeleteCategory = document.getElementById('confirmDeleteCategory');
  const deleteCategoryName = document.getElementById('deleteCategoryName');
  const deleteCategoryMsg = document.getElementById('deleteCategoryMsg');

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // متغيرات للحذف
  let serviceToDelete = null;
  let categoryToDelete = null;

  // بيانات مؤقتة
  let allCategories = [];
  let allServices = [];

  // --- API Helper ---
  async function apiFetch(url, opts = {}) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('jc_user');
        window.location.href = '/login/login.html';
        return null;
      }
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error('API Error:', err);
      return { ok: false, error: err };
    }
  }

  // ========================================
  // إدارة الأقسام
  // ========================================

  // جلب الأقسام
  async function loadCategories() {
    const r = await apiFetch('/api/categories', { method: 'GET' });

    if (!r || !r.ok) {
      categoriesGrid.innerHTML = `
        <div class="loading-box">
          <p style="color: #f44336;">❌ فشل تحميل الأقسام</p>
        </div>
      `;
      return;
    }

    allCategories = r.data || [];
    renderCategories();
    updateCategorySelects();
  }

  function renderCategories() {
    categoriesGrid.innerHTML = '';

    if (allCategories.length === 0) {
      categoriesGrid.innerHTML = `
        <div class="loading-box">
          <p style="color: #757575;">📂 لا توجد أقسام حتى الآن</p>
          <small>قومي بإضافة قسم جديد من النموذج أعلاه</small>
        </div>
      `;
      return;
    }

    allCategories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';
      card.innerHTML = `
        <div class="category-card-header">
          <span class="category-icon">📂</span>
          <h4 class="category-name">${escapeHtml(cat.name)}</h4>
        </div>
        <div class="category-actions">
          <button class="icon-btn delete" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}" title="حذف القسم">
            🗑️
          </button>
        </div>
      `;
      categoriesGrid.appendChild(card);
    });

    // إضافة مستمعات لأزرار الحذف
    categoriesGrid.querySelectorAll('.icon-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        openDeleteCategoryModal(id, name);
      });
    });
  }

  // تحديث قوائم الأقسام المنسدلة
  function updateCategorySelects() {
    // في نموذج الخدمة
    serviceCategory.innerHTML = '<option value="">-- اختاري القسم --</option>';
    allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      serviceCategory.appendChild(opt);
    });

    // في الفلتر
    filterCategory.innerHTML = '<option value="">الكل</option>';
    allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      filterCategory.appendChild(opt);
    });
  }

  // إضافة قسم جديد
  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    categoryMsg.textContent = '';

    const name = categoryName.value.trim();
    if (!name) {
      categoryMsg.style.color = '#f44336';
      categoryMsg.textContent = '❌ الرجاء إدخال اسم القسم';
      return;
    }

    categoryMsg.style.color = '#2196f3';
    categoryMsg.textContent = '⏳ جارٍ الحفظ...';

    const r = await apiFetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!r || !r.ok) {
      categoryMsg.style.color = '#f44336';
      const msg = r && r.data && r.data.message ? r.data.message : 'فشل الاتصال بالسيرفر';
      categoryMsg.textContent = '❌ ' + msg;
      return;
    }

    categoryMsg.style.color = '#4caf50';
    categoryMsg.textContent = '✅ تم إضافة القسم بنجاح!';
    categoryForm.reset();

    await loadCategories();

    setTimeout(() => {
      categoryMsg.textContent = '';
    }, 3000);
  });

  // حذف قسم
  function openDeleteCategoryModal(id, name) {
    categoryToDelete = id;
    deleteCategoryName.textContent = name;
    deleteCategoryMsg.textContent = '';
    deleteCategoryModal.setAttribute('aria-hidden', 'false');
  }

  closeDeleteCategory && closeDeleteCategory.addEventListener('click', () => {
    deleteCategoryModal.setAttribute('aria-hidden', 'true');
    categoryToDelete = null;
  });

  cancelDeleteCategory && cancelDeleteCategory.addEventListener('click', () => {
    deleteCategoryModal.setAttribute('aria-hidden', 'true');
    categoryToDelete = null;
  });

  confirmDeleteCategory && confirmDeleteCategory.addEventListener('click', async () => {
    if (!categoryToDelete) return;

    deleteCategoryMsg.style.color = '#2196f3';
    deleteCategoryMsg.textContent = '⏳ جارٍ الحذف...';

    const r = await apiFetch(`/api/categories/${encodeURIComponent(categoryToDelete)}`, {
      method: 'DELETE'
    });

    if (!r || !r.ok) {
      deleteCategoryMsg.style.color = '#f44336';
      const msg = r && r.data && r.data.message ? r.data.message : 'فشل الحذف';
      deleteCategoryMsg.textContent = '❌ ' + msg;
      return;
    }

    deleteCategoryMsg.style.color = '#4caf50';
    deleteCategoryMsg.textContent = '✅ تم حذف القسم بنجاح!';

    setTimeout(() => {
      deleteCategoryModal.setAttribute('aria-hidden', 'true');
      categoryToDelete = null;
    }, 1000);

    await loadCategories();
    await loadServices();
  });

  // ========================================
  // إدارة الخدمات
  // ========================================

  // جلب الخدمات
  async function loadServices() {
    servicesTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-cell">
          <div class="loader"></div>
          <span>جارٍ تحميل الخدمات...</span>
        </td>
      </tr>
    `;

    const r = await apiFetch('/api/services', { method: 'GET' });

    if (!r || !r.ok) {
      servicesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:#f44336;padding:32px">
            ❌ فشل تحميل الخدمات
          </td>
        </tr>
      `;
      return;
    }

    allServices = r.data || [];
    renderServices();
  }

  function renderServices(filteredServices = null) {
    const servicesToShow = filteredServices !== null ? filteredServices : allServices;
    servicesTableBody.innerHTML = '';

    if (servicesToShow.length === 0) {
      servicesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:#757575;padding:48px">
            <div style="font-size:48px;margin-bottom:16px">💆‍♀️</div>
            <div style="font-size:16px">لا توجد خدمات حتى الآن</div>
            <div style="font-size:14px;margin-top:8px;color:#9e9e9e">قومي بإضافة خدمة جديدة من النموذج أعلاه</div>
          </td>
        </tr>
      `;
      return;
    }

    servicesToShow.forEach(srv => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${srv.id}</strong></td>
        <td><span class="category-badge">${escapeHtml(srv.category_name)}</span></td>
        <td>${escapeHtml(srv.name)}</td>
        <td><span class="duration-badge">⏱️ ${srv.duration} دقيقة</span></td>
        <td><span class="price-badge">💰 ${parseFloat(srv.price).toFixed(2)} ج.م</span></td>
        <td>
          <button class="action-btn edit" data-id="${srv.id}" 
                  data-name="${escapeHtml(srv.name)}"
                  data-duration="${srv.duration}"
                  data-price="${srv.price}">
            ✏️ تعديل
          </button>
          <button class="action-btn delete" data-id="${srv.id}" data-name="${escapeHtml(srv.name)}">
            🗑️ حذف
          </button>
        </td>
      `;
      servicesTableBody.appendChild(tr);
    });

    // مستمعات التعديل
    servicesTableBody.querySelectorAll('.action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditServiceModal(
          btn.dataset.id,
          btn.dataset.name,
          btn.dataset.duration,
          btn.dataset.price
        );
      });
    });

    // مستمعات الحذف
    servicesTableBody.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        openDeleteServiceModal(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  // فلترة الخدمات
  filterCategory.addEventListener('change', () => {
    const selectedCat = filterCategory.value;
    if (!selectedCat) {
      renderServices();
      return;
    }

    const filtered = allServices.filter(s => s.category_id == selectedCat);
    renderServices(filtered);
  });

  // إضافة خدمة جديدة
  serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    serviceMsg.textContent = '';

    const category_id = serviceCategory.value;
    const name = serviceName.value.trim();
    const duration = serviceDuration.value;
    const price = servicePrice.value;

    if (!category_id || !name || !duration || !price) {
      serviceMsg.style.color = '#f44336';
      serviceMsg.textContent = '❌ الرجاء ملء جميع الحقول';
      return;
    }

    if (isNaN(duration) || duration <= 0) {
      serviceMsg.style.color = '#f44336';
      serviceMsg.textContent = '❌ المدة يجب أن تكون رقم أكبر من صفر';
      return;
    }

    if (isNaN(price) || price < 0) {
      serviceMsg.style.color = '#f44336';
      serviceMsg.textContent = '❌ السعر يجب أن يكون رقم صحيح';
      return;
    }

    serviceMsg.style.color = '#2196f3';
    serviceMsg.textContent = '⏳ جارٍ الحفظ...';

    const r = await apiFetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id, name, duration, price })
    });

    if (!r || !r.ok) {
      serviceMsg.style.color = '#f44336';
      const msg = r && r.data && r.data.message ? r.data.message : 'فشل الاتصال بالسيرفر';
      serviceMsg.textContent = '❌ ' + msg;
      return;
    }

    serviceMsg.style.color = '#4caf50';
    serviceMsg.textContent = '✅ تم إضافة الخدمة بنجاح!';
    serviceForm.reset();

    await loadServices();

    setTimeout(() => {
      serviceMsg.textContent = '';
    }, 3000);
  });

  // تعديل خدمة
  function openEditServiceModal(id, name, duration, price) {
    editServiceId.value = id;
    editServiceName.value = name;
    editServiceDuration.value = duration;
    editServicePrice.value = price;
    editServiceMsg.textContent = '';
    editServiceModal.setAttribute('aria-hidden', 'false');
  }

  closeEditService && closeEditService.addEventListener('click', () => {
    editServiceModal.setAttribute('aria-hidden', 'true');
  });

  cancelEditService && cancelEditService.addEventListener('click', () => {
    editServiceModal.setAttribute('aria-hidden', 'true');
  });

  editServiceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editServiceMsg.textContent = '';

    const id = editServiceId.value;
    const name = editServiceName.value.trim();
    const duration = editServiceDuration.value;
    const price = editServicePrice.value;

    if (!name || !duration || !price) {
      editServiceMsg.style.color = '#f44336';
      editServiceMsg.textContent = '❌ الرجاء ملء جميع الحقول';
      return;
    }

    editServiceMsg.style.color = '#2196f3';
    editServiceMsg.textContent = '⏳ جارٍ الحفظ...';

    const r = await apiFetch(`/api/services/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, duration, price })
    });

    if (!r || !r.ok) {
      editServiceMsg.style.color = '#f44336';
      const msg = r && r.data && r.data.message ? r.data.message : 'فشل الحفظ';
      editServiceMsg.textContent = '❌ ' + msg;
      return;
    }

    editServiceMsg.style.color = '#4caf50';
    editServiceMsg.textContent = '✅ تم تحديث الخدمة بنجاح!';

    setTimeout(() => {
      editServiceModal.setAttribute('aria-hidden', 'true');
    }, 1000);

    await loadServices();
  });

  // حذف خدمة
  function openDeleteServiceModal(id, name) {
    serviceToDelete = id;
    deleteServiceName.textContent = name;
    deleteServiceMsg.textContent = '';
    deleteServiceModal.setAttribute('aria-hidden', 'false');
  }

  closeDeleteService && closeDeleteService.addEventListener('click', () => {
    deleteServiceModal.setAttribute('aria-hidden', 'true');
    serviceToDelete = null;
  });

  cancelDeleteService && cancelDeleteService.addEventListener('click', () => {
    deleteServiceModal.setAttribute('aria-hidden', 'true');
    serviceToDelete = null;
  });

  confirmDeleteService && confirmDeleteService.addEventListener('click', async () => {
    if (!serviceToDelete) return;

    deleteServiceMsg.style.color = '#2196f3';
    deleteServiceMsg.textContent = '⏳ جارٍ الحذف...';

    const r = await apiFetch(`/api/services/${encodeURIComponent(serviceToDelete)}`, {
      method: 'DELETE'
    });

    if (!r || !r.ok) {
      deleteServiceMsg.style.color = '#f44336';
      const msg = r && r.data && r.data.message ? r.data.message : 'فشل الحذف';
      deleteServiceMsg.textContent = '❌ ' + msg;
      return;
    }

    deleteServiceMsg.style.color = '#4caf50';
    deleteServiceMsg.textContent = '✅ تم حذف الخدمة بنجاح!';

    setTimeout(() => {
      deleteServiceModal.setAttribute('aria-hidden', 'true');
      serviceToDelete = null;
    }, 1000);

    await loadServices();
  });

  // إغلاق Modals عند الضغط على الخلفية
  [editServiceModal, deleteServiceModal, deleteCategoryModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.setAttribute('aria-hidden', 'true');
        }
      });
    }
  });

  // --- مساعدة: منع XSS ---
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // --- تحميل البيانات عند البداية ---
  loadCategories();
  loadServices();

  console.log('✅ تم تحميل صفحة الخدمات بنجاح');
});