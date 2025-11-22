// public/Main/main.js
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

  // --- عرض معلومات المستخدم ---
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  
  if (userName) {
    userName.textContent = currentUser.name || 'المستخدمة';
  }
  
  if (userRole) {
    userRole.textContent = currentUser.role || 'الدور';
    
    // تغيير لون البادج حسب الدور
    let badgeGradient = 'linear-gradient(135deg, #e91e63 0%, #ff4081 100%)';
    switch(currentUser.role) {
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

  // --- زر تسجيل الخروج ---
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // --- نافذة البحث ---
  const searchModal = document.getElementById('searchModal');
  const openSearch = document.getElementById('openSearch');
  const closeSearch = document.getElementById('closeSearch');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  // فتح نافذة البحث
  if (openSearch) {
    openSearch.addEventListener('click', () => {
      searchModal.setAttribute('aria-hidden', 'false');
      searchInput.focus();
    });
  }

  // إغلاق نافذة البحث
  if (closeSearch) {
    closeSearch.addEventListener('click', () => {
      searchModal.setAttribute('aria-hidden', 'true');
      searchInput.value = '';
      searchResults.innerHTML = '';
    });
  }

  // إغلاق عند الضغط على الخلفية
  if (searchModal) {
    searchModal.addEventListener('click', (e) => {
      if (e.target === searchModal) {
        searchModal.setAttribute('aria-hidden', 'true');
        searchInput.value = '';
        searchResults.innerHTML = '';
      }
    });
  }

  // إغلاق عند الضغط على Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchModal.getAttribute('aria-hidden') === 'false') {
      searchModal.setAttribute('aria-hidden', 'true');
      searchInput.value = '';
      searchResults.innerHTML = '';
    }
  });

  // --- البحث في الأقسام ---
  const allCards = document.querySelectorAll('.card');
  const cardsData = [];

  // جمع بيانات الكروت
  allCards.forEach(card => {
    const icon = card.querySelector('.card-icon span');
    const title = card.querySelector('h3');
    const desc = card.querySelector('.small');
    const keywords = card.getAttribute('data-keywords') || '';
    const href = card.getAttribute('href');
    const iconBg = card.querySelector('.card-icon').style.background;

    if (title && href) {
      cardsData.push({
        icon: icon ? icon.textContent : '📄',
        iconBg: iconBg,
        title: title.textContent,
        description: desc ? desc.textContent : '',
        keywords: keywords,
        href: href
      });
    }
  });

  // البحث عند الكتابة
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      
      if (!query) {
        searchResults.innerHTML = '';
        return;
      }

      // البحث في البيانات
      const results = cardsData.filter(card => {
        return card.title.toLowerCase().includes(query) ||
               card.description.toLowerCase().includes(query) ||
               card.keywords.toLowerCase().includes(query);
      });

      // عرض النتائج
      if (results.length === 0) {
        searchResults.innerHTML = `
          <div class="no-results">
            <div class="no-results-icon">🔍</div>
            <p>لم يتم العثور على نتائج</p>
            <small>جربي البحث بكلمات أخرى</small>
          </div>
        `;
        return;
      }

      searchResults.innerHTML = results.map(card => `
        <a href="${card.href}" class="search-result-item">
          <div class="card-icon" style="background: ${card.iconBg}">
            <span>${card.icon}</span>
          </div>
          <div>
            <h4>${highlightText(card.title, query)}</h4>
            <p class="small" style="margin: 4px 0 0; color: #757575;">${highlightText(card.description, query)}</p>
          </div>
        </a>
      `).join('');
    });
  }

  // تظليل النص المطابق في نتائج البحث
  function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark style="background: #fce4ec; padding: 2px 4px; border-radius: 3px;">$1</mark>');
  }

  // Escape special regex characters
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // --- فلترة الكروت حسب الصلاحيات (اختياري) ---
  // يمكنك إخفاء بعض الكروت بناءً على دور المستخدم
  // مثال: إذا كان المستخدم ليس ادمن، إخفاء بعض الأقسام
  
  // مثال بسيط:
  if (currentUser.role !== 'ادمن') {
    // يمكنك إخفاء قسم إدارة الحسابات مثلاً
    // const accountsCard = document.querySelector('a[href="/accounts/accounts.html"]');
    // if (accountsCard) accountsCard.style.display = 'none';
  }

  // --- إضافة تأثيرات تفاعلية ---
  allCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-8px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
  });

  // --- رسالة ترحيب عند أول تسجيل دخول ---
  const isFirstVisit = sessionStorage.getItem('jc_first_visit');
  if (!isFirstVisit) {
    sessionStorage.setItem('jc_first_visit', 'true');
    
    // يمكنك إضافة رسالة ترحيب هنا
    setTimeout(() => {
      // مثال: console.log('مرحباً ' + currentUser.name + '! 💖');
    }, 500);
  }

  // --- شريط التقدم للتحميل (اختياري) ---
  window.addEventListener('beforeunload', () => {
    // يمكنك إضافة loader هنا
  });

  // --- التحقق من الاتصال بالإنترنت ---
  window.addEventListener('online', () => {
    console.log('تم استعادة الاتصال بالإنترنت ✅');
  });

  window.addEventListener('offline', () => {
    console.log('تم فقد الاتصال بالإنترنت ⚠️');
  });

  // --- Smooth scroll للروابط الداخلية ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  console.log('✅ تم تحميل لوحة التحكم بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
  console.log('👑 الدور:', currentUser.role);
});