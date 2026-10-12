// Rapor: içindekiler, kaynak rozetleri, Markdown düzenleme, etkileşimli gömme (diğer Studio içerikleri), MD/PDF indirme
import { h, icon, renderMarkdown, download, slug, toast } from '../../ui.js';

const EMBED = /<!--\s*embed:(\d+)\s*-->/g;

export function render(root, art, api) {
  const c = art.content;
  const toc = h('nav', { class: 'toc', 'aria-label': 'İçindekiler' });
  const body = h('article', { class: 'report-body' });
  let editing = false;

  function paint() {
    body.replaceChildren();
    const parts = (c.markdown || '').split(EMBED);
    parts.forEach((p, i) => {
      if (i % 2 === 1) { const box = h('div', { class: 'embed card' }); body.append(box); api.renderEmbedded(+p, box); }
      else if (p.trim()) body.append(renderMarkdown(p, c.refs || []));
    });
    toc.replaceChildren();
    body.querySelectorAll('h1,h2,h3').forEach((hd, i) => {
      hd.id = 'h-' + i;
      toc.append(h('a', { href: '#h-' + i, class: 'toc-' + hd.tagName.toLowerCase(), onclick: (e) => { e.preventDefault(); hd.scrollIntoView({ behavior: 'smooth' }); } }, hd.textContent));
    });
  }

  const ta = h('textarea', { class: 'input md-edit', spellcheck: 'true' });
  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Düzenle');
  editBtn.onclick = async () => {
    editing = !editing;
    if (editing) { ta.value = c.markdown; body.replaceWith(ta); ta.focus(); }
    else {
      c.markdown = ta.value;
      await api.save({ ...c }, 'Rapor düzenlendi');
      ta.replaceWith(body); paint(); toast('Rapor kaydedildi');
    }
    editBtn.replaceChildren(icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Düzenle');
  };
  const embedBtn = h('button', { class: 'btn ghost small' }, icon('plus', 16), ' Studio içeriği göm');
  embedBtn.onclick = async () => {
    const id = await api.pickArtifact();
    if (!id) return;
    c.markdown += `\n\n<!-- embed:${id} -->\n`;
    await api.save({ ...c }, 'Gömülü içerik eklendi');
    paint();
  };

  root.append(h('div', { class: 'report-view' },
    h('div', { class: 'row gap wrap' }, h('span', { class: 'grow' }), embedBtn, editBtn,
      h('button', { class: 'btn ghost small', onclick: () => download(slug(art.title) + '.md', c.markdown, 'text/markdown') }, icon('download', 16), ' Markdown'),
      h('button', { class: 'btn ghost small', onclick: () => printReport(body) }, icon('download', 16), ' PDF')),
    h('div', { class: 'report-grid' }, toc, body)));
  paint();
}

function printReport(body) {
  const box = h('div', { id: 'print-root', class: 'print-report' }, body.cloneNode(true));
  document.body.append(box); document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); box.remove(); }, 100);
}

export function toText(art) { return art.content.markdown; }
