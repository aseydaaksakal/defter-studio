// Veri tablosu: sıralama, filtreleme, hücre düzenleme, satır ekle/sil, CSV ve Markdown dışa aktarma, kaynak rozetleri
import { h, icon, download, slug, toast, citeChip } from '../../ui.js';

export function render(root, art, api) {
  const c = art.content;
  const refs = Object.fromEntries((c.refs || []).map((r) => [r.n, r]));
  let sortCol = -1, asc = true, q = '', editing = false;
  const tbl = h('table', { class: 'dtable' });
  const wrap = h('div', { class: 'dtable-wrap' }, tbl);

  function paint() {
    let rows = c.rows.map((r, i) => ({ ...r, _i: i }));
    if (q) rows = rows.filter((r) => r.cells.join(' ').toLocaleLowerCase('tr').includes(q));
    if (sortCol >= 0) rows.sort((a, b) => String(a.cells[sortCol] ?? '').localeCompare(String(b.cells[sortCol] ?? ''), 'tr', { numeric: true }) * (asc ? 1 : -1));
    tbl.replaceChildren(
      h('thead', {}, h('tr', {}, c.columns.map((col, k) => h('th', { 'aria-sort': sortCol === k ? (asc ? 'ascending' : 'descending') : 'none' },
        h('button', { class: 'th-btn', onclick: () => { asc = sortCol === k ? !asc : true; sortCol = k; paint(); } }, col, sortCol === k ? (asc ? ' ▲' : ' ▼') : ''))),
        h('th', { class: 'ref-col' }, 'Kaynak'), editing ? h('th') : null)),
      h('tbody', {}, rows.map((r) => h('tr', {},
        c.columns.map((_, k) => h('td', { contenteditable: editing ? 'true' : null, 'data-r': r._i, 'data-k': k }, r.cells[k] ?? '')),
        h('td', { class: 'ref-col' }, r.ref && refs[r.ref] ? citeChip(refs[r.ref]) : ''),
        editing ? h('td', {}, h('button', { class: 'icon-btn', 'aria-label': 'Satırı sil', onclick: () => { c.rows.splice(r._i, 1); paint(); } }, icon('trash', 16))) : null))));
  }
  function collect() {
    tbl.querySelectorAll('td[data-r]').forEach((td) => { c.rows[+td.dataset.r].cells[+td.dataset.k] = td.innerText.trim(); });
  }
  const csv = () => [c.columns, ...c.rows.map((r) => r.cells)].map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const md = () => `| ${c.columns.join(' | ')} |\n| ${c.columns.map(() => '---').join(' | ')} |\n` + c.rows.map((r) => `| ${c.columns.map((_, k) => r.cells[k] ?? '').join(' | ')} |`).join('\n');
  const editBtn = h('button', { class: 'btn ghost small' }, icon('edit', 16), ' Düzenle');
  editBtn.onclick = async () => {
    if (editing) { collect(); await api.save({ ...c }, 'Tablo düzenlendi'); toast('Tablo kaydedildi'); }
    editing = !editing; paint();
    editBtn.replaceChildren(icon(editing ? 'check' : 'edit', 16), editing ? ' Kaydet' : ' Düzenle');
    addBtn.hidden = !editing;
  };
  const addBtn = h('button', { class: 'btn ghost small', hidden: true, onclick: () => { collect(); c.rows.push({ cells: c.columns.map(() => '') }); paint(); } }, icon('plus', 16), ' Satır');

  root.append(h('div', { class: 'table-view' },
    h('div', { class: 'row gap wrap' },
      h('input', { class: 'input small', type: 'search', placeholder: 'Tabloda ara…', 'aria-label': 'Tabloda ara', oninput: (e) => { q = e.target.value.toLocaleLowerCase('tr'); paint(); } }),
      h('span', { class: 'muted small' }, `${c.rows.length} satır`), h('span', { class: 'grow' }), addBtn, editBtn,
      h('button', { class: 'btn ghost small', onclick: () => { navigator.clipboard.writeText(md()); toast('Markdown kopyalandı'); } }, icon('copy', 16), ' Kopyala'),
      h('button', { class: 'btn ghost small', onclick: () => download(slug(art.title) + '.csv', '﻿' + csv(), 'text/csv') }, icon('download', 16), ' CSV')),
    wrap, c.notes ? h('p', { class: 'muted small' }, c.notes) : null));
  paint();
}

export function toText(art) {
  const c = art.content;
  return [c.columns.join(' | '), ...c.rows.map((r) => r.cells.join(' | '))].join('\n');
}
