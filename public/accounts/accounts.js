// public/accounts/accounts.js
document.addEventListener('DOMContentLoaded', () => {
  // --- تحقق: يجب أن يكون المستخدم مسجّل وادمن ---
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }
  
  const currentUser = JSON.parse(raw);
  if (!currentUser || currentUser.role !== 'ادمن') {
    alert('هذه الصفحة متاحة لمستخدمين من نوع "ادمن" فقط.');
    window.location.href = '/Main/main.html';
    return;
  }

  // عناصر DOM
  const createForm = document.getElementById('createForm');
  const createMsg = document.getElementById('createMsg');
  const listMsg = document.getElementById('listMsg');
  const accountsTableBody = document.querySelector('#accountsTable tbody');

  // Modal التعديل
  const editModal = document.getElementById('editModal');
  const closeEdit = document.getElementById('closeEdit');
  const editForm = document.getElementById('editForm');
  const editId = document.getElementById('editId');
  const editName = document.getElementById('editName');
  const editPassword = document.getElementById('editPassword');
  const editMsg = document.getElementById('editMsg');
  const cancelEdit = document.getElementById('cancelEdit');

  // Modal الحذف
  const deleteModal = document.getElementById('deleteModal');
  const closeDelete = document.getElementById('closeDelete');
  const deleteAccountName = document.getElementById('deleteAccountName');
  const confirmDelete = document.getElementById('confirmDelete');
  const cancelDelete = document.getElementById('cancelDelete');
  const deleteMsg = document.getElementById('deleteMsg');

  // زر تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // متغير لحفظ الـ ID المراد حذفه
  let accountToDelete = null;

  // --- API helper ---
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

  // --- جلب الحسابات من السيرفر ---
  async function loadAccounts() {
    listMsg.textContent = '';
    accountsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading-cell">
          <div class="loader"></div>
          <span>جارٍ تحميل البيانات...</span>
        </td>
      </tr>
    `;

    const r = await apiFetch('/api/accounts', { method: 'GET' });

    if (!r || !r.ok) {
      accountsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#f44336;padding:32px">
            ❌ فشل تحميل البيانات من السيرفر
          </td>
        </tr>
      `;
      listMsg.style.color = '#f44336';
      listMsg.textContent = 'حدث خطأ أثناء جلب الحسابات. الرجاء التحقق من اتصال السيرفر.';
      return;
    }

    renderAccounts(r.data || []);
  }

  function renderAccounts(arr) {
    accountsTableBody.innerHTML = '';
    
    if (!arr || arr.length === 0) {
      accountsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#757575;padding:48px">
            <div style="font-size:48px;margin-bottom:16px">📋</div>
            <div style="font-size:16px">لا توجد حسابات حتى الآن</div>
            <div style="font-size:14px;margin-top:8px;color:#9e9e9e">قومي بإنشاء حساب جديد من القسم الجانبي</div>
          </td>
        </tr>
      `;
      return;
    }

    arr.forEach(acc => {
      const tr = document.createElement('tr');
      
      // اختيار الأيقونة المناسبة لكل وظيفة
      let roleIcon = '👤';
      switch(acc.role) {
        case 'ادمن': roleIcon = '👑'; break;
        case 'محاسب': roleIcon = '💰'; break;
        case 'استقبال': roleIcon = '💁‍♀️'; break;
        case 'دكتور': roleIcon = '👩‍⚕️'; break;
        case 'دكتور بشرة': roleIcon = '✨'; break;
        case 'دكتور لايزر': roleIcon = '💫'; break;
      }
      
      tr.innerHTML = `
        <td><strong>${acc.id ?? '-'}</strong></td>
        <td>${escapeHtml(acc.name)}</td>
        <td><span style="direction:ltr;display:inline-block">${escapeHtml(acc.phone)}</span></td>
        <td>${roleIcon} ${escapeHtml(acc.role)}</td>
        <td>
          <button class="action-btn edit" data-id="${acc.id}" data-name="${escapeHtml(acc.name)}">
            ✏️ تعديل
          </button>
          <button class="action-btn delete" data-id="${acc.id}" data-name="${escapeHtml(acc.name)}">
            🗑️ حذف
          </button>
        </td>
      `;
      accountsTableBody.appendChild(tr);
    });

    // إضافة مستمع لأزرار التعديل
    accountsTableBody.querySelectorAll('.action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        openEditModal(id, name);
      });
    });

    // إضافة مستمع لأزرار الحذف
    accountsTableBody.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        openDeleteModal(id, name);
      });
    });
  }

  // --- انشاء حساب جديد ---
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    createMsg.textContent = '';
    
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    // تحقق بسيط
    if (!name || !phone || !password || !role) {
      createMsg.style.color = '#f44336';
      createMsg.textContent = '❌ الرجاء ملء جميع الحقول.';
      return;
    }
    
    if (!/^0\d{9,10}$/.test(phone)) {
      createMsg.style.color = '#f44336';
      createMsg.textContent = '❌ الرجاء إدخال رقم هاتف صحيح (يبدأ بصفر ويتكون من 10-11 رقم).';
      return;
    }
    
    if (password.length < 4) {
      createMsg.style.color = '#f44336';
      createMsg.textContent = '❌ كلمة المرور قصيرة جداً (يجب أن تكون 4 أحرف على الأقل).';
      return;
    }

    createMsg.style.color = '#2196f3';
    createMsg.textContent = '⏳ جارٍ إنشاء الحساب...';

    const payload = { name, phone, password, role };

    const r = await apiFetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r) {
      createMsg.style.color = '#f44336';
      createMsg.textContent = '❌ فشل الاتصال بالسيرفر.';
      return;
    }

    if (r.ok) {
      createMsg.style.color = '#4caf50';
      createMsg.textContent = '✅ تم إنشاء الحساب بنجاح!';
      createForm.reset();
      
      // إعادة تحميل القائمة
      await loadAccounts();
      
      // مسح الرسالة بعد 3 ثواني
      setTimeout(() => {
        createMsg.textContent = '';
      }, 3000);
    } else {
      createMsg.style.color = '#f44336';
      const message = (r.data && r.data.message) ? r.data.message : `خطأ (${r.status})`;
      createMsg.textContent = '❌ فشل إنشاء الحساب: ' + message;
    }
  });

  // --- فتح نافذة التعديل ---
  function openEditModal(id, name) {
    editId.value = id;
    editName.value = name;
    editPassword.value = '';
    editMsg.textContent = '';
    editModal.setAttribute('aria-hidden', 'false');
  }

  closeEdit && closeEdit.addEventListener('click', () => {
    editModal.setAttribute('aria-hidden', 'true');
  });
  
  cancelEdit && cancelEdit.addEventListener('click', () => {
    editModal.setAttribute('aria-hidden', 'true');
  });

  // حفظ التعديلات
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editMsg.textContent = '';
    
    const id = editId.value;
    const name = editName.value.trim();
    const password = editPassword.value;

    if (!name) {
      editMsg.style.color = '#f44336';
      editMsg.textContent = '❌ الرجاء إدخال اسم صالح.';
      return;
    }

    if (password && password.length < 4) {
      editMsg.style.color = '#f44336';
      editMsg.textContent = '❌ كلمة المرور قصيرة جداً (يجب أن تكون 4 أحرف على الأقل).';
      return;
    }

    editMsg.style.color = '#2196f3';
    editMsg.textContent = '⏳ جارٍ حفظ التعديلات...';

    const body = { name };
    if (password && password.length >= 4) {
      body.password = password;
    }

    const r = await apiFetch(`/api/accounts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r) {
      editMsg.style.color = '#f44336';
      editMsg.textContent = '❌ فشل الاتصال بالسيرفر.';
      return;
    }

    if (r.ok) {
      editMsg.style.color = '#4caf50';
      editMsg.textContent = '✅ تم حفظ التعديلات بنجاح!';
      
      setTimeout(() => {
        editModal.setAttribute('aria-hidden', 'true');
      }, 1000);
      
      await loadAccounts();
    } else {
      editMsg.style.color = '#f44336';
      const message = (r.data && r.data.message) ? r.data.message : `خطأ (${r.status})`;
      editMsg.textContent = '❌ فشل الحفظ: ' + message;
    }
  });

  // --- فتح نافذة تأكيد الحذف ---
  function openDeleteModal(id, name) {
    accountToDelete = id;
    deleteAccountName.textContent = name;
    deleteMsg.textContent = '';
    deleteModal.setAttribute('aria-hidden', 'false');
  }

  closeDelete && closeDelete.addEventListener('click', () => {
    deleteModal.setAttribute('aria-hidden', 'true');
    accountToDelete = null;
  });
  
  cancelDelete && cancelDelete.addEventListener('click', () => {
    deleteModal.setAttribute('aria-hidden', 'true');
    accountToDelete = null;
  });

  // تأكيد الحذف
  confirmDelete && confirmDelete.addEventListener('click', async () => {
    if (!accountToDelete) return;

    deleteMsg.style.color = '#2196f3';
    deleteMsg.textContent = '⏳ جارٍ حذف الحساب...';

    const r = await apiFetch(`/api/accounts/${encodeURIComponent(accountToDelete)}`, {
      method: 'DELETE'
    });

    if (!r) {
      deleteMsg.style.color = '#f44336';
      deleteMsg.textContent = '❌ فشل الاتصال بالسيرفر.';
      return;
    }

    if (r.ok) {
      deleteMsg.style.color = '#4caf50';
      deleteMsg.textContent = '✅ تم حذف الحساب بنجاح!';
      
      setTimeout(() => {
        deleteModal.setAttribute('aria-hidden', 'true');
        accountToDelete = null;
      }, 1000);
      
      await loadAccounts();
    } else {
      deleteMsg.style.color = '#f44336';
      const message = (r.data && r.data.message) ? r.data.message : `خطأ (${r.status})`;
      deleteMsg.textContent = '❌ فشل الحذف: ' + message;
    }
  });

  // إغلاق الـ Modal عند الضغط على الخلفية
  editModal && editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      editModal.setAttribute('aria-hidden', 'true');
    }
  });

  deleteModal && deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      deleteModal.setAttribute('aria-hidden', 'true');
      accountToDelete = null;
    }
  });

  // --- مساعدة: منع XSS (عرض آمن) ---
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // تحميل الحسابات عند البداية
  loadAccounts();
});