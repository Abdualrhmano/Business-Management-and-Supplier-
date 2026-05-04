// server.js (محسّن)
// متطلبات: node 18+ يملك fetch مدمج. إذا تستخدم node <18، قم بتثبيت node-fetch
// تثبيت مقترح (اختياري): npm i dotenv
const express = require('express');
const cors = require('cors');
const path = require('path');
const process = require('process');

try {
  require('dotenv').config();
} catch (e) {
  // dotenv اختياري؛ في بيئات الإنتاج قد لا تحتاجه
}

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- إعدادات أساسية وأمنية ----------
const CORS_ORIGIN = process.env.CORS_ORIGIN || true; // في الإنتاج ضع origin محدد
app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'POST'] }));

// استخدم express.json بدل body-parser (مضمن)
app.use(express.json({ limit: '200kb' }));

// سجلات بسيطة للطلبات (يمكن استبدال morgan لاحقًا)
app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// خادم الملفات الثابتة (public)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- حد معدل بسيط per-IP (in-memory) ----------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // نافذة دقيقة
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10); // 30 طلب/دقيقة افتراضي
const ipCounters = new Map();

function rateLimitMiddleware(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = ipCounters.get(ip) || { count: 0, start: now };
    if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    ipCounters.set(ip, entry);
    if (entry.count > RATE_LIMIT_MAX) {
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    next();
  } catch (err) {
    next();
  }
}

// تنظيف دوري للذاكرة (entries قديمة)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounters.entries()) {
    if (now - entry.start > RATE_LIMIT_WINDOW_MS * 5) ipCounters.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS * 2);

// ---------- أدوات مساعدة ----------
function safeString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, 2000); // حد طول مبدئي للحماية
}

// استخراج أقسام من نص الـ AI بمرونة
function extractSection(text, headingVariants = []) {
  if (!text) return '';
  for (const heading of headingVariants) {
    // نمط: العنوان متبوعًا بأي محتوى حتى العنوان التالي أو نهاية النص
    const re = new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?(?=\\n[^\\n]+?:|$)', 'i');
    const m = text.match(re);
    if (m && m[0]) {
      // إزالة العنوان نفسه من البداية
      return m[0].replace(new RegExp('^' + heading, 'i'), '').trim();
    }
  }
  // محاولة بديلة: البحث عن العنوان ثم أخذ 800 حرف بعده
  for (const heading of headingVariants) {
    const idx = text.toLowerCase().indexOf(heading.toLowerCase());
    if (idx >= 0) {
      return text.slice(idx + heading.length, idx + heading.length + 1600).trim();
    }
  }
  return '';
}

// fetch مع مهلة وAbortController
async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
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

// retry مع تراجع أسي (exponential backoff)
async function fetchWithRetry(url, opts = {}, retries = 2, baseDelay = 700, timeoutMs = 20000) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const resp = await fetchWithTimeout(url, opts, timeoutMs);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        const err = new Error(`HTTP ${resp.status}: ${txt}`);
        err.status = resp.status;
        throw err;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt > retries) break;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ---------- نقطة النهاية /api/generate (محسّنة) ----------
app.post('/api/generate', rateLimitMiddleware, async (req, res) => {
  try {
    const { businessName, industry, budget, goals, challenges } = req.body || {};

    // تحقق بسيط على الخادم (مكرر لحماية إضافية)
    if (!businessName || !industry || !goals || !challenges) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة.' });
    }

    // تنظيف المدخلات
    const bName = safeString(businessName);
    const ind = safeString(industry);
    const bud = safeString(budget || '');
    const gls = safeString(goals);
    const ch = safeString(challenges);

    // بناء prompt مع حدود طولية وحماية من حقن غير مرغوب
    const prompt = [
      'You are an expert small-business strategist. Create a concise, professional business plan in Arabic.',
      `Business Name: ${bName}`,
      `Industry: ${ind}`,
      `Budget: ${bud || 'N/A'}`,
      `Goals: ${gls}`,
      `Current Challenges: ${ch}`,
      '',
      'Provide three sections with clear headings in Arabic:',
      '1) استراتيجية التسويق: practical steps and channels, prioritized.',
      '2) تحليل SWOT: bullet points for Strengths, Weaknesses, Opportunities, Threats.',
      '3) خطوات تنفيذية (90 يوم): week-by-week or milestone-based prioritized action steps.',
      '',
      'Return the response as plain text with headings exactly: "استراتيجية التسويق:", "تحليل SWOT:", "خطوات تنفيذية (90 يوم):".',
      'Keep each section concise and actionable.'
    ].join('\n');

    // إعداد استدعاء Gemini الحقيقي
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL = process.env.GEMINI_API_URL || process.env.GEMINI_URL || ''; // ضع URL الصحيح في env
    if (!GEMINI_API_KEY || !GEMINI_API_URL) {
      console.warn('GEMINI_API_KEY أو GEMINI_API_URL غير مضبوط في متغيرات البيئة.');
      return res.status(500).json({ error: 'Server misconfiguration: AI credentials missing.' });
    }

    // بناء payload وفق واجهة REST المتوقعة — عدّل الحقول حسب توثيق مزودك
    const payload = {
      // مثال عام: قد تحتاج لتعديل هذا الجزء ليتوافق مع واجهة Gemini الحقيقية
      prompt: prompt,
      maxOutputTokens: 800,
      temperature: 0.2,
      // يمكنك إضافة إعدادات أخرى هنا حسب التوثيق
    };

    // رؤوس الطلب
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`
    };

    // استدعاء AI مع retry وtimeout
    let aiResp;
    try {
      aiResp = await fetchWithRetry(GEMINI_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }, /*retries*/ 2, /*baseDelay*/ 800, /*timeoutMs*/ 25000);
    } catch (err) {
      console.error('AI fetch failed:', err);
      return res.status(502).json({ error: 'AI service error', details: err.message || String(err) });
    }

    // قراءة JSON من الاستجابة
    let aiJson;
    try {
      aiJson = await aiResp.json();
    } catch (err) {
      const txt = await aiResp.text().catch(() => '');
      console.error('Failed to parse AI response as JSON:', err, txt);
      return res.status(502).json({ error: 'Invalid AI response format', details: txt || err.message });
    }

    // استخراج النص من استجابة Gemini (مرن لعدة صيغ)
    let fullText = '';
    // أمثلة على أماكن قد تحتوي النص حسب واجهات مختلفة
    if (aiJson.output && Array.isArray(aiJson.output) && aiJson.output.length > 0) {
      // قد تكون المحتويات في output[0].content أو output[0].text أو output[0].message
      const first = aiJson.output[0];
      fullText = (first.content || first.text || first.message || '').toString();
    }
    if (!fullText && aiJson.candidates && Array.isArray(aiJson.candidates) && aiJson.candidates[0]) {
      fullText = (aiJson.candidates[0].content || aiJson.candidates[0].text || '').toString();
    }
    if (!fullText && aiJson.output_text) fullText = String(aiJson.output_text);
    if (!fullText && aiJson.text) fullText = String(aiJson.text);
    if (!fullText) {
      // كحل أخير: stringify كامل (مفيد للتشخيص)
      fullText = JSON.stringify(aiJson);
    }

    // الآن نقسم النص إلى أقسام متوقعة (العناوين العربية أولاً ثم الإنجليزية)
    const marketing = extractSection(fullText, ['استراتيجية التسويق:', 'استراتيجية التسويق', 'Marketing strategy:', 'Marketing Strategy:']);
    const swot = extractSection(fullText, ['تحليل SWOT:', 'تحليل SWOT', 'SWOT analysis:', 'SWOT Analysis:']);
    const actions = extractSection(fullText, ['خطوات تنفيذية (90 يوم):', 'خطوات تنفيذية:', 'Action Steps:', 'Action steps:']);

    // إذا كانت الأقسام فارغة، نأخذ أجزاء من النص الكامل كاحتياط
    const responsePayload = {
      marketing: marketing || fullText.slice(0, 1600),
      swot: swot || '',
      actions: actions || ''
    };

    // إعادة النتيجة إلى الواجهة الأمامية
    return res.json(responsePayload);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// نقطة اختبار بسيطة
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// بدء الخادم
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
