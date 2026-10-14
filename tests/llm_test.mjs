// Sağlayıcı istek biçimi testi (node tests/llm_test.mjs): gerçek anahtar ve ağ yok, fetch taklit edilir.
// Neden: bulut Claude 5'e temperature gidiyordu (400) ve gerçek anahtarla hiç denenmemişti; biçim burada resmi kurallara göre sınanır.
import { chat } from '../js/llm.js';

const AYRINTI = process.argv.includes('-v');
let gecen = 0, toplam = 0;
const ok = (ad, kosul, bilgi = '') => { toplam++; if (kosul) gecen++; if (!kosul || AYRINTI) console.log((kosul ? '✓ ' : '✗ ') + ad + (bilgi ? ' — ' + bilgi : '')); };
const sse = (lines) => new Response(lines.map((l) => 'data: ' + JSON.stringify(l) + '\n\n').join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
let istekler = [], cevap;
globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); istekler.push({ url, body }); return cevap(body, istekler.length); };
const anth = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'test', model: 'claude-sonnet-5-5', temperature: 0.6 };
const metin = [{ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'gizli' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Merhaba' } }];

cevap = () => sse(metin);
let out = await chat({ cfg: anth, system: 'k'.repeat(2500), messages: [{ role: 'user', content: 'SORU: x' }], cache: true });
let b = istekler[0].body;
ok('Claude 5: temperature gönderilmez, effort medium, max_tokens 64k', !('temperature' in b) && b.output_config?.effort === 'medium' && b.max_tokens === 64000, JSON.stringify({ t: b.temperature, oc: b.output_config, m: b.max_tokens }));
ok('Claude: önbellek istenince uzun sistem bloğu + otomatik önbellek', Array.isArray(b.system) && b.system[0].cache_control?.type === 'ephemeral' && b.cache_control?.type === 'ephemeral');
ok('Claude: düşünme metni çıktıya karışmaz', out === 'Merhaba', out);

istekler = [];
await chat({ cfg: anth, system: 'kısa', messages: [{ role: 'user', content: 'a' }], role: 'fast' });
b = istekler[0].body;
ok('Claude: hızlı görev low effort, tek seferlikte önbellek yazılmaz', b.output_config.effort === 'low' && typeof b.system === 'string' && !('cache_control' in b));

istekler = [];
cevap = (body, n) => (n === 1 ? new Response(JSON.stringify({ error: { message: 'temperature is not supported for this model' } }), { status: 400 }) : sse(metin));
out = await chat({ cfg: { ...anth, model: 'claude-opus-4-8' }, system: 's', messages: [{ role: 'user', content: 'a' }] });
ok('Eski Claude modeli: temperature gider; 400 "temperature" → onsuz bir kez yeniden', istekler.length === 2 && 'temperature' in istekler[0].body && !('temperature' in istekler[1].body) && out === 'Merhaba', String(istekler.length));

istekler = [];
const oa = { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'test', model: 'gpt-6', temperature: 0.6 };
const oaSse = () => sse([{ choices: [{ delta: { content: '{"a":1}' } }] }]);
cevap = (body, n) => (n === 1 ? new Response(JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.6 with this model." } }), { status: 400 }) : oaSse());
out = await chat({ cfg: oa, messages: [{ role: 'user', content: 'a' }], json: true });
ok('OpenAI akıl yürüten model: yalnız temperature atılır, response_format korunur', istekler.length === 2 && !('temperature' in istekler[1].body) && istekler[1].body.response_format?.type === 'json_object' && out === '{"a":1}');

istekler = [];
cevap = (body, n) => (n === 1 ? new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), { status: 400 }) : oaSse());
await chat({ cfg: { ...oa, provider: 'custom', baseUrl: 'http://localhost:1234/v1' }, messages: [{ role: 'user', content: 'a' }], json: true });
ok('OpenAI uyumlu sunucu: response_format desteklenmezse atılır, temperature kalır', istekler.length === 2 && !('response_format' in istekler[1].body) && istekler[1].body.temperature === 0.6);

console.log(`\n${gecen}/${toplam} sağlayıcı kontrolü geçti`);
process.exit(gecen === toplam ? 0 : 1);
