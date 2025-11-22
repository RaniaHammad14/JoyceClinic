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

  // --- العناصر ---
  const loadingSpinner = document.getElementById('loadingSpinner');
  const clientsGrid = document.getElementById('clientsGrid');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn = document.getElementById('refreshBtn');
  const totalClientsEl = document.getElementById('totalClients');
  const totalBalancesEl = document.getElementById('totalBalances');

  let allClients = [];

  // --- جلب البيانات من السيرفر ---
  async function loadClients() {
    loadingSpinner.style.display = 'block';
    emptyState.style.display = 'none';
    clientsGrid.innerHTML = '';

    try {
      const response = await fetch('/api/clients');
      if (!response.ok) {
        throw new Error('فشل في جلب البيانات');
      }

      allClients = await response.json();
      displayClients(allClients);
      updateStats(allClients);
    } catch (error) {
      console.error('Error loading clients:', error);
      clientsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--error);">
          ❌ حدث خطأ أثناء تحميل البيانات
        </div>
      `;
    } finally {
      loadingSpinner.style.display = 'none';
    }
  }

// --- عرض العملاء في الشبكة ---
  function displayClients(clients) {
    if (!clients || clients.length === 0) {
      emptyState.style.display = 'block';
      clientsGrid.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';

    const cards = clients.map(client => {
      return `
        <div class="client-card" onclick="window.location.href='/bookings/clientdetails.html?id=${client.id}'">
          <div class="client-avatar">👤</div>
          <div class="client-info">
            <div class="client-header">
              <div class="client-name">${client.name}</div>
              <div class="client-id">#${client.id}</div>
            </div>
            <div class="client-phone">${client.phone}</div>
          </div>
        </div>
      `;
    }).join('');

    clientsGrid.innerHTML = cards;
  }

  // --- تحديث الإحصائيات ---
  function updateStats(clients) {
    totalClientsEl.textContent = clients.length;

    const totalBalance = clients.reduce((sum, client) => {
      return sum + 
        parseFloat(client.balance_basic || 0) + 
        parseFloat(client.balance_offers || 0) + 
        parseFloat(client.balance_laser || 0) + 
        parseFloat(client.balance_skin || 0) + 
        parseFloat(client.balance_old || 0);
    }, 0);

    totalBalancesEl.textContent = totalBalance.toFixed(2) + ' ج';
  }

  // --- البحث ---
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();

    if (!query) {
      displayClients(allClients);
      return;
    }

    const filtered = allClients.filter(client => {
      return client.name.toLowerCase().includes(query) || 
             client.phone.includes(query);
    });

    displayClients(filtered);
  });

  // --- تحديث البيانات ---
  refreshBtn.addEventListener('click', () => {
    loadClients();
  });

  // --- تحميل البيانات عند فتح الصفحة ---
  loadClients();

  console.log('✅ تم تحميل صفحة إدارة العملاء بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
});