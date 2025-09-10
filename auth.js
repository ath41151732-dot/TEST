// auth.js (single-button edition): 
// - 새 버튼을 만들지 않습니다.
// - 화면에 이미 있는 'google로 로그인' 버튼 1개에만 이벤트를 연결합니다.
// - Firestore에 users/{uid} 문서로 events 배열을 저장/동기화합니다.

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  initializeFirestore, doc, getDoc, setDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 0) Firebase App 초기화 (이미 초기화돼 있으면 재사용)
const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig || {});
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });

// === Firestore 동기화 (UI 생성 없음) ===
function startEventsSync(uid){
  try {
    if (!uid) return;
    const ref = doc(db, "users", uid); // users/{uid}

    // 최초 동기화
    (async () => {
      try{
        const snap = await getDoc(ref);
        const local = (typeof window.getUserEvents === 'function')
          ? (window.getUserEvents() || [])
          : (window.EVENTS_USER || []);
        if (!snap.exists()){
          await setDoc(ref, { events: local, updatedAt: Date.now() });
        } else {
          const remote = Array.isArray(snap.data()?.events) ? snap.data().events : [];
          if (remote.length){
            window.applyRemoteEvents?.(remote);
          } else if (local.length){
            await setDoc(ref, { events: local, updatedAt: Date.now() }, { merge: true });
          }
        }
      }catch(e){ console.warn('[sync] initial', e); }
    })();

    // 실시간 수신
    if (window._unsubEvents) try{ window._unsubEvents(); }catch{}
    window._unsubEvents = onSnapshot(ref, (snap) => {
      const arr = Array.isArray(snap.data()?.events) ? snap.data().events : [];
      window.applyRemoteEvents?.(arr);
    });

    // 로컬 저장 후 → 클라우드 업데이트 훅
    window.afterLocalSave = function(){
      try{
        const arr = (typeof window.getUserEvents === 'function')
          ? (window.getUserEvents() || [])
          : (window.EVENTS_USER || []);
        setDoc(ref, { events: Array.isArray(arr) ? arr : [], updatedAt: Date.now() }, { merge: true });
      }catch(e){ console.warn('[sync] push', e); }
    };
  } catch (e) {
    console.warn('[sync] startEventsSync error', e);
  }
}

function stopEventsSync(){
  try{ window._unsubEvents && window._unsubEvents(); }catch{}
  try{ delete window.afterLocalSave; }catch{}
}

// === 기존 'google로 로그인' 버튼 1개에만 이벤트 연결 (UI 생성 없음) ===
(function attachExistingLoginButton(){
  try {
    const provider = new GoogleAuthProvider();
    try { if (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN) {
      provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });
    }} catch(e){}

    function norm(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
    function findLoginBtn(){
      const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      return nodes.find(el => norm(el.textContent).includes('google로 로그인')) || document.getElementById('loginBtn');
    }

    function wire(){
      const btn = findLoginBtn();
      if (!btn || btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => signInWithPopup(auth, provider).catch(console.warn));
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire, { once: true });
    } else {
      wire();
    }
  } catch(e) {
    console.warn('[auth] attachExistingLoginButton', e);
  }
})();

// === 인증 상태 변화 → 동기화 및 (있다면) UI 토글 ===
onAuthStateChanged(auth, (user) => {
  const email = (user && user.email || '').toLowerCase();
  const allowed = (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN)
    ? email.endsWith('@' + ALLOWED_DOMAIN)
    : true;

  // 선택적으로, 페이지에 존재하는 요소가 있으면 토글(없으면 건드리지 않음)
  const loginBtn  = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userName  = document.getElementById('userName');

  function showIn(u){
    if (loginBtn)  loginBtn.style.display = 'none';
    if (userName) { userName.style.display = ''; userName.textContent = (u.displayName || u.email || '로그인됨'); }
    if (logoutBtn) {
      logoutBtn.style.display = '';
      if (!logoutBtn._wired) {
        logoutBtn._wired = true;
        logoutBtn.addEventListener('click', () => signOut(auth).catch(console.warn));
      }
    }
  }
  function showOut(){
    if (loginBtn)  loginBtn.style.display = '';
    if (userName)  userName.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }

  if (user && allowed){
    showIn(user);
    startEventsSync(user.uid);
  } else {
    stopEventsSync();
    showOut();
  }
});
