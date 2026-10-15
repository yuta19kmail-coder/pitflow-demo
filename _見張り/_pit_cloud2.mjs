/* =====================================================================
   PitFlow の見張り用：**2台の端末が1つの偽クラウドを共有する**（v2.185.0・棚卸し S-01/S-03/S-04）
   ---------------------------------------------------------------------
   ・偽クラウドは本物の set(…,{mergeFields}) と FieldValue.delete() をまねる（_merge_set.mjs）
   ・ルール＝「版（rev）が いま+1 でなければ弾く」を入れ物ごとに付けられる（opt.revCols）
     pitSettings/main は '@settings' で指定
   ・書き込みは全部の端末へ届く。`止める(端末)` でその端末だけ届かなくできる（＝まだ受け取っていない端末）
   ・db-pit.js は env の PIT_DB_SRC で別の版を読ませられる（直す前の版で「赤」を確かめる用）
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { mergeSet } from './_merge_set.mjs';

export const COLS = ['pitCards','pitCustomers','pitLoaners','pitLoanerAssigns','pitCompanyCars','pitFleetEvents','pitBoardNotes'];
const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export function makeCloud(opt = {}) {
  const data = {};
  COLS.forEach(c => { data[c] = ((opt.data && opt.data[c]) || []).map(clone); });
  let settingsDoc = opt.settings ? clone(opt.settings) : null;
  const revCols = new Set(opt.revCols || ['pitCards']);
  const devs = [];                 /* { watchers:{col:cb}, settingsCb, linkCb, held:bool, queue:[] } */
  const log = { set: [], del: [], 弾いた: [], writes: [] };

  const strip = o => { const c = clone(o); delete c.id; return c; };
  const docOf = (id, body) => ({ id, exists: body !== null && body !== undefined,
    data: () => (body === null || body === undefined) ? null : clone(body), metadata: { fromCache: false } });

  function 届ける(col, id, type) {
    devs.forEach(d => {
      const f = () => {
        if (col === 'pitSettings') { if (d.settingsCb && settingsDoc) d.settingsCb(docOf('main', settingsDoc)); return; }
        const cb = d.watchers[col]; if (!cb) return;
        const o = data[col].find(x => x.id === id);
        const doc = docOf(id, o ? strip(o) : null);
        cb({ docChanges: () => [{ type: o ? (type || 'modified') : 'removed', doc }], forEach: () => {}, metadata: { fromCache: false } });
      };
      if (d.held) d.queue.push(f); else Promise.resolve().then(f);
    });
  }

  function makeDev() {
    const d = { watchers: {}, settingsCb: null, linkCb: null, held: false, queue: [] };
    devs.push(d);
    const collection = (col) => ({
      get: () => Promise.resolve((() => { const arr = data[col].map(o => docOf(o.id, strip(o)));
        return { forEach: f => arr.forEach(f), docChanges: () => arr.map(doc => ({ type: 'added', doc })), size: arr.length, metadata: { fromCache: false } }; })()),
      onSnapshot: (cb) => { d.watchers[col] = cb; Promise.resolve().then(() => {
        const arr = data[col].map(o => docOf(o.id, strip(o)));
        cb({ docChanges: () => arr.map(doc => ({ type: 'added', doc })), forEach: f => arr.forEach(f), metadata: { fromCache: false } }); });
        return () => { delete d.watchers[col]; }; },
      doc: (id) => ({
        __path: col + '/' + id,
        get: () => Promise.resolve(col === 'pitSettings' ? docOf(id, settingsDoc) : (() => { const o = data[col].find(x => x.id === id); return docOf(id, o ? strip(o) : null); })()),
        onSnapshot: (a, b) => {
          const withMeta = (typeof a === 'object' && a !== null);
          const next = withMeta ? b : a;
          if (withMeta) { d.linkCb = next; Promise.resolve().then(() => next({ exists: !!settingsDoc, data: () => clone(settingsDoc), metadata: { fromCache: false } })); }
          else { d.settingsCb = next; Promise.resolve().then(() => { if (settingsDoc) next(docOf(id, settingsDoc)); }); }
          return () => {};
        }
      })
    });
    const db = { batch: () => { const ops = []; return {
      set: (ref, body, o) => ops.push({ t: 'set', p: ref.__path, body: clone(body), opt: o }),
      update: (ref, body) => ops.push({ t: 'set', p: ref.__path, body: clone(body), opt: { mergeFields: Object.keys(body) } }),
      delete: (ref) => ops.push({ t: 'del', p: ref.__path }),
      commit: () => new Promise((res, rej) => {
        /* v2.185.2 本物と同じく、書いた直後に「まだ届いていない印つき」の手元向けの受信を、書いた端末にだけ出す（opt.localEcho） */
        if (opt.localEcho) ops.forEach(o => {
          if (o.t !== 'set') return;
          const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          if (col === 'pitSettings') { if (d.settingsCb) { const m = mergeSet(settingsDoc, o.body, o.opt); d.settingsCb({ id, exists: true, data: () => clone(m), metadata: { hasPendingWrites: true } }); } return; }
          const cb = d.watchers[col]; if (!cb) return;
          const cur = data[col].find(x => x.id === id);
          const m = mergeSet(cur || null, o.body, o.opt); delete m.id;
          cb({ docChanges: () => [{ type: cur ? 'modified' : 'added', doc: { id, exists: true, data: () => clone(m), metadata: { hasPendingWrites: true } } }], forEach: () => {}, metadata: { fromCache: false, hasPendingWrites: true } });
        });
        setTimeout(() => {
        for (const o of ops) {
          const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          if (o.t !== 'set') continue;
          const key = col === 'pitSettings' ? '@settings' : col;
          if (!revCols.has(key)) continue;
          const cur = col === 'pitSettings' ? settingsDoc : data[col].find(x => x.id === id);
          if (!cur || cur.rev === undefined || cur.rev === null) continue;
          if (!(o.body && o.body.rev === cur.rev + 1)) {
            log.弾いた.push(o.p + '（版 ' + (o.body && o.body.rev) + ' ／いま ' + cur.rev + '）');
            const e = new Error('PERMISSION_DENIED: Missing or insufficient permissions.'); e.code = 'permission-denied';
            return rej(e);
          }
        }
        ops.forEach(o => {
          const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          log.writes.push({ t: o.t, p: o.p, fields: o.opt && o.opt.mergeFields ? o.opt.mergeFields.map(String) : '全部' });
          if (o.t === 'del') { log.del.push(o.p); data[col] = data[col].filter(x => x.id !== id); 届ける(col, id, 'removed'); return; }
          log.set.push(o.p);
          if (col === 'pitSettings') { settingsDoc = mergeSet(settingsDoc, o.body, o.opt); 届ける(col, id); return; }
          const j = data[col].findIndex(x => x.id === id);
          const n = Object.assign(mergeSet(j >= 0 ? data[col][j] : null, o.body, o.opt), { id });
          if (j >= 0) data[col][j] = n; else data[col].push(n);
          届ける(col, id, j >= 0 ? 'modified' : 'added');
        });
        res();
      }, opt.delay || 5); })
    }; } };
    return { db, collection, dev: d };
  }

  return {
    data, log, makeDev,
    get settings() { return settingsDoc; },
    止める: (dv) => { dv.held = true; },
    届けなおす: (dv) => { dv.held = false; const q = dv.queue.splice(0); q.forEach(f => f()); },
    サーバーの: (col, id) => { if (col === 'pitSettings') return clone(settingsDoc); const o = data[col].find(x => x.id === id); return o ? clone(o) : null; },
    /* よその端末（MHS・FlowDesk など）が update で欄だけ書いた＋版を1つ進めた */
    よそが直す: (col, id, patch) => {
      const o = data[col].find(x => x.id === id); if (!o) return false;
      Object.assign(o, clone(patch)); if (o.rev !== undefined) o.rev = (o.rev || 0) + 1;
      届ける(col, id); return true;
    }
  };
}

export function boot(cloud, opt = {}) {
  const { db, collection, dev } = cloud.makeDev();
  const 言 = [], 知らせ = [];
  const ctx = {};
  ctx.window = ctx;
  ctx.console = { log: (...a) => 言.push(a.join(' ')), warn: (...a) => 言.push('警告:' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')), error: (...a) => 言.push('エラー:' + a.join(' ')) };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.Promise = Promise; ctx.JSON = JSON; ctx.Date = Date; ctx.Math = Math; ctx.Object = Object; ctx.Array = Array;
  ctx.document = { addEventListener() {}, querySelector: () => ({ content: '0.0.0' }), hidden: false, getElementById: () => null };
  ctx.addEventListener = () => {};
  ctx.localStorage = { length: 0, getItem: () => null, setItem() {}, removeItem() {}, key: () => null };
  ctx.PIT_CLOUD = true; ctx.PIT_WORK_TYPES = [];
  ctx.state = { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {},
                cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], boardNotes: [], staff: [] };
  ctx.fb = { ready: true, currentUser: { uid: 'u1' }, db, company: () => ({ collection }), serverTimestamp: () => 0,
             FieldValue: { delete: () => '@del' } };
  ctx.PitSync = { link() {}, set() {}, connected() {}, received() {}, saving() {}, saved() {}, failed() {} };
  ctx.showToast = (m, code) => 知らせ.push((code || '') + ' ' + m);
  ctx.__editing = null;
  ctx.pitCardEditingId = () => ctx.__editing;
  if (opt.before) opt.before(ctx);
  vm.createContext(ctx);
  const src = process.env.PIT_DB_SRC ? fs.readFileSync(process.env.PIT_DB_SRC, 'utf8') : fs.readFileSync(path.join(process.cwd(), 'js', 'db-pit.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'db-pit.js' });
  (opt.extra || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8'), ctx, { filename: f }));
  return { ctx, D: ctx.PitDB, S: ctx.state, dev, 言, 知らせ };
}

export const 待つ = (ms = 60) => new Promise(r => setTimeout(r, ms));
