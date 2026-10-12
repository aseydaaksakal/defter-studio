// Pomodoro odak zamanlayıcısı: 25 dk odak + 5 dk mola (4 turda bir 15 dk). Sayfa yenilense de süre korunur.
import { h, toast, confirmBox } from './ui.js';
import { award } from './learn.js';

const KEY = 'ds-pomo';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const save = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} };
const fmt = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function pomodoroButton() {
  const btn = h('button', { class: 'status-pill pomo', title: 'Pomodoro: 25 dk odak, 5 dk mola' }, '⏱');
  let st = load(), timer = 0;
  const beep = () => { try { const ac = new AudioContext(); const o = ac.createOscillator(); const g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.35); setTimeout(() => ac.close(), 600); } catch {} };
  function tick() {
    if (!st) { btn.textContent = '⏱'; btn.classList.remove('on', 'brk'); return; }
    const left = st.end - Date.now();
    btn.textContent = `${st.phase === 'focus' ? '🎯' : '☕'} ${fmt(left)}`;
    btn.classList.toggle('on', st.phase === 'focus'); btn.classList.toggle('brk', st.phase !== 'focus');
    if (left <= 0) {
      beep();
      if (st.phase === 'focus') {
        st.round = (st.round || 0) + 1; award(10, 'pomodoro');
        const long = st.round % 4 === 0;
        st = { ...st, phase: 'break', end: Date.now() + (long ? 15 : 5) * 60000 };
        toast(long ? 'Harika! 15 dakika uzun mola.' : 'Odak turu bitti: 5 dakika mola. Ayağa kalkın, su için.', 'ok', 6000);
        try { Notification.permission === 'granted' && new Notification('Mola zamanı', { body: long ? '15 dakika' : '5 dakika' }); } catch {}
      } else {
        st = { ...st, phase: 'focus', end: Date.now() + 25 * 60000 };
        toast('Mola bitti: yeni 25 dakikalık odak turu başladı.', 'info', 5000);
      }
      save(st);
    }
  }
  btn.onclick = async () => {
    if (!st) { st = { phase: 'focus', end: Date.now() + 25 * 60000, round: 0 }; save(st); toast('25 dakikalık odak başladı. Bildirimleri ve telefonu kapatın.'); }
    else if (await confirmBox('Pomodoro durdurulsun mu?', 'Bu turdaki süre kaydedilmez.', 'Durdur')) { st = null; save(null); }
    tick();
  };
  timer = setInterval(() => { if (!btn.isConnected) return clearInterval(timer); tick(); }, 1000);
  tick();
  return btn;
}
