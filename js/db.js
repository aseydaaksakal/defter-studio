// Defter Studio — tarayıcı içi veritabanı (IndexedDB, Dexie ile)
// Her şey kullanıcının kendi tarayıcısında saklanır; sunucuya hiçbir veri gitmez.
import Dexie from './vendor/dexie.mjs';

export const db = new Dexie('defter-studio');

// Şema sürüm 1
// notebooks : defterler
// sources   : kaynaklar (PDF, metin, web, ses dökümü)
// chunks    : kaynakların arama için parçaları
// messages  : sohbet geçmişi
// artifacts : Studio çıktıları (podcast, slayt, test ...). Her düzenleme yeni bir "version" kaydı açar.
// versions  : artifact'lerin eski sürümleri (geçmişe dönmek için)
// blobs     : ses / video dosyaları (Blob)
// settings  : anahtar-değer ayarlar
db.version(1).stores({
  notebooks: '++id, title, updatedAt',
  sources: '++id, notebookId, title, enabled, createdAt',
  chunks: '++id, sourceId, notebookId, ord',
  messages: '++id, notebookId, createdAt',
  artifacts: '++id, notebookId, type, status, createdAt, updatedAt',
  versions: '++id, artifactId, createdAt',
  blobs: '++id, artifactId, kind',
  settings: 'key'
});
// Şema sürüm 2 (0.3.0): soru bankası. Sorular token harcamadan tekrar tekrar test oluşturmak için saklanır.
// questions: { notebookId, q, options, answer, explanation, hint, topic, evidence, ref:{title,page,text}, verified,
//              preset, level, createdAt, seen, correct, wrong, lastAt, lastOk, due }
db.version(2).stores({
  questions: '++id, notebookId, topic, preset, createdAt, lastAt, due'
});

export const now = () => Date.now();

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

export async function touchNotebook(id) {
  await db.notebooks.update(id, { updatedAt: now() });
}

// Artifact kaydet; mevcut içeriği önce versions tablosuna kopyalar
export async function saveArtifactContent(id, content, note = 'Düzenlendi') {
  const art = await db.artifacts.get(id);
  if (!art) return;
  if (art.content) {
    await db.versions.add({ artifactId: id, content: art.content, title: art.title, note: art.versionNote || 'İlk sürüm', createdAt: art.updatedAt || art.createdAt });
  }
  await db.artifacts.update(id, { content, updatedAt: now(), versionNote: note });
}

export async function deleteArtifact(id) {
  await db.transaction('rw', db.artifacts, db.versions, db.blobs, async () => {
    await db.versions.where('artifactId').equals(id).delete();
    await db.blobs.where('artifactId').equals(id).delete();
    await db.blobs.filter((b) => String(b.artifactId).startsWith(id + ':')).delete();
    await db.artifacts.delete(id);
  });
}

export async function deleteSource(id) {
  await db.transaction('rw', db.sources, db.chunks, db.blobs, async () => {
    await db.chunks.where('sourceId').equals(id).delete();
    await db.blobs.where('artifactId').equals('src:' + id).delete();
    await db.sources.delete(id);
  });
}

export async function deleteNotebook(id) {
  const arts = await db.artifacts.where('notebookId').equals(id).primaryKeys();
  for (const a of arts) await deleteArtifact(a);
  const srcs = await db.sources.where('notebookId').equals(id).primaryKeys();
  for (const s of srcs) await deleteSource(s);
  await db.messages.where('notebookId').equals(id).delete();
  await db.questions.where('notebookId').equals(id).delete();
  await db.settings.delete('bank:' + id);
  await db.notebooks.delete(id);
}

// Yedek: bir defteri tek JSON dosyası olarak dışa aktar (ses/video blob'ları hariç)
export async function exportNotebook(id) {
  const notebook = await db.notebooks.get(id);
  const sources = await db.sources.where('notebookId').equals(id).toArray();
  const messages = await db.messages.where('notebookId').equals(id).toArray();
  const artifacts = await db.artifacts.where('notebookId').equals(id).toArray();
  const versions = [];
  for (const a of artifacts) versions.push(...await db.versions.where('artifactId').equals(a.id).toArray());
  const questions = await db.questions.where('notebookId').equals(id).toArray();
  return { format: 'defter-studio', v: 2, exportedAt: now(), notebook, sources, messages, artifacts, versions, questions };
}

export async function importNotebook(data, chunkText) {
  if (data.format !== 'defter-studio') throw new Error('Bu dosya bir Defter Studio yedeği değil.');
  const { id: _old, ...nb } = data.notebook;
  const nid = await db.notebooks.add({ ...nb, title: nb.title + ' (içe aktarıldı)', updatedAt: now() });
  for (const s of data.sources) {
    const { id: _s, ...rest } = s;
    const sid = await db.sources.add({ ...rest, notebookId: nid });
    await chunkText(nid, sid, rest.text || '');
  }
  for (const m of data.messages) { const { id: _m, ...rest } = m; await db.messages.add({ ...rest, notebookId: nid }); }
  const map = {};
  for (const a of data.artifacts) { const { id: oldId, ...rest } = a; map[oldId] = await db.artifacts.add({ ...rest, notebookId: nid }); }
  for (const v of data.versions || []) { const { id: _v, ...rest } = v; if (map[rest.artifactId]) await db.versions.add({ ...rest, artifactId: map[rest.artifactId] }); }
  for (const q of data.questions || []) { const { id: _q, ...rest } = q; await db.questions.add({ ...rest, notebookId: nid }); }
  return nid;
}
