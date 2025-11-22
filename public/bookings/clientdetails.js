//clientdetails.js
// === دوال ربط العمليات بالشيفت ===

// دالة للحصول على الشيفت النشط
async function getCurrentShift(userId) {
  try {
    const response = await fetch(`/api/shifts/current/${userId}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Error getting current shift:', error);
    return null;
  }
}

// دالة مساعدة لإضافة عملية للشيفت (محدثة)
async function addShiftOperation(shiftId, operationData) {
  try {
    // إذا كانت العملية تاريخية، لا نضيفها للشيفت
    if (operationData.is_historical) {
      console.log('⚠️ العملية تاريخية - لم تضف للشيفت');
      return;
    }
    
    const cfg = { ...dbConfig, database: 'beyou' };
    let pool;
    
    try {
      pool = await sql.connect(cfg);
      
      const query = `
        INSERT INTO dbo.shift_operations 
        (shift_id, operation_type, client_name, client_phone, amount, payment_method, description, created_at)
        VALUES (@shift_id, @operation_type, @client_name, @client_phone, @amount, @payment_method, @description, GETDATE())
      `;
      
      await pool.request()
        .input('shift_id', sql.Int, shiftId)
        .input('operation_type', sql.NVarChar, operationData.operation_type)
        .input('client_name', sql.NVarChar, operationData.client_name)
        .input('client_phone', sql.NVarChar, operationData.client_phone)
        .input('amount', sql.Decimal(10, 2), operationData.amount)
        .input('payment_method', sql.NVarChar, operationData.payment_method)
        .input('description', sql.NVarChar, operationData.description)
        .query(query);
        
      console.log('✅ تم تسجيل العملية في الشيفت');
      
    } catch (error) {
      console.error('Error adding shift operation:', error.message);
    } finally {
      try { if (pool) await pool.close(); } catch(e) { }
    }
    
  } catch (error) {
    console.error('Error in addShiftOperation:', error);
  }
}

// === الكود الرئيسي ===

document.addEventListener('DOMContentLoaded', async () => {
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

  // --- الحصول على ID العميل من URL ---
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');

  if (!clientId) {
    alert('⚠️ لم يتم تحديد العميل');
    window.location.href = '/bookings/manageclients.html';
    return;
  }

  // --- العناصر ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const printModal = document.getElementById('printModal');
  const closePrintModalBtn = document.getElementById('closePrintModal');
  const cancelPrintBtn = document.getElementById('cancelPrint');
  const printBtn = document.getElementById('printBtn');
  
  // Modal شحن الرصيد
  const chargeModal = document.getElementById('chargeModal');
  const closeChargeBtn = document.getElementById('closeChargeModal');
  const cancelChargeBtn = document.getElementById('cancelCharge');
  const chargeForm = document.getElementById('chargeForm');
  
  // Modal تحويل الرصيد بين الفئات
  const transferModal = document.getElementById('transferModal');
  const closeTransferBtn = document.getElementById('closeTransferModal');
  const cancelTransferBtn = document.getElementById('cancelTransfer');
  const transferForm = document.getElementById('transferForm');
  
  // Modal تحويل لعميل آخر
  const transferClientModal = document.getElementById('transferClientModal');
  const closeTransferClientBtn = document.getElementById('closeTransferClientModal');
  const cancelTransferClientBtn = document.getElementById('cancelTransferClient');
  const transferClientForm = document.getElementById('transferClientForm');
  
// Modal حذف العميل
  const deleteModal = document.getElementById('deleteModal');
  const closeDeleteBtn = document.getElementById('closeDeleteModal');
  const cancelDeleteBtn = document.getElementById('cancelDelete');
  const confirmDeleteBtn = document.getElementById('confirmDelete');

  // Modal تعديل ID
  const editIdModal = document.getElementById('editIdModal');
  const closeEditIdBtn = document.getElementById('closeEditIdModal');
  const cancelEditIdBtn = document.getElementById('cancelEditId');
  const editIdForm = document.getElementById('editIdForm');

  // Modal تعديل الهاتف
  const editPhoneModal = document.getElementById('editPhoneModal');
  const closeEditPhoneBtn = document.getElementById('closeEditPhoneModal');
  const cancelEditPhoneBtn = document.getElementById('cancelEditPhone');
  const editPhoneForm = document.getElementById('editPhoneForm');

  // Modal إضافة رقم إضافي
  const addPhoneModal = document.getElementById('addPhoneModal');
  const closeAddPhoneBtn = document.getElementById('closeAddPhoneModal');
  const cancelAddPhoneBtn = document.getElementById('cancelAddPhone');
  const addPhoneForm = document.getElementById('addPhoneForm');
  // Modal تعديل رقم إضافي
  const editAdditionalPhoneModal = document.getElementById('editAdditionalPhoneModal');
  const closeEditAdditionalPhoneBtn = document.getElementById('closeEditAdditionalPhoneModal');
  const cancelEditAdditionalPhoneBtn = document.getElementById('cancelEditAdditionalPhone');
  const editAdditionalPhoneForm = document.getElementById('editAdditionalPhoneForm');

  // Modal تعديل البريد
  const editEmailModal = document.getElementById('editEmailModal');
  const closeEditEmailBtn = document.getElementById('closeEditEmailModal');
  const cancelEditEmailBtn = document.getElementById('cancelEditEmail');
  const editEmailForm = document.getElementById('editEmailForm');

  // Modal شراء عرض
  const buyOfferModal = document.getElementById('buyOfferModal');
  const closeBuyOfferBtn = document.getElementById('closeBuyOfferModal');
  const cancelBuyOfferBtn = document.getElementById('cancelBuyOffer');
  const buyOfferForm = document.getElementById('buyOfferForm');

  let clientData = null;
  let currentTransaction = null;
  let allTransactions = [];
  let allOffers = [];

  // --- التبديل بين التابات ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
      if (panel) {
        panel.classList.add('active');
      }

if (tabName === 'transactions') {
        loadTransactions();
      } else if (tabName === 'offers') {
        loadOffers();
      } else if (tabName === 'visits') {
        loadVisits();
      }
       else if (tabName === 'bookings') {
  loadBookings();
}
    });
  });

  // --- جلب بيانات العميل ---
  async function loadClientData() {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) {
        throw new Error('فشل في جلب بيانات العميل');
      }

      clientData = await response.json();
      displayClientData(clientData);
    } catch (error) {
      console.error('Error loading client:', error);
      alert('❌ حدث خطأ أثناء تحميل بيانات العميل');
      window.location.href = '/bookings/manageclients.html';
    }
  }

  // --- عرض بيانات العميل ---
// في دالة displayClientData، عدّل هذا الجزء:
function displayClientData(client) {
  document.getElementById('clientName').innerHTML = `
    ${client.name}
    <button class="edit-btn" onclick="openEditNameModal()" title="تعديل الاسم">
      <span>✏️</span>
    </button>
  `;
    document.getElementById('clientPhone').textContent = client.phone;
    document.getElementById('clientId').textContent = client.id;

    document.getElementById('basicName').textContent = client.name;
    document.getElementById('basicPhone').textContent = client.phone;
    document.getElementById('basicBalance').textContent = parseFloat(client.balance_basic || 0).toFixed(2) + ' ج';
    document.getElementById('oldBalance').textContent = parseFloat(client.balance_old || 0).toFixed(2) + ' ج';

    document.getElementById('offersBalance').textContent = parseFloat(client.balance_offers || 0).toFixed(2) + ' ج';
    document.getElementById('laserBalance').textContent = parseFloat(client.balance_laser || 0).toFixed(2) + ' ج';
    document.getElementById('skinBalance').textContent = parseFloat(client.balance_skin || 0).toFixed(2) + ' ج';
    document.getElementById('offersBalance').textContent = parseFloat(client.balance_offers || 0).toFixed(2) + ' ج';
    document.getElementById('laserBalance').textContent = parseFloat(client.balance_laser || 0).toFixed(2) + ' ج';
    document.getElementById('skinBalance').textContent = parseFloat(client.balance_skin || 0).toFixed(2) + ' ج';
    
    // تحميل الأرقام الإضافية
    loadAdditionalPhones();
  }
  // Modal تعديل الاسم
const editNameModal = document.createElement('div');
editNameModal.id = 'editNameModal';
editNameModal.className = 'modal';
editNameModal.setAttribute('aria-hidden', 'true');
editNameModal.innerHTML = `
  <div class="modal-backdrop"></div>
  <div class="modal-inner">
    <button class="close-btn" id="closeEditNameModal">&times;</button>
    <h2>✏️ تعديل اسم العميل</h2>
    <form id="editNameForm">
      <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 12px; margin-bottom: 20px;">
        <h4 style="color: #1565c0; margin-bottom: 10px;">معلومات العميل الحالية</h4>
        <p><strong>الاسم الحالي:</strong> <span id="currentNameDisplay"></span></p>
        <p><strong>رقم الهاتف:</strong> <span id="currentPhoneDisplay"></span></p>
        <p><strong>ID:</strong> <span id="currentIdDisplay"></span></p>
      </div>
      
      <div class="form-group">
        <label for="newClientName">الاسم الجديد *</label>
        <input type="text" id="newClientName" required placeholder="أدخل الاسم الجديد">
      </div>
      
      <div id="editNameMessage" class="message" style="display: none;"></div>
      
      <div class="form-actions">
        <button type="submit" class="btn btn-success">
          <span>✅</span>
          حفظ التغييرات
        </button>
        <button type="button" class="btn btn-secondary" id="cancelEditName">
          إلغاء
        </button>
      </div>
    </form>
  </div>
`;
document.body.appendChild(editNameModal);
// دالة فتح modal تعديل الاسم
window.openEditNameModal = () => {
  if (currentUser.role !== 'ادمن' && currentUser.role !== 'استقبال') {
    alert('⚠️ هذه الميزة متاحة للأدمن وموظفي الاستقبال فقط');
    return;
  }
  
  // تعبئة البيانات الحالية
  document.getElementById('currentNameDisplay').textContent = clientData.name;
  document.getElementById('currentPhoneDisplay').textContent = clientData.phone;
  document.getElementById('currentIdDisplay').textContent = clientData.id;
  document.getElementById('newClientName').value = clientData.name;
  
  document.getElementById('editNameMessage').style.display = 'none';
  editNameModal.setAttribute('aria-hidden', 'false');
};

// دالة إغلاق modal تعديل الاسم
function closeEditNameModal() {
  editNameModal.setAttribute('aria-hidden', 'true');
}
// معالجة تحديث الاسم
document.getElementById('editNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const newName = document.getElementById('newClientName').value.trim();
  
  if (!newName) {
    showEditNameMessage('⚠️ الرجاء إدخال اسم جديد', 'error');
    return;
  }
  
  if (newName === clientData.name) {
    showEditNameMessage('⚠️ الاسم الجديد يجب أن يكون مختلفاً عن القديم', 'error');
    return;
  }

  const submitBtn = document.querySelector('#editNameForm button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> جاري التحديث...';
  
  try {
    const response = await fetch(`/api/clients/${clientId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: newName,
        phone: clientData.phone,
        email: clientData.email || '',
        balance_basic: clientData.balance_basic,
        balance_offers: clientData.balance_offers,
        balance_laser: clientData.balance_laser,
        balance_skin: clientData.balance_skin,
        balance_old: clientData.balance_old
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showEditNameMessage('✅ تم تحديث اسم العميل بنجاح', 'success');
      
      // تحديث البيانات المحلية
      clientData.name = newName;
      
      setTimeout(async () => {
        closeEditNameModal();
        await loadClientData(); // إعادة تحميل البيانات لعرض التغيير
      }, 1500);
      
    } else {
      showEditNameMessage('❌ ' + (result.message || 'حدث خطأ أثناء تحديث الاسم'), 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showEditNameMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
});

// دالة عرض الرسائل
function showEditNameMessage(text, type) {
  const msg = document.getElementById('editNameMessage');
  msg.textContent = text;
  msg.className = `message ${type}`;
  msg.style.display = 'block';
}
// إضافة event listeners للإغلاق
document.getElementById('closeEditNameModal').addEventListener('click', closeEditNameModal);
document.getElementById('cancelEditName').addEventListener('click', closeEditNameModal);

// إغلاق بالضغط على Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEditNameModal();
  }
});
// Modal شحن الرصيد التاريخي
const historicalChargeModal = document.getElementById('historicalChargeModal');
const closeHistoricalChargeBtn = document.getElementById('closeHistoricalChargeModal');
const cancelHistoricalChargeBtn = document.getElementById('cancelHistoricalCharge');
const historicalChargeForm = document.getElementById('historicalChargeForm');
// --- فتح modal شحن الرصيد التاريخي ---
window.openHistoricalChargeModal = () => {
  if (currentUser.role !== 'ادمن' && currentUser.role !== 'استقبال') {
    alert('⚠️ هذه الميزة متاحة للأدمن وموظفي الاستقبال فقط');
    return;
  }
  
  // تعيين التاريخ الحالي كقيمة افتراضية
  const now = new Date();
  const localDateTime = now.toISOString().slice(0, 16);
  document.getElementById('historicalChargeDate').value = localDateTime;
  
  document.getElementById('historicalBalanceType').value = '';
  document.getElementById('historicalChargeAmount').value = '';
  document.getElementById('historicalChargeNotes').value = '';
  document.getElementById('historicalChargeMessage').style.display = 'none';
  historicalChargeModal.setAttribute('aria-hidden', 'false');
};
// --- معالجة شحن الرصيد التاريخي ---
historicalChargeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const balanceType = document.getElementById('historicalBalanceType').value;
  const amount = parseFloat(document.getElementById('historicalChargeAmount').value);
  const chargeDate = document.getElementById('historicalChargeDate').value;
  const notes = document.getElementById('historicalChargeNotes').value.trim();
  
  if (!balanceType) {
    showHistoricalChargeMessage('⚠️ الرجاء اختيار نوع الرصيد', 'error');
    return;
  }
  
  if (!amount || amount <= 0) {
    showHistoricalChargeMessage('⚠️ الرجاء إدخال مبلغ صحيح', 'error');
    return;
  }
  
  if (!chargeDate) {
    showHistoricalChargeMessage('⚠️ الرجاء اختيار التاريخ', 'error');
    return;
  }

  const submitBtn = historicalChargeForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> جاري الشحن...';
  
  try {
    const response = await fetch(`/api/clients/${clientId}/historical-charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        balance_type: balanceType,
        amount: amount,
        charge_date: chargeDate,
        notes: notes,
        created_by: currentUser.name,
        is_historical: true // علامة أن هذه عملية تاريخية
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showHistoricalChargeMessage('✅ تم شحن الرصيد التاريخي بنجاح', 'success');
      setTimeout(async () => {
        historicalChargeModal.setAttribute('aria-hidden', 'true');
        await loadClientData();
        await loadTransactions(); // تحديث قائمة المعاملات
      }, 1500);
    } else {
      showHistoricalChargeMessage('❌ ' + (result.message || 'حدث خطأ أثناء الشحن'), 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showHistoricalChargeMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>⏳</span> شحن الرصيد التاريخي';
  }
});

function showHistoricalChargeMessage(text, type) {
  const msg = document.getElementById('historicalChargeMessage');
  msg.textContent = text;
  msg.className = `message ${type}`;
  msg.style.display = 'block';
}
// إضافة event listeners للإغلاق
closeHistoricalChargeBtn.addEventListener('click', () => {
  historicalChargeModal.setAttribute('aria-hidden', 'true');
});

cancelHistoricalChargeBtn.addEventListener('click', () => {
  historicalChargeModal.setAttribute('aria-hidden', 'true');
});

// إضافة للإغلاق بالضغط على Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    historicalChargeModal.setAttribute('aria-hidden', 'true');
  }
});


// إغلاق بالضغط خارج الـ modal
editNameModal.addEventListener('click', (e) => {
  if (e.target === editNameModal) {
    closeEditNameModal();
  }
});
  

  // --- جلب المعاملات ---
async function loadTransactions() {
  const loadingEl = document.getElementById('loadingTransactions');
  const contentEl = document.getElementById('transactionsContent');
  const listEl = document.getElementById('transactionsList');
  const emptyEl = document.getElementById('emptyTransactions');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const response = await fetch(`/api/clients/${clientId}/transactions?include_historical=true`);
    if (!response.ok) {
      throw new Error('فشل في جلب المعاملات');
    }

    const transactions = await response.json();
    allTransactions = transactions;

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    if (transactions.length === 0) {
      emptyEl.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    displayTransactions(transactions);
  } catch (error) {
    console.error('Error loading transactions:', error);
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    listEl.innerHTML = '<p style="color: var(--error); text-align: center; padding: 40px;">❌ حدث خطأ أثناء تحميل المعاملات</p>';
  }
}

  // --- عرض المعاملات ---
function displayTransactions(transactions) {
  const listEl = document.getElementById('transactionsList');

  const html = transactions.map(transaction => {
    const date = new Date(transaction.created_at).toLocaleString('ar-EG');
    const amount = parseFloat(transaction.amount || 0).toFixed(2);
    const sign = transaction.amount >= 0 ? '+' : '';
    
    // تمييز العمليات التاريخية (باستخدام is_historical أو الملاحظات)
    const isHistorical = transaction.is_historical || 
                        (transaction.notes && transaction.notes.includes('[تاريخي]'));
    const historicalBadge = isHistorical ? 
      '<span style="color: #ff9800; font-weight: 600; background: #fff3e0; padding: 2px 8px; border-radius: 12px; font-size: 12px;">⏳ تاريخي</span>' : '';

    return `
      <div class="transaction-card" style="${isHistorical ? 'border-right: 4px solid #ff9800; background: #fffaf0;' : ''}">
        <div class="transaction-details">
          <div class="transaction-amount">${sign}${amount} ج</div>
          <div class="transaction-type">
            <strong>${transaction.balance_type}</strong> — ${transaction.transaction_type}
            ${historicalBadge}
          </div>
          ${transaction.payment_method ? `<div class="transaction-meta">💳 طريقة الدفع: ${transaction.payment_method}</div>` : ''}
          <div class="transaction-meta">
            👤 بواسطة: ${transaction.created_by}
          </div>
          ${transaction.notes ? `<div class="transaction-meta">📝 ملحوظة: ${transaction.notes}</div>` : ''}
          <div class="transaction-meta">🕒 ${date}</div>
        </div>
        <div class="transaction-actions">
          <button class="print-btn" onclick="window.openPrintModal(${transaction.id})">
            <span>🖨️</span>
            طباعة
          </button>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
  }

  // --- فلترة المعاملات بالتاريخ ---
  window.filterTransactions = () => {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;

    let filtered = [...allTransactions];

    if (startDate) {
      filtered = filtered.filter(t => {
        const tDate = new Date(t.created_at).toISOString().split('T')[0];
        return tDate >= startDate;
      });
    }

    if (endDate) {
      filtered = filtered.filter(t => {
        const tDate = new Date(t.created_at).toISOString().split('T')[0];
        return tDate <= endDate;
      });
    }

    displayTransactions(filtered);

    if (filtered.length === 0) {
      document.getElementById('emptyTransactions').style.display = 'block';
      document.getElementById('transactionsList').innerHTML = '';
    } else {
      document.getElementById('emptyTransactions').style.display = 'none';
    }
  };

  // --- مسح الفلاتر ---
  window.clearFilters = () => {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    displayTransactions(allTransactions);
    document.getElementById('emptyTransactions').style.display = allTransactions.length === 0 ? 'block' : 'none';
  };

// --- تحميل العروض المتاحة + المشتراة ---
async function loadOffers() {
  // تحميل العروض المتاحة
  const loadingEl = document.getElementById('loadingOffers');
  const gridEl = document.getElementById('offersGrid');
  const emptyEl = document.getElementById('emptyOffers');

  loadingEl.style.display = 'block';
  gridEl.innerHTML = '';
  emptyEl.style.display = 'none';

  try {
    const response = await fetch('/api/offers');
    if (!response.ok) {
      throw new Error('فشل في جلب العروض');
    }

    allOffers = await response.json();
    
    // فلترة العروض النشطة فقط
    const activeOffers = allOffers.filter(offer => offer.status === 'active');

    loadingEl.style.display = 'none';

    if (activeOffers.length === 0) {
      emptyEl.style.display = 'block';
    } else {
      displayOffers(activeOffers);
    }
  } catch (error) {
    console.error('Error loading offers:', error);
    loadingEl.style.display = 'none';
    gridEl.innerHTML = '<p style="color: var(--error); text-align: center; padding: 40px;">❌ حدث خطأ أثناء تحميل العروض</p>';
  }

  // تحميل العروض المشتراة
  loadPurchasedOffers();
}

// --- تحميل العروض المشتراة ---
async function loadPurchasedOffers() {
  const loadingEl = document.getElementById('loadingPurchasedOffers');
  const gridEl = document.getElementById('purchasedOffersGrid');
  const emptyEl = document.getElementById('emptyPurchasedOffers');

  loadingEl.style.display = 'block';
  gridEl.innerHTML = '';
  emptyEl.style.display = 'none';

  try {
    const response = await fetch(`/api/clients/${clientId}/purchased-offers`);
    if (!response.ok) {
      throw new Error(`فشل في جلب العروض المشتراة: ${response.status}`);
    }

    const purchasedOffers = await response.json();
    console.log('Purchased offers loaded:', purchasedOffers); // للتصحيح

    loadingEl.style.display = 'none';

    if (!purchasedOffers || purchasedOffers.length === 0) {
      emptyEl.style.display = 'block';
    } else {
      displayPurchasedOffers(purchasedOffers);
    }
  } catch (error) {
    console.error('Error loading purchased offers:', error);
    loadingEl.style.display = 'none';
    gridEl.innerHTML = `
      <div style="color: var(--error); text-align: center; padding: 40px;">
        ❌ حدث خطأ أثناء تحميل العروض المشتراة
        <br>
        <small>${error.message}</small>
      </div>
    `;
  }
}
// --- عرض العروض المتاحة للشراء ---
function displayOffers(offers) {
  const gridEl = document.getElementById('offersGrid');

  const html = offers.map(offer => {
    let services = [];
    try {
      services = JSON.parse(offer.services);
    } catch(e) {
      console.error('Error parsing services:', e);
    }

    return `
      <div class="offer-card">
        <div class="offer-header">
          <div class="offer-icon">✨</div>
          <div class="offer-title">
            <h3 class="offer-name">${offer.name}</h3>
            <span class="offer-type">${offer.offer_type === 'bundle' ? '📦 باقة' : '🎟️ جلسات'}</span>
          </div>
        </div>

        <div class="offer-body">
          <div class="offer-detail">
            <span class="offer-label">السعر:</span>
            <span class="offer-value offer-price">${parseFloat(offer.offer_price).toFixed(2)} ج</span>
          </div>

          ${offer.sessions_count ? `
            <div class="offer-detail">
              <span class="offer-label">عدد الجلسات:</span>
              <span class="offer-value">${offer.sessions_count} جلسة</span>
            </div>
          ` : ''}

          <div class="offer-detail">
            <span class="offer-label">عدد الخدمات:</span>
            <span class="offer-value">${services.length} خدمة</span>
          </div>

          ${offer.description ? `
            <div class="offer-detail">
              <span class="offer-label">الوصف:</span>
              <span class="offer-value">${offer.description}</span>
            </div>
          ` : ''}
        </div>

        <div class="offer-footer">
          <button class="offer-buy-btn" onclick="window.openBuyOfferModal(${offer.id})">
            <span>🛒</span>
            شراء العرض
          </button>
        </div>
      </div>
    `;
  }).join('');

  gridEl.innerHTML = html;
}

// --- عرض العروض المشتراة ---
function displayPurchasedOffers(offers) {
  const gridEl = document.getElementById('purchasedOffersGrid');

  const html = offers.map(offer => {
    let services = [];
    if (offer.services && Array.isArray(offer.services)) {
      services = offer.services;
    }

    // حساب إجمالي الجلسات المتبقية
    let totalRemainingSessions = 0;
    if (offer.service_sessions) {
      totalRemainingSessions = offer.service_sessions.reduce((total, session) => {
        return total + (session.remaining_sessions || 0);
      }, 0);
    }

    const hasRemainingSessions = totalRemainingSessions > 0;

    return `
      <div class="offer-card" style="border: 3px solid #3b82f6; background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%);">
        <div class="offer-header">
          <div class="offer-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">✨</div>
          <div class="offer-title">
            <h3 class="offer-name">${offer.offer_name || offer.name || 'عرض بدون اسم'}</h3>
            <span class="offer-type" style="background: #dbeafe; color: #1e40af;">${offer.offer_type === 'bundle' ? '📦 باقة' : '🎟️ جلسات'}</span>
          </div>
        </div>

        <div class="offer-body">
          <div class="offer-detail">
            <span class="offer-label">السعر المدفوع:</span>
            <span class="offer-value" style="color: #059669; font-weight: 700;">
              ${parseFloat(offer.purchase_price || 0).toFixed(2)} ج
            </span>
          </div>

          <div class="offer-detail">
            <span class="offer-label">عدد الخدمات:</span>
            <span class="offer-value">${services.length} خدمة</span>
          </div>

          <div class="offer-detail">
            <span class="offer-label">إجمالي الجلسات المتبقية:</span>
            <span class="offer-value" style="color: #059669; font-weight: 700;">
              ${totalRemainingSessions} جلسة
            </span>
          </div>

          <div class="offer-detail">
            <span class="offer-label">تاريخ الشراء:</span>
            <span class="offer-value">${new Date(offer.purchase_date).toLocaleDateString('ar-EG')}</span>
          </div>

          <div class="offer-detail">
            <span class="offer-label">تم الشراء بواسطة:</span>
            <span class="offer-value">${offer.created_by}</span>
          </div>

          <!-- عرض الخدمات وأزرار الاستخدام -->
          ${hasRemainingSessions ? `
            <div class="offer-services-section" style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #e0f2fe;">
              <h4 style="color: #1e40af; margin-bottom: 15px; text-align: center;">🚀 استخدام الخدمات</h4>
              
              ${services.map((service, index) => {
                const serviceObj = typeof service === 'object' ? service : { name: String(service) };
                const serviceIndex = index;
                const serviceName = serviceObj.name || serviceObj.service_name || 'خدمة غير معروفة';
                const safeServiceName = serviceName.replace(/'/g, "\\'");
                
                // البحث عن جلسات هذه الخدمة
                const serviceSession = offer.service_sessions?.find(s => 
                  s.service_index == serviceIndex
                );
                
                const serviceRemaining = serviceSession ? serviceSession.remaining_sessions : 0;
                const canUseService = serviceRemaining > 0;
                
                return `
                <div class="service-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px;">
                  <div style="flex: 1;">
                    <div style="font-weight: 500;">${serviceName}</div>
                    <div style="font-size: 12px; color: ${canUseService ? '#059669' : '#dc2626'};">
                      الجلسات المتبقية: ${serviceRemaining}
                    </div>
                  </div>
                  <button class="use-service-btn" 
                          onclick="window.useOfferService(${offer.id}, ${serviceIndex}, '${safeServiceName}')"
                          style="background: ${canUseService ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#9ca3af'}; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: ${canUseService ? 'pointer' : 'not-allowed'}; font-size: 12px;"
                          ${!canUseService ? 'disabled' : ''}>
                    ✅ استخدام هذه الخدمة فقط
                  </button>
                </div>
                `;
              }).join('')}
              
              <!-- زر استخدام كامل العرض -->
              <div class="use-all-section" style="text-align: center; padding: 12px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 8px; margin-top: 15px;">
                <button class="use-all-btn" 
                        onclick="window.useOfferSession(${offer.id})"
                        style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                  🎯 استخدام العرض كله (-1 جلسة من كل خدمة)
                </button>
                <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                  سيتم خصم جلسة واحدة من كل خدمة في العرض
                </p>
              </div>
            </div>
          ` : `
            <div class="offer-status" style="background: #dcfce7; color: #15803d; padding: 12px; border-radius: 8px; text-align: center; font-weight: 600;">
              ✅ تم استخدام جميع الجلسات
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');

  gridEl.innerHTML = html;
}
// استخدام خدمة محددة من عرض
window.useOfferService = async (purchasedOfferId, serviceIndex, serviceName) => {
  if (!confirm(`هل تريد استخدام خدمة "${serviceName}" فقط من هذا العرض؟`)) {
    return;
  }

  try {
    const response = await fetch(`/api/purchased-offers/${purchasedOfferId}/use-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_index: serviceIndex,
        service_name: serviceName,
        used_by: currentUser.name
      })
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ ${result.message}\nالجلسات المتبقية للخدمة: ${result.service_remaining}`);
      loadPurchasedOffers();
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ في الاتصال بالسيرفر');
  }
};

// استخدام العرض كله (يخصم من كل الخدمات)
window.useOfferSession = async (purchasedOfferId) => {
  if (!confirm('هل تريد استخدام العرض كله؟ سيتم خصم جلسة واحدة من كل خدمة في العرض.')) {
    return;
  }

  try {
    const response = await fetch(`/api/purchased-offers/${purchasedOfferId}/use-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        used_by: currentUser.name
      })
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ ${result.message}`);
      loadPurchasedOffers();
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ في الاتصال بالسيرفر');
  }
};
// استخدام العرض كله (يخصم من العدد الكلي ومن كل الخدمات)
window.useOfferSession = async (purchasedOfferId) => {
  if (!confirm('هل تريد استخدام العرض كله؟ سيتم خصم جلسة واحدة من العدد الإجمالي ومن كل خدمة في العرض.')) {
    return;
  }

  try {
    const response = await fetch(`/api/purchased-offers/${purchasedOfferId}/use-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        used_by: currentUser.name
      })
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ ${result.message}\nالجلسات الإجمالية المتبقية: ${result.remaining}`);
      loadPurchasedOffers();
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ في الاتصال بالسيرفر');
  }
};
// --- استخدام جلسة من عرض ---
window.useOfferSession = async (purchasedOfferId) => {
  if (!confirm('هل تريد استخدام جلسة من هذا العرض؟')) {
    return;
  }

  try {
    const response = await fetch(`/api/purchased-offers/${purchasedOfferId}/use-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        used_by: currentUser.name
      })
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ ${result.message}\nالجلسات المتبقية: ${result.remaining}`);
      loadPurchasedOffers(); // إعادة تحميل العروض المشتراة
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ في الاتصال بالسيرفر');
  }
};

// --- تعديل معالجة شراء العرض ---
buyOfferForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const offerId = document.getElementById('selectedOfferId').value;
  const paymentMethod = document.getElementById('offerPaymentMethod').value;
  
  if (!paymentMethod) {
    showBuyOfferMessage('⚠️ الرجاء اختيار طريقة الدفع', 'error');
    return;
  }

  const offer = allOffers.find(o => o.id === parseInt(offerId));
  if (!offer) {
    showBuyOfferMessage('❌ العرض غير موجود', 'error');
    return;
  }

  const currentShift = await getCurrentShift(currentUser.id);
  
  const submitBtn = buyOfferForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> جاري الشراء...';
  
  try {
    // استخدام API الجديد لشراء العرض
    const response = await fetch(`/api/clients/${clientId}/purchase-offer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        offer_id: parseInt(offerId),
        payment_method: paymentMethod,
        created_by: currentUser.name
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // إضافة العملية للشيفت
      if (currentShift) {
        await addShiftOperation(currentShift.id, {
          operation_type: 'شراء عرض',
          client_name: clientData.name,
          client_phone: clientData.phone,
          amount: parseFloat(offer.offer_price),
          payment_method: 'تحويل داخلي',
          balance_type: 'رصيد عروض',
          description: `شراء عرض: ${offer.name}`
        });
        console.log('✅ تم تسجيل عملية شراء العرض في الشيفت');
      }

      showBuyOfferMessage('✅ تم شراء العرض بنجاح', 'success');
      setTimeout(async () => {
        buyOfferModal.setAttribute('aria-hidden', 'true');
        await loadClientData();
        await loadTransactions();
        await loadPurchasedOffers(); // تحديث العروض المشتراة
      }, 1500);
    } else {
      showBuyOfferMessage('❌ ' + (result.message || 'حدث خطأ أثناء الشراء'), 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showBuyOfferMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>🛒</span> تأكيد الشراء';
  }
});
  // --- فتح modal شراء عرض ---
// --- شراء العرض مباشرة ---
window.openBuyOfferModal = async (offerId) => {
  const offer = allOffers.find(o => o.id === offerId);
  if (!offer) {
    alert('❌ العرض غير موجود');
    return;
  }

  const offerPrice = parseFloat(offer.offer_price);
  const currentOffersBalance = parseFloat(clientData.balance_offers || 0);

  // التحقق من الرصيد
  if (currentOffersBalance < offerPrice) {
    alert(`⚠️ رصيد العروض غير كافي!\n\nالمطلوب: ${offerPrice.toFixed(2)} ج\nالمتوفر: ${currentOffersBalance.toFixed(2)} ج\nالنقص: ${(offerPrice - currentOffersBalance).toFixed(2)} ج`);
    return;
  }

  // تأكيد الشراء
  if (!confirm(`هل تريد شراء العرض "${offer.name}"?\n\nالسعر: ${offerPrice.toFixed(2)} ج\nسيتم الخصم من رصيد العروض`)) {
    return;
  }

  const currentShift = await getCurrentShift(currentUser.id);
  
  try {
    // استخدام API الجديد لشراء العرض
    const response = await fetch(`/api/clients/${clientId}/purchase-offer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        offer_id: parseInt(offerId),
        payment_method: 'خصم من رصيد العروض',
        created_by: currentUser.name
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // إضافة العملية للشيفت
      if (currentShift) {
        await addShiftOperation(currentShift.id, {
          operation_type: 'شراء عرض',
          client_name: clientData.name,
          client_phone: clientData.phone,
          amount: offerPrice,
          payment_method: 'خصم من رصيد العروض',
          balance_type: 'رصيد عروض',
          description: `شراء عرض: ${offer.name} - خصم من الرصيد`
        });
        console.log('✅ تم تسجيل عملية شراء العرض في الشيفت');
      }

      alert(`✅ تم شراء العرض بنجاح!\n\nالعرض: ${offer.name}\nالسعر: ${offerPrice.toFixed(2)} ج\nالرصيد المتبقي: ${(currentOffersBalance - offerPrice).toFixed(2)} ج`);
      
      // تحديث البيانات
      await loadClientData();
      await loadTransactions();
      await loadPurchasedOffers();
    } else {
      alert('❌ ' + (result.message || 'حدث خطأ أثناء الشراء'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ في الاتصال بالسيرفر');
  }
};

  // --- معالجة شراء العرض ---
  buyOfferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const offerId = document.getElementById('selectedOfferId').value;
    const paymentMethod = document.getElementById('offerPaymentMethod').value;
    
    if (!paymentMethod) {
      showBuyOfferMessage('⚠️ الرجاء اختيار طريقة الدفع', 'error');
      return;
    }

    const offer = allOffers.find(o => o.id === parseInt(offerId));
    if (!offer) {
      showBuyOfferMessage('❌ العرض غير موجود', 'error');
      return;
    }

    const currentShift = await getCurrentShift(currentUser.id);
    
    const submitBtn = buyOfferForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الشراء...';
    
    try {
      // شحن رصيد العروض
      const response = await fetch(`/api/clients/${clientId}/charge-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          balance_type: 'رصيد عروض',
          amount: parseFloat(offer.offer_price),
          payment_method: paymentMethod,
          created_by: currentUser.name
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // إضافة العملية للشيفت
        if (currentShift) {
          await addShiftOperation(currentShift.id, {
            operation_type: 'شراء عرض',
            client_name: clientData.name,
            client_phone: clientData.phone,
            amount: parseFloat(offer.offer_price),
            payment_method: paymentMethod,
            balance_type: 'رصيد عروض',
            description: `شراء عرض: ${offer.name}`
          });
          console.log('✅ تم تسجيل عملية شراء العرض في الشيفت');
        }

        showBuyOfferMessage('✅ تم شراء العرض بنجاح وإضافته لرصيد العروض', 'success');
        setTimeout(async () => {
          buyOfferModal.setAttribute('aria-hidden', 'true');
          await loadClientData();
          await loadTransactions();
        }, 1500);
      } else {
        showBuyOfferMessage('❌ ' + (result.message || 'حدث خطأ أثناء الشراء'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showBuyOfferMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🛒</span> تأكيد الشراء';
    }
  });

  function showBuyOfferMessage(text, type) {
    const msg = document.getElementById('buyOfferMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- فتح modal تعديل الهاتف ---
  window.openEditPhoneModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    
    document.getElementById('currentPhone').value = clientData.phone;
    document.getElementById('newPhone').value = '';
    document.getElementById('editPhoneMessage').style.display = 'none';
    editPhoneModal.setAttribute('aria-hidden', 'false');
  };

// --- معالجة تعديل الهاتف الأساسي ---
editPhoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const newPhone = document.getElementById('newPhone').value.trim();
  
  if (!/^01[0-9]{9}$/.test(newPhone)) {
    showEditPhoneMessage('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
    return;
  }
  
  if (newPhone === clientData.phone) {
    showEditPhoneMessage('⚠️ رقم الهاتف الجديد يجب أن يكون مختلفاً عن القديم', 'error');
    return;
  }

  const submitBtn = editPhoneForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> جاري التحديث...';
  
  try {
    const response = await fetch(`/api/clients/${clientId}/main-phone`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: newPhone
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showEditPhoneMessage('✅ تم تحديث رقم الهاتف بنجاح', 'success');
      setTimeout(async () => {
        editPhoneModal.setAttribute('aria-hidden', 'true');
        await loadClientData();
      }, 1500);
    } else {
      showEditPhoneMessage('❌ ' + (result.message || 'حدث خطأ أثناء تحديث الهاتف'), 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showEditPhoneMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>📱</span> تحديث الهاتف';
  }
});

function showEditPhoneMessage(text, type) {
  const msg = document.getElementById('editPhoneMessage');
  msg.textContent = text;
  msg.className = `message ${type}`;
  msg.style.display = 'block';
}

// --- إضافة دالة تعديل رقم إضافي (جديدة) ---
window.editAdditionalPhone = async (phoneId) => {
  if (currentUser.role !== 'ادمن') {
    alert('⚠️ هذه الميزة متاحة للأدمن فقط');
    return;
  }
  
  try {
    // جلب بيانات الرقم الحالي
    const phonesRes = await fetch(`/api/clients/${clientId}/phones`);
    const phones = await phonesRes.json();
    const phone = phones.find(p => p.id === phoneId);
    
    if (!phone) {
      alert('❌ الرقم غير موجود');
      return;
    }
    
    // فتح modal للتعديل
    const editPhoneModal = document.getElementById('editAdditionalPhoneModal');
    if (!editPhoneModal) {
      alert('❌ خطأ: modal التعديل غير موجود');
      return;
    }
    
    document.getElementById('editAdditionalPhoneId').value = phoneId;
    document.getElementById('editAdditionalPhone').value = phone.phone;
    document.getElementById('editAdditionalPhoneType').value = phone.phone_type || 'إضافي';
    document.getElementById('editAdditionalPhoneNotes').value = phone.notes || '';
    document.getElementById('editAdditionalPhoneMessage').style.display = 'none';
    
    editPhoneModal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ أثناء جلب بيانات الرقم');
  }
};


function showEditAdditionalPhoneMessage(text, type) {
  const msg = document.getElementById('editAdditionalPhoneMessage');
  msg.textContent = text;
  msg.className = `message ${type}`;
  msg.style.display = 'block';
}

  // --- فتح modal تعديل البريد ---
  window.openEditEmailModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    
    document.getElementById('currentEmail').value = clientData.email || 'لا يوجد';
    document.getElementById('newEmail').value = '';
    document.getElementById('editEmailMessage').style.display = 'none';
    editEmailModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة تعديل البريد ---
  editEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newEmail = document.getElementById('newEmail').value.trim();
    
    if (!newEmail) {
      showEditEmailMessage('⚠️ الرجاء إدخال بريد إلكتروني صحيح', 'error');
      return;
    }

    const submitBtn = editEmailForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الحفظ...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: clientData.name,
          phone: clientData.phone,
          email: newEmail,
          balance_basic: clientData.balance_basic,
          balance_offers: clientData.balance_offers,
          balance_laser: clientData.balance_laser,
          balance_skin: clientData.balance_skin,
          balance_old: clientData.balance_old
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        showEditEmailMessage('✅ تم حفظ البريد الإلكتروني بنجاح', 'success');
        setTimeout(async () => {
          editEmailModal.setAttribute('aria-hidden', 'true');
          await loadClientData();
        }, 1500);
      } else {
        showEditEmailMessage('❌ ' + (result.message || 'حدث خطأ أثناء حفظ البريد'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showEditEmailMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>📧</span> حفظ البريد';
    }
  });

function showEditEmailMessage(text, type) {
    const msg = document.getElementById('editEmailMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

// --- تحديث دالة عرض الأرقام الإضافية لإضافة زر التعديل ---
// --- تحميل الأرقام الإضافية ---
async function loadAdditionalPhones() {
  const listEl = document.getElementById('additionalPhonesList');
  
  try {
    const response = await fetch(`/api/clients/${clientId}/phones`);
    if (!response.ok) {
      throw new Error('فشل في جلب الأرقام');
    }

    const phones = await response.json();

    if (phones.length === 0) {
      listEl.innerHTML = '<div class="no-additional-phones">لا توجد أرقام إضافية مسجلة</div>';
      return;
    }

    const html = phones.map(phone => `
      <div class="phone-item">
        <div class="phone-item-icon">📞</div>
        <div class="phone-item-content">
          <div class="phone-item-number">${phone.phone}</div>
          <span class="phone-item-type">${phone.phone_type}</span>
          ${phone.notes ? `<div class="phone-item-notes">${phone.notes}</div>` : ''}
        </div>
        <div class="phone-item-actions">
          <button class="phone-item-edit" onclick="window.editAdditionalPhone(${phone.id})" title="تعديل">
            <span>✏️</span>
          </button>
          <button class="phone-item-delete" onclick="window.deleteAdditionalPhone(${phone.id})" title="حذف">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `).join('');

    listEl.innerHTML = html;
  } catch (error) {
    console.error('Error loading phones:', error);
    listEl.innerHTML = '<div class="no-additional-phones" style="color: var(--error);">❌ حدث خطأ أثناء تحميل الأرقام</div>';
  }
}
  // --- فتح modal إضافة رقم ---
  window.openAddPhoneModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    
    document.getElementById('additionalPhone').value = '';
    document.getElementById('phoneType').value = 'إضافي';
    document.getElementById('phoneNotes').value = '';
    document.getElementById('addPhoneMessage').style.display = 'none';
    addPhoneModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة إضافة رقم ---
  addPhoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phone = document.getElementById('additionalPhone').value.trim();
    const phoneType = document.getElementById('phoneType').value;
    const notes = document.getElementById('phoneNotes').value.trim();
    
    if (!/^01[0-9]{9}$/.test(phone)) {
      showAddPhoneMessage('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
      return;
    }

    const submitBtn = addPhoneForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الإضافة...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}/phones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phone,
          phone_type: phoneType,
          notes: notes || null
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        showAddPhoneMessage('✅ تم إضافة الرقم بنجاح', 'success');
        setTimeout(() => {
          addPhoneModal.setAttribute('aria-hidden', 'true');
          loadAdditionalPhones();
        }, 1500);
      } else {
        showAddPhoneMessage('❌ ' + (result.message || 'حدث خطأ أثناء الإضافة'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showAddPhoneMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>➕</span> إضافة الرقم';
    }
  });

  function showAddPhoneMessage(text, type) {
    const msg = document.getElementById('addPhoneMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- حذف رقم إضافي ---
  window.deleteAdditionalPhone = async (phoneId) => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }

    if (!confirm('هل أنت متأكد من حذف هذا الرقم؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/clients/${clientId}/phones/${phoneId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert('✅ ' + result.message);
        loadAdditionalPhones();
      } else {
        alert('❌ ' + (result.message || 'حدث خطأ أثناء الحذف'));
      }
    } catch (error) {
      console.error('Error:', error);
      alert('❌ حدث خطأ في الاتصال بالسيرفر');
    }
  };

  // --- فتح modal شحن الرصيد ---
  window.openChargeModal = (balanceType) => {
    document.getElementById('chargeBalanceType').value = balanceType;
    document.getElementById('chargeClientId').value = clientId;
    document.getElementById('chargeAmount').value = '';
    document.getElementById('chargePaymentMethod').value = '';
    document.getElementById('chargeMessage').style.display = 'none';
    chargeModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة شحن الرصيد ---
  chargeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const targetClientId = document.getElementById('chargeClientId').value;
    const balanceType = document.getElementById('chargeBalanceType').value;
    const amount = parseFloat(document.getElementById('chargeAmount').value);
    const paymentMethod = document.getElementById('chargePaymentMethod').value;
    
    if (!targetClientId || !amount || !paymentMethod) {
      showChargeMessage('⚠️ الرجاء ملء جميع الحقول', 'error');
      return;
    }
    
    if (amount <= 0) {
      showChargeMessage('⚠️ المبلغ يجب أن يكون أكبر من صفر', 'error');
      return;
    }

    // الحصول على الشيفت النشط
    const currentShift = await getCurrentShift(currentUser.id);
    
    const submitBtn = chargeForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الشحن...';
    
    try {
      const response = await fetch(`/api/clients/${targetClientId}/charge-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          balance_type: balanceType,
          amount: amount,
          payment_method: paymentMethod,
          created_by: currentUser.name
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {

        showChargeMessage('✅ ' + result.message, 'success');
        setTimeout(async () => {
          chargeModal.setAttribute('aria-hidden', 'true');
          await loadClientData();
          await loadTransactions();
        }, 1500);
      } else {
        showChargeMessage('❌ ' + (result.message || 'حدث خطأ أثناء الشحن'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showChargeMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💰</span> شحن الرصيد';
    }
  });

  function showChargeMessage(text, type) {
    const msg = document.getElementById('chargeMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- فتح modal تحويل بين الفئات ---
  window.openTransferModal = (fromType) => {
    document.getElementById('transferFrom').value = fromType;
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferTo').value = '';
    document.getElementById('transferMessage').style.display = 'none';
    transferModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة تحويل بين الفئات ---
  transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fromType = document.getElementById('transferFrom').value;
    const toType = document.getElementById('transferTo').value;
    const amount = parseFloat(document.getElementById('transferAmount').value);
    
    if (!toType) {
      showTransferMessage('⚠️ الرجاء اختيار نوع الرصيد المستهدف', 'error');
      return;
    }
    
    if (!amount || amount <= 0) {
      showTransferMessage('⚠️ الرجاء إدخال مبلغ صحيح', 'error');
      return;
    }

    // الحصول على الشيفت النشط
    const currentShift = await getCurrentShift(currentUser.id);
    
    const submitBtn = transferForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري التحويل...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}/transfer-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_balance: fromType,
          to_balance: toType,
          amount: amount,
          created_by: currentUser.name
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // إضافة العملية للشيفت
        if (currentShift) {
          await addShiftOperation(currentShift.id, {
            operation_type: 'تحويل رصيد',
            client_name: clientData.name,
            client_phone: clientData.phone,
            amount: amount,
            payment_method: 'تحويل داخلي',
            description: `تحويل ${amount.toFixed(2)} ج من ${fromType} إلى ${toType}`
          });
          console.log('✅ تم تسجيل العملية في الشيفت');
        }

        showTransferMessage('✅ ' + result.message, 'success');
        setTimeout(async () => {
          transferModal.setAttribute('aria-hidden', 'true');
          await loadClientData();
          await loadTransactions();
        }, 1500);
      } else {
        showTransferMessage('❌ ' + (result.message || 'حدث خطأ أثناء التحويل'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showTransferMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💱</span> تحويل';
    }
  });

  function showTransferMessage(text, type) {
    const msg = document.getElementById('transferMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- فتح modal تحويل لعميل آخر ---
  window.openTransferClientModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    
    document.getElementById('targetClientPhone').value = '';
    document.getElementById('transferClientAmount').value = '';
    document.getElementById('transferClientMessage').style.display = 'none';
    transferClientModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة تحويل لعميل آخر ---
  transferClientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const targetPhone = document.getElementById('targetClientPhone').value.trim();
    const amount = parseFloat(document.getElementById('transferClientAmount').value);
    
    if (!targetPhone) {
      showTransferClientMessage('⚠️ الرجاء إدخال رقم هاتف العميل المستهدف', 'error');
      return;
    }
    
    if (!/^01[0-9]{9}$/.test(targetPhone)) {
      showTransferClientMessage('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
      return;
    }
    
    if (!amount || amount <= 0) {
      showTransferClientMessage('⚠️ الرجاء إدخال مبلغ صحيح', 'error');
      return;
    }

    // الحصول على الشيفت النشط
    const currentShift = await getCurrentShift(currentUser.id);
    
    const submitBtn = transferClientForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري التحويل...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}/transfer-to-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_phone: targetPhone,
          amount: amount,
          created_by: currentUser.name
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // إضافة العملية للشيفت
        if (currentShift) {
          await addShiftOperation(currentShift.id, {
            operation_type: 'تحويل لعميل',
            client_name: clientData.name,
            client_phone: clientData.phone,
            amount: amount,
            payment_method: 'تحويل داخلي',
            description: `تحويل ${amount.toFixed(2)} ج للعميل ${targetPhone}`
          });
          console.log('✅ تم تسجيل العملية في الشيفت');
        }

        showTransferClientMessage('✅ ' + result.message, 'success');
        setTimeout(async () => {
          transferClientModal.setAttribute('aria-hidden', 'true');
          await loadClientData();
          await loadTransactions();
        }, 1500);
      } else {
        showTransferClientMessage('❌ ' + (result.message || 'حدث خطأ أثناء التحويل'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showTransferClientMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💸</span> تحويل';
    }
  });

  function showTransferClientMessage(text, type) {
    const msg = document.getElementById('transferClientMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- فتح modal تعديل ID ---
  window.openEditIdModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    
    document.getElementById('currentIdDisplay').value = clientId;
    document.getElementById('newClientId').value = '';
    document.getElementById('editIdMessage').style.display = 'none';
    editIdModal.setAttribute('aria-hidden', 'false');
  };

  // --- معالجة تعديل ID ---
  editIdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newId = parseInt(document.getElementById('newClientId').value);
    
    if (!newId || newId <= 0) {
      showEditIdMessage('⚠️ الرجاء إدخال ID صحيح', 'error');
      return;
    }
    
    if (newId === parseInt(clientId)) {
      showEditIdMessage('⚠️ ID الجديد يجب أن يكون مختلفاً عن القديم', 'error');
      return;
    }

    const submitBtn = editIdForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري التحديث...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}/change-id`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newId: newId
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        showEditIdMessage('✅ ' + result.message, 'success');
        setTimeout(() => {
          // إعادة التوجيه للصفحة بـ ID الجديد
          window.location.href = `/bookings/clientdetails.html?id=${result.newId}`;
        }, 1500);
      } else {
        showEditIdMessage('❌ ' + (result.message || 'حدث خطأ أثناء تغيير ID'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showEditIdMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✏️</span> تحديث ID';
    }
  });

  function showEditIdMessage(text, type) {
    const msg = document.getElementById('editIdMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    msg.style.display = 'block';
  }

  // --- فتح modal حذف العميل ---
  window.openDeleteModal = () => {
    if (currentUser.role !== 'ادمن') {
      alert('⚠️ هذه الميزة متاحة للأدمن فقط');
      return;
    }
    deleteModal.setAttribute('aria-hidden', 'false');
  };

  // --- تأكيد حذف العميل ---
  confirmDeleteBtn.addEventListener('click', async () => {
    // الحصول على الشيفت النشط
    const currentShift = await getCurrentShift(currentUser.id);

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<span>⏳</span> جاري الحذف...';
    
    try {
      // حساب إجمالي رصيد العميل
      const totalBalance = parseFloat(clientData.balance_basic || 0) + 
                          parseFloat(clientData.balance_offers || 0) + 
                          parseFloat(clientData.balance_laser || 0) + 
                          parseFloat(clientData.balance_skin || 0) + 
                          parseFloat(clientData.balance_old || 0);

      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // إضافة عملية خصم للشيفت إذا كان هناك رصيد
        if (currentShift && totalBalance > 0) {
          await addShiftOperation(currentShift.id, {
            operation_type: 'حذف عميل',
            client_name: clientData.name,
            client_phone: clientData.phone,
            amount: totalBalance,
            payment_method: 'خصم من الخزنة',
            description: `حذف عميل برصيد ${totalBalance.toFixed(2)} ج - تم خصمه من الخزنة`
          });
          console.log('✅ تم تسجيل عملية الحذف في الشيفت');
        }

        alert('✅ ' + result.message);
        window.location.href = '/bookings/manageclients.html';
      } else {
        alert('❌ ' + (result.message || 'حدث خطأ أثناء حذف العميل'));
      }
    } catch (error) {
      console.error('Error:', error);
      alert('❌ حدث خطأ في الاتصال بالسيرفر');
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<span>🗑️</span> نعم، احذف';
      deleteModal.setAttribute('aria-hidden', 'true');
    }
  });

  // --- فتح نافذة الطباعة ---
  window.openPrintModal = (transactionId) => {
    fetch(`/api/clients/${clientId}/transactions`)
      .then(res => res.json())
      .then(transactions => {
        currentTransaction = transactions.find(t => t.id === transactionId);
        if (currentTransaction) {
          displayPrintContent(currentTransaction);
          printModal.setAttribute('aria-hidden', 'false');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('❌ حدث خطأ أثناء تحميل بيانات المعاملة');
      });
  };

// --- عرض محتوى الطباعة - نسخة محسّنة ---
function displayPrintContent(transaction) {
  const date = new Date(transaction.created_at).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  const amount = parseFloat(transaction.amount || 0).toFixed(2);
  const sign = transaction.amount >= 0 ? '+' : '';

  // إنشاء محتوى الطباعة
  const printHTML = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8">
      <title>إيصال - Joyce Beauty Salon</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Cairo', Arial, sans-serif;
          direction: rtl;
          padding: 30px;
          background: white;
        }
        
        .receipt {
          max-width: 800px;
          margin: 0 auto;
          background: white;
        }
        
        .header {
          text-align: center;
          padding-bottom: 25px;
          border-bottom: 4px solid #e91e63;
          margin-bottom: 30px;
        }
        
        .header h1 {
          margin: 0 0 15px;
          color: #e91e63;
          font-size: 36px;
          font-weight: 700;
        }
        
        .contacts {
          font-size: 16px;
          color: #666;
          line-height: 2.2;
        }
        
        .contacts div {
          margin: 8px 0;
        }
        
        .body {
          padding: 20px 0;
        }
        
        .row {
          display: flex;
          justify-content: space-between;
          padding: 18px 12px;
          border-bottom: 2px solid #e0e0e0;
        }
        
        .row.highlight {
          background: #f0f9ff;
        }
        
        .row.last {
          border-bottom: 4px solid #e91e63;
        }
        
        .label {
          font-weight: 700;
          color: #2d2d2d;
          font-size: 18px;
        }
        
        .value {
          font-weight: 600;
          color: #424242;
          font-size: 18px;
        }
        
        .amount {
          font-weight: 700;
          color: #4caf50;
          font-size: 22px;
        }
        
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 25px;
          border-top: 2px solid #e0e0e0;
          color: #999;
          font-size: 15px;
        }
        
        .footer p {
          margin: 10px 0;
        }
        
        @media print {
          body {
            padding: 10mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        
        <div class="header">
          <h1>💅 Joyce Beauty Salon</h1>
          <div class="contacts">
            <div>📱 01115619292</div>
            <div>📱 01111066761</div>
            <div>📍 شارع المستشفى الدولي أمام الإسعاف</div>
          </div>
        </div>
        
        <div class="body">
          
          <div class="row">
            <span class="label">اسم العميل:</span>
            <span class="value">${clientData.name}</span>
          </div>
          
          <div class="row">
            <span class="label">رقم الهاتف:</span>
            <span class="value" style="direction: ltr;">${clientData.phone}</span>
          </div>
          
          <div class="row">
            <span class="label">نوع المعاملة:</span>
            <span class="value">${transaction.transaction_type}</span>
          </div>
          
          <div class="row highlight">
            <span class="label">المبلغ:</span>
            <span class="amount">${sign}${amount} جنيه</span>
          </div>
          
          <div class="row">
            <span class="label">نوع الرصيد:</span>
            <span class="value">${transaction.balance_type}</span>
          </div>
          
          ${transaction.payment_method ? `
          <div class="row">
            <span class="label">طريقة الدفع:</span>
            <span class="value">${transaction.payment_method}</span>
          </div>
          ` : ''}
          
          <div class="row">
            <span class="label">بواسطة:</span>
            <span class="value">${transaction.created_by}</span>
          </div>
          
          ${transaction.notes ? `
          <div class="row">
            <span class="label">ملحوظة:</span>
            <span class="value">${transaction.notes}</span>
          </div>
          ` : ''}
          
          <div class="row last">
            <span class="label">التاريخ:</span>
            <span class="value">${date}</span>
          </div>
          
        </div>
        
        <div class="footer">
          <p>شكراً لثقتكم بنا 💖</p>
          <p><strong>Joyce Beauty Salon © 2025</strong></p>
        </div>
        
      </div>
    </body>
    </html>
  `;

  // عرض المحتوى في الـ Modal
  const printContent = document.getElementById('printContent');
  printContent.innerHTML = printHTML;
  
  // حفظ الـ HTML للطباعة
  printContent.dataset.printHtml = printHTML;
}

// --- طباعة - نسخة محسّنة ---
printBtn.addEventListener('click', () => {
  const printContent = document.getElementById('printContent');
  const printHTML = printContent.dataset.printHtml;
  
  if (!printHTML) {
    alert('⚠️ لا يوجد محتوى للطباعة');
    return;
  }
  
  // فتح نافذة جديدة للطباعة
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(printHTML);
  printWindow.document.close();
  
  // انتظار تحميل المحتوى ثم الطباعة
  printWindow.onload = function() {
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = function() {
      printWindow.close();
    };
  };
});
  // --- إغلاق النوافذ ---
  closePrintModalBtn.addEventListener('click', () => {
    printModal.setAttribute('aria-hidden', 'true');
  });

  cancelPrintBtn.addEventListener('click', () => {
    printModal.setAttribute('aria-hidden', 'true');
  });

  closeChargeBtn.addEventListener('click', () => {
    chargeModal.setAttribute('aria-hidden', 'true');
  });

  cancelChargeBtn.addEventListener('click', () => {
    chargeModal.setAttribute('aria-hidden', 'true');
  });

  closeTransferBtn.addEventListener('click', () => {
    transferModal.setAttribute('aria-hidden', 'true');
  });

  cancelTransferBtn.addEventListener('click', () => {
    transferModal.setAttribute('aria-hidden', 'true');
  });

  closeTransferClientBtn.addEventListener('click', () => {
    transferClientModal.setAttribute('aria-hidden', 'true');
  });

  cancelTransferClientBtn.addEventListener('click', () => {
    transferClientModal.setAttribute('aria-hidden', 'true');
  });

  closeDeleteBtn.addEventListener('click', () => {
    deleteModal.setAttribute('aria-hidden', 'true');
  });

  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.setAttribute('aria-hidden', 'true');
  });

closeEditIdBtn.addEventListener('click', () => {
    editIdModal.setAttribute('aria-hidden', 'true');
  });

  cancelEditIdBtn.addEventListener('click', () => {
    editIdModal.setAttribute('aria-hidden', 'true');
  });

  closeEditPhoneBtn.addEventListener('click', () => {
    editPhoneModal.setAttribute('aria-hidden', 'true');
  });

  cancelEditPhoneBtn.addEventListener('click', () => {
    editPhoneModal.setAttribute('aria-hidden', 'true');
  });

  closeEditEmailBtn.addEventListener('click', () => {
    editEmailModal.setAttribute('aria-hidden', 'true');
  });

  cancelEditEmailBtn.addEventListener('click', () => {
    editEmailModal.setAttribute('aria-hidden', 'true');
  });

  closeBuyOfferBtn.addEventListener('click', () => {
    buyOfferModal.setAttribute('aria-hidden', 'true');
  });

  cancelBuyOfferBtn.addEventListener('click', () => {
    buyOfferModal.setAttribute('aria-hidden', 'true');
  });


  // --- إغلاق بالضغط على Escape ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      printModal.setAttribute('aria-hidden', 'true');
      chargeModal.setAttribute('aria-hidden', 'true');
      transferModal.setAttribute('aria-hidden', 'true');
      transferClientModal.setAttribute('aria-hidden', 'true');
      deleteModal.setAttribute('aria-hidden', 'true');
      editIdModal.setAttribute('aria-hidden', 'true');
      editPhoneModal.setAttribute('aria-hidden', 'true');
      editEmailModal.setAttribute('aria-hidden', 'true');
      buyOfferModal.setAttribute('aria-hidden', 'true');
      if (editAdditionalPhoneModal) {
        editAdditionalPhoneModal.setAttribute('aria-hidden', 'true');
      }
    }
  });

  // تحسين الطباعة
window.addEventListener('beforeprint', () => {
  // إخفاء كل العناصر غير المطلوبة
  document.querySelectorAll('.modal-backdrop, .site-header, .tabs-nav, button:not(#printBtn)').forEach(el => {
    el.style.display = 'none';
  });
});

window.addEventListener('afterprint', () => {
  // إعادة إظهار العناصر
  window.location.reload();
});

// --- تحميل البيانات عند فتح الصفحة ---
  await loadClientData();

  // ⭐ حط الكود هنا ⭐
  closeAddPhoneBtn.addEventListener('click', () => {
    addPhoneModal.setAttribute('aria-hidden', 'true');
  });

  cancelAddPhoneBtn.addEventListener('click', () => {
    addPhoneModal.setAttribute('aria-hidden', 'true');
  });
  // إغلاق modal تعديل رقم إضافي
  if (closeEditAdditionalPhoneBtn) {
    closeEditAdditionalPhoneBtn.addEventListener('click', () => {
      editAdditionalPhoneModal.setAttribute('aria-hidden', 'true');
    });
  }

  if (cancelEditAdditionalPhoneBtn) {
    cancelEditAdditionalPhoneBtn.addEventListener('click', () => {
      editAdditionalPhoneModal.setAttribute('aria-hidden', 'true');
    });
  }
  // --- إضافة دالة تعديل رقم إضافي ---
window.editAdditionalPhone = async (phoneId) => {
  if (currentUser.role !== 'ادمن') {
    alert('⚠️ هذه الميزة متاحة للأدمن فقط');
    return;
  }
  
  try {
    const phonesRes = await fetch(`/api/clients/${clientId}/phones`);
    const phones = await phonesRes.json();
    const phone = phones.find(p => p.id === phoneId);
    
    if (!phone) {
      alert('❌ الرقم غير موجود');
      return;
    }
    
    document.getElementById('editAdditionalPhoneId').value = phoneId;
    document.getElementById('editAdditionalPhone').value = phone.phone;
    document.getElementById('editAdditionalPhoneType').value = phone.phone_type || 'إضافي';
    document.getElementById('editAdditionalPhoneNotes').value = phone.notes || '';
    document.getElementById('editAdditionalPhoneMessage').style.display = 'none';
    
    editAdditionalPhoneModal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    console.error('Error:', error);
    alert('❌ حدث خطأ أثناء جلب بيانات الرقم');
  }
};

// --- معالجة تعديل رقم إضافي ---
if (editAdditionalPhoneForm) {
  editAdditionalPhoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneId = document.getElementById('editAdditionalPhoneId').value;
    const phone = document.getElementById('editAdditionalPhone').value.trim();
    const phoneType = document.getElementById('editAdditionalPhoneType').value;
    const notes = document.getElementById('editAdditionalPhoneNotes').value.trim();
    
    if (!/^01[0-9]{9}$/.test(phone)) {
      showEditAdditionalPhoneMessage('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
      return;
    }

    const submitBtn = editAdditionalPhoneForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري التحديث...';
    
    try {
      const response = await fetch(`/api/clients/${clientId}/phones/${phoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phone,
          phone_type: phoneType,
          notes: notes || null
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        showEditAdditionalPhoneMessage('✅ تم تحديث الرقم بنجاح', 'success');
        setTimeout(() => {
          editAdditionalPhoneModal.setAttribute('aria-hidden', 'true');
          loadAdditionalPhones();
        }, 1500);
      } else {
        showEditAdditionalPhoneMessage('❌ ' + (result.message || 'حدث خطأ أثناء التحديث'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showEditAdditionalPhoneMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✏️</span> تحديث الرقم';
    }
  });
}

function showEditAdditionalPhoneMessage(text, type) {
  const msg = document.getElementById('editAdditionalPhoneMessage');
  msg.textContent = text;
  msg.className = `message ${type}`;
  msg.style.display = 'block';
}

  console.log('✅ تم تحميل صفحة تفاصيل العميل بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
  console.log('🆔 العميل:', clientId);
  // --- جلب الزيارات (الجلسات المنتهية) ---
  let allVisits = [];

  async function loadVisits() {
    const loadingEl = document.getElementById('loadingVisits');
    const contentEl = document.getElementById('visitsContent');
    const listEl = document.getElementById('visitsList');
    const emptyEl = document.getElementById('emptyVisits');

    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';

    try {
      const response = await fetch(`/api/clients/${clientId}/visits`);
      if (!response.ok) {
        throw new Error('فشل في جلب الزيارات');
      }

      const visits = await response.json();
      allVisits = visits;

      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';

      if (visits.length === 0) {
        emptyEl.style.display = 'block';
        listEl.innerHTML = '';
        return;
      }

      emptyEl.style.display = 'none';
      displayVisits(visits);
    } catch (error) {
      console.error('Error loading visits:', error);
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      listEl.innerHTML = '<p style="color: var(--error); text-align: center; padding: 40px;">❌ حدث خطأ أثناء تحميل الزيارات</p>';
    }
  }
  // --- جلب الحجوزات ---
let allBookings = [];

async function loadBookings() {
  const loadingEl = document.getElementById('loadingBookings');
  const contentEl = document.getElementById('bookingsContent');
  const listEl = document.getElementById('bookingsList');
  const emptyEl = document.getElementById('emptyBookings');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const response = await fetch(`/api/clients/${clientId}/bookings`);
    if (!response.ok) {
      throw new Error('فشل في جلب الحجوزات');
    }

    const bookings = await response.json();
    allBookings = bookings;

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    if (bookings.length === 0) {
      emptyEl.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    displayBookings(bookings);
  } catch (error) {
    console.error('Error loading bookings:', error);
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    listEl.innerHTML = '<p style="color: var(--error); text-align: center; padding: 40px;">❌ حدث خطأ أثناء تحميل الحجوزات</p>';
  }
}

// --- عرض الحجوزات ---
function displayBookings(bookings) {
  const listEl = document.getElementById('bookingsList');

  const html = bookings.map(booking => {
    // ⭐ إصلاح التاريخ باستخدام التوقيت المحلي المصري
    let date = 'تاريخ غير محدد';
    
    try {
      if (booking.booking_date) {
        // تحويل التاريخ من UTC إلى التوقيت المحلي
        const bookingDate = new Date(booking.booking_date);
        
        // إضافة الوقت إذا كان متاح
        if (booking.start_time && booking.start_time !== '1970-01-01T10:00:00.000Z') {
          const timeMatch = booking.start_time.match(/T(\d{2}):(\d{2})/);
          if (timeMatch) {
            bookingDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
          }
        }
        
        // تنسيق التاريخ بالتوقيت المحلي
        if (!isNaN(bookingDate.getTime())) {
          const day = bookingDate.getDate();
          const month = bookingDate.getMonth() + 1;
          const year = bookingDate.getFullYear();
          let hours = bookingDate.getHours();
          const minutes = bookingDate.getMinutes();
          const ampm = hours >= 12 ? 'pm' : 'am';
          
          hours = hours % 12;
          hours = hours ? hours : 12; // الساعة 0 تصبح 12
          
          const minutesStr = minutes < 10 ? '0' + minutes : minutes;
          
          date = `${hours}:${minutesStr} ${ampm} ${day}-${month}-${year}`;
        }
      }
      
      // إذا فشل، استخدم created_at
      if (date === 'تاريخ غير محدد' && booking.created_at) {
        const createdDate = new Date(booking.created_at);
        if (!isNaN(createdDate.getTime())) {
          const day = createdDate.getDate();
          const month = createdDate.getMonth() + 1;
          const year = createdDate.getFullYear();
          let hours = createdDate.getHours();
          const minutes = createdDate.getMinutes();
          const ampm = hours >= 12 ? 'pm' : 'am';
          
          hours = hours % 12;
          hours = hours ? hours : 12;
          
          const minutesStr = minutes < 10 ? '0' + minutes : minutes;
          
          date = `${hours}:${minutesStr} ${ampm} ${day}-${month}-${year}`;
        }
      }
    } catch (e) {
      console.error('Error parsing date:', e);
    }

    let services = [];
    try {
      if (typeof booking.services === 'string') {
        services = JSON.parse(booking.services);
      } else if (Array.isArray(booking.services)) {
        services = booking.services;
      }
    } catch (e) {
      console.error('Error parsing services:', e);
    }

    const servicesText = services.length > 0 
      ? services.map(s => s.service_name || 'خدمة').join(' و ') 
      : 'لا توجد خدمات';
    
    // ⭐ التحقق من نوع الحجز
    const isUnpaid = booking.notes && (
      booking.notes.includes('[حجز مؤجل الدفع]') || 
      booking.notes.includes('[حجز غير مدفوع]') ||
      booking.notes.includes('[خدمات غير مدفوعة]')
    );
    const paymentType = isUnpaid ? '⚠️ دفع مؤجل' : '✅ مدفوع';
    const paymentColor = isUnpaid ? '#ff9800' : '#4caf50';

    return `
      <div class="visit-card" style="background: white; border: 2px solid ${isUnpaid ? '#ff9800' : '#e0e0e0'}; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <strong>👤 اسم العميل:</strong>
            <div style="color: #424242; margin-top: 4px;">${booking.client_name || 'غير محدد'}</div>
          </div>
          <div>
            <strong>👨‍⚕️ اسم الدكتور:</strong>
            <div style="color: #424242; margin-top: 4px;">${booking.doctor_name || 'غير محدد'}</div>
          </div>
          <div>
            <strong>📅 تاريخ الحجز:</strong>
            <div style="color: #424242; margin-top: 4px;">${date}</div>
          </div>
          <div>
            <strong>👤 تم الحجز بواسطة:</strong>
            <div style="color: #424242; margin-top: 4px;">${booking.created_by || 'غير محدد'}</div>
          </div>
        </div>

        <div style="border-top: 2px dashed #e0e0e0; padding-top: 16px; margin-top: 16px;">
          <strong>📝 ملاحظة:</strong>
          <div style="color: #757575; margin-top: 8px;">
            عمل ${servicesText}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 2px solid #e0e0e0;">
          <div>
            <strong>📊 حالة الحجز:</strong>
            <div style="margin-top: 8px;">
              <span style="display: inline-block; padding: 6px 12px; background: #e3f2fd; color: #1565c0; border-radius: 20px; font-weight: 600;">
                ${booking.status || 'غير محدد'}
              </span>
            </div>
          </div>
          <div>
            <strong>💳 نوع الحجز:</strong>
            <div style="margin-top: 8px;">
              <span style="display: inline-block; padding: 6px 12px; background: ${paymentColor}20; color: ${paymentColor}; border-radius: 20px; font-weight: 600;">
                ${paymentType}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
}

// --- فلترة الحجوزات ---
window.filterBookings = () => {
  const startDate = document.getElementById('filterBookingsStartDate').value;
  const endDate = document.getElementById('filterBookingsEndDate').value;

  let filtered = [...allBookings];

  if (startDate) {
    filtered = filtered.filter(b => b.booking_date >= startDate);
  }

  if (endDate) {
    filtered = filtered.filter(b => b.booking_date <= endDate);
  }

  displayBookings(filtered);

  if (filtered.length === 0) {
    document.getElementById('emptyBookings').style.display = 'block';
    document.getElementById('bookingsList').innerHTML = '';
  } else {
    document.getElementById('emptyBookings').style.display = 'none';
  }
};

// --- مسح الفلاتر ---
window.clearBookingsFilters = () => {
  document.getElementById('filterBookingsStartDate').value = '';
  document.getElementById('filterBookingsEndDate').value = '';
  displayBookings(allBookings);
  document.getElementById('emptyBookings').style.display = allBookings.length === 0 ? 'block' : 'none';
};

  // --- عرض الزيارات ---
  function displayVisits(visits) {
    const listEl = document.getElementById('visitsList');

    const html = visits.map(visit => {
      const date = new Date(visit.booking_date + ' ' + visit.start_time).toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let services = [];
      try {
        services = JSON.parse(visit.services);
      } catch (e) {
        console.error('Error parsing services:', e);
      }

      const totalPrice = parseFloat(visit.total_price || 0).toFixed(2);

      return `
        <div class="visit-card" style="background: white; border: 2px solid #e0e0e0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
            <div>
              <div style="font-size: 16px; color: #757575; margin-bottom: 8px;">
                📅 ${date}
              </div>
              <div style="font-size: 14px; color: #9e9e9e;">
                👨‍⚕️ ${visit.doctor_name || 'غير محدد'}
              </div>
            </div>
            <div style="text-align: left;">
              <div style="font-size: 18px; font-weight: 700; color: #4caf50;">
                💰 ${totalPrice} جنيه
              </div>
              <div style="font-size: 14px; color: #757575; margin-top: 4px;">
                ⏱️ ${visit.total_duration || 0} دقيقة
              </div>
            </div>
          </div>

          <div style="border-top: 2px dashed #e0e0e0; padding-top: 16px;">
            <h4 style="margin: 0 0 12px; color: #2d2d2d; font-size: 16px;">الخدمات (${services.length}):</h4>
            ${services.map((service, index) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9f9f9; border-radius: 8px; margin-bottom: 8px;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: #424242; margin-bottom: 4px;">
                    ${service.service_name}
                  </div>
                  <div style="font-size: 13px; color: #757575;">
                    ${service.duration} دقيقة - ${parseFloat(service.price).toFixed(2)} جنيه
                  </div>
                </div>
                <button 
                  onclick="window.showServiceReport(${visit.booking_id}, ${service.service_id}, ${index})"
                  style="background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
                  📋 إظهار التقرير
                </button>
              </div>
            `).join('')}
          </div>

          <div style="border-top: 2px solid #e0e0e0; padding-top: 12px; margin-top: 12px;">
            <div style="font-size: 13px; color: #757575;">
              👤 تم الحجز بواسطة: ${visit.created_by || 'غير محدد'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;
  }

  // --- فلترة الزيارات بالتاريخ ---
  window.filterVisits = () => {
    const startDate = document.getElementById('filterVisitsStartDate').value;
    const endDate = document.getElementById('filterVisitsEndDate').value;

    let filtered = [...allVisits];

    if (startDate) {
      filtered = filtered.filter(v => v.booking_date >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(v => v.booking_date <= endDate);
    }

    displayVisits(filtered);

    if (filtered.length === 0) {
      document.getElementById('emptyVisits').style.display = 'block';
      document.getElementById('visitsList').innerHTML = '';
    } else {
      document.getElementById('emptyVisits').style.display = 'none';
    }
  };

  // --- مسح الفلاتر ---
  window.clearVisitsFilters = () => {
    document.getElementById('filterVisitsStartDate').value = '';
    document.getElementById('filterVisitsEndDate').value = '';
    displayVisits(allVisits);
    document.getElementById('emptyVisits').style.display = allVisits.length === 0 ? 'block' : 'none';
  };

  // --- إظهار تقرير الخدمة في modal ---
  window.showServiceReport = async (bookingId, serviceId, serviceIndex) => {
    try {
      const response = await fetch(`/api/session-details/${bookingId}`);
      if (!response.ok) {
        alert('❌ لا يوجد تقرير لهذه الخدمة');
        return;
      }

      const details = await response.json();
      const serviceDetail = details.find(d => 
        d.service_id === serviceId && d.service_index === serviceIndex
      );

      if (!serviceDetail) {
        alert('❌ لا يوجد تقرير مسجل لهذه الخدمة');
        return;
      }

      // إنشاء modal للتقرير
      let reportModal = document.getElementById('reportModal');
      if (!reportModal) {
        reportModal = document.createElement('div');
        reportModal.id = 'reportModal';
        reportModal.className = 'modal';
        reportModal.setAttribute('aria-hidden', 'true');
        reportModal.innerHTML = `
          <div class="modal-backdrop"></div>
          <div class="modal-inner">
            <button class="close-btn" onclick="document.getElementById('reportModal').setAttribute('aria-hidden', 'true')">✖</button>
            <h2 style="margin: 0 0 24px; color: var(--primary); text-align: center;">📋 تقرير الخدمة</h2>
            <div id="reportContent" style="padding: 20px; background: #f9f9f9; border-radius: 8px;"></div>
            <div class="form-actions" style="margin-top: 20px;">
              <button class="btn btn-secondary" onclick="document.getElementById('reportModal').setAttribute('aria-hidden', 'true')">
                <span>✖</span>
                إغلاق
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(reportModal);
      }

      const reportContent = document.getElementById('reportContent');
      
      if (serviceDetail.detail_type === 'laser') {
        reportContent.innerHTML = `
          <div style="display: grid; gap: 16px;">
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>اسم الخدمة:</strong>
              <span>${serviceDetail.service_name}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>رقم الجلسة:</strong>
              <span>${serviceDetail.session_number || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>نوع الجلسة:</strong>
              <span>${serviceDetail.session_type || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>Pulses:</strong>
              <span>${serviceDetail.pulses || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>Power:</strong>
              <span>${serviceDetail.power || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>Puls Duration:</strong>
              <span>${serviceDetail.puls_duration || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>Spot Size:</strong>
              <span>${serviceDetail.spot_size || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>نوع البشرة:</strong>
              <span>${serviceDetail.skin_type || '--'}</span>
            </div>
            ${serviceDetail.notes ? `
              <div style="padding: 12px; background: white; border-radius: 6px;">
                <strong style="display: block; margin-bottom: 8px;">ملاحظات:</strong>
                <p style="margin: 0; color: #757575;">${serviceDetail.notes}</p>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>الطبيب:</strong>
              <span>${serviceDetail.doctor_name} (${serviceDetail.doctor_role})</span>
            </div>
          </div>
        `;
      } else if (serviceDetail.detail_type === 'skin') {
        reportContent.innerHTML = `
          <div style="display: grid; gap: 16px;">
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>اسم الخدمة:</strong>
              <span>${serviceDetail.service_name}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>المنتج المستخدم:</strong>
              <span>${serviceDetail.product_used || '--'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>الكمية:</strong>
              <span>${serviceDetail.quantity || '--'}</span>
            </div>
            ${serviceDetail.notes ? `
              <div style="padding: 12px; background: white; border-radius: 6px;">
                <strong style="display: block; margin-bottom: 8px;">ملاحظات:</strong>
                <p style="margin: 0; color: #757575;">${serviceDetail.notes}</p>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 6px;">
              <strong>الطبيب:</strong>
              <span>${serviceDetail.doctor_name} (${serviceDetail.doctor_role})</span>
            </div>
          </div>
        `;
      }

      reportModal.setAttribute('aria-hidden', 'false');

    } catch (error) {
      console.error('Error loading report:', error);
      alert('❌ حدث خطأ في تحميل التقرير');
    }
  };
});