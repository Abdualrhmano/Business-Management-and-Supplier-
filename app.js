

document.addEventListener('DOMContentLoaded', () => {
  // عناصر DOM
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

  // فتح النموذج من الشريط أو الهيرو
  [openFormBtn, heroStart].forEach(btn => {
    if (btn) btn.addEventListener('click', () => {
      orderPanel.scrollIntoView({behavior:'smooth', block:'center'});
      orderPanel.animate([{transform:'translateY(-6px)'},{transform:'translateY(0)'}], {duration:300});
    });
  });

  // منطق متعدد الخطوات مع انتقالات
  let currentStep = 1;
  function showStep(n){
    currentStep = n;
    stepPanels.forEach(p => {
      const is = parseInt(p.dataset.step,10) === n;
      p.hidden = !is;
      p.style.opacity = is ? '1' : '0';
      p.style.transform = is ? 'translateX(0)' : 'translateX(8px)';
    });
    steps.forEach(s => {
      const isActive = parseInt(s.dataset.step,10) === n;
      s.classList.toggle('active', isActive);
      s.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }
  nextBtns.forEach(btn => btn.addEventListener('click', () => {
    if (currentStep < stepPanels.length) showStep(currentStep + 1);
  }));
  prevBtns.forEach(btn => btn.addEventListener('click', () => {
    if (currentStep > 1) showStep(currentStep - 1);
  }));
  showStep(1);

  // إرسال النموذج
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // جمع البيانات
    const data = {
      businessName: form.businessName.value.trim(),
      industry: form.industry.value.trim(),
      budget: form.budget.value.trim(),
      goals: form.goals.value.trim(),
      challenges: form.challenges.value.trim()
    };

    // تحقق بسيط
    if (!data.businessName || !data.industry || !data.goals || !data.challenges) {
      alert('يرجى إكمال الحقول المطلوبة.');
      return;
    }

    // واجهة: عرض حالة التحليل
    planEmpty.classList.add('hidden');
    planOutput.classList.add('hidden');
    analysisUI.classList.remove('hidden');
    downloadBtn.disabled = true;
    printBtn.disabled = true;

    try {
      // إرسال إلى الخادم (الخادم يتولى استدعاء Gemini بأمان)
      // ملاحظة: الخادم يجب أن يكون مرتبطاً بنفس المشروع ويستمع على /api/generate
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || 'خطأ في الخادم');
      }

      // نتوقع JSON: { marketing: "...", swot: "...", actions: "...", meta: {...} }
      const result = await resp.json();

      // عرض الخطة
      renderPlan(result, data);

      // تشغيل Confetti بسيط عند النجاح
      runConfetti();
    } catch (err) {
      console.error('خطأ أثناء التوليد:', err);
      alert('حدث خطأ أثناء إنشاء الخطة. حاول مرة أخرى لاحقًا.');
      analysisUI.classList.add('hidden');
      planEmpty.classList.remove('hidden');
    }
  });

  // تحويل نص إلى HTML آمن (تحويل فقرات)
  function toHtmlSafe(text){
    if (!text) return '<p class="muted">لا توجد بيانات.</p>';
    return text.split(/\n{1,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  }

  function renderPlan(result, formData){
    analysisUI.classList.add('hidden');
    planOutput.classList.remove('hidden');

    metaBusiness.textContent = formData.businessName;
    metaIndustry.textContent = formData.industry;
    metaGoals.textContent = `الأهداف: ${formData.goals} · الميزانية: ${formData.budget || 'غير محددة'}`;

    // نعرض المحتوى (نفترض أن الخادم يعيد نصًا آمنًا أو نصًا عاديًا)
    marketingEl.innerHTML = toHtmlSafe(result.marketing || result.marketingText || '');
    swotEl.innerHTML = toHtmlSafe(result.swot || result.swotText || '');
    actionsEl.innerHTML = toHtmlSafe(result.actions || result.actionsText || '');

    downloadBtn.disabled = false;
    printBtn.disabled = false;
  }

  // تحميل كملف نصي
  downloadBtn.addEventListener('click', () => {
    const title = `${metaBusiness.textContent || 'business-plan'}`.replace(/\s+/g,'-').toLowerCase();
    const content = [
      `Business: ${metaBusiness.textContent}`,
      `Industry: ${metaIndustry.textContent}`,
      `${metaGoals.textContent}`,
      '',
      '--- Marketing Strategy ---',
      marketingEl.innerText,
      '',
      '--- SWOT Analysis ---',
      swotEl.innerText,
      '',
      '--- Action Steps ---',
      actionsEl.innerText
    ].join('\n\n');

    const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}-plan.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // طباعة الخطة
  printBtn.addEventListener('click', () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    const html = `
      <html>
        <head>
          <title>Plan - ${escapeHtml(metaBusiness.textContent)}</title>
          <style>
            body{font-family: Tajawal, Cairo, Arial, sans-serif;color:#021025;padding:20px}
            h1{font-size:20px}
            h2{font-size:16px;margin-top:18px}
            p{line-height:1.45}
            pre{white-space:pre-wrap;font-family:inherit}
          </style>
        </head>
        <body>
          <h1>${escapeHtml(metaBusiness.textContent)}</h1>
          <div><strong>القطاع:</strong> ${escapeHtml(metaIndustry.textContent)}</div>
          <div><strong>${escapeHtml(metaGoals.textContent)}</strong></div>
          <h2>استراتيجية التسويق</h2>
          <pre>${escapeHtml(marketingEl.innerText)}</pre>
          <h2>تحليل SWOT</h2>
          <pre>${escapeHtml(swotEl.innerText)}</pre>
          <h2>خطوات تنفيذية</h2>
          <pre>${escapeHtml(actionsEl.innerText)}</pre>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(()=>printWindow.print(), 600);
  });

  // تحسين / خطة جديدة
  refineBtn.addEventListener('click', () => {
    orderPanel.scrollIntoView({behavior:'smooth', block:'center'});
  });

  newBtn.addEventListener('click', () => {
    form.reset();
    showStep(1);
    planOutput.classList.add('hidden');
    planEmpty.classList.remove('hidden');
    downloadBtn.disabled = true;
    printBtn.disabled = true;
  });

  // أدوات مساعدة
  function escapeHtml(str){
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Confetti بسيط: ينشئ عناصر DOM ويعطيها حركة عشوائية
  function runConfetti(){
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    document.body.appendChild(confetti);
    const colors = ['#6EE7F9','#7C4DFF','#FFD166','#FF6B6B','#8BE38B'];
    const pieces = 28;
    for (let i=0;i<pieces;i++){
      const p = document.createElement('div');
      p.className = 'piece';
      p.style.background = colors[i % colors.length];
      p.style.left = (Math.random()*100) + '%';
      p.style.top = (-10 - Math.random()*10) + 'vh';
      p.style.width = (8 + Math.random()*8) + 'px';
      p.style.height = (10 + Math.random()*12) + 'px';
      p.style.opacity = 0.95;
      p.style.animationDuration = (2.6 + Math.random()*1.6) + 's';
      p.style.transform = `rotate(${Math.random()*360}deg)`;
      confetti.appendChild(p);
    }
    // إزالة بعد انتهاء الأنيميشن
    setTimeout(()=>confetti.remove(), 4200);
  }

  // سنة الفوتر
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
