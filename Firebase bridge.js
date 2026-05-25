// =====================================================
// Firebase Bridge - MAHFOOR CNC
// يُحمَّل قبل script.js كـ <script type="module">
// يعرض دوال Firebase على window عشان script.js يستخدمها
// =====================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDlQgvdsQZyOELPPmVWszHAjO4H75mwVck",
  authDomain: "mahfoor-cnc-mohand.firebaseapp.com",
  projectId: "mahfoor-cnc-mohand",
  storageBucket: "mahfoor-cnc-mohand.firebasestorage.app",
  messagingSenderId: "1052384264893",
  appId: "1:1052384264893:web:de6a12395dcfc14d156dd4"
};

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const ORDERS_COLLECTION = "orders";

  // حفظ طلب جديد
  window._saveOrderToFirebase = async function(order) {
    try {
      const docRef = await addDoc(collection(db, ORDERS_COLLECTION), {
        ...order,
        createdAt: serverTimestamp()
      });
      console.log("✅ تم حفظ الطلب على Firebase:", docRef.id);
      return docRef.id;
    } catch (e) {
      console.error("❌ فشل حفظ الطلب:", e);
      return null;
    }
  };

  // الاستماع للطلبات real-time
  window._listenToOrders = function(callback) {
    try {
      const q = query(collection(db, ORDERS_COLLECTION), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snapshot) => {
        const orders = [];
        snapshot.forEach((d) => {
          orders.push({ firebaseId: d.id, ...d.data() });
        });
        callback(orders);
      });
    } catch (e) {
      console.error("❌ فشل الاستماع:", e);
      callback(JSON.parse(localStorage.getItem('mahfourOrders')) || []);
      return () => {};
    }
  };

  // مسح كل الطلبات
  window._clearAllOrdersFromFirebase = async function() {
    try {
      const snapshot = await getDocs(collection(db, ORDERS_COLLECTION));
      const deletes = [];
      snapshot.forEach((document) => {
        deletes.push(deleteDoc(doc(db, ORDERS_COLLECTION, document.id)));
      });
      await Promise.all(deletes);
      console.log("✅ تم مسح كل الطلبات");
      return true;
    } catch (e) {
      console.error("❌ فشل المسح:", e);
      return false;
    }
  };

  window._firebaseReady = true;
  console.log("✅ Firebase Bridge جاهز");

} catch (e) {
  console.warn("⚠️ Firebase Bridge فشل التهيئة:", e);
  window._firebaseReady = false;
}