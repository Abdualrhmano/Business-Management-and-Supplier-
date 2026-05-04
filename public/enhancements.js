/* enhancements.js
   تحسينات غير متطفلة تُضاف بعد الكود الأساسي.
   لا تغير الكود الأصلي، بل تكمل وظائفه وتضيف واجهة أفضل.
*/
(function () {
  'use strict';

  // --- إعدادات عامة ---
  const AUTO_SAVE_KEY = 'bp_draft_v1';
  const RETRY_MAX = 2;
  const RETRY_DELAY_MS = 900;
  const FETCH_TIMEOUT_MS = 30000;

  // --- عناصر مساعدة عامة (تُنشأ إذا لم تكن موجودة) ---
  function ensureElement(id, tag = 'div', attrs = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
      document.body.appendChild(el);
    }
    return el;
  }

  // Toasts بسيطة
  const toastRoot = ensureElement('enh-toast-root');
  Object.assign(toastRoot.style, {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none'
  });
  function showToast(msg, type = 'info', timeout = 4000) {
    const t = document.createElement('div');
    t.className = `enh-toast enh-toast-${type}`;
    t.textContent = msg;
    Object.assign(t.style, {
      background: type === 'error' ? '#ff6b6b' : (type === 'success' ? '#8be38b' : '#021025'),
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(2,16,37,0.12)',
      fontSize: '13px',
      maxWidth: '320px',
      pointerEvents: 'auto',
      opacity: '1',
      transition: 'opacity .3s ease'
    });
    toastRoot.appendChild(t);
    setTimeout(() => { t.style.opacity = '0.01'; }, timeout - 300);
    setTimeout(() => { try { t.remove(); } catch (e) {} }, timeout);
  }

  // Spinner overlay أثناء المعالجة
  const spinner = ensureElement('enh-spinner');
  Object.assign(spinner.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2,16,37,0.35)',
    zIndex: '99998',
    pointerEvents: 'none'
  });
  spinner.innerHTML = `<div style="background:#fff;padding:18px;border-radius:12px;display:flex;gap:12px;align-items:center">
    <div class="enh-spinner-dot" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(90deg,#7c4dff,#6ee7f9);animation:enh-spin 1s linear infinite"></div>
    <div style="font-family:inherit;color:#021025">جاري إنشاء الخطة…</div>
  </div>`;
  // إضافة قواعد CSS المساعدة مرة واحدة
  const ENH_STYLE_ID = 'enh-global-styles';
  if (!document.getElementById(ENH_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = ENH_STYLE_ID;
    style.textContent = `
      @keyframes enh-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      .enh-toast { transition: opacity .3s ease, transform .25s ease; }
      .confetti { position: fixed; inset: 0; pointer-events: none; overflow: visible; z-index: 99997 }
      .confetti .piece { position: absolute; will-change: transform, opacity; animation-name: enh-confetti-fall; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
      @keyframes enh-confetti-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity:1 } 100% { transform: translateY(110vh) rotate(720deg); opacity:0.01 } }
    `;
    document.head.appendChild(style);
  }

  function showSpinner(show = true) {
    spinner.style.display = show ? 'flex' : 'none';
  }

  // aria-live region لقراءة التحديثات للمستخدمين ذوي الإعاقة
  const liveRegion = ensureElement('enh-aria-live', 'div', { 'aria-live': 'polite', 'aria-atomic': 'true' });
  Object.assign(liveRegion.style, { position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' });

  // --- حفظ المسودة في localStorage (autosave) ---
  const form = document.getElementById('multi-step-form');
  if (form) {
    // استعادة المسودة عند التحميل
    try {
      const raw = localStorage.getItem(AUTO_SAVE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        Object.keys(draft).forEach(k => {
          const el = form.elements[k];
          if (el) el.value = draft[k];
        });
        showToast('تم استعادة مسودة سابقة.', 'info', 2500);
      }
    } catch (e) { /* تجاهل أخطاء التخزين */ }

    // حفظ تلقائي بعد آخر تغيير
    let saveTimer = null;
    form.addEventListener('input', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const fd = new FormData(form);
        const obj = {};
        for (const [k, v] of fd.entries()) obj[k] = v;
        try { localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(obj)); } catch (e) { /* تخطي */ }
        liveRegion.textContent = 'تم حفظ المسودة محليًا.';
      }, 1200);
    });
  }

  // زر لمسح المسودة (إن وُجد)
  const clearDraftBtn = document.getElementById('clear-draft-btn');
  if (clearDraftBtn) {
    clearDraftBtn.addEventListener('click', () => {
      localStorage.removeItem(AUTO_SAVE_KEY);
      showToast('تم مسح المسودة المحلية.', 'success');
    });
  }

  // --- Retry ذكي لعمليات fetch مع مهلة وAbortController احتياطي ---
  async function fetchWithRetry(url, opts = {}, retries = RETRY_MAX, delay = RETRY_DELAY_MS) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const merged = Object.assign({}, opts, { signal: controller.signal });
        const res = await fetch(url, merged);
        clearTimeout(timeoutId);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || `HTTP ${res.status}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        clearTimeout(timeoutId);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  // --- ربط التحسينات مع الكود الأساسي دون تغييره ---
  if (form) {
    const originalSubmit = form.querySelector('[type="submit"]');
    if (originalSubmit) {
      // لا نغيّر السلوك الأصلي: نراقب حدث submit ونضيف سلوكنا قبل وبعد
      form.addEventListener('submit', async (ev) => {
        // إذا حدثت معالجة بالفعل، نمنع تكرار الإرسال
        if (form.dataset.enhProcessing === '1') {
          ev.preventDefault();
          showToast('العملية جارية بالفعل. الرجاء الانتظار...', 'info');
          return;
        }

        // نسمح للكود الأصلي بالتعامل مع preventDefault داخليًا كما يفعل الآن
        // لكن نضيف واجهة مستخدم مساعدة: spinner وaria-live
        form.dataset.enhProcessing = '1';
        showSpinner(true);
        showToast('بدأت عملية إنشاء الخطة...', 'info', 1200);
        liveRegion.textContent = 'بدأت عملية إنشاء الخطة. الرجاء الانتظار.';

        // نراقب الشبكة عبر استبدال مؤقت لـ window.fetch (غير دائم) فقط أثناء المعالجة
        const nativeFetch = window.fetch;
        let fetchReplaced = false;
        try {
          window.fetch = async function (...args) {
            const url = args[0];
            if (typeof url === 'string' && url.includes('/api/generate')) {
              // استخدم retry ذكي لنداء /api/generate
              const opts = args[1] || {};
              return await fetchWithRetry(url, opts);
            }
            return nativeFetch.apply(this, args);
          };
          fetchReplaced = true;

          // ننتظر انتهاء معالجة الكود الأصلي: نراقب إزالة analysisUI أو ظهور planOutput كإشارة
          const waitForCompletion = () => new Promise((resolve) => {
            const maxWait = 35000;
            const start = Date.now();
            const check = () => {
              const analysisUI = document.getElementById('analysis-ui');
              const planOutput = document.getElementById('plan-output');
              if ((planOutput && !planOutput.classList.contains('hidden')) || (analysisUI && analysisUI.classList.contains('hidden'))) {
                resolve({ success: true });
                return;
              }
              if (Date.now() - start > maxWait) {
                resolve({ success: false });
                return;
              }
              setTimeout(check, 400);
            };
            check();
          });

          const result = await waitForCompletion();
          if (!result.success) {
            showToast('انتهت مهلة العملية. حاول مرة أخرى.', 'error');
            liveRegion.textContent = 'انتهت مهلة العملية.';
          } else {
            showToast('تم إنشاء الخطة بنجاح!', 'success');
            liveRegion.textContent = 'تم إنشاء الخطة بنجاح.';
          }
        } catch (err) {
          console.error('Enhancement wrapper error', err);
          showToast('حدث خطأ أثناء المعالجة.', 'error');
        } finally {
          // إعادة fetch الأصلي بأمان
          try {
            if (fetchReplaced) window.fetch = nativeFetch;
          } catch (e) { /* تجاهل */ }
          delete form.dataset.enhProcessing;
          showSpinner(false);
        }
      }, { passive: false });
    }
  }

  // --- تحسين Confetti: CSS افتراضي إذا لم يكن موجود ---
  (function ensureConfettiStyles() {
    const id = 'enh-confetti-style';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .confetti { position: fixed; inset: 0; pointer-events: none; overflow: visible; z-index: 99997 }
      .confetti .piece { position: absolute; will-change: transform, opacity; animation-name: enh-confetti-fall; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
      @keyframes enh-confetti-fall {
        0% { transform: translateY(-10vh) rotate(0deg); opacity:1 }
        100% { transform: translateY(110vh) rotate(720deg); opacity:0.01 }
      }
    `;
    document.head.appendChild(s);
  })();

  // --- فحص الطباعة: إن فشل فتح نافذة الطباعة نعرض توجيه للمستخدم ---
  const printBtn = document.getElementById('print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      setTimeout(() => {
        showToast('إذا لم تفتح نافذة الطباعة، تأكد من السماح للنوافذ المنبثقة.', 'info', 5000);
      }, 800);
    });
  }

  // --- اقتراحات اختبار سريعة ---
  function logEnhReady() {
    console.info('Enhancements loaded: autosave, spinner, toasts, retry wrapper, aria-live.');
  }
  logEnhReady();

})();
