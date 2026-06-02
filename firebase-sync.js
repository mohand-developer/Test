/**
 * ═══════════════════════════════════════════════════════
 *  MAHFOOR CNC — Firebase Real-Time Orders Sync
 *  ملف المزامنة الفورية للطلبات عبر الأجهزة
 *
 *  الخطوات اللازمة لتفعيله (مرة واحدة فقط):
 *  1. اذهب إلى https://console.firebase.google.com
 *  2. اضغط "Add project" → سمّيه "mahfoor-cnc"
 *  3. اضغط على أيقونة </> لإضافة Web App
 *  4. انسخ الـ firebaseConfig وضعه في المتغير أدناه
 *  5. من القائمة الجانبية: Build → Realtime Database → Create database
 *  6. اختار "Start in test mode" (للبداية)
 * ═══════════════════════════════════════════════════════
 */

// ┌─────────────────────────────────────────────────────┐
// │  ضع هنا بياناتك من Firebase Console                 │
// └─────────────────────────────────────────────────────┘
const firebaseConfig = {
  apiKey: "AIzaSyDlQgvdsQZyOELPPmVWszHAjO4H75mwVck",
  authDomain: "mahfoor-cnc-mohand.firebaseapp.com",
  databaseURL: "https://mahfoor-cnc-mohand-default-rtdb.firebaseio.com",
  projectId: "mahfoor-cnc-mohand",
  storageBucket: "mahfoor-cnc-mohand.firebasestorage.app",
  messagingSenderId: "1052384264893",
  appId: "1:1052384264893:web:de6a12395dcfc14d156dd4",
  measurementId: "G-29K8JM14MR"
};

// ══════════════════════════════════════════════════════
//  لا تعدل تحت هذا السطر
// ══════════════════════════════════════════════════════

const MAHFOOR_FIREBASE = (() => {
  let db = null;
  let initialized = false;
  let newOrderCallback = null;     // يُستدعى في صفحة الأدمن عند وصول طلب جديد

  // ──────────────────────────────────────────
  //  تهيئة Firebase
  // ──────────────────────────────────────────
  async function init() {
    if (initialized) return;
    try {
      // تحميل Firebase SDK ديناميكياً (v9 compat)
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();
      initialized = true;
      window._mahfoorFirebaseReady = true;
      console.log('✅ MAHFOOR Firebase: connected');
    } catch (err) {
      console.warn('⚠️ MAHFOOR Firebase: failed to init, working offline only', err);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ──────────────────────────────────────────
  //  حفظ طلب جديد في Firebase + localStorage
  // ──────────────────────────────────────────
  async function saveOrder(order) {
    // دايمًا احفظ محلياً أولاً (الـ fallback)
    _saveToLocal(order);

    if (!initialized || !db) {
      console.warn('Firebase not ready, saved locally only');
      return;
    }
    try {
      // استخدم timestamp كـ key لضمان الترتيب الصحيح
      const key = String(order.id);
      await db.ref(`mahfoor_orders/${key}`).set(order);
      console.log('✅ Order saved to Firebase:', key);
    } catch (err) {
      console.warn('Firebase save failed, local only:', err);
    }
  }

  function _saveToLocal(order) {
    const orders = JSON.parse(localStorage.getItem('mahfourOrders')) || [];
    // تجنب التكرار
    if (!orders.find(o => o.id === order.id)) {
      orders.push(order);
      localStorage.setItem('mahfourOrders', JSON.stringify(orders));
    }
  }

  // ──────────────────────────────────────────
  //  تحديث حالة طلب في Firebase
  // ──────────────────────────────────────────
  async function updateOrderStatus(orderId, newStatus) {
    // تحديث محلي
    const orders = JSON.parse(localStorage.getItem('mahfourOrders')) || [];
    const idx = orders.findIndex(o => String(o.id) === String(orderId));
    if (idx !== -1) {
      orders[idx].status = newStatus;
      localStorage.setItem('mahfourOrders', JSON.stringify(orders));
    }

    if (!initialized || !db) return;
    try {
      await db.ref(`mahfoor_orders/${orderId}/status`).set(newStatus);
    } catch (err) {
      console.warn('Firebase status update failed:', err);
    }
  }

  // ──────────────────────────────────────────
  //  حذف طلب من Firebase
  // ──────────────────────────────────────────
  async function deleteOrder(orderId) {
    // حذف محلي
    let orders = JSON.parse(localStorage.getItem('mahfourOrders')) || [];
    orders = orders.filter(o => String(o.id) !== String(orderId));
    localStorage.setItem('mahfourOrders', JSON.stringify(orders));

    if (!initialized || !db) return;
    try {
      await db.ref(`mahfoor_orders/${orderId}`).remove();
    } catch (err) {
      console.warn('Firebase delete failed:', err);
    }
  }

  // ──────────────────────────────────────────
  //  حذف كل الطلبات
  // ──────────────────────────────────────────
  async function clearAllOrders() {
    localStorage.setItem('mahfourOrders', JSON.stringify([]));
    if (!initialized || !db) return;
    try {
      await db.ref('mahfoor_orders').remove();
    } catch (err) {
      console.warn('Firebase clear failed:', err);
    }
  }

  // ──────────────────────────────────────────
  //  مستمع real-time للأدمن (يستدعى فقط في admin.html)
  //  callback(orders) يُستدعى كلما تغيرت البيانات
  // ──────────────────────────────────────────
  async function listenToOrders(callback) {
    newOrderCallback = callback;

    if (!initialized || !db) {
      // شغّل callback بالبيانات المحلية مؤقتاً
      const local = JSON.parse(localStorage.getItem('mahfourOrders')) || [];
      callback(local);
      console.warn('Firebase not ready, using local orders only');
      return;
    }

    // جلب البيانات الموجودة + الاستماع للتغييرات الجديدة
    db.ref('mahfoor_orders').on('value', (snapshot) => {
      const data = snapshot.val();
      let orders = [];
      if (data) {
        orders = Object.values(data);
        orders.sort((a, b) => (b.ts || 0) - (a.ts || 0)); // أحدث أولاً
      }
      // دمج مع localStorage وحفظ
      localStorage.setItem('mahfourOrders', JSON.stringify(orders));
      callback(orders);

      // إشعار صوتي + بصري لو جه طلب جديد
      _notifyNewOrder(orders);
    });
  }

  let _lastOrderCount = null;
  function _notifyNewOrder(orders) {
    if (_lastOrderCount === null) {
      _lastOrderCount = orders.length;
      return;
    }
    if (orders.length > _lastOrderCount) {
      const diff = orders.length - _lastOrderCount;
      _lastOrderCount = orders.length;
      // إشعار بصري
      showNewOrderAlert(diff, orders[0]);
      // إشعار صوتي
      _playNotificationSound();
    } else {
      _lastOrderCount = orders.length;
    }
  }

  function showNewOrderAlert(count, latestOrder) {
    // إشعار المتصفح (لو مسموح)
    if (Notification && Notification.permission === 'granted') {
      const n = latestOrder ?
        (latestOrder.details?.match(/\*الاسم:\* (.+)/)?.[1] || 'عميل') : 'عميل';
      new Notification(`🛍️ طلب جديد من ${n}!`, {
        body: `وصل ${count} طلب جديد على متجر MAHFOOR CNC`,
        icon: 'https://i.postimg.cc/4NSrnTbt/photo-2025-09-26-07-00-26.jpg'
      });
    }

    // إشعار داخل الصفحة (toast)
    const existing = document.getElementById('mahfoor-new-order-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'mahfoor-new-order-toast';
    const customerName = latestOrder?.details?.match(/\*الاسم:\* (.+)/)?.[1] || 'عميل جديد';
    const total = latestOrder?.details?.match(/\*الإجمالي:\* ([\d.]+)/)?.[1] || '';
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:2em;">🛍️</div>
        <div>
          <div style="font-weight:700;font-size:1.05em;">طلب جديد وصل!</div>
          <div style="font-size:0.88em;opacity:0.9;">${customerName}${total ? ' — ' + total + ' ج.م' : ''}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()"
          style="margin-right:auto;background:rgba(255,255,255,0.2);border:none;border-radius:50%;
                 width:28px;height:28px;cursor:pointer;color:white;font-size:1em;">✕</button>
      </div>
    `;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      left: '24px',
      zIndex: '99999',
      background: 'linear-gradient(135deg, #13352f, #1e4d44)',
      color: 'white',
      padding: '16px 20px',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
      minWidth: '280px',
      borderRight: '4px solid #d4a853',
      animation: 'slideInToast 0.4s ease'
    });

    // CSS animation
    if (!document.getElementById('mahfoor-toast-style')) {
      const style = document.createElement('style');
      style.id = 'mahfoor-toast-style';
      style.textContent = `
        @keyframes slideInToast {
          from { transform: translateY(80px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 8000);
  }

  function _playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.3);
      });
    } catch (e) { /* صوت اختياري */ }
  }

  // ──────────────────────────────────────────
  //  طلب إذن الإشعارات
  // ──────────────────────────────────────────
  function requestNotificationPermission() {
    if (Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ──────────────────────────────────────────
  //  حفظ حالة توفر منتج في Firebase
  //  productId: رقم المنتج، available: true/false
  // ──────────────────────────────────────────
  async function saveProductAvailability(productId, available) {
    if (!initialized || !db) {
      console.warn('Firebase not ready, availability saved locally only');
      return;
    }
    try {
      await db.ref(`mahfoor_availability/${productId}`).set({
        id: productId,
        available: available,
        updatedAt: Date.now()
      });
      console.log(`✅ Product ${productId} availability → ${available}`);
    } catch (err) {
      console.warn('Firebase availability update failed:', err);
    }
  }

  // ──────────────────────────────────────────
  //  مستمع real-time لحالة التوفر (للمتجر)
  //  callback(availabilityMap) مثال: { 1: false, 3: true }
  // ──────────────────────────────────────────
  function listenToProductAvailability(callback) {
    if (!initialized || !db) {
      callback({});
      return;
    }
    db.ref('mahfoor_availability').on('value', (snapshot) => {
      const data = snapshot.val() || {};
      // حوّل البيانات لـ map بسيط: { productId: available }
      const availMap = {};
      Object.values(data).forEach(item => {
        availMap[item.id] = item.available;
      });
      callback(availMap);
    });
  }

  return { init, saveOrder, updateOrderStatus, deleteOrder, clearAllOrders, listenToOrders, requestNotificationPermission, saveProductAvailability, listenToProductAvailability };
})();

// تهيئة تلقائية عند تحميل أي صفحة
document.addEventListener('DOMContentLoaded', () => {
  MAHFOOR_FIREBASE.init();
});