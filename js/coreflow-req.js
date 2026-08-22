/* ========================================
   coreflow-req.js  -  📮 予定依頼（スケジュール希望届）の**共通の本体**
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。
      アプリ側のコピーを直しても、次の配布で上書きされて消えます。

   ◎なにをするもの（ゆうた指定 2026-08-22）
     🗣「メカニックとかだと『●●に回送したい』があったとしても、
     　　**誰が行く・いつ行く・どう行く が全体のスケジュールの中で決定する必要がある**。
     　　だから結局スケジュールとしては入れられない、が発生する」
     🗣 追加「**PitFlow のカード詳細の付箋発行ボタンの隣にも搭載。
     　　客名・車種・作業タイプ・担当者 が入った状態で開いて、その車両で依頼を投げられる**」

     ＝ **出す人は「やりたいこと」だけ出す。日・時間・担当を決めるのはスケジューラー。**

   ◎なぜ共通部品にしたか
     ⚠ 出す口が **MHS（上のボタン）と PitFlow（カード詳細）の2つ**になった。
        欄・言葉・保存する形を2本持つと、**片方だけ直る事故**が必ず始まる
        （付箋がそれで3本コピペになり、3つともバラバラになっていた＝2026-08-18 の反省）。
     🔴 **欄／ラベル／保存する形／入力チェックは、ここ1本。**
        アプリ側に残すのは「その画面の都合」だけ（どこに出すか・保存の呼び方・一覧の描き方）。

   ◎入れ物は **MHS の社内予定と同じ `companies/{cid}/scheduleEvents`**
     `req:true` の札を1枚足しただけ。**Firestore のルールは1文字も触らない。**
     予定表に出すかどうかは **MHS の `mhs-share.js` の `mhsHidden` 1本**が決める。
     ⚠ ここに「予定表に出す／出さない」を書かないこと。**判定を2か所に持たない。**

   ◎使い方（アプリ側）
     ① 窓を開く時
        CFReq.start({ car: {...}（あれば）, deptName:'整備' });
        CFReq.mount({ el:'req-body', places:[{name,category}...], meHtml:'<span>…</span>' });
     ② チップ・入力欄は CFReq が自分で面倒をみる（onclick / oninput は書かなくていい）
     ③ 出す時
        var r = CFReq.build({ createdByUid, createdByMemberId, createdByName });
        if (r.err) { toast(r.msg, r.code); return; }
        …… r.doc を scheduleEvents に保存する（保存のしかたはアプリ側）
        ⚠ `r.err` は種類だけ（'title' / 'date'）。**エラー番号は各アプリの台帳から付ける。**

   ◎見た目
     `coreflow-req.css`（これも _shared が本体）。**すべて `.cf-req` の中に閉じてある**ので、
     アプリ側の `.fld` / `.pick` と喧嘩しない（MHS には元からある／PitFlow には無い）。

   ⚠ 絵文字は使わない。線画SVG（`ic()`＝coreflow-icons.js）で描く（ゆうた指定 2026-08-22）。
   ⚠ 画面に「任意」という字を出さない（ゆうた指定）。任意の欄は空のまま出せば済む。
   ======================================== */
(function (w) {
  'use strict';

  var VERSION = '1.0.0';

  /* ---- 選べるもの（🔴 言葉を変える時はここだけ。アプリ側に書き写さない） ---- */
  var DUE = [['any', 'いつでも'], ['week', '今週中'], ['month', '今月中'], ['date', 'この日まで']];
  var LEN = [['30m', '30分'], ['1-2h', '1〜2時間'], ['half', '半日'], ['day', '1日'], ['unsure', 'わからない']];
  var URG = [['normal', 'ふつう'], ['soon', '早めに'], ['rush', '急ぎ']];
  /* 🔴 「誰が行くか」ではなく「誰が行けそうか」。決めるのはスケジューラー（ゆうたが挙げた4つそのまま） */
  var WHO = [['self', '自分が行く'], ['ownDept', '自部署をメインに'], ['otherDept', '別部署にお願いしたい'], ['unknown', '未定']];
  /* ⚠ 「泊まり」は作らない（ゆうた指定 2026-08-22） */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ic(n, s) { return (w.ic ? w.ic(n, '', s || 14) : ''); }
  function lab(tbl, v) { for (var i = 0; i < tbl.length; i++) { if (tbl[i][0] === v) return tbl[i][1]; } return ''; }
  function el(id) { return (typeof document !== 'undefined') ? document.getElementById(id) : null; }

  /* ---- 依頼の中身を人の言葉にする（一覧・窓・板、どこから呼んでも同じ答え） ---- */
  function dueLabel(e) {
    if (!e) return '';
    if ((e.reqDue || '') === 'date') return e.reqDueDate ? (String(e.reqDueDate).slice(5).replace('-', '/') + 'まで') : '期限あり';
    return lab(DUE, e.reqDue || 'any');
  }
  function lenLabel(e) { return lab(LEN, (e && e.reqLen) || 'unsure'); }
  function urgLabel(e) { return lab(URG, (e && e.reqUrg) || 'normal'); }
  function whoLabel(e) {
    if (!e) return '';
    var l = lab(WHO, e.reqWho || 'unknown');
    if ((e.reqWho || '') === 'ownDept' && e.reqDeptName) l = e.reqDeptName + 'をメインに';
    return l;
  }
  /* 🚗 車から出した依頼の1行（客名・車種・作業タイプ・担当者）。無ければ空文字 */
  function carLine(e) {
    var c = e && e.reqCar; if (!c) return '';
    var a = [];
    if (c.cust)  a.push(c.cust + '様');
    if (c.model) a.push(c.model);
    if (c.work)  a.push(c.work);
    if (c.staff) a.push('担当 ' + c.staff);
    return a.join('　');
  }
  function hasCar(e) { return !!(e && e.reqCar && (e.reqCar.cust || e.reqCar.model || e.reqCar.id)); }

  /* ---- いま書きかけの依頼（1つだけ持つ。窓は同時に2つ開かない） ---- */
  var RQ = null, MOUNT = null;

  function start(seed) {
    seed = seed || {};
    RQ = {
      title: seed.title || '', reqDue: 'week', reqDueDate: '', reqLen: 'half', reqUrg: 'normal',
      reqPlace: seed.place || '', reqWho: 'self', memo: '',
      reqDeptName: seed.deptName || '',
      reqCar: seed.car || null
    };
    return RQ;
  }
  function state() { return RQ; }

  function mount(opt) {
    MOUNT = opt || {};
    render();
  }
  function render() {
    if (!MOUNT || !RQ) return;
    var host = el(MOUNT.el || 'req-body'); if (!host) return;
    host.innerHTML = bodyHTML();
  }

  function pickHTML(g, tbl, cur) {
    return tbl.map(function (a) {
      return '<span class="pick' + (cur === a[0] ? ' on' : '') + '" onclick="CFReq.pick(\'' + g + '\',\'' + esc(a[0]) + '\')">' + esc(a[1]) + '</span>';
    }).join('');
  }
  function placeOptions() {
    var seen = {}, out = [];
    ((MOUNT && MOUNT.places) || []).forEach(function (l) {
      var n = (l && (l.name || l.title)) || ''; if (!n || seen[n]) return; seen[n] = 1;
      out.push('<option value="' + esc(n) + '">' + esc((l && l.category) || '') + '</option>');
    });
    return out.join('');
  }

  /* 🔴 欄はここ1本。MHS からも PitFlow からも、まったく同じものが出る。 */
  function bodyHTML() {
    var carBox = hasCar(RQ) ? (
      '<div class="rq-carbox">' + ic('car', 15) + '<div><b>' + esc(carLine(RQ)) + '</b>' +
      (RQ.reqCar.resNo ? ('<br><span class="rq-sub">' + esc(RQ.reqCar.resNo) + '</span>') : '') +
      '<br><span class="rq-sub">この車の依頼として出します（受け取る側にも車が出ます）</span></div></div>') : '';

    return '<div class="cf-req">' + carBox +
      '<div class="rq-intro"><b>日にちも担当も書かなくて大丈夫です。</b>それを全体の中で決めるのがスケジューラーの仕事です。<br>' +
      'ここでは<b>「なにを・いつまでに・どれくらい」</b>だけ教えてください。</div>' +

      '<div class="fld"><label>なにをしたい？ *</label>' +
        '<input type="text" id="rq-title" value="' + esc(RQ.title || '') + '" placeholder="' +
        esc(hasCar(RQ) ? '例：この車を熊谷の陸運へ回送したい' : '例：ハイエース（品川300 あ 12-34）を熊谷の陸運へ回送したい') +
        '" style="font-size:15px;font-weight:600" oninput="CFReq.sync()"></div>' +

      '<div class="fld"><label>いつまでに？</label><div class="seg-pick">' + pickHTML('due', DUE, RQ.reqDue) + '</div>' +
        (RQ.reqDue === 'date' ? ('<div style="margin-top:7px"><input type="date" id="rq-duedate" value="' + esc(RQ.reqDueDate || '') + '" oninput="CFReq.sync()"></div>') : '') +
        '<div class="rq-hint">これは<b>締切</b>であって、<b>やる日ではありません</b>。</div></div>' +

      '<div class="fld"><label>どれくらいかかる？</label><div class="seg-pick">' + pickHTML('len', LEN, RQ.reqLen) + '</div></div>' +

      '<div class="fld"><label>急ぎ？</label><div class="seg-pick">' + pickHTML('urg', URG, RQ.reqUrg) + '</div></div>' +

      '<div class="fld"><label>行き先</label>' +
        '<input type="text" id="rq-place" list="rq-placelist" autocomplete="off" value="' + esc(RQ.reqPlace || '') + '" placeholder="打ち込んでもOK／登録された場所からも選べます" oninput="CFReq.sync()">' +
        '<datalist id="rq-placelist">' + placeOptions() + '</datalist>' +
        '<div class="rq-hint">自由に打ってもいいし、CoreMembers に登録された<b>場所</b>から選んでも構いません。</div></div>' +

      '<div class="fld"><label>メンバー候補</label><div class="seg-pick">' + pickHTML('who', WHO, RQ.reqWho) + '</div>' +
        '<div class="rq-hint">「行けそうな人」の見当だけ。<b>誰が行くかを最終的に決めるのはスケジューラー</b>です。' +
        ((RQ.reqWho === 'ownDept' && RQ.reqDeptName) ? ('　→ <b>' + esc(RQ.reqDeptName) + '</b> として伝わります') : '') + '</div></div>' +

      '<div class="fld"><label>ひとこと</label>' +
        '<textarea id="rq-memo" placeholder="例：朝イチで出れば午前で帰ってこられます。帰りの足だけ誰か。" oninput="CFReq.sync()">' + esc(RQ.memo || '') + '</textarea>' +
        '<div class="rq-hint">書いたことは、そのまま予定の<b>補足メモ</b>になります。</div></div>' +

      '<div class="fld" style="margin-bottom:0"><label>出す人</label>' +
        ((MOUNT && MOUNT.meHtml) || '') +
        '<span class="rq-hint" style="margin-left:8px">自動で入ります</span></div>' +
      '</div>';
  }

  function pick(g, v) {
    if (!RQ) return;
    sync();
    if (g === 'due') RQ.reqDue = v;
    else if (g === 'len') RQ.reqLen = v;
    else if (g === 'urg') RQ.reqUrg = v;
    else if (g === 'who') RQ.reqWho = v;
    render();
  }
  /* 入力欄 → RQ（描き直す前に必ず通す。通さないと打った字が消える） */
  function sync() {
    if (!RQ) return;
    var t = el('rq-title'); if (t) RQ.title = t.value;
    var p = el('rq-place'); if (p) RQ.reqPlace = p.value;
    var d = el('rq-duedate'); if (d) RQ.reqDueDate = d.value;
    var m = el('rq-memo'); if (m) RQ.memo = m.value;
  }

  /* ---- 入力チェック（🔴 番号もここ1本。アプリ側で別の番号を作らない） ---- */
  function check() {
    sync();
    if (!RQ) return { err: 'none', msg: '依頼の入力が始まっていません' };
    if (!String(RQ.title || '').trim()) return { err: 'title', msg: 'なにをしたいかを入れてください' };
    if (RQ.reqDue === 'date' && !RQ.reqDueDate) return { err: 'date', msg: '「この日まで」の日付を選んでください' };
    return { err: '' };
    /* 🔴 エラー番号（MH-1006 / PF-…）は**各アプリの台帳**が持つ。
       ここで番号を作ると、番号の決めごと（1アプリ1台帳）が崩れる。 */
  }

  /* ---- 依頼のドキュメントを作る（🔴 保存する形はここ1本） ----
     who … 「自分が行く」の時だけ、出した人を担当の下書きに入れる（受け取る側で外せる）
     ⚠ date は**わざと空**。日付を入れると「決まっているように見える」から。
        MHS 側で日付を入れずに保存しようとすると止まる（＝日を決めずには予定にできない）。 */
  function build(o) {
    o = o || {};
    var v = check(); if (v.err) return v;
    var now = (o.now != null) ? o.now : Date.now();
    var today = o.today || '';
    var doc = {
      source: 'manual',
      /* 🔴 これが札。MHS の mhsHidden が見て、カレンダー・Todayボード・前日LINEから落とす */
      req: true, reqStatus: 'open', reqAt: now, reqOn: today, reqFrom: o.from || 'mhs',
      reqDue: RQ.reqDue, reqDueDate: (RQ.reqDue === 'date' ? RQ.reqDueDate : ''),
      reqLen: RQ.reqLen, reqUrg: RQ.reqUrg, reqPlace: String(RQ.reqPlace || '').trim(),
      reqWho: RQ.reqWho, reqDeptName: (RQ.reqWho === 'ownDept' ? (RQ.reqDeptName || '') : ''),
      reqCar: RQ.reqCar || null, reqLog: [],
      /* ↓ ここから下は「予定になったとき」にそのまま使う器。日付と担当は**わざと空** */
      title: String(RQ.title || '').trim(), date: '', time: '終日', timeMode: 'allday', endTime: '', endDate: '',
      etype: '社内予定', layer: 'company', kind: 'all', dept: '', mainDept: '',
      who: (RQ.reqWho === 'self' && o.createdByMemberId) ? [o.createdByMemberId] : [],
      memo: String(RQ.memo || '').trim(),
      secret: false, repeat: null, remind: [], remindCustom: [], todo: false, needApprove: false, approvers: [],
      ownerUid: o.createdByUid || null,
      createdByUid: o.createdByUid || null,
      createdByMemberId: o.createdByMemberId || null,
      createdByName: o.createdByName || ''
    };
    doc.reqLog.push({ at: now, kind: 'open', text: '', uid: o.createdByUid || null, by: o.createdByName || '' });
    return { err: '', doc: doc, id: 'e' + now + Math.floor((o.rand != null ? o.rand : Math.random()) * 1000) };
  }

  /* ---- やりとりの記録（見送りの理由もここ。消さない） ---- */
  function logPush(e, kind, text, by, uid, now) {
    if (!e) return e;
    e.reqLog = (e.reqLog || []).slice();
    e.reqLog.push({ at: (now != null ? now : Date.now()), kind: kind, text: String(text || ''), uid: uid || null, by: by || '' });
    if (e.reqLog.length > 40) e.reqLog = e.reqLog.slice(-40);
    return e;
  }
  function lastMsg(e) {
    var l = (e && e.reqLog) || [];
    for (var i = l.length - 1; i >= 0; i--) { if (l[i].text) return l[i]; }
    return null;
  }

  var CFReq = {
    VERSION: VERSION,
    DUE: DUE, LEN: LEN, URG: URG, WHO: WHO,
    dueLabel: dueLabel, lenLabel: lenLabel, urgLabel: urgLabel, whoLabel: whoLabel,
    carLine: carLine, hasCar: hasCar,
    start: start, state: state, mount: mount, render: render, bodyHTML: bodyHTML,
    pick: pick, sync: sync, check: check, build: build,
    logPush: logPush, lastMsg: lastMsg,
    esc: esc
  };
  w.CFReq = CFReq;
  if (typeof module !== 'undefined' && module.exports) module.exports = CFReq;   /* node の見張り用 */
})(typeof globalThis !== 'undefined' ? globalThis : this);
