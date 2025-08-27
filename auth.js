// auth.js — PHHS 전용 Google 로그인 (@phhs.kr 도메인 제한)
// 정적 사이트(깃허브 Pages/Netlify 등)에서 바로 동작하도록 Firebase v10 CDN 모듈 사용

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence,
  signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { initializeFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
console.log("[auth] loaded");

// 🔧 네가 준 Firebase 설정 (콘솔에서 복사한 값)
const firebaseConfig = {
  apiKey: "AIzaSyCMBAyFozLAyVhsnm7Yl-SBJXVGAkLiysY",
  authDomain: "calender-6fe09.firebaseapp.com",
  projectId: "calender-6fe09",
  storageBucket: "calender-6fe09.firebasestorage.app",
  messagingSenderId: "822464492939",
  appId: "1:822464492939:web:d0b65cf1cd2d73b706ab8e",
  measurementId: "G-N2WYX8GBFT"
};

// Firebase 초기화
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);


const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });
// 같은 브라우저에서 로그인 상태 유지
setPersistence(auth, browserLocalPersistence).catch(console.warn);

// 허용할 구글 이메일 도메인
const ALLOWED_DOMAIN = "phhs.kr";

// 로그인 UI를 꽂을 자리 확보
function ensureBox(){
  // 1) 명시적 자리
  let box = document.getElementById("authBox");
  if (box) return box;

  // 2) 기존 툴바 오른쪽
  const bar = document.querySelector(".toolbar");
  if (bar){
    box = document.createElement("div");
    box.id = "authBox";
    box.style.marginLeft = "auto";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.gap = "8px";
    bar.appendChild(box);
    return box;
  }

  // 3) 임시 우상단 고정
  box = document.createElement("div");
  box.id = "authBox";
  box.style.cssText = "position:fixed;top:10px;right:10px;z-index:9999;display:flex;gap:8px;align-items:center";
  document.body.appendChild(box);
  return box;
}

// 비로그인 UI
function renderSignedOut(){
  const box = ensureBox(); if (!box) return;
  box.innerHTML = "";
  const btn = document.createElement("button");
  btn.textContent = "구글로 로그인";
  btn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    // 'hd'는 선택화면 힌트(완전 강제는 아니라서 아래에서 재검사)
    provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: "select_account" });
    try{
      const res = await signInWithPopup(auth, provider);
      const email = (res.user?.email || "").toLowerCase();
      if (!email.endsWith("@"+ALLOWED_DOMAIN)) {
        await signOut(auth);
        alert(`${ALLOWED_DOMAIN} 계정만 로그인할 수 있어요.`);
      }
    }catch(e){
      if (e?.code !== "auth/popup-closed-by-user"){
        alert("로그인 실패: " + (e?.message || e));
      }
    }
  });
  box.appendChild(btn);
}

// 로그인 UI
function renderSignedIn(user){
  const box = ensureBox(); if (!box) return;
  box.innerHTML = "";
  const who = document.createElement("span");
  who.style.fontSize = "12px";
  who.style.opacity = ".8";
  who.textContent = `${user.displayName || user.email} 로그인됨`;
  const out = document.createElement("button");
  out.textContent = "로그아웃";
  out.addEventListener("click", () => signOut(auth));
  box.append(who, out);
}

// 로그인 상태 반영 + 도메인 강제

// === Firestore 동기화 (로그인 후 시작) ===
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

    // 로컬 저장 래핑 → 클라우드 업데이트
    const origSave = window.saveUserEvents;
    window.saveUserEvents = function(){
      try{ origSave && origSave(); }catch{}
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
function stopEventsSync(){ try{ window._unsubEvents && window._unsubEvents(); }catch{} }
window.startEventsSync = startEventsSync;
window.stopEventsSync  = stopEventsSync;
// === END Firestore 동기화 ===

onAuthStateChanged(auth, (user) => {
  const ok = !!user && (user.email || "").toLowerCase().endsWith("@"+ALLOWED_DOMAIN);
  if (ok) renderSignedIn(user);
  else    renderSignedOut();
});

// 디버깅용
window.phhsAuth = { auth, signOut, onAuthStateChanged };


// === Lightweight Auth UI mount (guarantees login button) ===
function mountAuthUI(){
  try {
    const box = document.getElementById('authBox');
    if (!box) return;

    if (!box.querySelector('#authUI')) {
      box.innerHTML = [
        '<div id="authUI" style="display:flex;gap:.5rem;align-items:center">',
        '  <button id="loginBtn" type="button">Google 로그인</button>',
        '  <span id="userName" style="display:none"></span>',
        '  <button id="logoutBtn" type="button" style="display:none">로그아웃</button>',
        '</div>'
      ].join('');
    }

    const loginBtn  = box.querySelector('#loginBtn');
    const logoutBtn = box.querySelector('#logoutBtn');
    const userName  = box.querySelector('#userName');

    const provider = new GoogleAuthProvider();
    try {
      if (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN) {
        provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });
      }
    } catch (e) {}

    if (loginBtn) loginBtn.onclick  = () => signInWithPopup(auth, provider).catch(console.warn);
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth).catch(console.warn);

    function showSignedIn(u){
      if (loginBtn)  loginBtn.style.display = 'none';
      if (userName) { userName.style.display = ''; userName.textContent = (u.displayName || u.email || '로그인됨'); }
      if (logoutBtn) logoutBtn.style.display = '';
    }
    function showSignedOut(){
      if (loginBtn)  loginBtn.style.display = '';
      if (userName)  userName.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }

    // UI + 동기화
    onAuthStateChanged(auth, (user) => {
      const email = (user && user.email || '').toLowerCase();
      const allowed = (typeof ALLOWED_DOMAIN === 'string' && ALLOWED_DOMAIN)
        ? email.endsWith('@' + ALLOWED_DOMAIN)
        : true;
      if (user && allowed){
        showSignedIn(user);
        window.startEventsSync?.(user.uid);
      } else {
        showSignedOut();
        window.stopEventsSync?.();
      }
    });
  } catch (e) {
    console.warn('[auth-ui] mount error', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAuthUI, { once: true });
} else {
  mountAuthUI();
}
// === END Lightweight Auth UI ===

