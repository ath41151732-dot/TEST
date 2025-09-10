// auth.js — one-button edition (keep only 'Google 로그인', hide other login buttons)
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Init
const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig || {});
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });

// ===== Firestore Sync =====
function startEventsSync(uid){
  try{
    if(!uid) return;
    const ref = doc(db, "users", uid);

    (async () => {
      try{
        const snap = await getDoc(ref);
        const local = (typeof window.getUserEvents === 'function') ? (window.getUserEvents() || []) : (window.EVENTS_USER || []);
        if (!snap.exists()){
          await setDoc(ref, { events: local, updatedAt: Date.now() });
        } else {
          const remote = Array.isArray(snap.data()?.events) ? snap.data().events : [];
          if (remote.length){ window.applyRemoteEvents?.(remote); }
          else if (local.length){ await setDoc(ref, { events: local, updatedAt: Date.now() }, { merge: true }); }
        }
      }catch(e){ console.warn('[sync] initial', e); }
    })();

    if (window._unsubEvents) try{ window._unsubEvents(); }catch{}
    window._unsubEvents = onSnapshot(ref, (snap) => {
      const arr = Array.isArray(snap.data()?.events) ? snap.data().events : [];
      window.applyRemoteEvents?.(arr);
    });

    window.afterLocalSave = function(){
      try{
        const arr = (typeof window.getUserEvents === 'function') ? (window.getUserEvents() || []) : (window.EVENTS_USER || []);
        setDoc(ref, { events: Array.isArray(arr) ? arr : [], updatedAt: Date.now() }, { merge: true });
      }catch(e){ console.warn('[sync] push', e); }
    };
  }catch(e){ console.warn('[sync] startEventsSync', e); }
}
function stopEventsSync(){ try{ window._unsubEvents && window._unsubEvents(); }catch{} try{ delete window.afterLocalSave; }catch{} }

// ===== Keep only the intended login button =====
function norm(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }

function getKeepLoginBtn(){
  const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
  // 1) Prefer exact phrase 'google 로그인' or '구글 로그인' (NO '로')
  let keep = nodes.find(el => (/\bgoogle\s*로그인\b/i.test(el.textContent || '') || /\b구글\s*로그인\b/.test(el.textContent || '')) );
  // 2) Fallback: first '로그인' containing google/구글
  if (!keep) keep = nodes.find(el => {
    const t = norm(el.textContent);
    return t.includes('로그인') && (t.includes('google') || t.includes('구글'));
  });
  // Hide other login-labelled buttons (e.g., '구글로 로그인')
  nodes.forEach(el => {
    if (el === keep) return;
    const t = norm(el.textContent);
    if (t.includes('로그인') && (t.includes('google') || t.includes('구글'))) {
      el.style.display = 'none';
    }
  });
  // Ensure keep is visible
  if (keep){ keep.style.display = ''; keep.hidden = false; }
  return keep || null;
}

function wireKeepLoginBtn(){
  try{
    const provider = new GoogleAuthProvider();
    try{
      if (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN){
        provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });
      }
    }catch{}

    const btn = getKeepLoginBtn();
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => signInWithPopup(auth, provider).catch(console.warn));
  }catch(e){ console.warn('[auth] wireKeepLoginBtn', e); }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', wireKeepLoginBtn, { once: true });
} else {
  wireKeepLoginBtn();
}

// ===== Auth state → toggle + sync =====
onAuthStateChanged(auth, (user) => {
  const keepBtn = getKeepLoginBtn();
  const email = (user && user.email || '').toLowerCase();
  const allowed = (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN) ? email.endsWith('@'+ALLOWED_DOMAIN) : true;

  const logoutBtn = document.getElementById('logoutBtn');
  const userName  = document.getElementById('userName');

  function showIn(u){
    if (keepBtn) keepBtn.style.display = 'none';
    if (userName){ userName.style.display=''; userName.textContent = (u.displayName || u.email || '로그인됨'); }
    if (logoutBtn){
      logoutBtn.style.display='';
      if (!logoutBtn._wired){
        logoutBtn._wired = true;
        logoutBtn.addEventListener('click', () => signOut(auth).catch(console.warn));
      }
    }
  }
  function showOut(){
    if (keepBtn) keepBtn.style.display = '';
    if (userName) userName.style.display='none';
    if (logoutBtn) logoutBtn.style.display='none';
  }

  if (user && allowed){ showIn(user); startEventsSync(user.uid); }
  else { stopEventsSync(); showOut(); }
});
