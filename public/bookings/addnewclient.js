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

// دالة لإضافة عملية للشيفت
async function addShiftOperation(shiftId, operationData) {
  try {
    const response = await fetch(`/api/shifts/${shiftId}/operation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(operationData)
    });
    
    if (!response.ok) {
      console.error('Failed to add shift operation');
    }
  } catch (error) {
    console.error('Error adding shift operation:', error);
  }
}

// === الكود الرئيسي ===

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
  const form = document.getElementById('addClientForm');
  const messageDiv = document.getElementById('message');
  const totalBalanceEl = document.getElementById('totalBalance');
  
  const balanceInputs = {
    basic: document.getElementById('balanceBasic'),
    offers: document.getElementById('balanceOffers'),
    laser: document.getElementById('balanceLaser'),
    skin: document.getElementById('balanceSkin'),
    old: document.getElementById('balanceOld')
  };

  // --- حساب إجمالي الرصيد تلقائياً ---
  function updateTotalBalance() {
    let total = 0;
    
    Object.values(balanceInputs).forEach(input => {
      const value = parseFloat(input.value) || 0;
      total += value;
    });

    totalBalanceEl.textContent = total.toFixed(2) + ' جنيه';
    
    // تغيير اللون حسب القيمة
    if (total > 0) {
      totalBalanceEl.style.color = '#4caf50';
    } else {
      totalBalanceEl.style.color = '#757575';
    }
  }

  // إضافة مستمعين للحقول
  Object.values(balanceInputs).forEach(input => {
    input.addEventListener('input', updateTotalBalance);
  });

  // --- التحقق من رقم الهاتف ---
  const phoneInput = document.getElementById('clientPhone');
  phoneInput.addEventListener('input', (e) => {
    // السماح بالأرقام فقط
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });

  // --- عرض رسالة ---
  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // إخفاء الرسالة بعد 5 ثواني
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 5000);
    
    // Scroll to message
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // --- إرسال الفورم ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();

    // التحقق من البيانات
    if (!name) {
      showMessage('⚠️ الرجاء إدخال اسم العميل', 'error');
      return;
    }

    if (!phone) {
      showMessage('⚠️ الرجاء إدخال رقم الهاتف', 'error');
      return;
    }

    if (!/^01[0-9]{9}$/.test(phone)) {
      showMessage('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
      return;
    }

    // الحصول على الشيفت النشط
    const currentShift = await getCurrentShift(currentUser.id);

    // الحصول على طريقة الدفع
    const paymentMethodSelect = document.getElementById('paymentMethod');
    const paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'نقدي';

    // جمع بيانات الرصيد
    const clientData = {
      name: name,
      phone: phone,
      balance_basic: parseFloat(balanceInputs.basic.value) || 0,
      balance_offers: parseFloat(balanceInputs.offers.value) || 0,
      balance_laser: parseFloat(balanceInputs.laser.value) || 0,
      balance_skin: parseFloat(balanceInputs.skin.value) || 0,
      balance_old: parseFloat(balanceInputs.old.value) || 0,
      payment_method: paymentMethod,
      created_by: currentUser.name
    };

    // تعطيل زر الإرسال
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> جاري الحفظ...';

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clientData)
      });

      const result = await response.json();

      if (response.ok) {
        showMessage('✅ تم إضافة العميل بنجاح! ID: ' + result.id, 'success');
        
        // إضافة العملية للشيفت إذا كان هناك شيفت نشط
        if (currentShift) {
          const totalBalance = clientData.balance_basic + clientData.balance_offers + 
                             clientData.balance_laser + clientData.balance_skin + 
                             clientData.balance_old;
          
          if (totalBalance > 0) {
            await addShiftOperation(currentShift.id, {
              operation_type: 'تسجيل عميل',
              client_name: name,
              client_phone: phone,
              amount: totalBalance,
              payment_method: paymentMethod,
              description: `تسجيل عميل جديد برصيد ${totalBalance.toFixed(2)} ج`
            });
            console.log('✅ تم تسجيل العملية في الشيفت');
          }
        } else {
          console.log('⚠️ لا يوجد شيفت نشط - لم يتم تسجيل العملية');
        }
        
        // إعادة تعيين الفورم بعد 2 ثانية
        setTimeout(() => {
          form.reset();
          updateTotalBalance();
          
          // الانتقال لصفحة العملاء بعد 3 ثواني
          setTimeout(() => {
            window.location.href = '/bookings/manageclients.html';
          }, 2000);
        }, 2000);
      } else {
        showMessage('❌ ' + (result.message || 'حدث خطأ أثناء إضافة العميل'), 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // --- إعادة تعيين الفورم ---
  form.addEventListener('reset', () => {
    setTimeout(updateTotalBalance, 0);
    messageDiv.style.display = 'none';
  });

  console.log('✅ تم تحميل صفحة إضافة عميل بنجاح');
  console.log('👤 المستخدم:', currentUser.name);
  console.log('🆔 User ID:', currentUser.id);
});