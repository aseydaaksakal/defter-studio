// Defter Studio — dil modeli sağlayıcıları
// Tek arayüz: chat({ system, messages, json, onToken, signal }) → metin
// Desteklenenler: Ollama (lokal), OpenAI uyumlu her sunucu (LM Studio, llama.cpp, vLLM, OpenAI,
// Groq, OpenRouter, DeepSeek, Mistral ...), Google Gemini, Anthropic Claude.
import { getSetting, setSetting } from './db.js';

export const PROVIDERS = {
  ollama: {
    label: 'Ollama (lokal, ücretsiz)', baseUrl: 'http://localhost:11434', needsKey: false,
    model: 'qwen3.8:27b', embedModel: '',
    hint: 'Bilgisayarınızda çalışır. GitHub Pages’ten kullanırken OLLAMA_ORIGINS ayarı gerekir; uygulamayı lokal sunucudan (http://localhost:8765) açarsanız gerekmez (KURULUM.md).'
  },
  lmstudio: {
    label: 'LM Studio / llama.cpp / vLLM (lokal)', baseUrl: 'http://localhost:1234/v1', needsKey: false, kind: 'openai',
    model: '', embedModel: '', hint: 'OpenAI uyumlu lokal sunucu. LM Studio’da “Enable CORS” açık olmalı.'
  },
  gemini: {
    label: 'Google Gemini (ücretsiz katman var)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true,
    model: 'gemini-2.5-flash', embedModel: 'text-embedding-004', hint: 'Anahtarı aistudio.google.com adresinden alın.'
  },
  groq: {
    label: 'Groq (ücretsiz katman var)', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'console.groq.com — çok hızlı, açık modeller.'
  },
  openrouter: {
    label: 'OpenRouter (ücretsiz modeller dahil)', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'Adı “:free” ile biten modeller ücretsizdir.'
  },
  openai: {
    label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: 'text-embedding-3-small', hint: ''
  },
  anthropic: {
    label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1', needsKey: true,
    model: 'claude-sonnet-5-5', embedModel: '', hint: 'Anahtar yalnız bu tarayıcıda saklanır.'
  },
  xai: {
    label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'console.x.ai — “Listele” ile güncel Grok modellerini seçin.'
  },
  deepseek: {
    label: 'DeepSeek (ucuz)', baseUrl: 'https://api.deepseek.com', needsKey: true, kind: 'openai',
    model: 'deepseek-chat', embedModel: '', hint: 'platform.deepseek.com — deepseek-chat (hızlı) veya deepseek-reasoner (düşünen).'
  },
  qwen: {
    label: 'Alibaba Qwen (DashScope)', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', needsKey: true, kind: 'openai',
    model: 'qwen-plus', embedModel: '', hint: 'Model Studio (uluslararası) anahtarı. qwen-plus / qwen-max / qwen-flash.'
  },
  mistral: {
    label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, kind: 'openai',
    model: 'mistral-large-latest', embedModel: 'mistral-embed', hint: 'console.mistral.ai'
  },
  together: {
    label: 'Together AI (açık modeller)', baseUrl: 'https://api.together.xyz/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'api.together.ai — açık ağırlıklı modelleri bulutta çalıştırır.'
  },
  moonshot: {
    label: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.ai/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'platform.moonshot.ai — “Listele” ile model seçin.'
  },
  minimax: {
    label: 'MiniMax (metin)', baseUrl: 'https://api.minimax.io/v1', needsKey: true, kind: 'openai',
    model: '', embedModel: '', hint: 'platform.minimax.io — aynı anahtar seslendirmede de kullanılabilir.'
  },
  custom: {
    label: 'Özel OpenAI uyumlu uç nokta', baseUrl: '', needsKey: false, kind: 'openai', model: '', embedModel: '', hint: ''
  }
};

const kindOf = (p) => PROVIDERS[p]?.kind || p;

export async function loadConfig() {
  const cfg = await getSetting('llm', null);
  if (cfg) return cfg;
  const p = PROVIDERS.ollama;
  return { provider: 'ollama', baseUrl: p.baseUrl, apiKey: '', model: p.model, embedModel: '', numCtx: 32768, temperature: 0.6 };
}
export async function saveConfig(cfg) { await setSetting('llm', cfg); }

// Düşünen modellerin (<think>...</think>) iç sesini temizle
export function stripThinking(t) {
  return t.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
}

async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onData(line);
    }
  }
  if (buf.trim()) onData(buf.trim());
}

async function check(res) {
  if (res.ok) return res;
  let msg = `${res.status} ${res.statusText}`;
  try { const j = await res.json(); msg += ' — ' + (j.error?.message || j.error || JSON.stringify(j)); } catch {}
  throw new Error(msg);
}

export async function chat({ system = '', messages, json = false, onToken, signal, cfg, role, temperature, think }) {
  cfg = cfg || await loadConfig();
  const temp = temperature ?? cfg.temperature ?? 0.6;
  // Model rolleri: 'fast' görevleri (özet, öneri, plan) ayarlıysa küçük/hızlı modele gider
  if (role === 'fast' && cfg.fastModel) cfg = { ...cfg, model: cfg.fastModel };
  const kind = kindOf(cfg.provider);
  const base = (cfg.baseUrl || '').replace(/\/$/, '');
  let out = '';
  const push = (t) => { if (!t) return; out += t; onToken && onToken(t, out); };

  if (kind === 'ollama') {
    const body = {
      model: cfg.model, stream: true,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      options: { num_ctx: cfg.numCtx || 32768, temperature: temp }, keep_alive: '30m'
    };
    if (json) { body.format = 'json'; body.think = false; }
    else if (think === false) body.think = false; // JSON görevlerinde düşünme çıktısı yalnız süre harcar
    let res = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify(body), signal });
    if (!res.ok && res.status === 400 && 'think' in body) { delete body.think; res = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify(body), signal }); }
    await check(res);
    await readSSE(res, (line) => { try { const j = JSON.parse(line); push(j.message?.content); } catch {} });
  } else if (kind === 'openai') {
    const body = {
      model: cfg.model, stream: true, temperature: temp,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    };
    if (json) body.response_format = { type: 'json_object' };
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    if (cfg.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Defter Studio'; }
    let res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok && json && res.status === 400) { // bazı sunucular response_format desteklemez
      delete body.response_format;
      res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal });
    }
    await check(res);
    await readSSE(res, (line) => {
      if (!line.startsWith('data:')) return;
      const d = line.slice(5).trim();
      if (d === '[DONE]') return;
      try { push(JSON.parse(d).choices?.[0]?.delta?.content); } catch {}
    });
  } else if (kind === 'gemini') {
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = { contents, generationConfig: { temperature: temp } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const url = `${base}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
    const res = await check(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey }, body: JSON.stringify(body), signal }));
    await readSSE(res, (line) => {
      if (!line.startsWith('data:')) return;
      try { const j = JSON.parse(line.slice(5)); push((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')); } catch {}
    });
  } else if (kind === 'anthropic') {
    const body = { model: cfg.model, max_tokens: 16000, stream: true, temperature: Math.min(1, temp), messages };
    if (system) body.system = system;
    const res = await check(await fetch(base + '/messages', {
      method: 'POST', signal, body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    }));
    await readSSE(res, (line) => {
      if (!line.startsWith('data:')) return;
      try { const j = JSON.parse(line.slice(5)); if (j.type === 'content_block_delta') push(j.delta?.text); } catch {}
    });
  } else {
    throw new Error('Bilinmeyen sağlayıcı: ' + cfg.provider);
  }
  return stripThinking(out);
}

// Metnin içinden ilk geçerli JSON nesnesini çıkar
export function extractJSON(text) {
  const t = stripThinking(text).replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '');
  const start = t.search(/[{[]/);
  if (start < 0) throw new Error('Yanıtta JSON bulunamadı');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  return JSON.parse(t.slice(start)); // son çare
}

export async function chatJSON(opts) {
  const text = await chat({ ...opts, json: true });
  try { return extractJSON(text); } catch (e) {
    // Modelden bozuk JSON'u düzeltmesini iste
    const fixed = await chat({
      cfg: opts.cfg, role: opts.role, signal: opts.signal, json: true, temperature: 0,
      system: 'Yalnızca geçerli JSON döndür. Açıklama yazma.',
      messages: [{ role: 'user', content: 'Aşağıdaki metni geçerli JSON nesnesine dönüştür, içeriği değiştirme:\n\n' + text.slice(0, 60000) }]
    });
    return extractJSON(fixed);
  }
}

export async function embed(texts, cfg) {
  cfg = cfg || await loadConfig();
  if (!cfg.embedModel) return null;
  const kind = kindOf(cfg.provider);
  const base = (cfg.baseUrl || '').replace(/\/$/, '');
  if (kind === 'ollama') {
    const res = await check(await fetch(base + '/api/embed', { method: 'POST', body: JSON.stringify({ model: cfg.embedModel, input: texts }) }));
    return (await res.json()).embeddings;
  }
  if (kind === 'openai') {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    const res = await check(await fetch(base + '/embeddings', { method: 'POST', headers, body: JSON.stringify({ model: cfg.embedModel, input: texts }) }));
    return (await res.json()).data.map((d) => d.embedding);
  }
  if (kind === 'gemini') {
    const url = `${base}/models/${cfg.embedModel}:batchEmbedContents`;
    const res = await check(await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({ requests: texts.map((t) => ({ model: 'models/' + cfg.embedModel, content: { parts: [{ text: t }] } })) })
    }));
    return (await res.json()).embeddings.map((e) => e.values);
  }
  return null;
}

// Sağlayıcıdaki modelleri listele
export async function listModels(cfg) {
  const kind = kindOf(cfg.provider);
  const base = (cfg.baseUrl || '').replace(/\/$/, '');
  if (kind === 'ollama') {
    const j = await (await check(await fetch(base + '/api/tags'))).json();
    return j.models.map((m) => m.name);
  }
  if (kind === 'openai') {
    const headers = cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {};
    const j = await (await check(await fetch(base + '/models', { headers }))).json();
    return (j.data || []).map((m) => m.id).sort();
  }
  if (kind === 'gemini') {
    const j = await (await check(await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': cfg.apiKey } }))).json();
    return j.models.map((m) => m.name.replace('models/', ''));
  }
  if (kind === 'anthropic') {
    const j = await (await check(await fetch(base + '/models', {
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    }))).json();
    return j.data.map((m) => m.id);
  }
  return [];
}
