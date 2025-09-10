// auth.singlebtn.final.js — doesn't create UI; wires ONLY the existing 'Google 로그인' button; keeps Firestore sync
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig || {});
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });

// Sync
function startEventsSync(uid){
  try {
    if (!uid) return;
    const ref = doc(db, "users", uid);
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
    if (window._unsubEvents) try{ window._unsubEvents(); }catch{}
    window._unsubEvents = onSnapshot(ref, (snap) => {
      const arr = Array.isArray(snap.data()?.events) ? snap.data().events : [];
      window.applyRemoteEvents?.(arr);
    });
    window.afterLocalSave = function(){
      try{
        const arr = (typeof window.getUserEvents === 'function')
          ? (window.getUserEvents() || [])
          : (window.EVENTS_USER || []);
        setDoc(ref, { events: Array.isArray(arr) ? arr : [], updatedAt: Date.now() }, { merge: true });
      }catch(e){ console.warn('[sync] push', e); }
    };
  } catch(e){ console.warn('[sync] start', e); }
}
function stopEventsSync(){ try{ window._unsubEvents && window._unsubEvents(); }catch{} try{ delete window.afterLocalSave; }catch{} }

// Wire existing 'Google 로그인' only
(function attachExisting(){
  try{
    const provider = new GoogleAuthProvider();
    try { if (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN) { provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' }); } } catch(e){}
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
    function findLoginBtn(){
      const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      // prefer exact "Google 로그인"
      const exact = nodes.find(el => norm(el.textContent) === 'google 로그인');
      if (exact) return exact;
      // contains 'google 로그인' (mixed case)
      const contains = nodes.find(el => norm(el.textContent).includes('google 로그인'));
      if (contains) return contains;
      // fallback id
      return document.getElementById('loginBtn');
    }
    function wire(){
      const btn = findLoginBtn();
      if (!btn || btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => signInWithPopup(auth, provider).catch(console.warn));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true }); else wire();
  }catch(e){ console.warn('[auth] attachExisting', e); }
})();

// Auth state
onAuthStateChanged(auth, (user) => {
  const email = (user && user.email || '').toLowerCase();
  const allowed = (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN) ? email.endsWith('@' + ALLOWED_DOMAIN) : true;
  const loginBtn  = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userName  = document.getElementById('userName');
  function showIn(u){ if (loginBtn) loginBtn.style.display='none'; if (userName){ userName.style.display=''; userName.textContent=(u.displayName||u.email||'로그인됨'); } if (logoutBtn){ logoutBtn.style.display=''; if(!logoutBtn._wired){ logoutBtn._wired=true; logoutBtn.addEventListener('click', () => signOut(auth).catch(console.warn)); } } }
  function showOut(){ if (loginBtn) loginBtn.style.display=''; if (userName) userName.style.display='none'; if (logoutBtn) logoutBtn.style.display='none'; }
  if (user && allowed){ showIn(user); startEventsSync(user.uid); } else { stopEventsSync(); showOut(); }
});
