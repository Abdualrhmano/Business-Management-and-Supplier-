// public/app.js (محسّن — يحتفظ بالمنطق الأساسي ويضيف تحسينات غير متطفلة)
document.addEventListener('DOMContentLoaded', () => {
  // عناصر DOM بأمان (التحقق من الوجود)
  const openFormBtn = document.getElementById('open-form-btn');
  const heroStart = document.getElementById('hero-start');
  const orderPanel = document.getElementById('order-panel');
  const form = document.getElementById('multi-step-form');
  const steps = Array.from(document.querySelectorAll('.step'));
  const stepPanels = Array.from(document.querySelectorAll('.step-panel'));
  const nextBtns = Array.from(document.querySelectorAll('.next-btn'));
  const prevBtns = Array.from(document.querySelectorAll('.prev-btn'));
  const analysisUI = document.getElementById('analysis-ui');
  const planOutput = document.getElementById('plan-output');
  const planEmpty = document.getElementById('empty-state');
  const downloadBtn = document.getElementById('download-btn');
  const printBtn = document.getElementById('print-btn');
  const refineBtn = document.getElementById('refine-btn');
  const newBtn = document.getElementById('new-btn');

  const metaBusiness = document.getElementById('meta-business');
  const metaIndustry = document.getElementById('meta-industry');
  const metaGoals = document.getElementById('meta-goals');
  const marketingEl = document.getElementById('marketing');
  const swotEl = document.getElementById('swot');
  const actionsEl = document.getElementById('actions');

  // حماية: إذا لم يوجد النموذج أو الألواح فلا نفعل شيء
  if (!form || stepPanels.length === 0) return;

  // --- تحسينات غير متطفلة: toasts, spinner, autosave, aria-live, confetti CSS ---
  // ننشئ عناصر مساعدة فقط إذا لم تكن موجودة
  function ensureEl(id, tag = 'div', attrs = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
      document.body.appendChild(el);
    }
    return el;
  }

  // Toast root
  const toastRoot = ensureEl('enh-toast-root');
  Object.assign(toastRoot.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: '99999',
    display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none'
  });
  function showToast(msg, type = 'info', timeout = 4000) {
    const t = document.createElement('div');
    t.className = `enh-toast enh-toast-${type}`;
    t.textContent = msg;
    Object.assign(t.style, {
      background: type === 'error' ? '#ff6b6b' : (type === 'success' ? '#8be38b' : '#021025'),
      color: '#fff', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 6px 18px rgba(2,16,37,0.12)',
      fontSize: '13px', maxWidth: '320px', pointerEvents: 'auto'
    });
    toastRoot.appendChild(t);
    setTimeout(() => t.style.opacity = '0.01', timeout - 300);
    setTimeout(() => t.remove(), timeout);
  }

  // Spinner overlay
  const spinner = ensureEl('enh-spinner');
  Object.assign(spinner.style, {
    position: 'fixed', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2,16,37,0.35)', zIndex: '99998'
  });
  spinner.innerHTML = `<div style="background:#fff;padding:14px;border-radius:10px;display:flex;gap:12px;align-items:center">
    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(90deg,#7c4dff,#6ee7f9);animation:enh-spin 1s linear infinite"></div>
    <div style="font-family:inherit;color:#021025">جاري إنشاء الخطة…</div>
  </div>`;
  const enhStyleId = 'enh-styles';
  if (!document.getElementById(enhStyleId)) {
    const style = document.createElement('style');
    style.id = enhStyleId;
    style.textContent = `
      @keyframes enh-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      .confetti { position: fixed; inset: 0; pointer-events: none; overflow: visible; z-index: 99997 }
      .confetti .piece { position: absolute; will-change: transform, opacity; animation-name: enh-confetti-fall; animation-timing-function: cubic-bezier(.2,.8,.2,1); }
      @keyframes enh-confetti-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity:1 } 100% { transform: translateY(110vh) rotate(720deg); opacity:0.01 } }
    `;
    document.head.appendChild(style);
  }

  // aria-live region لتحسين الوصولية
  const liveRegion = ensureEl('enh-aria-live', 'div', { 'aria-live': 'polite', 'aria-atomic': 'true' });
  Object.assign(liveRegion.style, { position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' });

  // --- فتح النموذج من الشريط أو الهيرو ---
  [openFormBtn, heroStart].forEach(btn => {
    if (!btn || !orderPanel) return;
    btn.addEventListener('click', () => {
      orderPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      orderPanel.animate([{ transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }], { duration: 300 });
    });
  });

  // متعدد الخطوات مع انتقالات بسيطة
  let currentStep = 1;
  const totalSteps = stepPanels.length;

  function showStep(n) {
    currentStep = Math.max(1, Math.min(n, totalSteps));
    stepPanels.forEach(p => {
      const stepNum = parseInt(p.dataset.step, 10) || 0;
      const is = stepNum === currentStep;
      p.hidden = !is;
      p.style.opacity = is ? '1' : '0';
      p.style.transform = is ? 'translateX(0)' : 'translateX(8px)';
      p.setAttribute('aria-hidden', (!is).toString());
    });
    steps.forEach(s => {
      const stepNum = parseInt(s.dataset.step, 10) || 0;
      const isActive = stepNum === currentStep;
      s.classList.toggle('active', isActive);
      s.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep < totalSteps) showStep(currentStep + 1);
    });
  });
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) showStep(currentStep - 1);
    });
  });
  showStep(1);

  // مساعدة: تعطيل/تمكين عناصر واجهة
  function setUiBusy(isBusy) {
    const allControls = [downloadBtn, printBtn, ...nextBtns, ...prevBtns];
    allControls.forEach(c => { if (c) c.disabled = isBusy; });
    if (form) {
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = isBusy;
    }
    // Spinner و live region
    showSpinner(isBusy);
    liveRegion.textContent = isBusy ? 'المعالجة جارية' : 'جاهز';
  }

  // تحويل نص إلى HTML آمن (تحويل فقرات)
  function escapeHtml(str) {
    if (!str && str !== '') return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function toHtmlSafe(text) {
    if (!text) return '<p class="muted">لا توجد بيانات.</p>';
    return String(text).split(/\n{1,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  }

  // --- Autosave (مسودة) في localStorage ---
  const AUTO_SAVE_KEY = 'bizintel_draft_v1';
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (raw) {
      const draft = JSON.parse(raw);
      Object.keys(draft).forEach(k => {
        const el = form.elements[k];
        if (el) el.value = draft[k];
      });
      showToast('تم استعادة مسودة سابقة.', 'info', 2200);
    }
  } catch (e) { /* تجاهل أخطاء التخزين */ }

  let saveTimer = null;
  form.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const fd = new FormData(form);
      const obj = {};
      for (const [k, v] of fd.entries()) obj[k] = v;
      try { localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(obj)); } catch (e) {}
      liveRegion.textContent = 'تم حفظ المسودة محليًا.';
    }, 1200);
  });

  // زر لمسح المسودة إن وُجد
  const clearDraftBtn = document.getElementById('clear-draft-btn');
  if (clearDraftBtn) {
    clearDraftBtn.addEventListener('click', () => {
      localStorage.removeItem(AUTO_SAVE_KEY);
      showToast('تم مسح المسودة المحلية.', 'success', 2000);
    });
  }

  // --- fetch with timeout & retry (client-side helper) ---
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const merged = Object.assign({}, opts, { signal: controller.signal });
      const resp = await fetch(url, merged);
      clearTimeout(id);
      return resp;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }
  async function fetchWithRetry(url, opts = {}, retries = 2, baseDelay = 700) {
    let attempt = 0;
    let lastErr = null;
    while (attempt <= retries) {
      try {
        const resp = await fetchWithTimeout(url, opts, 30000);
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt || `HTTP ${resp.status}`);
        }
        return resp;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > retries) break;
        await new Promise(r => setTimeout(r, baseDelay * attempt));
      }
    }
    throw lastErr;
  }

  // إرسال النموذج
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // منع الإرسال المتكرر محليًا
    if (form.dataset.submitting === '1') {
      showToast('العملية جارية بالفعل. الرجاء الانتظار...', 'info', 1800);
      return;
    }
    form.dataset.submitting = '1';

    // جمع البيانات من الحقول بأمان (يدعم أسماء الحقول داخل form)
    const fd = new FormData(form);
    const data = {
      businessName: (fd.get('businessName') || '').toString().trim(),
      industry: (fd.get('industry') || '').toString().trim(),
      budget: (fd.get('budget') || '').toString().trim(),
      goals: (fd.get('goals') || '').toString().trim(),
      challenges: (fd.get('challenges') || '').toString().trim()
    };

    // تحقق بسيط
    if (!data.businessName || !data.industry || !data.goals || !data.challenges) {
      alert('يرجى إكمال الحقول المطلوبة.');
      delete form.dataset.submitting;
      return;
    }

    // واجهة: عرض حالة التحليل
    if (planEmpty) planEmpty.classList.add('hidden');
    if (planOutput) planOutput.classList.add('hidden');
    if (analysisUI) {
      analysisUI.classList.remove('hidden');
      analysisUI.setAttribute('aria-hidden', 'false');
    }
    setUiBusy(true);
    liveRegion.textContent = 'جاري إرسال البيانات إلى الخادم.';

    // نستخدم fetchWithRetry لنداء /api/generate (يحوي مهلة وإعادة محاولة)
    try {
      const resp = await fetchWithRetry('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }, 2, 800);

      const result = await resp.json();

      // عرض الخطة
      renderPlan(result, data);

      // Confetti عند النجاح
      runConfetti();
      showToast('تم إنشاء الخطة بنجاح!', 'success', 2200);
      liveRegion.textContent = 'تم إنشاء الخطة بنجاح.';
      // بعد نجاح الإنشاء، نحذف المسودة المحلية
      try { localStorage.removeItem(AUTO_SAVE_KEY); } catch (e) {}
    } catch (err) {
      console.error('خطأ أثناء التوليد:', err);
      if (err.name === 'AbortError') {
        alert('انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.');
      } else {
        alert('حدث خطأ أثناء إنشاء الخطة. حاول مرة أخرى لاحقًا.');
      }
      if (analysisUI) analysisUI.classList.add('hidden');
      if (planEmpty) planEmpty.classList.remove('hidden');
      showToast('فشل إنشاء الخطة. تحقق من الاتصال أو حاول لاحقًا.', 'error', 3500);
      liveRegion.textContent = 'فشل إنشاء الخطة.';
    } finally {
      setUiBusy(false);
      delete form.dataset.submitting;
    }
  });

  function renderPlan(result = {}, formData = {}) {
    if (analysisUI) analysisUI.classList.add('hidden');
    if (planOutput) planOutput.classList.remove('hidden');

    if (metaBusiness) metaBusiness.textContent = formData.businessName || '';
    if (metaIndustry) metaIndustry.textContent = formData.industry || '';
    if (metaGoals) metaGoals.textContent = `الأهداف: ${formData.goals || ''} · الميزانية: ${formData.budget || 'غير محددة'}`;

    if (marketingEl) marketingEl.innerHTML = toHtmlSafe(result.marketing || result.marketingText || '');
    if (swotEl) swotEl.innerHTML = toHtmlSafe(result.swot || result.swotText || '');
    if (actionsEl) actionsEl.innerHTML = toHtmlSafe(result.actions || result.actionsText || '');

    if (downloadBtn) downloadBtn.disabled = false;
    if (printBtn) printBtn.disabled = false;
  }

  // تحميل كملف نصي
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const title = `${(metaBusiness && metaBusiness.textContent) || 'business-plan'}`.replace(/\s+/g, '-').toLowerCase();
      const content = [
        `Business: ${(metaBusiness && metaBusiness.textContent) || ''}`,
        `Industry: ${(metaIndustry && metaIndustry.textContent) || ''}`,
        `${(metaGoals && metaGoals.textContent) || ''}`,
        '',
        '--- Marketing Strategy ---',
        (marketingEl && marketingEl.innerText) || '',
        '',
        '--- SWOT Analysis ---',
        (swotEl && swotEl.innerText) || '',
        '',
        '--- Action Steps ---',
        (actionsEl && actionsEl.innerText) || ''
      ].join('\n\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}-plan.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('تم تنزيل الخطة كملف نصي.', 'success', 1800);
    });
  }

  // طباعة الخطة
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      try {
        const business = (metaBusiness && metaBusiness.textContent) || '';
        const industry = (metaIndustry && metaIndustry.textContent) || '';
        const goals = (metaGoals && metaGoals.textContent) || '';
        const marketingText = (marketingEl && marketingEl.innerText) || '';
        const swotText = (swotEl && swotEl.innerText) || '';
        const actionsText = (actionsEl && actionsEl.innerText) || '';

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
          alert('تعذر فتح نافذة الطباعة. تأكد من السماح للنوافذ المنبثقة.');
          showToast('تأكد من السماح للنوافذ المنبثقة للطباعة.', 'info', 3500);
          return;
        }

        const html = `
          <html>
            <head>
              <title>Plan - ${escapeHtml(business)}</title>
              <style>
                body{font-family: Tajawal, Cairo, Arial, sans-serif;color:#021025;padding:20px}
                h1{font-size:20px}
                h2{font-size:16px;margin-top:18px}
                p{line-height:1.45}
                pre{white-space:pre-wrap;font-family:inherit}
              </style>
            </head>
            <body>
              <h1>${escapeHtml(business)}</h1>
              <div><strong>القطاع:</strong> ${escapeHtml(industry)}</div>
              <div><strong>${escapeHtml(goals)}</strong></div>
              <h2>استراتيجية التسويق</h2>
              <pre>${escapeHtml(marketingText)}</pre>
              <h2>تحليل SWOT</h2>
              <pre>${escapeHtml(swotText)}</pre>
              <h2>خطوات تنفيذية</h2>
              <pre>${escapeHtml(actionsText)}</pre>
            </body>
          </html>
        `;
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          try { printWindow.print(); } catch (err) { console.warn('Print failed', err); }
        }, 600);
      } catch (err) {
        console.error('خطأ أثناء الطباعة:', err);
        alert('حدث خطأ أثناء محاولة الطباعة.');
      }
    });
  }

  // تحسين / خطة جديدة
  if (refineBtn && orderPanel) {
    refineBtn.addEventListener('click', () => {
      orderPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      form.reset();
      showStep(1);
      if (planOutput) planOutput.classList.add('hidden');
      if (planEmpty) planEmpty.classList.remove('hidden');
      if (downloadBtn) downloadBtn.disabled = true;
      if (printBtn) printBtn.disabled = true;
      try { localStorage.removeItem(AUTO_SAVE_KEY); } catch (e) {}
      showToast('جاهز لبدء خطة جديدة.', 'info', 1400);
    });
  }

  // Confetti بسيط مع تنظيف آمن
  function runConfetti() {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    document.body.appendChild(confetti);
    const colors = ['#6EE7F9', '#7C4DFF', '#FFD166', '#FF6B6B', '#8BE38B'];
    const pieces = 28;
    for (let i = 0; i < pieces; i++) {
      const p = document.createElement('div');
      p.className = 'piece';
      p.style.background = colors[i % colors.length];
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (-10 - Math.random() * 10) + 'vh';
      p.style.width = (8 + Math.random() * 8) + 'px';
      p.style.height = (10 + Math.random() * 12) + 'px';
      p.style.opacity = '0.95';
      p.style.animationDuration = (2.6 + Math.random() * 1.6) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.appendChild(p);
    }
    // إزالة بعد انتهاء الأنيميشن أو بعد مهلة احتياطية
    const removeConfetti = () => { if (confetti && confetti.parentNode) confetti.parentNode.removeChild(confetti); };
    confetti.addEventListener('animationend', removeConfetti, { once: true });
    setTimeout(removeConfetti, 4500);
  }

  // سنة الفوتر
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
