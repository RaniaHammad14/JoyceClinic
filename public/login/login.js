// public/login/login.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const phoneInput = document.getElementById('phone');
  const pwdInput = document.getElementById('password');
  const msg = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');
  const toggleBtn = document.getElementById('togglePwd');

  // تفعيل زر إظهار/إخفاء كلمة السر
  toggleBtn.addEventListener('click', () => {
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      toggleBtn.textContent = '🙈';
      toggleBtn.setAttribute('aria-label', 'إخفاء كلمة المرور');
    } else {
      pwdInput.type = 'password';
      toggleBtn.textContent = '👁️';
      toggleBtn.setAttribute('aria-label', 'إظهار كلمة المرور');
    }
  });

  function validPhone(v){
    return /^0\d{9,10}$/.test(v.trim());
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const phone = phoneInput.value.trim();
    const password = pwdInput.value;

    if (!validPhone(phone)) {
      msg.style.color = '#c23b3b';
      msg.textContent = 'الرجاء إدخال رقم هاتف صحيح.';
      return;
    }
    if (!password || password.length < 3) {
      msg.style.color = '#c23b3b';
      msg.textContent = 'الرجاء إدخال كلمة مرور صحيحة.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التحقق...';

    try {
      const resp = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      const data = await resp.json();

      if (data && data.success) {
        // حفظ بيانات المستخدم مؤقتًا في الجلسة (session)
        // نسجّل فقط حقول عامة (لا تحفظ باسورد في الـ sessionStorage)
        const safeUser = {
          id: data.user.id,
          name: data.user.name,
          phone: data.user.phone,
          role: data.user.role
        };
        sessionStorage.setItem('jc_user', JSON.stringify(safeUser));

        msg.style.color = '#1a7f3a';
        msg.textContent = `مرحباً ${safeUser.name} — جارٍ التحويل إلى لوحة التحكم...`;

        // توجيه إلى الصفحة الرئيسية بعد تسجيل الدخول
        window.location.href = '/Main/main.html';
      } else {
        msg.style.color = '#c23b3b';
        msg.textContent = data && data.message ? data.message : 'فشل في تسجيل الدخول';
      }
    } catch (err) {
      console.error(err);
      msg.style.color = '#c23b3b';
      msg.textContent = 'حدث خطأ في الاتصال بالخادم.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تسجيل دخول';
    }
  });
});
