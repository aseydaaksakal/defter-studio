// Sekme varlığı: aynı uygulama birden fazla sekmede açıkken bir sekmenin açılışı diğerinin işlerini
// ("Sayfa kapandığı için yarıda kaldı") bozmasın ve aynı iş (üretim, OCR, soru bankası) iki sekmede birden çalışmasın.
export const TAB = Math.random().toString(36).slice(2, 10);
const KEY = 'ds-tab:';
const beat = () => { try { localStorage.setItem(KEY + TAB, String(Date.now())); } catch {} };
beat();
setInterval(beat, 10000);
addEventListener('pagehide', () => { try { localStorage.removeItem(KEY + TAB); } catch {} });

// Son 30 saniyede sinyal veren diğer sekmeler
export function otherTabs() {
  const out = new Set();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(KEY) || k === KEY + TAB) continue;
      if (Date.now() - +localStorage.getItem(k) < 30000) out.add(k.slice(KEY.length));
      else localStorage.removeItem(k);
    }
  } catch {}
  return out;
}
// Bu işin sahibi şu an açık başka bir sekme mi?
export const ownedElsewhere = (owner) => !!owner && owner !== TAB && otherTabs().has(owner);
