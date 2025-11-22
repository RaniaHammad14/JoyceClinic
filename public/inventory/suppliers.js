// public/inventory/suppliers.js

let suppliersData = [];
let invoicesData = [];
let paymentsData = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  // التحقق من تسجيل الدخول
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }

  currentUser = JSON.parse(raw);

  // إعداد التاريخ الحالي
  const today = new Date().toISOString().split('T')[0];
  const invoiceDateInput = document.getElementById('invoiceDate');
  const paymentDateInput = document.getElementById('paymentDate');
  if (invoiceDateInput) invoiceDateInput.value = today;
  if (paymentDateInput) paymentDateInput.value = today;

  // إعداد التبويبات
  setupTabs();

  // إعداد أزرار الإضافة
  document.getElementById('addSupplierBtn')?.addEventListener('click', () => openModal('addSupplierModal'));
  document.getElementById('addInvoiceBtn')?.addEventListener('click', () => openModal('addInvoiceModal'));
  document.getElementById('addPaymentBtn')?.addEventListener('click', () => openModal('addPaymentModal'));

  // إعداد نماذج الإضافة
  document.getElementById('addSupplierForm')?.addEventListener('submit', handleAddSupplier);
  document.getElementById('addInvoiceForm')?.addEventListener('submit', handleAddInvoice);
  document.getElementById('addPaymentForm')?.addEventListener('submit', handleAddPayment);

  // إعداد البحث والفلترة
  setupSearchAndFilters();

  // تحميل البيانات
  loadAllData();

  console.log('✅ تم تحميل صفحة الموردين بنجاح');
});

// تحميل جميع البيانات
async function loadAllData() {
  await Promise.all([
    loadSuppliers(),
    loadInvoices(),
    loadPayments(),
    updateStats()
  ]);
}

// إعداد التبويبات
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`)?.classList.add('active');
    });
  });
}

// فتح نافذة منبثقة
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    
    if (modalId === 'addInvoiceModal' || modalId === 'addPaymentModal') {
      updateSuppliersDropdown();
    }
  }
}

// إغلاق نافذة منبثقة
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    const form = modal.querySelector('form');
    if (form) form.reset();
  }
}

// تحديث قائمة الموردين في القوائم المنسدلة
function updateSuppliersDropdown() {
  const invoiceSupplierSelect = document.getElementById('invoiceSupplier');
  const paymentSupplierSelect = document.getElementById('paymentSupplier');
  
  const options = suppliersData
    .filter(s => s.status === 'active')
    .map(s => `<option value="${s.id}">${s.name}</option>`)
    .join('');
  
  if (invoiceSupplierSelect) {
    invoiceSupplierSelect.innerHTML = '<option value="">اختر المورد</option>' + options;
  }
  
  if (paymentSupplierSelect) {
    paymentSupplierSelect.innerHTML = '<option value="">اختر المورد</option>' + options;
  }
}

// إضافة مورد جديد
async function handleAddSupplier(e) {
  e.preventDefault();
  
  const supplierData = {
    name: document.getElementById('supplierName').value.trim(),
    phone: document.getElementById('supplierPhone').value.trim(),
    email: document.getElementById('supplierEmail').value.trim(),
    company: document.getElementById('supplierCompany').value.trim(),
    address: document.getElementById('supplierAddress').value.trim(),
    balance: parseFloat(document.getElementById('supplierBalance').value) || 0,
    credit_limit: parseFloat(document.getElementById('supplierCreditLimit').value) || 0,
    notes: document.getElementById('supplierNotes').value.trim()
  };
  
  try {
    const response = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplierData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addSupplierModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding supplier:', error);
    showNotification('حدث خطأ أثناء إضافة المورد', 'error');
  }
}

// إضافة فاتورة جديدة
async function handleAddInvoice(e) {
  e.preventDefault();
  
  const invoiceData = {
    invoice_number: document.getElementById('invoiceNumber').value.trim(),
    supplier_id: parseInt(document.getElementById('invoiceSupplier').value),
    invoice_date: document.getElementById('invoiceDate').value,
    due_date: document.getElementById('invoiceDueDate').value || null,
    total_amount: parseFloat(document.getElementById('invoiceAmount').value),
    paid_amount: parseFloat(document.getElementById('invoicePaid').value) || 0,
    description: document.getElementById('invoiceDescription').value.trim()
  };
  
  try {
    const response = await fetch('/api/supplier-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addInvoiceModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding invoice:', error);
    showNotification('حدث خطأ أثناء إضافة الفاتورة', 'error');
  }
}

// إضافة دفعة جديدة
async function handleAddPayment(e) {
  e.preventDefault();
  
  const paymentData = {
    invoice_id: parseInt(document.getElementById('paymentInvoice').value),
    supplier_id: parseInt(document.getElementById('paymentSupplier').value),
    amount: parseFloat(document.getElementById('paymentAmount').value),
    payment_method: document.getElementById('paymentMethod').value,
    payment_date: document.getElementById('paymentDate').value,
    reference_number: document.getElementById('paymentReference').value.trim(),
    notes: document.getElementById('paymentNotes').value.trim(),
    created_by: currentUser.name
  };
  
  try {
    const response = await fetch('/api/supplier-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addPaymentModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding payment:', error);
    showNotification('حدث خطأ أثناء تسجيل الدفعة', 'error');
  }
}

// تحميل الموردين
async function loadSuppliers() {
  try {
    const response = await fetch('/api/suppliers');
    suppliersData = await response.json();
    
    const tbody = document.getElementById('suppliersTableBody');
    
    if (suppliersData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">
            <div class="no-data-message">
              <span class="no-data-icon">📦</span>
              <p>لا توجد موردين مسجلين</p>
              <small>قم بإضافة مورد جديد للبدء</small>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = suppliersData.map(supplier => `
      <tr>
        <td>#${supplier.id}</td>
        <td><strong>${supplier.name}</strong></td>
        <td>${supplier.phone || '-'}</td>
        <td>${supplier.address || '-'}</td>
        <td><strong style="color: ${supplier.balance > 0 ? 'var(--danger)' : 'var(--success)'}">
          ${parseFloat(supplier.balance).toFixed(2)} ج
        </strong></td>
        <td>${formatDate(supplier.last_transaction)}</td>
        <td><span class="badge ${supplier.status}">${supplier.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
        <td>
          <button class="action-btn view" onclick="viewSupplier(${supplier.id})">عرض</button>
          <button class="action-btn edit" onclick="editSupplier(${supplier.id})">تعديل</button>
          <button class="action-btn delete" onclick="deleteSupplier(${supplier.id})">حذف</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading suppliers:', error);
    showNotification('حدث خطأ أثناء تحميل الموردين', 'error');
  }
}

// تحميل الفواتير
async function loadInvoices() {
  try {
    const response = await fetch('/api/supplier-invoices');
    invoicesData = await response.json();
    
    const tbody = document.getElementById('invoicesTableBody');
    
    if (invoicesData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">
            <div class="no-data-message">
              <span class="no-data-icon">📄</span>
              <p>لا توجد فواتير</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = invoicesData.map(invoice => `
      <tr>
        <td><strong>${invoice.invoice_number}</strong></td>
        <td>${invoice.supplier_name}</td>
        <td>${formatDate(invoice.invoice_date)}</td>
        <td>${parseFloat(invoice.total_amount).toFixed(2)} ج</td>
        <td style="color: var(--success)">${parseFloat(invoice.paid_amount).toFixed(2)} ج</td>
        <td style="color: var(--danger)">${parseFloat(invoice.remaining_amount).toFixed(2)} ج</td>
        <td><span class="badge ${invoice.status}">
          ${invoice.status === 'paid' ? 'مدفوعة' : (invoice.status === 'partial' ? 'مدفوعة جزئياً' : 'معلقة')}
        </span></td>
        <td>
          <button class="action-btn view" onclick="viewInvoice(${invoice.id})">عرض</button>
          <button class="action-btn delete" onclick="deleteInvoice(${invoice.id})">حذف</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading invoices:', error);
    showNotification('حدث خطأ أثناء تحميل الفواتير', 'error');
  }
}

// تحميل المدفوعات
async function loadPayments() {
  try {
    const response = await fetch('/api/supplier-payments');
    paymentsData = await response.json();
    
    const tbody = document.getElementById('paymentsTableBody');
    
    if (paymentsData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">
            <div class="no-data-message">
              <span class="no-data-icon">💳</span>
              <p>لا توجد مدفوعات مسجلة</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = paymentsData.map(payment => `
      <tr>
        <td>#${payment.id}</td>
        <td>${payment.supplier_name}</td>
        <td>${payment.invoice_number}</td>
        <td><strong style="color: var(--success)">${parseFloat(payment.amount).toFixed(2)} ج</strong></td>
        <td>${getPaymentMethodLabel(payment.payment_method)}</td>
        <td>${formatDate(payment.payment_date)}</td>
        <td>${payment.notes || '-'}</td>
        <td>
          <button class="action-btn view" onclick="viewPayment(${payment.id})">عرض</button>
          <button class="action-btn delete" onclick="deletePayment(${payment.id})">حذف</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading payments:', error);
    showNotification('حدث خطأ أثناء تحميل المدفوعات', 'error');
  }
}

// تحديث الإحصائيات - مع إصلاح الخطأ
async function updateStats() {
  try {
    const response = await fetch('/api/suppliers/stats');
    
    // تحقق من نجاح الطلب
    if (!response.ok) {
      console.error('Failed to fetch stats:', response.status);
      // استخدم بيانات افتراضية في حالة الفشل
      document.getElementById('totalSuppliers').textContent = suppliersData.length || 0;
      document.getElementById('totalDue').textContent = '0.00 ج';
      document.getElementById('monthlyPaid').textContent = '0.00 ج';
      document.getElementById('pendingInvoices').textContent = '0';
      return;
    }
    
    const stats = await response.json();
    
    // تحديث العناصر بأمان مع التحقق من القيم
    document.getElementById('totalSuppliers').textContent = stats.total_suppliers || 0;
    document.getElementById('totalDue').textContent = `${(stats.total_due || 0).toFixed(2)} ج`;
    document.getElementById('monthlyPaid').textContent = `${(stats.monthly_payments || 0).toFixed(2)} ج`;
    document.getElementById('pendingInvoices').textContent = stats.pending_invoices || 0;
  } catch (error) {
    console.error('Error updating stats:', error);
    // استخدم بيانات افتراضية في حالة الخطأ
    document.getElementById('totalSuppliers').textContent = suppliersData.length || 0;
    document.getElementById('totalDue').textContent = '0.00 ج';
    document.getElementById('monthlyPaid').textContent = '0.00 ج';
    document.getElementById('pendingInvoices').textContent = '0';
  }
}

// تحميل فواتير مورد معين
async function loadSupplierInvoices(supplierId) {
  const select = document.getElementById('paymentInvoice');
  
  if (!supplierId) {
    select.innerHTML = '<option value="">اختر الفاتورة</option>';
    return;
  }
  
  try {
    const response = await fetch(`/api/suppliers/${supplierId}/invoices`);
    const invoices = await response.json();
    
    const pendingInvoices = invoices.filter(inv => parseFloat(inv.remaining_amount) > 0);
    
    if (pendingInvoices.length === 0) {
      select.innerHTML = '<option value="">لا توجد فواتير معلقة</option>';
      return;
    }
    
    select.innerHTML = '<option value="">اختر الفاتورة</option>' + 
      pendingInvoices.map(inv => 
        `<option value="${inv.id}">${inv.invoice_number} - المتبقي: ${parseFloat(inv.remaining_amount).toFixed(2)} ج</option>`
      ).join('');
  } catch (error) {
    console.error('Error loading supplier invoices:', error);
    select.innerHTML = '<option value="">خطأ في التحميل</option>';
  }
}

// إعداد البحث والفلترة
function setupSearchAndFilters() {
  document.getElementById('searchSuppliers')?.addEventListener('input', filterSuppliers);
  document.getElementById('filterSupplierStatus')?.addEventListener('change', filterSuppliers);
  document.getElementById('sortSuppliers')?.addEventListener('change', filterSuppliers);
  
  document.getElementById('paymentSupplier')?.addEventListener('change', (e) => {
    loadSupplierInvoices(e.target.value);
  });
}

function filterSuppliers() {
  const searchTerm = document.getElementById('searchSuppliers')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('filterSupplierStatus')?.value || 'all';
  const sortBy = document.getElementById('sortSuppliers')?.value || 'name';
  
  let filtered = [...suppliersData];
  
  if (searchTerm) {
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(searchTerm) ||
      (s.phone && s.phone.includes(searchTerm)) ||
      (s.company && s.company.toLowerCase().includes(searchTerm))
    );
  }
  
  if (statusFilter !== 'all') {
    filtered = filtered.filter(s => s.status === statusFilter);
  }
  
  if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  } else if (sortBy === 'due') {
    filtered.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));
  } else if (sortBy === 'recent') {
    filtered.sort((a, b) => new Date(b.last_transaction) - new Date(a.last_transaction));
  }
  
  const tbody = document.getElementById('suppliersTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-data">
          <div class="no-data-message">
            <span class="no-data-icon">🔍</span>
            <p>لا توجد نتائج</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filtered.map(supplier => `
    <tr>
      <td>#${supplier.id}</td>
      <td><strong>${supplier.name}</strong></td>
      <td>${supplier.phone || '-'}</td>
      <td>${supplier.address || '-'}</td>
      <td><strong style="color: ${supplier.balance > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${parseFloat(supplier.balance).toFixed(2)} ج
      </strong></td>
      <td>${formatDate(supplier.last_transaction)}</td>
      <td><span class="badge ${supplier.status}">${supplier.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
      <td>
        <button class="action-btn view" onclick="viewSupplier(${supplier.id})">عرض</button>
        <button class="action-btn edit" onclick="editSupplier(${supplier.id})">تعديل</button>
        <button class="action-btn delete" onclick="deleteSupplier(${supplier.id})">حذف</button>
      </td>
    </tr>
  `).join('');
}

// عرض تفاصيل مورد
function viewSupplier(id) {
  const supplier = suppliersData.find(s => s.id === id);
  if (supplier) {
    const details = `
تفاصيل المورد:

الاسم: ${supplier.name}
الهاتف: ${supplier.phone || '-'}
البريد: ${supplier.email || '-'}
الشركة: ${supplier.company || '-'}
العنوان: ${supplier.address || '-'}
الرصيد: ${parseFloat(supplier.balance).toFixed(2)} ج
الحد الائتماني: ${parseFloat(supplier.credit_limit).toFixed(2)} ج
الحالة: ${supplier.status === 'active' ? 'نشط' : 'غير نشط'}
ملاحظات: ${supplier.notes || '-'}
    `;
    alert(details);
  }
}

// تعديل مورد
function editSupplier(id) {
  showNotification('ميزة التعديل قيد التطوير', 'info');
}

// حذف مورد
async function deleteSupplier(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المورد؟\nسيتم حذف جميع الفواتير والمدفوعات المرتبطة به.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/suppliers/${id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error deleting supplier:', error);
    showNotification('حدث خطأ أثناء حذف المورد', 'error');
  }
}

// حذف فاتورة
async function deleteInvoice(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/supplier-invoices/${id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error deleting invoice:', error);
    showNotification('حدث خطأ أثناء حذف الفاتورة', 'error');
  }
}

// حذف دفعة
async function deletePayment(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الدفعة؟')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/supplier-payments/${id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error deleting payment:', error);
    showNotification('حدث خطأ أثناء حذف الدفعة', 'error');
  }
}

// وظائف التقارير - الآن فعلية وليست وهمية!
function generateSupplierReport() {
  if (suppliersData.length === 0) {
    showNotification('لا توجد بيانات موردين لإنشاء التقرير', 'error');
    return;
  }
  
  // إنشاء تقرير شامل بصيغة نصية
  let report = '====== تقرير الموردين الشامل ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد الموردين: ${suppliersData.length}\n\n`;
  
  report += '--- تفاصيل الموردين ---\n\n';
  suppliersData.forEach(supplier => {
    report += `المورد: ${supplier.name}\n`;
    report += `الهاتف: ${supplier.phone || '-'}\n`;
    report += `الشركة: ${supplier.company || '-'}\n`;
    report += `المستحقات: ${parseFloat(supplier.balance).toFixed(2)} ج\n`;
    report += `الحالة: ${supplier.status === 'active' ? 'نشط' : 'غير نشط'}\n`;
    report += '---\n\n';
  });
  
  // تحميل كملف نصي
  downloadTextFile(report, `تقرير_الموردين_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء تقرير الموردين بنجاح', 'success');
}

function generateDueReport() {
  const dueSuppliers = suppliersData.filter(s => parseFloat(s.balance) > 0);
  
  if (dueSuppliers.length === 0) {
    showNotification('لا توجد مستحقات على أي مورد', 'info');
    return;
  }
  
  let report = '====== تقرير المستحقات ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد الموردين ذوي المستحقات: ${dueSuppliers.length}\n\n`;
  
  const totalDue = dueSuppliers.reduce((sum, s) => sum + parseFloat(s.balance), 0);
  report += `إجمالي المستحقات: ${totalDue.toFixed(2)} ج\n\n`;
  
  report += '--- تفاصيل المستحقات ---\n\n';
  dueSuppliers.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));
  
  dueSuppliers.forEach((supplier, index) => {
    report += `${index + 1}. ${supplier.name}\n`;
    report += `   المستحق: ${parseFloat(supplier.balance).toFixed(2)} ج\n`;
    report += `   الهاتف: ${supplier.phone || '-'}\n\n`;
  });
  
  downloadTextFile(report, `تقرير_المستحقات_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء تقرير المستحقات بنجاح', 'success');
}

function generateMonthlyReport() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const monthlyInvoices = invoicesData.filter(inv => {
    const invDate = new Date(inv.invoice_date);
    return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
  });
  
  const monthlyPayments = paymentsData.filter(pay => {
    const payDate = new Date(pay.payment_date);
    return payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear;
  });
  
  const monthName = new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  
  let report = `====== تقرير المشتريات لشهر ${monthName} ======\n\n`;
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n\n`;
  
  const totalInvoices = monthlyInvoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount), 0);
  const totalPayments = monthlyPayments.reduce((sum, pay) => sum + parseFloat(pay.amount), 0);
  
  report += `عدد الفواتير: ${monthlyInvoices.length}\n`;
  report += `إجمالي الفواتير: ${totalInvoices.toFixed(2)} ج\n`;
  report += `عدد المدفوعات: ${monthlyPayments.length}\n`;
  report += `إجمالي المدفوعات: ${totalPayments.toFixed(2)} ج\n\n`;
  
  report += '--- تفاصيل الفواتير ---\n\n';
  monthlyInvoices.forEach(inv => {
    report += `فاتورة: ${inv.invoice_number}\n`;
    report += `المورد: ${inv.supplier_name}\n`;
    report += `المبلغ: ${parseFloat(inv.total_amount).toFixed(2)} ج\n`;
    report += `التاريخ: ${formatDate(inv.invoice_date)}\n`;
    report += `الحالة: ${inv.status === 'paid' ? 'مدفوعة' : (inv.status === 'partial' ? 'جزئية' : 'معلقة')}\n`;
    report += '---\n\n';
  });
  
  downloadTextFile(report, `تقرير_شهري_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء التقرير الشهري بنجاح', 'success');
}

function generateTopSuppliersReport() {
  if (invoicesData.length === 0) {
    showNotification('لا توجد معاملات لإنشاء التقرير', 'error');
    return;
  }
  
  // حساب إجمالي التعاملات لكل مورد
  const supplierTotals = {};
  
  invoicesData.forEach(inv => {
    if (!supplierTotals[inv.supplier_id]) {
      supplierTotals[inv.supplier_id] = {
        name: inv.supplier_name,
        total: 0,
        count: 0
      };
    }
    supplierTotals[inv.supplier_id].total += parseFloat(inv.total_amount);
    supplierTotals[inv.supplier_id].count += 1;
  });
  
  // تحويل إلى مصفوفة وترتيب
  const sortedSuppliers = Object.values(supplierTotals)
    .sort((a, b) => b.total - a.total);
  
  let report = '====== تقرير الموردين الأكثر تعاملاً ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد الموردين: ${sortedSuppliers.length}\n\n`;
  
  report += '--- الترتيب حسب حجم التعاملات ---\n\n';
  sortedSuppliers.forEach((supplier, index) => {
    report += `${index + 1}. ${supplier.name}\n`;
    report += `   إجمالي التعاملات: ${supplier.total.toFixed(2)} ج\n`;
    report += `   عدد الفواتير: ${supplier.count}\n`;
    report += `   متوسط الفاتورة: ${(supplier.total / supplier.count).toFixed(2)} ج\n\n`;
  });
  
  downloadTextFile(report, `تقرير_أفضل_موردين_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء تقرير الموردين بنجاح', 'success');
}

// دالة لتحميل ملف نصي
function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// دوال مساعدة
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function getPaymentMethodLabel(method) {
  const labels = {
    'cash': 'نقدي',
    'transfer': 'تحويل بنكي',
    'check': 'شيك'
  };
  return labels[method] || method;
}

function showNotification(message, type = 'info') {
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  alert(`${icon} ${message}`);
}

function viewInvoice(id) {
  const invoice = invoicesData.find(inv => inv.id === id);
  if (invoice) {
    const status = invoice.status === 'paid' ? 'مدفوعة' : (invoice.status === 'partial' ? 'مدفوعة جزئياً' : 'معلقة');
    const details = `
تفاصيل الفاتورة:

رقم الفاتورة: ${invoice.invoice_number}
المورد: ${invoice.supplier_name}
التاريخ: ${formatDate(invoice.invoice_date)}
تاريخ الاستحقاق: ${formatDate(invoice.due_date)}
المبلغ الإجمالي: ${parseFloat(invoice.total_amount).toFixed(2)} ج
المدفوع: ${parseFloat(invoice.paid_amount).toFixed(2)} ج
المتبقي: ${parseFloat(invoice.remaining_amount).toFixed(2)} ج
الحالة: ${status}
الوصف: ${invoice.description || '-'}
    `;
    alert(details);
  }
}

function viewPayment(id) {
  const payment = paymentsData.find(p => p.id === id);
  if (payment) {
    const details = `
تفاصيل الدفعة:

المورد: ${payment.supplier_name}
الفاتورة: ${payment.invoice_number}
المبلغ: ${parseFloat(payment.amount).toFixed(2)} ج
الطريقة: ${getPaymentMethodLabel(payment.payment_method)}
التاريخ: ${formatDate(payment.payment_date)}
رقم المرجع: ${payment.reference_number || '-'}
ملاحظات: ${payment.notes || '-'}
    `;
    alert(details);
  }
}