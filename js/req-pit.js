/* =========================================================
   req-pit.js  -  📮 予定依頼（PitFlow 側の入口）
   ---------------------------------------------------------
   ◎なにをするもの（ゆうた指定 2026-08-22）
     🗣「PitFlow の方にも、予定依頼を搭載。**各カード詳細の付箋発行ボタンの隣**に搭載。
     　　**客名・車種・作業タイプ・担当者 が入った状態で開いて**、
     　　そこからその車両で依頼を投げられる感じを想定」

     ＝ 「この車を◯◯へ回送したい」のように、**やりたいことは決まっているが
        いつ・誰が・どう行くかは全体を見ないと決まらない**用件を、その場で出せるようにする。

   ◎🔴 いちばん大事な決めごと（次に触る人へ）
     🔴 **欄・言葉・保存する形は、この中に1文字も書かない。**
        全部 **`js/coreflow-req.js`（CFReq＝_shared が本体）**が持っている。
        MHS の「＋ 予定依頼」とまったく同じ窓が出るのは、そのため。
        ここに写しを作ると、**片方だけ直る事故**がその日から始まる。
     🔴 **入れ物は MHS の社内予定と同じ `companies/{cid}/scheduleEvents`。**
        PitFlow は **書くだけ**。日を決める・担当を決めるのは **MHS 1本**。
        ＝「日を決める知識」を2つのアプリに持たせない。
     🔴 **PitFlow のデータ（pitCards ほか）には1文字も書かない。**
        車のことは **`reqCar` に写しを1枚とって持たせる**だけ
        （あとで車がアーカイブされても、依頼の側で何の車か読めるようにするため）。
     ⚠ 出せるのは **本番（クラウド）で開いている時だけ**。
        この端末だけのモード（デモ・localhost）では MHS に届かないので、その旨を出して止める。

   ◎車から拾うもの（ゆうたが挙げた4つ）
     客名 … pitCustName ／ 車種 … pitCarLabel ／ 作業タイプ … state.workTypes の label ／
     担当者 … フロント担当（frontStaff。無ければ staff）を pitStaffFull でフルネームに
     ⚠ どれも **PitFlow の物差し（pit-share.js）から借りる**。名前の出し方を書き写さない。
   ========================================================= */
(function (w) {
  'use strict';

  /* ---- いま自分は誰か（PitFlow のメンバー行から CoreMembers の番号を取る） ---- */
  function myRow() {
    var pid = (w.fb && w.fb.currentMember && w.fb.currentMember.id) || null;
    if (!pid) return null;
    return ((w.state && w.state.staff) || []).find(function (s) { return s.id === pid; }) || null;
  }
  function myName(r) {
    if (r) return r.lastName || r.dispName || r.name || '';
    return (w.fb && w.fb.currentMember && w.fb.currentMember.name) || '';
  }

  /* ---- 作業タイプの名前（基本＋併用可）。名前の出どころは state.workTypes 1本 ---- */
  function workName(c) {
    var wts = (w.state && w.state.workTypes) || [];
    var ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes.slice() : (c.workType ? [c.workType] : []);
    (Array.isArray(c.workAddons) ? c.workAddons : []).forEach(function (x) { if (ids.indexOf(x) < 0) ids.push(x); });
    var names = ids.map(function (id) {
      var t = wts.find(function (x) { return x.id === id; });
      return t ? String(t.label || t.name || '') : '';
    }).filter(Boolean);
    return names.join('＋');
  }

  /* ---- 車から「依頼に添える札」を作る（客名・車種・作業タイプ・担当者） ---- */
  function carSeed(c) {
    if (!c) return null;
    var staff = c.frontStaff || c.staff || '';
    return {
      id: c.id || '',
      resNo: c.resNo || '',
      cust: (w.pitCustName ? w.pitCustName(c) : (c.customer || '')) || '',
      model: (w.pitCarLabel ? w.pitCarLabel(c) : (c.car || '')) || '',
      work: workName(c),
      staff: (w.pitStaffFull ? w.pitStaffFull(staff) : staff) || ''
    };
  }
  w.pitReqCarSeed = carSeed;

  function cardById(id) {
    return ((w.state && w.state.cards) || []).find(function (x) { return x.id === id; }) || null;
  }

  /* ---- 窓（PitFlow の顧客モーダルと同じ骨。中身は CFReq が描く） ---- */
  function ensureBox() {
    var ov = document.getElementById('pitreq-ov');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'pitreq-ov'; ov.className = 'cm-overlay';
    ov.innerHTML =
      '<div class="cm-box" style="width:560px">' +
        '<div class="cm-head"><i data-ic=send data-ics=17></i> ＋ 予定依頼' +
          '<span class="cm-sub">日も担当も書かなくてOK</span>' +
          '<button class="cm-x" onclick="pitReqClose()"><i data-ic=close data-ics=16></i></button></div>' +
        '<div class="cm-body" id="pitreq-body"></div>' +
        '<div class="cm-foot"><button class="cm-cancel" onclick="pitReqClose()">キャンセル</button>' +
          '<button class="cm-save" onclick="pitReqSave()">依頼を出す</button></div>' +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) pitReqClose(); });
    document.body.appendChild(ov);
    return ov;
  }

  w.pitReqOpen = function (cardId) {
    var c = cardById(cardId);
    var r = myRow();
    if (w.CFReq == null) { if (w.pitToast) pitToast('予定依頼の部品が読み込めていません', 'PF-0060'); return; }
    w.CFReq.start({
      car: carSeed(c),
      deptName: (r && r.deptNames && r.deptNames[0]) || ''
    });
    var ov = ensureBox();
    w.CFReq.mount({
      el: 'pitreq-body',
      places: (w.pitLocList ? w.pitLocList() : []),
      meHtml: '<span style="font-size:13px">' + w.CFReq.esc(myName(r)) + '</span>'
    });
    ov.classList.add('show');
    if (w.icHydrate) try { icHydrate(ov); } catch (e) {}
    setTimeout(function () { var t = document.getElementById('rq-title'); if (t) t.focus(); }, 60);
  };
  w.pitReqClose = function () { var ov = document.getElementById('pitreq-ov'); if (ov) ov.classList.remove('show'); };

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  w.pitReqSave = function () {
    if (!w.CFReq) return;
    var r = myRow();
    var b = w.CFReq.build({
      createdByUid: (w.fb && w.fb.currentUser && w.fb.currentUser.uid) || null,
      createdByMemberId: (r && r.cmId) || null,
      createdByName: myName(r),
      today: ymd(new Date()),
      from: 'pitflow'
    });
    /* 🔴 エラー番号は PitFlow の台帳から付ける（共通部品は「どこが足りないか」だけ返す） */
    if (b.err) { if (w.pitToast) pitToast(b.msg, b.err === 'date' ? 'PF-0062' : 'PF-0061'); return; }

    /* ⚠ この端末だけのモードでは MHS に届かない。黙って捨てずに、その旨を出して止める。 */
    if (!(w.fb && w.fb.ready && w.fb.cloud && w.fb.db)) {
      if (w.pitToast) pitToast('この端末だけのモードでは予定依頼を出せません（本番の画面から出してください）', 'PF-0063');
      return;
    }
    var doc = Object.assign({}, b.doc);
    doc.updatedAt = w.fb.serverTimestamp ? w.fb.serverTimestamp() : null;
    doc.updatedBy = (w.fb.currentUser && w.fb.currentUser.uid) || null;
    w.fb.company().collection('scheduleEvents').doc(b.id).set(doc, { merge: true })
      .then(function () {
        pitReqClose();
        if (w.pitToast) pitToast('予定依頼を出しました（MHS で日が組まれます）');
      })
      .catch(function (e) {
        console.error('[req-pit] 保存に失敗', e);
        if (w.pitToast) pitToast('予定依頼を出せませんでした（通信または権限）', 'PF-0064');
      });
  };
})(window);
