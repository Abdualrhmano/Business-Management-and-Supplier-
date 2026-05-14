const express = require('express');
const cors = require('cors');
const path = require('path');
const process = require('process');

try { require('dotenv').config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

if (typeof fetch === 'undefined') {
  try {
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch;
    global.Headers = nodeFetch.Headers;
    global.Request = nodeFetch.Request;
    global.Response = nodeFetch.Response;
    console.info('Using node-fetch polyfill for fetch.');
  } catch (err) {
    console.warn('Global fetch is not available and node-fetch is not installed. Install node-fetch or use Node 18+.');
  }
}

const CORS_ORIGIN = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'POST'] }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;");
  next();
});

app.use(express.json({ limit: '200kb' }));

app.use((req, res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounters.entries()) {
    if (now - entry.start > RATE_LIMIT_WINDOW_MS * 5) ipCounters.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS * 2);

function safeString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, 2000);
}

function extractSection(text, headingVariants = []) {
  if (!text) return '';
  for (const heading of headingVariants) {
    const re = new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?(?=\\n[^\\n]+?:|$)', 'i');
    const m = text.match(re);
    if (m && m[0]) {
      return m[0].replace(new RegExp('^' + heading, 'i'), '').trim();
    }
  }
  for (const heading of headingVariants) {
    const idx = text.toLowerCase().indexOf(heading.toLowerCase());
    if (idx >= 0) {
      return text.slice(idx + heading.length, idx + heading.length + 1600).trim();
    }
  }
  return '';
}

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

app.post('/api/generate', rateLimitMiddleware, async (req, res) => {
  try {
    const { businessName, industry, budget, goals, challenges } = req.body || {};
    if (!businessName || !industry || !goals || !challenges) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة.' });
    }

    const bName = safeString(businessName);
    const ind = safeString(industry);
    const bud = safeString(budget || '');
    const gls = safeString(goals);
    const ch = safeString(challenges);

    const promptText = `
      أنت خبير استراتيجي للأعمال الصغيرة. قم بإنشاء خطة عمل احترافية ومختصرة باللغة العربية.
      اسم الشركة: ${bName}
      القطاع: ${ind}
      الميزانية: ${bud || 'غير محددة'}
      الأهداف: ${gls}
      التحديات: ${ch}

      يجب أن يتضمن الرد العناوين التالية بالضبط:
      1) استراتيجية التسويق: خطوات عملية وقنوات ذات أولوية.
      2) تحليل SWOT: نقاط القوة، الضعف، الفرص، والتهديدات.
      3) خطوات تنفيذية (90 يوم): خطوات مقسمة حسب الأسابيع أو الأهداف.
    `;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY غير مضبوط في متغيرات البيئة.');
      return res.status(500).json({ error: 'Server misconfiguration: API key missing.' });
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.7 }
    };

    let aiResp;
    try {
      aiResp = await fetchWithRetry(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 2, 800, 25000);
    } catch (err) {
      console.error('AI fetch failed:', err);
      return res.status(502).json({ error: 'AI service error', details: err.message || String(err) });
    }

    let aiJson;
    try {
      aiJson = await aiResp.json();
    } catch (err) {
      const txt = await aiResp.text().catch(() => '');
      console.error('Failed to parse AI response as JSON:', err, txt);
      return res.status(502).json({ error: 'Invalid AI response format', details: txt || err.message });
    }

    let fullText = '';
    if (aiJson.candidates && Array.isArray(aiJson.candidates) && aiJson.candidates[0]) {
      try {
        fullText = aiJson.candidates[0].content.parts[0].text || aiJson.candidates[0].text || '';
      } catch (e) {
        fullText = aiJson.candidates[0].text || '';
      }
    }
    if (!fullText && aiJson.output && Array.isArray(aiJson.output) && aiJson.output[0]) {
      const first = aiJson.output[0];
      fullText = (first.content || first.text || first.message || '').toString();
    }
    if (!fullText && aiJson.output_text) fullText = String(aiJson.output_text);
    if (!fullText && aiJson.text) fullText = String(aiJson.text);
    if (!fullText) fullText = JSON.stringify(aiJson);

    try { console.info('AI response length:', fullText.length); } catch (e) {}

    const marketing = extractSection(fullText, ['استراتيجية التسويق:', 'استراتيجية التسويق', 'Marketing strategy:', 'Marketing Strategy:']);
    const swot = extractSection(fullText, ['تحليل SWOT:', 'تحليل SWOT', 'SWOT analysis:', 'SWOT Analysis:']);
    const actions = extractSection(fullText, ['خطوات تنفيذية (90 يوم):', 'خطوات تنفيذية:', 'Action Steps:', 'Action steps:']);

    const responsePayload = {
      marketing: marketing || fullText.slice(0, 1600),
      swot: swot || '',
      actions: actions || ''
    };

    return res.json(responsePayload);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

function shutdown() {
  console.log('Shutting down server...');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});