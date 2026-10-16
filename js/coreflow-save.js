/* =========================================================
   coreflow-save.js ─ 💾 CFSave＝「変えた欄だけ保存」＋「変えたら必ず記録」を同じ1回で（棚卸し C-01）  v1.0.0  2026-10-16
   ---------------------------------------------------------
   🔴 全アプリ共通の本体はここ。アプリの js\coreflow-save.js は写し（sync-shared.ps1 が配る）。

   なぜ：「変えた欄だけ保存」の作りが全アプリで9通り。保存と記録を同じ1回で書くのは2か所だけ＝
         ほかは保存の後に記録を別に書くので、電波が切れると「保存できたのに記録が無い」があり得た。
   土台：MHS の mhsDiffOps／mhsWriteDiff（配列の扱いがいちばん良い・2台の見張りあり）＋ PitFlow の版番号（rev）。
   決めごと：
     ・base＝最後にクラウドから届いた形。base と今の形を比べ、違う欄だけ書く（触っていない欄を古い値で戻さない）
     ・1段下まで見る（moves.2026-10-14 のような「鍵の入れ物」は鍵ごと）。keyed の入れ物は鍵を抜いたら消す（FieldValue.delete）
     ・setLike の配列（並びに意味の無い集まり）は足す・抜くだけ（arrayUnion／arrayRemove）
     ・append の配列（後ろに足すだけの記録）は足した分だけ arrayUnion（相手が先に足した行を消さない）
     ・base が無い（作ったばかり）時だけ丸ごと set(merge)
     ・rev:true なら版を1つ進める（increment）＝PitFlow のルール（新しい版＝今の版＋1）を通る
     ・記録（CFLog の形）は同じ batch に入れる＝「保存できたのに記録が無い」「記録だけある」を作らない
     ・update は消された文書には書けない＝消された物を古い端末が半端に生き返らせない
   使い方：
     CFSave.write({ db, ref, co, base, data, rules:{ skip, keyed, setLike, append }, rev, stamp:{欄:値},
                    log: function (changes) { return CFLog の形 | null },
                    FV（無ければ firebase.firestore.FieldValue）, path（[欄,鍵] → 欄の道。無ければ FieldPath） }) → Promise<{ wrote, logged, ops }>
     CFSave.ops(base, data, rules) → 書く欄の一覧（見張り・「変わった所が無い」の判定用）
     CFSave.changes(ops, base, data) → 記録の前 → 後 [{ f, b, a }]
     CFSave.clone(v)／CFSave.sig(v)＝控えを作る・比べる
     CFSave.confirm(db, ref, { exists }) → サーバーまで届いたか確かめる（CarFlow core-save.js と同じ考え・8秒で諦めて読みに行く）
   ========================================================= */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : {});

  function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (plain(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clone(v[k]); }); return o; }
    return v;   /* 時刻（Timestamp）などはそのまま */
  }
  /* 並びに左右されない比べ方（鍵の順・undefined の欄は無いのと同じ） */
  function sig(v) {
    if (v === undefined) return 'u';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (typeof v.toMillis === 'function') return 't' + v.toMillis();
    if (Array.isArray(v)) return '[' + v.map(sig).join(',') + ']';
    var k = Object.keys(v).sort(), o = [];
    for (var i = 0; i < k.length; i++) { if (v[k[i]] === undefined) continue; o.push(JSON.stringify(k[i]) + ':' + sig(v[k[i]])); }
    return '{' + o.join(',') + '}';
  }
  function arrOp(path, a, b, name, R) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (R.setLike[name]) {
        var as = a.map(sig), bs = b.map(sig);
        var add = b.filter(function (v, i) { return as.indexOf(bs[i]) < 0; }), rem = a.filter(function (v, i) { return bs.indexOf(as[i]) < 0; });
        if (add.length && !rem.length) return { path: path, union: add };
        if (rem.length && !add.length) return { path: path, remove: rem };
      }
      if (R.append[name] && b.length > a.length && sig(b.slice(0, a.length)) === sig(a)) return { path: path, union: b.slice(a.length) };
    }
    if (R.append[name] && a == null && Array.isArray(b) && b.length) return { path: path, union: b.slice() };
    return { path: path, val: b };
  }
  function rulesOf(r) { r = r || {}; return { skip: r.skip || {}, keyed: r.keyed || {}, setLike: r.setLike || {}, append: r.append || {} }; }
  /* base と data を比べて、書く欄の一覧 [{ path:[欄,鍵?], val | union | remove | del }] */
  function ops(base, data, rules) {
    var R = rulesOf(rules), out = [];
    base = base || {};
    Object.keys(data || {}).forEach(function (k) {
      if (R.skip[k] || k === '' || k.charAt(0) === '_') return;
      var a = base[k], b = data[k];
      if (b === undefined || sig(a) === sig(b)) return;
      if (plain(b) && (a === undefined || plain(a))) {
        var aa = a || {};
        Object.keys(b).forEach(function (sk) {
          if (sk === '') return;   /* 空の鍵は住所（FieldPath）が作れず保存ごと止まる＝捨てる */
          var x = aa[sk], y = b[sk];
          if (y === undefined || sig(x) === sig(y)) return;
          out.push(arrOp([k, sk], x, y, sk, R));
        });
        if (R.keyed[k]) Object.keys(aa).forEach(function (sk) { if (sk !== '' && b[sk] === undefined) out.push({ path: [k, sk], del: true }); });
        return;
      }
      out.push(arrOp([k], a, b, k, R));
    });
    return out;
  }
  function at(o, path) { var v = o; for (var i = 0; i < path.length; i++) { if (v == null) return undefined; v = v[path[i]]; } return v; }
  /* 記録の前 → 後（足す・抜くの配列は「足した／抜いた物」だけ） */
  function changes(list, base, data) {
    return list.map(function (o) {
      var f = o.path.join('.');
      if (o.union) return { f: f, b: null, a: { '足した': o.union } };
      if (o.remove) return { f: f, b: { '抜いた': o.remove }, a: null };
      return { f: f, b: at(base || {}, o.path), a: o.del ? null : at(data || {}, o.path) };
    });
  }
  function FVof() { try { return G.firebase.firestore.FieldValue; } catch (e) { return null; } }
  function FPof() { try { return G.firebase.firestore.FieldPath; } catch (e) { return null; } }
  function fieldPath(path) {
    var FP = FPof();
    if (FP) { try { return new (Function.prototype.bind.apply(FP, [null].concat(path)))(); } catch (e) {} }
    return path.join('.');
  }
  function valueOf(o, FV) {
    if (o.del) return FV.delete();
    if (o.union) return FV.arrayUnion.apply(FV, o.union);
    if (o.remove) return FV.arrayRemove.apply(FV, o.remove);
    return o.val;
  }

  /* 書く。戻り＝{ wrote: 書いたか, logged: 記録も同じ1回に入れたか, ops } */
  function write(p) {
    var FV = p.FV || FVof(), R = rulesOf(p.rules), stamp = p.stamp || {};
    var pathOf = typeof p.path === 'function' ? p.path : fieldPath;
    var batch = p.db && typeof p.db.batch === 'function' ? p.db.batch() : null;
    var CFL = G.CFLog || null;
    if (!batch || !FV) return Promise.reject(new Error('[CFSave] firestore の部品がありません'));
    if (!p.base) {
      var all = clone(p.data || {});
      Object.keys(all).forEach(function (k) { if (R.skip[k] || k.charAt(0) === '_' || all[k] === undefined) delete all[k]; });
      Object.keys(stamp).forEach(function (k) { all[k] = stamp[k]; });
      if (p.rev) all.rev = FV.increment(1);
      batch.set(p.ref, all, { merge: true });
      var lgN = (CFL && typeof p.log === 'function' && p.co) ? p.log(changes(ops({}, p.data, p.rules), {}, p.data)) : null;
      if (lgN) CFL.put(batch, p.co, lgN);
      return batch.commit().then(function () { return { wrote: true, logged: !!lgN, ops: null }; });
    }
    var list = ops(p.base, p.data, p.rules);
    if (!list.length) return Promise.resolve({ wrote: false, logged: false, ops: list });
    var args = [p.ref];
    list.forEach(function (o) { args.push(pathOf(o.path), valueOf(o, FV)); });
    Object.keys(stamp).forEach(function (k) { args.push(k, stamp[k]); });
    if (p.rev) args.push('rev', FV.increment(1));
    batch.update.apply(batch, args);
    var lg = (CFL && typeof p.log === 'function' && p.co) ? p.log(changes(list, p.base, p.data)) : null;
    if (lg) CFL.put(batch, p.co, lg);
    return batch.commit().then(function () { return { wrote: true, logged: !!lg, ops: list }; });
  }

  /* サーバーまで届いたか（端末の中に溜まっただけでないか）。exists＝あるはず(true)／無いはず(false) */
  function confirm(db, ref, opt) {
    opt = opt || {};
    var wait = (db && typeof db.waitForPendingWrites === 'function') ? db.waitForPendingWrites() : Promise.resolve();
    var timer = new Promise(function (res) { setTimeout(res, opt.ms || 8000); });
    return Promise.race([wait, timer]).then(function () { return ref.get({ source: 'server' }); }).then(function (s) {
      var ok = opt.exists === false ? !s.exists : !!s.exists;
      if (!ok) { var e = new Error('[CFSave] サーバーに届いていません'); e.code = 'not-confirmed'; throw e; }
      return s;
    });
  }

  var CFSave = { VERSION: VERSION, ops: ops, changes: changes, write: write, confirm: confirm, clone: clone, sig: sig, plain: plain };
  if (typeof module === 'object' && module.exports) module.exports = CFSave;
  if (root) root.CFSave = CFSave;
})(typeof window !== 'undefined' ? window : null);
