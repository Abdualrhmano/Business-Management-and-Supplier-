

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // node 18+ يمكن استخدام global fetch بدل الحزمة
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات أمان أساسية
app.use(cors({
  origin: true, // في الإنتاج: ضع origin محدد بدلاً من true
  methods: ['GET','POST']
}));
app.use(bodyParser.json({ limit: '200kb' }));

// Serve static frontend (افتراضي: ملفات في مجلد public)
app.use(express.static(path.join(__dirname, 'public')));

/**
 * نقطة النهاية /api/generate
 * تستقبل بيانات النموذج من الواجهة الأمامية، تبني prompt، وتستدعي Gemini بأمان.
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { businessName, industry, budget, goals, challenges } = req.body || {};

    // تحقق بسيط على الخادم
    if (!businessName || !industry || !goals || !challenges) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة.' });
    }

    // بناء الـ prompt بطريقة منظمة
    const prompt = `
You are an expert small-business strategist. Create a concise, professional business plan in Arabic.
Business Name: ${businessName}
Industry: ${industry}
Budget: ${budget || 'N/A'}
Goals: ${goals}
Current Challenges: ${challenges}

Provide three sections with clear headings:
1) Marketing strategy — practical steps and channels, prioritized.
2) SWOT analysis — bullet points for Strengths, Weaknesses, Opportunities, Threats.
3) 90-day prioritized action steps — week-by-week or milestone-based.

Return the response as plain text with headings "استراتيجية التسويق:", "تحليل SWOT:", "خطوات تنفيذية (90 يوم):".
Keep each section concise and actionable.
`;

    // استدعاء Gemini (مثال REST). عدّل endpoint وbody وفق توثيق Gemini الفعلي.
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY غير مضبوط في متغيرات البيئة.');
      return res.status(500).json({ error: 'Server misconfiguration: API key missing.' });
    }

    // مثال استدعاء REST (تأكد من endpoint الصحيح وفق توثيق Google)
    const apiUrl = 'https://api.generative.google/v1beta2/models/gemini-pro:generateText'; // مثال افتراضي
    const payload = {
      // الهيكل الفعلي يختلف حسب واجهة Gemini؛ هذا مثال عام.
      prompt: prompt,
      maxOutputTokens: 800,
      temperature: 0.2,
      // أي إعدادات أخرى مطلوبة...
    };

    const aiResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify(payload),
      timeout: 20000
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('Gemini API error:', txt);
      return res.status(502).json({ error: 'AI service error', details: txt });
    }

    const aiJson = await aiResp.json();

    // استخراج النص من استجابة Gemini — قد يختلف حسب الصيغة الحقيقية
    // هنا نفترض أن النص الكامل موجود في aiJson.output[0].content أو aiJson.text
    let fullText = '';
    if (aiJson.output && Array.isArray(aiJson.output) && aiJson.output[0]) {
      // مثال: قد تكون المحتويات في output[0].content أو output[0].text
      fullText = aiJson.output[0].content || aiJson.output[0].text || '';
    }
    if (!fullText && aiJson.text) fullText = aiJson.text;
    if (!fullText) fullText = JSON.stringify(aiJson);

    // تقسيم النص إلى أقسام بناءً على العناوين العربية المتوقعة
    function extractSection(text, heading) {
      const re = new RegExp(heading + '[\\s\\S]*?(?=\\n[A-Za-z\u0600-\u06FF].+?:|$)', 'i');
      const m = text.match(re);
      if (m) {
        return m[0].replace(new RegExp('^' + heading, 'i'), '').trim();
      }
      // بديل: محاولة فصل حسب العناوين الإنجليزية
      const altRe = new RegExp(heading, 'i');
      if (altRe.test(text)) {
        const idx = text.indexOf(heading);
        return text.slice(idx + heading.length).trim();
      }
      return '';
    }

    // نبحث عن العناوين العربية أولاً
    const marketing = extractSection(fullText, 'استراتيجية التسويق:') || extractSection(fullText, 'Marketing strategy:') || '';
    const swot = extractSection(fullText, 'تحليل SWOT:') || extractSection(fullText, 'SWOT analysis:') || '';
    const actions = extractSection(fullText, 'خطوات تنفيذية (90 يوم):') || extractSection(fullText, 'Action Steps:') || '';

    // إذا كانت الأقسام فارغة، نرسل النص الكامل كاحتياط
    const responsePayload = {
      marketing: marketing || fullText.slice(0, 1200),
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

// في بيئة التطوير: خادم الملفات الثابتة من مجلد public
// تأكد أن index.html, styles.css, app.js داخل مجلد public أو عدّل المسارات حسب هيكل المشروع.

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
