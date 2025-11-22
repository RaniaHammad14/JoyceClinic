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

  // --- زر تسجيل الخروج ---
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.removeItem('jc_user');
      window.location.href = '/login/login.html';
    });
  }

  // --- إضافة تأثيرات تفاعلية للكروت ---
  const cards = document.querySelectorAll('.main-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-8px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
  });

  console.log('✅ تم تحميل صفحة إدارة العملاء بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
});