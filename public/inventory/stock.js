// public/inventory/stock.js

let productsData = [];
let categoriesData = [];
let suppliersData = [];
let movementsData = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  // التحقق من تسجيل الدخول
  const raw = sessionStorage.getItem('jc_user');
  if (!raw) {
    window.location.href = '/login/login.html';
    return;
  }

  currentUser = JSON.parse(raw);

  // إعداد التبويبات
  setupTabs();

  // إعداد الأزرار
  document.getElementById('addProductBtn')?.addEventListener('click', () => openModal('addProductModal'));
  document.getElementById('addMovementBtn')?.addEventListener('click', () => openModal('addMovementModal'));
  document.getElementById('addMovementBtn2')?.addEventListener('click', () => openModal('addMovementModal'));
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openModal('addCategoryModal'));

  // إعداد النماذج
  document.getElementById('addProductForm')?.addEventListener('submit', handleAddProduct);
  document.getElementById('addMovementForm')?.addEventListener('submit', handleAddMovement);
  document.getElementById('addCategoryForm')?.addEventListener('submit', handleAddCategory);

  // إعداد البحث والفلترة
  setupSearchAndFilters();

  // تحميل البيانات
  loadAllData();

  console.log('✅ تم تحميل صفحة المخزون بنجاح');
});

// تحميل جميع البيانات
async function loadAllData() {
  await Promise.all([
    loadCategories(),
    loadSuppliers(),
    loadProducts(),
    loadMovements(),
    updateStats()
  ]);
  
  updateDropdowns();
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
    updateDropdowns();
  }
}

// إغلاق نافذة منبثقة
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    const form = modal.querySelector('form');
    if (form) form.reset();
    
    // إخفاء معلومات الرصيد
    const stockInfo = document.getElementById('currentStockInfo');
    if (stockInfo) stockInfo.style.display = 'none';
  }
}

// تحديث القوائم المنسدلة
function updateDropdowns() {
  // قائمة الفئات
  const categorySelects = document.querySelectorAll('#productCategory, #filterCategory');
  categorySelects.forEach(select => {
    if (select.id === 'filterCategory') {
      select.innerHTML = '<option value="all">جميع الفئات</option>' +
        categoriesData.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">اختر الفئة</option>' +
        categoriesData.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  });

  // قائمة الموردين
  const supplierSelects = document.querySelectorAll('#productSupplier, #movementSupplier');
  supplierSelects.forEach(select => {
    select.innerHTML = '<option value="">اختر المورد</option>' +
      suppliersData.filter(s => s.status === 'active')
        .map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  });

  // قائمة المنتجات
  const productSelect = document.getElementById('movementProduct');
  if (productSelect) {
    productSelect.innerHTML = '<option value="">اختر المنتج</option>' +
      productsData.filter(p => p.status === 'active')
        .map(p => `<option value="${p.id}" data-stock="${p.current_stock}">${p.name} (متوفر: ${p.current_stock})</option>`).join('');
  }
}

// تحميل الفئات
async function loadCategories() {
  try {
    const response = await fetch('/api/product-categories');
    categoriesData = await response.json();
    
    const grid = document.getElementById('categoriesGrid');
    
    if (categoriesData.length === 0) {
      grid.innerHTML = `
        <div class="category-card empty">
          <div class="category-icon">📂</div>
          <h3>لا توجد فئات</h3>
          <p>قم بإضافة فئة جديدة</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = categoriesData.map(cat => {
      const productCount = productsData.filter(p => p.category_id === cat.id).length;
      return `
        <div class="category-card" onclick="filterByCategory(${cat.id})">
          <div class="category-icon">${cat.icon || '📦'}</div>
          <h3>${cat.name}</h3>
          <p>${cat.description || 'لا يوجد وصف'}</p>
          <span class="count">${productCount} منتج</span>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// تحميل الموردين
async function loadSuppliers() {
  try {
    const response = await fetch('/api/suppliers');
    suppliersData = await response.json();
  } catch (error) {
    console.error('Error loading suppliers:', error);
    suppliersData = [];
  }
}

// تحميل المنتجات
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    productsData = await response.json();
    
    renderProductsTable(productsData);
  } catch (error) {
    console.error('Error loading products:', error);
    showNotification('خطأ في تحميل المنتجات', 'error');
  }
}

// عرض جدول المنتجات
function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  
  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="no-data">
          <div class="no-data-message">
            <span class="no-data-icon">📦</span>
            <p>لا توجد منتجات</p>
            <small>قم بإضافة منتج جديد للبدء</small>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = products.map(product => {
    const stockBadge = getStockBadge(product.stock_status);
    const stockColor = product.current_stock <= product.min_stock ? 'var(--danger)' : 
                      product.current_stock >= product.max_stock ? 'var(--info)' : 'var(--success)';
    
    return `
      <tr>
        <td>${product.barcode || '-'}</td>
        <td><strong>${product.name}</strong></td>
        <td>${product.category_name || '-'}</td>
        <td>${product.unit}</td>
        <td style="color: ${stockColor}; font-weight: 700">${product.current_stock}</td>
        <td>${product.min_stock}</td>
        <td>${parseFloat(product.purchase_price).toFixed(2)} ج</td>
        <td>${parseFloat(product.selling_price).toFixed(2)} ج</td>
        <td>${product.location || '-'}</td>
        <td>${stockBadge}</td>
        <td>
          <button class="action-btn view" onclick="viewProduct(${product.id})">عرض</button>
          <button class="action-btn movement" onclick="quickMovement(${product.id})">حركة</button>
          <button class="action-btn edit" onclick="editProduct(${product.id})">تعديل</button>
          <button class="action-btn delete" onclick="deleteProduct(${product.id})">حذف</button>
        </td>
      </tr>
    `;
  }).join('');
}

// الحصول على شارة حالة المخزون
function getStockBadge(status) {
  const badges = {
    low: '<span class="badge low">منخفض</span>',
    normal: '<span class="badge normal">عادي</span>',
    overstocked: '<span class="badge overstocked">زائد</span>'
  };
  return badges[status] || badges.normal;
}

// تحميل الحركات
async function loadMovements() {
  try {
    const response = await fetch('/api/stock-movements');
    movementsData = await response.json();
    
    const tbody = document.getElementById('movementsTableBody');
    
    if (movementsData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="no-data">
            <div class="no-data-message">
              <span class="no-data-icon">🔄</span>
              <p>لا توجد حركات</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = movementsData.map(m => `
      <tr>
        <td>${formatDateTime(m.created_at)}</td>
        <td>${m.product_name}</td>
        <td><strong>${m.movement_type}</strong></td>
        <td style="font-weight: 700">${m.quantity}</td>
        <td>${m.previous_stock}</td>
        <td>${m.new_stock}</td>
        <td>${m.reference_number || '-'}</td>
        <td>${m.supplier_name || '-'}</td>
        <td>${m.created_by}</td>
        <td>${m.notes || '-'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading movements:', error);
  }
}

// تحديث الإحصائيات
async function updateStats() {
  try {
    const response = await fetch('/api/stock/stats');
    
    if (!response.ok) {
      setDefaultStats();
      return;
    }
    
    const stats = await response.json();
    
    document.getElementById('totalProducts').textContent = stats.total_products || 0;
    document.getElementById('lowStockProducts').textContent = stats.low_stock || 0;
    document.getElementById('outOfStockProducts').textContent = stats.out_of_stock || 0;
    document.getElementById('inventoryValue').textContent = `${(stats.inventory_value || 0).toFixed(2)} ج`;
    document.getElementById('todayMovements').textContent = stats.today_movements || 0;
  } catch (error) {
    console.error('Error updating stats:', error);
    setDefaultStats();
  }
}

function setDefaultStats() {
  document.getElementById('totalProducts').textContent = '0';
  document.getElementById('lowStockProducts').textContent = '0';
  document.getElementById('outOfStockProducts').textContent = '0';
  document.getElementById('inventoryValue').textContent = '0.00 ج';
  document.getElementById('todayMovements').textContent = '0';
}

// إضافة منتج جديد
async function handleAddProduct(e) {
  e.preventDefault();
  
  const productData = {
    barcode: document.getElementById('productBarcode').value.trim(),
    name: document.getElementById('productName').value.trim(),
    category_id: parseInt(document.getElementById('productCategory').value),
    supplier_id: parseInt(document.getElementById('productSupplier').value) || null,
    description: document.getElementById('productDescription').value.trim(),
    unit: document.getElementById('productUnit').value.trim(),
    purchase_price: parseFloat(document.getElementById('productPurchasePrice').value) || 0,
    selling_price: parseFloat(document.getElementById('productSellingPrice').value) || 0,
    current_stock: parseInt(document.getElementById('productStock').value) || 0,
    min_stock: parseInt(document.getElementById('productMinStock').value) || 5,
    max_stock: parseInt(document.getElementById('productMaxStock').value) || 100,
    reorder_point: parseInt(document.getElementById('productReorderPoint').value) || 10,
    location: document.getElementById('productLocation').value.trim(),
    created_by: currentUser.name
  };
  
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addProductModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding product:', error);
    showNotification('خطأ في إضافة المنتج', 'error');
  }
}

// إضافة حركة مخزون
async function handleAddMovement(e) {
  e.preventDefault();
  
  const movementData = {
    product_id: parseInt(document.getElementById('movementProduct').value),
    movement_type: document.getElementById('movementType').value,
    quantity: parseInt(document.getElementById('movementQuantity').value),
    supplier_id: parseInt(document.getElementById('movementSupplier').value) || null,
    reference_number: document.getElementById('movementReference').value.trim(),
    notes: document.getElementById('movementNotes').value.trim(),
    created_by: currentUser.name
  };
  
  try {
    const response = await fetch('/api/stock-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movementData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addMovementModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding movement:', error);
    showNotification('خطأ في تسجيل الحركة', 'error');
  }
}

// إضافة فئة جديدة
async function handleAddCategory(e) {
  e.preventDefault();
  
  const categoryData = {
    name: document.getElementById('categoryName').value.trim(),
    description: document.getElementById('categoryDescription').value.trim(),
    icon: document.getElementById('categoryIcon').value.trim()
  };
  
  try {
    const response = await fetch('/api/product-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(result.message, 'success');
      closeModal('addCategoryModal');
      await loadAllData();
    } else {
      showNotification(result.message, 'error');
    }
  } catch (error) {
    console.error('Error adding category:', error);
    showNotification('خطأ في إضافة الفئة', 'error');
  }
}

// تحديث رصيد المنتج في النموذج
function updateProductStock() {
  const select = document.getElementById('movementProduct');
  const stockInfo = document.getElementById('currentStockInfo');
  const stockValue = document.getElementById('currentStockValue');
  
  if (select.value) {
    const option = select.options[select.selectedIndex];
    const stock = option.getAttribute('data-stock');
    stockValue.textContent = stock;
    stockInfo.style.display = 'block';
  } else {
    stockInfo.style.display = 'none';
  }
}

// حركة سريعة
function quickMovement(productId) {
  openModal('addMovementModal');
  setTimeout(() => {
    const select = document.getElementById('movementProduct');
    select.value = productId;
    updateProductStock();
  }, 100);
}

// عرض تفاصيل منتج
function viewProduct(id) {
  const product = productsData.find(p => p.id === id);
  if (product) {
    const details = `
تفاصيل المنتج:

الاسم: ${product.name}
الباركود: ${product.barcode || '-'}
الفئة: ${product.category_name || '-'}
المورد: ${product.supplier_name || '-'}
الوحدة: ${product.unit}
الكمية الحالية: ${product.current_stock}
الحد الأدنى: ${product.min_stock}
الحد الأقصى: ${product.max_stock}
نقطة إعادة الطلب: ${product.reorder_point}
سعر الشراء: ${parseFloat(product.purchase_price).toFixed(2)} ج
سعر البيع: ${parseFloat(product.selling_price).toFixed(2)} ج
الموقع: ${product.location || '-'}
الوصف: ${product.description || '-'}
    `;
    alert(details);
  }
}

// تعديل منتج
function editProduct(id) {
  showNotification('ميزة التعديل قيد التطوير', 'info');
}

// حذف منتج
async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟\nسيتم حذف جميع حركات المخزون المرتبطة به.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/products/${id}`, {
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
    console.error('Error deleting product:', error);
    showNotification('خطأ في حذف المنتج', 'error');
  }
}

// الفلترة حسب الفئة
function filterByCategory(categoryId) {
  // الانتقال لتبويب المنتجات
  document.querySelector('.tab-btn[data-tab="products"]')?.click();
  
  // تطبيق الفلتر
  setTimeout(() => {
    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) {
      filterSelect.value = categoryId;
      filterProducts();
    }
  }, 100);
}

// إعداد البحث والفلترة
function setupSearchAndFilters() {
  // بحث وفلترة المنتجات
  document.getElementById('searchProducts')?.addEventListener('input', filterProducts);
  document.getElementById('filterCategory')?.addEventListener('change', filterProducts);
  document.getElementById('filterStockStatus')?.addEventListener('change', filterProducts);
  document.getElementById('sortProducts')?.addEventListener('change', filterProducts);
  
  // بحث وفلترة الحركات
  document.getElementById('searchMovements')?.addEventListener('input', filterMovements);
  document.getElementById('filterMovementType')?.addEventListener('change', filterMovements);
  document.getElementById('filterMovementDateFrom')?.addEventListener('change', filterMovements);
  document.getElementById('filterMovementDateTo')?.addEventListener('change', filterMovements);
}

function filterProducts() {
  const searchTerm = document.getElementById('searchProducts')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('filterCategory')?.value || 'all';
  const statusFilter = document.getElementById('filterStockStatus')?.value || 'all';
  const sortBy = document.getElementById('sortProducts')?.value || 'name';
  
  let filtered = [...productsData];
  
  if (searchTerm) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(searchTerm) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm)) ||
      (p.category_name && p.category_name.toLowerCase().includes(searchTerm))
    );
  }
  
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(p => p.category_id === parseInt(categoryFilter));
  }
  
  if (statusFilter !== 'all') {
    filtered = filtered.filter(p => p.stock_status === statusFilter);
  }
  
  // الترتيب
  if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  } else if (sortBy === 'stock_asc') {
    filtered.sort((a, b) => a.current_stock - b.current_stock);
  } else if (sortBy === 'stock_desc') {
    filtered.sort((a, b) => b.current_stock - a.current_stock);
  } else if (sortBy === 'value') {
    filtered.sort((a, b) => 
      (b.current_stock * b.purchase_price) - (a.current_stock * a.purchase_price)
    );
  }
  
  renderProductsTable(filtered);
}

function filterMovements() {
  const searchTerm = document.getElementById('searchMovements')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filterMovementType')?.value || 'all';
  const dateFrom = document.getElementById('filterMovementDateFrom')?.value;
  const dateTo = document.getElementById('filterMovementDateTo')?.value;
  
  let filtered = [...movementsData];
  
  if (searchTerm) {
    filtered = filtered.filter(m => 
      m.product_name.toLowerCase().includes(searchTerm) ||
      (m.reference_number && m.reference_number.toLowerCase().includes(searchTerm)) ||
      (m.notes && m.notes.toLowerCase().includes(searchTerm))
    );
  }
  
  if (typeFilter !== 'all') {
    filtered = filtered.filter(m => m.movement_type === typeFilter);
  }
  
  if (dateFrom) {
    filtered = filtered.filter(m => new Date(m.created_at) >= new Date(dateFrom));
  }
  
  if (dateTo) {
    filtered = filtered.filter(m => new Date(m.created_at) <= new Date(dateTo + ' 23:59:59'));
  }
  
  const tbody = document.getElementById('movementsTableBody');
  
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="no-data">
          <div class="no-data-message">
            <span class="no-data-icon">🔍</span>
            <p>لا توجد نتائج</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filtered.map(m => `
    <tr>
      <td>${formatDateTime(m.created_at)}</td>
      <td>${m.product_name}</td>
      <td><strong>${m.movement_type}</strong></td>
      <td style="font-weight: 700">${m.quantity}</td>
      <td>${m.previous_stock}</td>
      <td>${m.new_stock}</td>
      <td>${m.reference_number || '-'}</td>
      <td>${m.supplier_name || '-'}</td>
      <td>${m.created_by}</td>
      <td>${m.notes || '-'}</td>
    </tr>
  `).join('');
}

// التقارير
function generateFullStockReport() {
  if (productsData.length === 0) {
    showNotification('لا توجد بيانات لإنشاء التقرير', 'error');
    return;
  }
  
  let report = '====== تقرير المخزون الكامل ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد المنتجات: ${productsData.length}\n\n`;
  
  report += '--- تفاصيل المنتجات ---\n\n';
  productsData.forEach((product, index) => {
    report += `${index + 1}. ${product.name}\n`;
    report += `   الفئة: ${product.category_name || '-'}\n`;
    report += `   الكمية: ${product.current_stock} ${product.unit}\n`;
    report += `   سعر الشراء: ${parseFloat(product.purchase_price).toFixed(2)} ج\n`;
    report += `   القيمة: ${(product.current_stock * product.purchase_price).toFixed(2)} ج\n`;
    report += `   الموقع: ${product.location || '-'}\n`;
    report += '---\n\n';
  });
  
  const totalValue = productsData.reduce((sum, p) => 
    sum + (p.current_stock * p.purchase_price), 0
  );
  report += `\nإجمالي قيمة المخزون: ${totalValue.toFixed(2)} ج\n`;
  
  downloadTextFile(report, `تقرير_المخزون_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء التقرير بنجاح', 'success');
}

function generateLowStockReport() {
  const lowStock = productsData.filter(p => p.current_stock <= p.min_stock);
  
  if (lowStock.length === 0) {
    showNotification('لا توجد منتجات منخفضة', 'info');
    return;
  }
  
  let report = '====== تقرير المخزون المنخفض ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد المنتجات المنخفضة: ${lowStock.length}\n\n`;
  
  report += '--- المنتجات التي تحتاج إعادة طلب ---\n\n';
  lowStock.forEach((product, index) => {
    report += `${index + 1}. ${product.name}\n`;
    report += `   الكمية الحالية: ${product.current_stock}\n`;
    report += `   الحد الأدنى: ${product.min_stock}\n`;
    report += `   نقطة إعادة الطلب: ${product.reorder_point}\n`;
    report += `   المورد: ${product.supplier_name || '-'}\n`;
    report += '---\n\n';
  });
  
  downloadTextFile(report, `تقرير_مخزون_منخفض_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء التقرير بنجاح', 'success');
}

function generateMovementsReport() {
  if (movementsData.length === 0) {
    showNotification('لا توجد حركات لإنشاء التقرير', 'error');
    return;
  }
  
  let report = '====== تقرير حركات المخزون ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
  report += `عدد الحركات: ${movementsData.length}\n\n`;
  
  report += '--- تفاصيل الحركات ---\n\n';
  movementsData.forEach((movement, index) => {
    report += `${index + 1}. ${movement.product_name}\n`;
    report += `   النوع: ${movement.movement_type}\n`;
    report += `   الكمية: ${movement.quantity}\n`;
    report += `   من: ${movement.previous_stock} إلى: ${movement.new_stock}\n`;
    report += `   التاريخ: ${formatDateTime(movement.created_at)}\n`;
    report += `   المستخدم: ${movement.created_by}\n`;
    if (movement.notes) report += `   ملاحظات: ${movement.notes}\n`;
    report += '---\n\n';
  });
  
  downloadTextFile(report, `تقرير_حركات_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء التقرير بنجاح', 'success');
}

function generateValueReport() {
  if (productsData.length === 0) {
    showNotification('لا توجد بيانات لإنشاء التقرير', 'error');
    return;
  }
  
  let report = '====== تقرير قيمة المخزون ======\n\n';
  report += `التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n\n`;
  
  // حساب القيم
  let totalPurchaseValue = 0;
  let totalSellingValue = 0;
  let expectedProfit = 0;
  
  report += '--- قيمة المخزون حسب الفئات ---\n\n';
  
  categoriesData.forEach(cat => {
    const catProducts = productsData.filter(p => p.category_id === cat.id);
    if (catProducts.length === 0) return;
    
    const catPurchaseValue = catProducts.reduce((sum, p) => 
      sum + (p.current_stock * p.purchase_price), 0
    );
    const catSellingValue = catProducts.reduce((sum, p) => 
      sum + (p.current_stock * p.selling_price), 0
    );
    
    totalPurchaseValue += catPurchaseValue;
    totalSellingValue += catSellingValue;
    
    report += `${cat.icon || '📦'} ${cat.name}\n`;
    report += `   عدد المنتجات: ${catProducts.length}\n`;
    report += `   قيمة الشراء: ${catPurchaseValue.toFixed(2)} ج\n`;
    report += `   قيمة البيع المتوقعة: ${catSellingValue.toFixed(2)} ج\n`;
    report += `   الربح المتوقع: ${(catSellingValue - catPurchaseValue).toFixed(2)} ج\n`;
    report += '---\n\n';
  });
  
  expectedProfit = totalSellingValue - totalPurchaseValue;
  
  report += '\n====== الإجمالي ======\n\n';
  report += `إجمالي قيمة الشراء: ${totalPurchaseValue.toFixed(2)} ج\n`;
  report += `إجمالي قيمة البيع المتوقعة: ${totalSellingValue.toFixed(2)} ج\n`;
  report += `الربح المتوقع: ${expectedProfit.toFixed(2)} ج\n`;
  report += `نسبة الربح: ${((expectedProfit / totalPurchaseValue) * 100).toFixed(2)}%\n`;
  
  downloadTextFile(report, `تقرير_قيمة_المخزون_${new Date().toISOString().split('T')[0]}.txt`);
  showNotification('تم إنشاء التقرير بنجاح', 'success');
}

// تحميل ملف نصي
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

// تنسيق التاريخ والوقت
function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// عرض الإشعارات
function showNotification(message, type = 'info') {
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  alert(`${icon} ${message}`);
}

// تحديث تلقائي للبيانات كل دقيقة
setInterval(() => {
  updateStats();
}, 60000);