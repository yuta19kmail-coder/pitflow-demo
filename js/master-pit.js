/* ================================================================================
   master-pit.js  ─  🗂 マスター入力（予約〜返車を1枚で作る・直す）  PitFlow v2.85.0
   ================================================================================
   ◎なぜ要るか（ゆうた指定 2026-09-07）
     🗣「前からちょくちょくある事故（消えたり変になっちゃったりするような挙動）、もしくは
     　　**『あ、全然前に返車してるけど、今更入れてないことに気づいた』**みたいなパターンの時に、
     　　極端に言えば**予約〜返車まで全てのパラメーターを1枚のマスター予約みたいな画面で一括で操作**して、
     　　最終的にカードとして吐き出すような機能」

   ◎着手前に決めたこと（ゆうた確定 2026-09-07）
     ① **新規の後追い入力も、既存カードの修理も両方**やる
     ② **いまの必須チェックは残す**（止まるのは card-miss.js が言う所だけ）
     ③ 保存したら **売上・実績／顧客控え／代車カレンダー／操作ログ** ぜんぶ連動させる
     ④ **管理者以上だけ**（物差しは `pitIsAdmin()` 1本）
     ⑤ 呼び出したお客様の欄は**ここでは直せない**
        🗣「それはカードではなく、**顧客ビューから直す仕事**」
     ⑥ 予約番号は**自動**。手では打てない（重なるとデータチェックが毎回拾う）。振り直しだけできる
     ⑦ 車検の理由欄は**合格なら出さない**（不合格・再検合格の時だけ）
     ⑧ **話として成立しないものは、自由といっても弾く**

   ◎🔴🔴 写しを作らない（この画面が借りているもの）
     ・必須の判定 …… `pitCardMisses`（card-miss.js）
     ・時刻の言葉 …… `PIT_TIME_QUICK` / `_normTime`（**新規予約とまったく同じ**）
     ・社内区分 ……… `PIT_INTERN_KINDS` / `pitInternSet`（**新規予約の「その他」と同じ並び**）
     ・付加 ………… `PIT_WORK_SPECIALS`
     ・作業タイプ・受付タイプ・初回リピーター・課・メンバー … 設定の表そのまま
     ・変えた欄の記録 … `pitLogCardEdit`（v2.22.0）
     🔴 **ここで言葉の表を作らないこと。** 作った瞬間、新規予約と食い違う日が来る。

   ⚠⚠ **使われていない欄を並べないこと**（ゆうた指定「急ぎ等、使われてないバッジが入っている、
      実装時には重々気を付ける事」）。`urgent` は v0.35.5 で画面から外れて**キーだけ温存**されている。
      この画面にも出していない。**足す時は、本当に新規予約や予約詳細で使われているかを確かめること。**

   ⚠ 読み込みは card-miss / intern-pit / pit-share / customers より後ろ。
   ================================================================================ */
(function (w, d) {
  'use strict';

  var M = null;          /* いま編集している中身（カードの写し）。保存するまで本物に触らない */
  var MODE = 'new';      /* 'new' = 新しく作る ／ 'fix' = いまあるカードを直す */
  var SRC  = 'repeat';   /* 新しく作る時：'repeat' = リピーターから ／ 'blank' = 白紙から */
  var BEFORE = null;     /* 直す時：開いた時の姿（戻す・記録に使う） */
  var LOCKED = false;    /* お客様の欄に鍵がかかっているか */
  var Q = '';            /* 探す言葉 */
  var PICK = null;       /* 呼び出したお客様 { cust, veh } */

  function t(v){ return String(v == null ? '' : v).trim(); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
  function st(){ return w.state || {}; }
  function admin(){ try { return !!(w.pitIsAdmin && w.pitIsAdmin()); } catch(e){ return false; } }
  function num(v){ var n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; }
  function yen(n){ return num(n).toLocaleString(); }
  function today(){ var x = new Date(); x.setHours(0,0,0,0);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); }

  function blank(){
    return {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      resNo: (w.pitGenResNo ? w.pitGenResNo() : ''),
      status: 'reserved', boardId: '', division: '', bayId: null,
      customer:'', kana:'', tel:'', contacts:[], plate:'', maker:'', car:'', karteNo:'', repeat:'',
      dropType:'', workType:null, workAddons:[], workSpecials:[], internKind:'',
      reserveDate:'', reserveTime:'', bookedAt: today(), menu:'',
      frontStaff:'', reserveStaff:'', consult:false, codeRed:false,
      tentative:false, approvalPending:false,
      needLoaner:false, loanerId:'', loanerFrom:'', loanerTo:'',
      needWash:false, inspectors:[], mechanics:[], checkers:[],
      inspSchedule:{ mode:'manual', slots:{}, history:[] },
      estAmount:'', estHoldDays:'', amountQuote:'', amountOrder:'', amountFinal:'', feeAmount:'',
      earlyDiscount:false, returnDate:'', returnTime:'', returnDateFinal:'', completedAt:'', salesDate:'',
      actualInAt:'', returnStage:'', noSale:false, archived:false,
      log:[{ label:'マスター入力で作った', at: Date.now() }]
    };
  }

  w.pitMasterOpen = function(cardId){
    if (!admin()) { render(); return; }
    if (cardId){
      var c = (st().cards || []).filter(function(x){ return x && x.id === cardId; })[0];
      if (c){ MODE = 'fix'; M = JSON.parse(JSON.stringify(c)); BEFORE = JSON.parse(JSON.stringify(c));
              LOCKED = !!c.customerId; PICK = null; render(); return; }
    }
    MODE = 'new'; SRC = 'repeat'; M = blank(); BEFORE = null; LOCKED = false; PICK = null; Q = '';
    render();
  };

  /* ================================================================
     🚧 話として成立しないもの（ゆうた指定 2026-09-07）
     ----------------------------------------------------------------
     2段に分ける。
       止める … 話として成立しない。**保存を押せない**
       聞く  … ありうるが、押す前に一度確かめる
     ⚠ 「同じ車が同じ日に2枚」のように**実際には正しいことがある**ものは、止めずに聞く側。
        ＝ データチェックで R01 に「確認した」を出せるようにしたのと同じ考え方。
     🔴 必須の判定は `pitCardMisses` 1本（ここで表を作らない）。
     ================================================================ */
  function checks(c){
    var stop = [], warn = [];
    var miss = ((w.pitCardMisses ? w.pitCardMisses(c) : null) || {}).red || [];
    if (miss.length) stop.push('必須が空のままです ― ' + miss.map(function(x){ return x.label; }).join('・'));

    var rd = t(c.reserveDate), ain = t(c.actualInAt), rp = t(c.returnDate);
    var rf = t(c.returnDateFinal), dt = t(c.completedAt), amt = t(c.amountFinal);
    var 返車済み = (c.status === 'returned');
    var 未入庫  = (c.status === 'reserved');

    if (rd && rp && rp < rd)   stop.push('返車予定日（' + rp + '）が、入庫日（' + rd + '）より前です');
    if (ain && rf && rf < ain) stop.push('確定返車日（' + rf + '）が、実際に入庫した日（' + ain + '）より前です');
    if (rd && dt && dt < rd)   stop.push('実績カウント日（' + dt + '）が、入庫日（' + rd + '）より前です');
    if (t(c.loanerFrom) && t(c.loanerTo) && t(c.loanerTo) < t(c.loanerFrom))
      stop.push('代車の「貸出まで」が「貸出から」より前です');

    /* ⚠ 「売上なしアーカイブ」は**わざと実績カウント日を空にする**（実績・売上に乗る道を無くすため）。
       ＝ そこは止めない。ふつうの返車済みだけ見る。 */
    if (返車済み && !dt && !c.noSale) stop.push('返車済みなのに、実績カウント日が空です');
    if (返車済み && !c.noSale && !amt)
      stop.push('返車済みなのに、確定金額が空です（売上に数えないなら「売上なし」を押してください）');
    /* 🔴 見るのは**確定金額（請求額）だけ**。
       ⚠ 見積・受注の額が残っているのは**正しい姿**（v2.9.5＝本当に見積もった額なので消さない）。
       　 ここで見積・受注まで止めると、あの決めごとと正面衝突する。 */
    if (c.noSale && amt) stop.push('「売上なし」なのに、確定金額（' + yen(amt) + ' 円）が入っています');
    if (未入庫 && ain)  stop.push('まだ入庫していない状態なのに、実際に入庫した日が入っています');
    if (未入庫 && dt)   stop.push('まだ入庫していない状態なのに、実績カウント日が入っています');
    if (c.status === 'scrap' && amt) stop.push('廃車・乗替なのに、確定金額が入っています');

    var s2 = c.inspSchedule || {}, hist = Array.isArray(s2.history) ? s2.history : [];
    hist.forEach(function(x, i){
      var n = i + 1;
      if (!t(x.date)) stop.push('車検の ' + n + '回目の日が空です');
      if (t(x.date) && rd && t(x.date) < rd) stop.push('車検の ' + n + '回目（' + x.date + '）が、入庫日より前です');
      if (t(x.date) && rf && t(x.date) > rf) stop.push('車検の ' + n + '回目（' + x.date + '）が、確定返車日より後です');
      if (x.result === 'pass' && t(x.why)) stop.push('車検の ' + n + '回目は合格なのに、落ちた理由が入っています');
      if (x.result !== 'pass' && !t(x.why)) warn.push('車検の ' + n + '回目に、落ちた理由が入っていません');
    });
    if (s2.result === 'done' && hist.length && hist[hist.length-1].result === 'recheck')
      stop.push('車検は「終わった（合格）」なのに、最後の記録が不合格のままです');

    if (返車済み && amt && !c.noSale)
      warn.push('月次の数字が動きます ― ' + dt.slice(5,7).replace(/^0/,'') + '月の売上に +' + yen(amt) + ' 円／台数 +1台');
    if (c.needLoaner && t(c.loanerId))
      warn.push('代車カレンダーにも入ります（過去の日で入れると、二重貸しの警告が出ることがあります）');
    if (rd && t(c.plate) && (st().cards || []).some(function(x){
      return x && x.id !== c.id && t(x.plate) === t(c.plate) && t(x.reserveDate) === rd
             && (w.pitCardActive ? w.pitCardActive(x) : true); }))
      warn.push('同じ車・同じ入庫日のカードが、ほかにもあります（正しいこともあります）');

    return { stop: stop, warn: warn };
  }
  w.pitMasterChecks = checks;   /* 🔎 見張りが借りる（画面を開かずに確かめられるように） */

  /* ================================================================
     保存＝ふつうの道と同じ連動を起こす（ゆうた確定）
     🔴 ここで「何を連動させるか」を増やさない。**ふつうのカードと同じ道**を通すだけ。
     ================================================================ */
  w.pitMasterSave = function(print){
    if (!M || !admin()) return;
    var r = checks(M);
    if (r.stop.length){ if (w.pitToast) w.pitToast('まだ保存できません（下の赤い所を直してください）'); return; }
    var go = w.pitAsk ? w.pitAsk('この内容で保存しますか？', {
      ok:'保存してカードにする',
      detail: (MODE === 'fix' ? '・いまあるカードを、この内容で上書きします' : '・新しいカードを作ります')
            + (r.warn.length ? ('\n' + r.warn.map(function(x){ return '・' + x; }).join('\n')) : '')
    }) : Promise.resolve(true);
    go.then(function(yes){ if (yes) _save(!!print); });
  };

  /* 🗑 v2.86.0（ゆうた指定 2026-09-07）**売上なしアーカイブで保存する。**
     🗣「売上なしとアーカイブのバッチはなしで、**売上なしアーカイブで保存する**」
     🔴 中身は予約詳細の「売上なしでアーカイブ」と**まったく同じ手順**（写しを作らない）。
        ＝ 印を付ける／返車済みにする／**実績カウント日は空にする**（実績・売上に乗る道を無くす）／
          確定返車日を埋める／置き場所を空ける。
     ⚠ 確定金額（請求額）が入ったままだと、上の関門で止まる。**先に消してから押すこと。**
        （見積・受注の額はそのままでよい＝v2.9.5 の決めごと） */
  w.pitMasterNoSale = function(){
    if (!M || !admin()) return;
    (w.pitAsk ? w.pitAsk('売上なしアーカイブで保存しますか？', { ok:'売上なしで保存', danger:true,
      detail:'・実績にも売上にも入りません\n・返車済みにして片付けます\n・実績カウント日は空にします' })
      : Promise.resolve(true)).then(function(yes){
      if (!yes) return;
      var td = today();
      M.noSale = true; M.noSaleAt = td;
      M.noSaleBy = (w.pitFlowMe ? w.pitFlowMe() : '');
      M.status = 'returned';
      M.completedAt = '';                       /* 🔴 実績カウント日は入れない */
      M.returnDateFinal = t(M.returnDateFinal) || t(M.returnDate) || td;
      if (!t(M.returnDate)) M.returnDate = M.returnDateFinal;
      M.returnTbd = false; M.bayId = null; M.baySlot = null; M.testDrive = false;
      var r = checks(M);
      if (r.stop.length){ render(); if (w.pitToast) w.pitToast('まだ保存できません（下の赤い所を直してください）'); return; }
      _save(false, true);
    });
  };

  function _save(print, noSale){
    if (!Array.isArray(st().cards)) st().cards = [];
    var live = null;
    if (MODE === 'fix'){
      live = (st().cards || []).filter(function(x){ return x && x.id === M.id; })[0];
      if (!live){ if (w.pitAlert) w.pitAlert('直すカードが見つかりません', { code:'PF-3080',
        detail:'ほかの端末で消された可能性があります。画面を開き直してください。' }); return; }
      Object.keys(M).forEach(function(k){ live[k] = M[k]; });
    } else {
      live = JSON.parse(JSON.stringify(M));
      st().cards.push(live);
    }
    try { if (!live._sample && w.upsertCustomerFromCard) w.upsertCustomerFromCard(live); } catch(e){}
    try { if (w.pitSyncLoanerAssigns) w.pitSyncLoanerAssigns(); } catch(e){}
    try {
      if (MODE === 'fix' && BEFORE && w.pitLogCardEdit) w.pitLogCardEdit(live, BEFORE);
      if (w.pitLog) w.pitLog(MODE === 'fix' ? 'マスター入力で直した' : 'マスター入力で作った',
        { cardId: live.id, kind:'edit',
          label: (t(live.customer) || '（無名）') + ' / ' + (t(live.car) || t(live.plate) || '') });
    } catch(e){}
    if (noSale){
      try { if (w.logFlow) w.logFlow(live, '売上なしでアーカイブした'); } catch(e){}
      try { if (w.pitLog) w.pitLog('売上なしでアーカイブした', { cardId: live.id, kind:'out',
        label: (t(live.customer) || '（無名）') + ' / ' + (t(live.car) || t(live.plate) || '') }); } catch(e){}
    }
    if (w.PitDB) w.PitDB.save();
    /* 🖨 表紙は cover-print.js の `pitPrintCover` 1本（別の窓で刷るので、画面の切り替えとは関係なく動く）。
       🔴 **保存が通った時だけ刷る**＝紙が出たのにカードが無い、が起きない（v1.78.0 の決めごとと同じ）。 */
    if (print){
      try { if (w.logFlow) w.logFlow(live, '表紙を印刷して保存'); } catch(e){}
      if (w.pitToast) w.pitToast('表紙を印刷しています…');
      try { if (w.pitPrintCover) w.pitPrintCover(live.id); } catch(e){}
    }
    if (w.pitToast && !print) w.pitToast(noSale ? '売上なしでアーカイブしました（実績・売上には入りません）'
                                                : (MODE === 'fix' ? '直しました' : 'カードにしました'));
    MODE = 'fix'; M = JSON.parse(JSON.stringify(live)); BEFORE = JSON.parse(JSON.stringify(live));
    render();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  }

  w.pitMasterUndo = function(){
    if (MODE !== 'fix' || !BEFORE) return;
    (w.pitAsk ? w.pitAsk('開いた時の内容に戻しますか？', { ok:'戻す', danger:true,
      detail:'この画面で打った分は消えます。保存ずみの内容には触りません。' }) : Promise.resolve(true))
      .then(function(yes){ if (!yes) return; M = JSON.parse(JSON.stringify(BEFORE)); render(); });
  };

  /* ===== 欄をいじる ===== */
  w.pitMasterSet = function(key, v){ if (!M) return; M[key] = v; render(); };
  w.pitMasterSetQuiet = function(key, v){ if (!M) return; M[key] = v; paintFoot(); };
  w.pitMasterToggle = function(key){ if (!M) return; M[key] = !M[key]; render(); };
  /* 🕐 入庫時刻＝新規予約とまったく同じ整形（`_normTime` 1本。ここで直さない） */
  w.pitMasterTime = function(v){ if (!M) return; M.reserveTime = (w._normTime ? w._normTime(v) : t(v)); render(); };
  w.pitMasterIntern = function(k){
    if (!M) return;
    if (k === 'loanercar') return;   /* 🔴 代車はここからは選べない（v2.53.0 の決めごとと同じ） */
    var now = (w.pitInternKind ? w.pitInternKind(M) : '');
    if (w.pitInternSet) w.pitInternSet(M, now === k ? '' : k); else M.internKind = (now === k ? '' : k);
    render();
  };
  w.pitMasterSpecial = function(id){
    if (!M) return;
    if (!Array.isArray(M.workSpecials)) M.workSpecials = [];
    var i = M.workSpecials.indexOf(id);
    if (i >= 0) M.workSpecials.splice(i, 1); else M.workSpecials.push(id);
    render();
  };
  w.pitMasterResNo = function(){ if (!M) return; M.resNo = (w.pitGenResNo ? w.pitGenResNo() : M.resNo); render(); };

  function hist(){
    if (!M.inspSchedule) M.inspSchedule = { mode:'manual', slots:{}, history:[] };
    if (!Array.isArray(M.inspSchedule.history)) M.inspSchedule.history = [];
    return M.inspSchedule.history;
  }
  w.pitMasterShkAdd = function(){ hist().push({ date:'', slot:'am', round:'', staff:'', result:'recheck', why:'' }); render(); };
  w.pitMasterShkDel = function(i){ hist().splice(i, 1); render(); };
  w.pitMasterShkSet = function(i, k, v){
    var a = hist(); if (!a[i]) return;
    a[i][k] = v;
    /* 🔴 合格にしたら理由は消す（残すと「合格なのに理由がある」を自分で作る＝ゆうた指定） */
    if (k === 'result' && v === 'pass') a[i].why = '';
    render();
  };
  w.pitMasterShkPlan = function(k, v){
    if (!M) return;
    if (!M.inspSchedule) M.inspSchedule = { mode:'manual', slots:{}, history:[] };
    M.inspSchedule[k] = (k === 'round') ? (v ? Number(v) : 0) : v;
    render();
  };

  w.pitMasterQ = function(v){ Q = t(v); paintFind(); };
  w.pitMasterMode = function(m){ MODE = m; if (m === 'new') w.pitMasterOpen(); else { Q = ''; render(); } };
  w.pitMasterSrc = function(s){
    SRC = s;
    if (s === 'blank'){ LOCKED = false; PICK = null; M.customerId = ''; }
    render();
  };
  w.pitMasterPickCust = function(cid, vid){
    var cu = (st().customers || []).filter(function(x){ return x && x.id === cid; })[0];
    if (!cu) return;
    var v = (cu.vehicles || []).filter(function(x){ return x && x.id === vid; })[0] || null;
    PICK = { cust: cu, veh: v };
    M.customerId = cu.id;
    M.customer = t(cu.name); M.kana = t(cu.kana);
    var ct = (cu.contacts || []).filter(function(x){ return x && x.primary; })[0] || (cu.contacts || [])[0];
    M.tel = t(ct && ct.tel);
    if (v){ M.vehId = v.id; M.plate = t(v.plate); M.maker = t(v.maker); M.car = t(v.car);
            M.karteNo = t(v.karteNo);
            if (v.boardId) M.boardId = v.boardId;
            if (v.division) M.division = v.division; }
    LOCKED = true;
    render();
  };
  w.pitMasterOpenCust = function(){
    var id = (PICK && PICK.cust.id) || (M && M.customerId);
    if (!id) return;
    if (w.showView) w.showView('customers');
    if (w.custOpen) w.custOpen(id);
  };
  w.pitMasterPickCard = function(id){ w.pitMasterOpen(id); };

  /* ===== 描く（部品） ===== */
  function opts(list, cur, blankLabel){
    var h = blankLabel ? ('<option value="">' + esc(blankLabel) + '</option>') : '';
    (list || []).forEach(function(x){
      h += '<option value="' + esc(x.id) + '"' + (t(cur) === t(x.id) ? ' selected' : '') + '>' + esc(x.label) + '</option>';
    });
    return h;
  }
  function fld(label, inner, o){
    o = o || {};
    return '<div class="ms-f' + (o.wide ? ' wide' : '') + (o.lock ? ' lock' : '') + '">'
      + '<label>' + esc(label)
      + (o.req  ? ' <span class="ms-req">必須</span>' : '')
      + (o.mon  ? ' <span class="ms-mon">数字が動く</span>' : '')
      + (o.lock ? ' <span class="ms-lockb">顧客ビューで</span>' : '')
      + '</label>' + inner
      + (o.hint ? '<div class="ms-hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }
  function txt(key, ph, lock){
    return '<input value="' + esc(M[key]) + '"' + (lock ? ' disabled' : '')
      + (ph ? ' placeholder="' + esc(ph) + '"' : '')
      + ' oninput="pitMasterSetQuiet(\'' + key + '\',this.value)" onchange="pitMasterSet(\'' + key + '\',this.value)">';
  }
  function dte(key){ return '<input type="date" value="' + esc(M[key]) + '" onchange="pitMasterSet(\'' + key + '\',this.value)">'; }
  function sel(key, list, blankLabel){
    return '<select onchange="pitMasterSet(\'' + key + '\',this.value)">' + opts(list, M[key], blankLabel) + '</select>';
  }
  function chip(on, label, call, cls){
    return '<button type="button" class="ms-chip' + (on ? ' on' : '') + (cls ? ' ' + cls : '') + '"'
      + ' onclick="' + call + '">' + esc(label) + '</button>';
  }
  /* 🕐 入庫時刻＝**新規予約と同じ仕組み**（打ち込み＋ショートカット）。言葉の表は `PIT_TIME_QUICK` 1本。 */
  function timeField(){
    var cur = t(M.reserveTime);
    var h = '<div class="ms-time"><input value="' + esc(cur) + '" placeholder="9 / 900 / 09:00"'
          + ' onchange="pitMasterTime(this.value)"><div class="ms-tq">';
    (w.PIT_TIME_QUICK || []).forEach(function(x){
      h += '<button type="button" class="ms-tqb' + (cur === x.label ? ' on' : '') + '"'
         + ' onclick="pitMasterTime(\'' + esc(x.label) + '\')">' + esc(x.label) + '</button>';
    });
    return h + '</div></div>';
  }

  /* ===== 上のバー・探す・呼び出す ===== */
  function head(){
    var h = '<div class="ms-bar"><div class="ms-seg">'
      +  '<button class="ms-btn' + (MODE === 'new' ? ' on' : '') + '" onclick="pitMasterMode(\'new\')">新しく作る</button>'
      +  '<button class="ms-btn' + (MODE === 'fix' ? ' on' : '') + '" onclick="pitMasterMode(\'fix\')">いまあるカードを直す</button>'
      +  '</div>';
    if (MODE === 'fix' && BEFORE) h += '<button class="ms-btn" onclick="pitMasterUndo()">開いた時に戻す</button>';
    h += '<div class="ms-sp"></div><span class="ms-adm">管理者以上</span></div>';
    return h;
  }
  function findRows(k){
    if (!k) return '<div class="ms-hint">お客様名・ナンバー・予約番号のどれかを打ってください。</div>';
    var hit = (st().cards || []).filter(function(c){
      if (!c || c._draft) return false;
      var s2 = (t(c.customer) + t(c.kana) + t(c.plate) + t(c.resNo) + t(c.car)).replace(/[\s　-]/g,'').toLowerCase();
      return s2.indexOf(k) >= 0;
    }).slice(0, 12);
    if (!hit.length) return '<div class="ms-hint">見つかりませんでした。</div>';
    return hit.map(function(c){
      var stx = w.pitCardStatusText ? w.pitCardStatusText(c) : t(c.status);
      return '<div class="ms-cand' + (M && c.id === M.id ? ' on' : '') + '" onclick="pitMasterPickCard(\'' + esc(c.id) + '\')">'
        + '<div class="ms-cl"><b>' + esc(t(c.customer) || t(c.kana) || '（無名）') + '</b>'
        + '<span>' + esc(t(c.plate) || 'ナンバーなし') + '　' + esc(t(c.car)) + '</span></div>'
        + '<div class="ms-cr">' + esc(t(c.resNo)) + '　' + esc(stx) + '　' + esc(t(c.reserveDate)) + '</div></div>';
    }).join('');
  }
  function custRows(k){
    if (!k) return '<div class="ms-hint">お名前・カナ・TEL・ナンバー・カルテNo のどれかを打ってください。</div>';
    var out = [];
    (st().customers || []).forEach(function(cu){
      if (!cu || out.length >= 8) return;
      var base = (t(cu.name) + t(cu.kana) + (cu.contacts||[]).map(function(x){ return t(x.tel); }).join(''))
                 .replace(/[\s　-]/g,'').toLowerCase();
      var vhit = (cu.vehicles || []).some(function(v){
        return v && (t(v.plate) + t(v.karteNo) + t(v.car)).replace(/[\s　-]/g,'').toLowerCase().indexOf(k) >= 0; });
      if (base.indexOf(k) < 0 && !vhit) return;
      out.push(cu);
    });
    if (!out.length) return '<div class="ms-hint">見つかりませんでした。</div>';
    return out.map(function(cu){
      var n = (st().cards || []).filter(function(c){ return c && c.customerId === cu.id; }).length;
      var h = '<div class="ms-cand"><div class="ms-cl"><b>' + esc(t(cu.name) || t(cu.kana) || '（無名）') + ' 様</b>'
        + '<span>' + esc(t(cu.kana)) + '</span></div><div class="ms-cr">来店 ' + n + '回</div></div>';
      h += '<div class="ms-chips" style="margin:-2px 0 10px 10px">';
      (cu.vehicles || []).forEach(function(v){
        if (!v) return;
        h += chip(!!(PICK && PICK.veh && PICK.veh.id === v.id),
          (t(v.plate) || 'ナンバーなし') + '　' + t(v.maker) + ' ' + t(v.car),
          "pitMasterPickCust('" + esc(cu.id) + "','" + esc(v.id) + "')");
      });
      return h + '</div>';
    }).join('');
  }
  function findHtml(){
    if (MODE !== 'fix') return '';
    return '<div class="ms-card"><div class="ms-ch"><span class="ms-n">0</span> どのカードを直すか</div>'
      + '<div class="ms-pad"><div class="ms-find"><input placeholder="予約番号・お客様名・ナンバーで探す"'
      + ' value="' + esc(Q) + '" oninput="pitMasterQ(this.value)"></div>'
      + '<div id="ms-find">' + findRows(Q.replace(/[\s　-]/g,'').toLowerCase()) + '</div></div></div>';
  }
  function callHtml(){
    if (MODE !== 'new') return '';
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">0</span> どこから作るか'
      + '<span class="ms-note">リピーターなら、呼び出すと下が埋まります</span></div><div class="ms-pad">';
    h += '<div class="ms-seg" style="margin-bottom:11px">'
      +  '<button class="ms-btn' + (SRC === 'repeat' ? ' on' : '') + '" onclick="pitMasterSrc(\'repeat\')">リピーターから作る</button>'
      +  '<button class="ms-btn' + (SRC === 'blank'  ? ' on' : '') + '" onclick="pitMasterSrc(\'blank\')">白紙から作る（初回のお客様）</button>'
      +  '</div>';
    if (SRC === 'repeat'){
      h += '<div class="ms-find" style="margin-bottom:10px"><input placeholder="お名前・カナ・TEL・ナンバー・カルテNo で探す"'
        +  ' value="' + esc(Q) + '" oninput="pitMasterQ(this.value)"></div>'
        +  '<div id="ms-find">' + custRows(Q.replace(/[\s　-]/g,'').toLowerCase()) + '</div>';
    } else {
      h += '<div class="ms-hint">初回のお客様です。下の「お客様と車」を打ってください。</div>';
    }
    return h + '</div></div>';
  }

  /* ===== ① お客様と車 ===== */
  function sec1(){
    var L = LOCKED;
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">1</span> お客様と車'
      + '<span class="ms-note">車検証のとおりに</span></div><div class="ms-pad">';
    if (L){
      /* 🔴 ゆうた指定 2026-09-07「呼び出しの場合は名前や電話などは変更できないように。
         　 それはカードではなく、**顧客ビューから直す仕事**」 */
      h += '<div class="ms-chk ok" style="margin-bottom:11px"><b>呼び出したお客様の欄は、ここでは直せません。</b>'
        + 'お名前・カナ・TEL・ナンバー・メーカー・車種・カルテNo は<b>顧客ビューで直す仕事</b>です。'
        + 'ここで直すと、カードと顧客控えのどちらが正しいのか分からなくなります。'
        + ' <span class="ms-go" onclick="pitMasterOpenCust()">→ この方を顧客ビューで開く</span></div>';
    }
    h += '<div class="ms-grid">';
    h += fld('お客様名（漢字）', txt('customer','', L), { lock:L });
    h += fld('カナ',            txt('kana','', L),     { lock:L, req:true });
    h += fld('TEL',             txt('tel','', L),      { lock:L });
    h += fld('ナンバー',        txt('plate','', L),    { lock:L });
    h += fld('メーカー',        txt('maker','', L),    { lock:L });
    h += fld('車種（グレード）', txt('car','', L),     { lock:L });
    h += fld('カルテNo',        txt('karteNo','', L),  { lock:L });
    h += fld('初回／リピーター', sel('repeat', st().repeatTypes, '—'), { req:true });
    h += fld('国産車／輸入車',   sel('boardId', (st().boards || []).map(function(b){ return { id:b.id, label:b.name || b.id }; }), '—'));
    return h + '</div></div></div>';
  }

  /* ===== ② 予約 ===== */
  function sec2(){
    var kind = w.pitInternKind ? w.pitInternKind(M) : '';
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">2</span> 予約'
      + '<span class="ms-note">受けた時の話</span></div><div class="ms-pad"><div class="ms-grid">';
    h += fld('入庫日', dte('reserveDate'), { req:true });
    h += fld('受付タイプ', sel('dropType', st().dropTypes, '—'), { req:true });
    h += fld('作業タイプ', sel('workType', (st().workTypes || []).filter(function(x){ return !x.combinable; }), '—'), { req: !kind });
    h += fld('フロント担当', sel('frontStaff', (st().staff || []).filter(function(x){ return x && x.front; })
             .map(function(x){ return { id:x.name, label:x.name }; }), '—'), { hint:'フロント別の売上は、ここで決まります' });
    h += fld('課', sel('division', st().divisions, '—'));
    h += fld('予約番号',
      '<div class="ms-row2"><input value="' + esc(M.resNo) + '" disabled>'
      + '<button class="ms-btn" onclick="pitMasterResNo()">振り直す</button></div>',
      { lock:true, hint:'手で入れると番号が重なります（データチェックが毎回拾います）' });
    h += fld('入庫時刻', timeField(), { wide:true, hint:'新規予約と同じ言葉です（打ち込みもできます）' });
    h += '</div>';
    h += '<div class="ms-f wide" style="margin-top:11px"><label>作業内容</label>'
      +  '<textarea onchange="pitMasterSet(\'menu\',this.value)">' + esc(M.menu) + '</textarea></div>';
    /* 🔧 その他＝新規予約の「その他」の引き出しと**同じ並び**（ゆうた指定 2026-09-07） */
    h += '<hr class="ms-sep">';
    h += '<div class="ms-lb">付加<span>作業タイプとセットで付ける印。売上・実績は通常どおり</span></div><div class="ms-chips">';
    (w.PIT_WORK_SPECIALS || []).forEach(function(it){
      h += chip((M.workSpecials || []).indexOf(it.id) >= 0, it.label, "pitMasterSpecial('" + it.id + "')", 'grey');
    });
    h += '</div>';
    h += '<div class="ms-lb" style="margin-top:10px">社内区分<span>自社の車。売上には数えません（実績には残ります）</span></div><div class="ms-chips">';
    (w.PIT_INTERN_KINDS || []).forEach(function(it){
      var lock = (it.id === 'loanercar');   /* 🔴 代車は作業予定ボードからだけ（v2.53.0 と同じ決めごと） */
      h += '<button type="button" class="ms-chip' + (kind === it.id ? ' on' : '') + (lock ? ' off' : '') + '"'
        + (lock ? ' disabled title="代車は作業予定ボードからだけ作れます"' : ' title="' + esc(it.desc || '') + '"')
        + ' onclick="pitMasterIntern(\'' + it.id + '\')">' + esc(it.label) + '</button>';
    });
    h += '</div>';
    /* ⚠ ここに「急ぎ」を置かないこと（v0.35.5 で画面から外れてキーだけ温存＝使われていない） */
    h += '<div class="ms-lb" style="margin-top:10px">受け方</div><div class="ms-chips">';
    h += chip(!!M.consult, '見積相談', "pitMasterToggle('consult')");
    h += chip(!!M.codeRed, 'F（要注意）', "pitMasterToggle('codeRed')");
    h += chip(!!M.tentative, '仮予約', "pitMasterToggle('tentative')");
    h += chip(!!M.approvalPending, '承認待ち', "pitMasterToggle('approvalPending')");
    h += '</div>';
    return h + '</div></div>';
  }

  /* ===== ③ 作業 ===== */
  function sec3(){
    var cols = [{ id:'reserved', label:'予約（まだ入庫していない）' }]
      .concat((((st().boards || [])[0] || {}).cols || []).map(function(x){ return { id:x.id, label:x.name }; }))
      .concat([{ id:'returned', label:'返車済み（実績）' }]);
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">3</span> 作業'
      + '<span class="ms-note">工場の中の話</span></div><div class="ms-pad"><div class="ms-grid">';
    h += fld('いまどの列にいるか', sel('status', cols, ''));
    h += fld('実際に入庫した日', dte('actualInAt'));
    h += fld('洗車', '<select onchange="pitMasterSet(\'needWash\',this.value===\'1\')">'
      + '<option value="0"' + (M.needWash ? '' : ' selected') + '>しない</option>'
      + '<option value="1"' + (M.needWash ? ' selected' : '') + '>する</option></select>');
    h += '</div><hr class="ms-sep"><div class="ms-lb">代車</div><div class="ms-grid">';
    h += fld('代車', '<select onchange="pitMasterSet(\'needLoaner\',this.value===\'1\')">'
      + '<option value="0"' + (M.needLoaner ? '' : ' selected') + '>要らない</option>'
      + '<option value="1"' + (M.needLoaner ? ' selected' : '') + '>使った</option></select>');
    if (M.needLoaner){
      h += fld('どの代車', sel('loanerId', (st().loaners || []).filter(function(l){ return l && !l.retired; })
        .map(function(l){ return { id:l.id, label:(w.pitVehLabel ? w.pitVehLabel(l) : (l.name || l.id)) }; }), '—'), { req:true });
      h += fld('貸出から', dte('loanerFrom'), { req:true });
      h += fld('貸出まで', dte('loanerTo'), { req:true });
    }
    return h + '</div></div></div>';
  }

  /* ===== 車検（車検の札が付いていて、入庫している時だけ・ゆうた指定 2026-09-07） ===== */
  function shakenOn(){
    if (!(w.pitIsShaken ? w.pitIsShaken(M) : (M.workType === 'shaken'))) return false;
    return M.status !== 'reserved';
  }
  function secShaken(){
    if (!shakenOn()) return '';
    var s2 = M.inspSchedule || {}, hs = Array.isArray(s2.history) ? s2.history : [];
    var offices = (w.pitRikuunFrom ? (w.pitRikuunFrom(st().locations || []) || []) : []);
    var mem = (st().staff || []).map(function(x){ return { id:x.name, label:x.name }; });
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">3+</span> 車検'
      + '<span class="ms-note">車検の札が付いていて、入庫している時だけ出ます</span></div><div class="ms-pad">';
    h += '<div class="ms-lb">これから行く予定</div><div class="ms-grid">';
    h += fld('陸運局', '<select onchange="pitMasterShkPlan(\'office\',this.value)">'
      + opts(offices.map(function(x){ return { id:x.id || x.name, label:x.name || x.id }; }), s2.office, '—') + '</select>',
      { hint: offices.length ? '' : '場所の表（メンバー画面）に陸運局が登録されていません' });
    h += fld('回送担当', '<select onchange="pitMasterShkPlan(\'resultStaff\',this.value)">'
      + opts(mem, s2.resultStaff, '—') + '</select>');
    h += fld('R（何ラウンド）', '<select onchange="pitMasterShkPlan(\'round\',this.value)">'
      + opts((w.PIT_SHAKEN_ROUNDS || [1,2,3,4]).map(function(n){ return { id:String(n), label:n + 'R' }; }),
             String(s2.round || ''), 'まだ決めていない') + '</select>');
    h += fld('行く日', '<input type="date" value="' + esc(s2.decided) + '" onchange="pitMasterShkPlan(\'decided\',this.value)">');
    h += fld('午前／午後', '<select onchange="pitMasterShkPlan(\'decidedSlot\',this.value)">'
      + '<option value="am"' + (s2.decidedSlot === 'pm' ? '' : ' selected') + '>午前</option>'
      + '<option value="pm"' + (s2.decidedSlot === 'pm' ? ' selected' : '') + '>午後</option></select>');
    h += fld('いまの状態', '<select onchange="pitMasterShkPlan(\'result\',this.value)">'
      + '<option value=""' + (s2.result ? '' : ' selected') + '>まだ行っていない</option>'
      + '<option value="done"' + (s2.result === 'done' ? ' selected' : '') + '>終わった（合格）</option></select>');
    h += '</div><hr class="ms-sep">';
    h += '<div class="ms-lb" style="display:flex;align-items:center;gap:9px">行った記録（何回でも足せます）'
      + '<button class="ms-btn ms-sm" onclick="pitMasterShkAdd()">＋ 記録を足す</button></div><div class="ms-shk">';
    hs.forEach(function(x, i){
      var cls = (x.result === 'pass' || x.result === 'repass') ? ' ok' : ' ng';
      h += '<div class="ms-shkrow' + cls + '"><div class="ms-no">' + (i+1) + '</div>'
        + '<input type="date" value="' + esc(x.date) + '" onchange="pitMasterShkSet(' + i + ',\'date\',this.value)">'
        + '<select onchange="pitMasterShkSet(' + i + ',\'slot\',this.value)">'
        +   '<option value="am"' + (x.slot === 'pm' ? '' : ' selected') + '>午前</option>'
        +   '<option value="pm"' + (x.slot === 'pm' ? ' selected' : '') + '>午後</option></select>'
        + '<select onchange="pitMasterShkSet(' + i + ',\'round\',this.value)">'
        +   opts([1,2,3,4].map(function(n){ return { id:String(n), label:n + 'R' }; }), String(x.round || ''), '—') + '</select>'
        + '<select onchange="pitMasterShkSet(' + i + ',\'staff\',this.value)">'
        +   opts(mem, x.staff, '—') + '</select>'
        + '<select onchange="pitMasterShkSet(' + i + ',\'result\',this.value)">'
        +   '<option value="recheck"' + (x.result === 'recheck' ? ' selected' : '') + '>不合格</option>'
        +   '<option value="pass"'    + (x.result === 'pass'    ? ' selected' : '') + '>合格</option>'
        +   '<option value="repass"'  + (x.result === 'repass'  ? ' selected' : '') + '>再検合格</option></select>'
        /* 🔴 ゆうた指定＝理由は合格なら出さない（不合格・再検合格の時だけ入れられる） */
        + (x.result === 'pass'
            ? '<div class="ms-hint" style="align-self:center">（合格なので理由はありません）</div>'
            : '<input value="' + esc(x.why) + '" placeholder="落ちた理由・ひとこと"'
              + ' onchange="pitMasterShkSet(' + i + ',\'why\',this.value)">')
        + '<button class="ms-x" title="この記録を消す" onclick="pitMasterShkDel(' + i + ')">✕</button></div>';
    });
    if (!hs.length) h += '<div class="ms-hint">まだ1件もありません。</div>';
    return h + '</div><div class="ms-hint" style="margin-top:8px">'
      + '1件＝1回ぶんの行き。<b>不合格が続いた回数は、ここの行の数で決まります</b>（この画面で数えません）。'
      + '</div></div></div>';
  }

  /* ===== ④ 返車とお金 ===== */
  function sec4(){
    var kind = w.pitInternKind ? w.pitInternKind(M) : '';
    var h = '<div class="ms-card"><div class="ms-ch"><span class="ms-n">4</span> 返車とお金'
      + '<span class="ms-note">月次の数字が動く所</span></div><div class="ms-pad"><div class="ms-grid">';
    h += fld('完TEL', '<select onchange="pitMasterSet(\'returnStage\',this.value)">'
      + '<option value=""' + (M.returnStage ? '' : ' selected') + '>まだ</option>'
      + '<option value="returnWait"' + (M.returnStage === 'returnWait' ? ' selected' : '') + '>済（返車待ち）</option></select>');
    h += fld('返車予定日', dte('returnDate'));
    h += fld('確定返車日', dte('returnDateFinal'), { mon:true });
    h += fld('実績カウント日', dte('completedAt'), { mon:true });
    h += fld('売上日', dte('salesDate'), { mon:true });
    h += '</div><hr class="ms-sep">';
    if (kind){
      h += '<div class="ms-chk ok">' + esc(w.pitInternLabel ? w.pitInternLabel(M) : '社内車両')
        + '（社内車両）です。金額・完TEL・洗車・伝票はありません。実績には残りますが、売上には数えません。</div>';
    } else {
      h += '<div class="ms-grid">';
      h += fld('概算金額', txt('estAmount'));
      h += fld('見積金額', txt('amountQuote'));
      h += fld('受注金額', txt('amountOrder'));
      h += fld('確定金額（請求額）', txt('amountFinal'), { mon:true });
      h += fld('諸費用（車検）', txt('feeAmount'), { req: !!(w.pitIsShaken && w.pitIsShaken(M)) });
      h += '</div>';
    }
    /* 🗑 v2.86.0（ゆうた指定 2026-09-07）**「売上なし」と「アーカイブ」の札は置かない。**
       🗣「売上なしとアーカイブのバッチはなしで、売上なしアーカイブで保存する」
       🗣「アーカイブは状態が実績なら勝手にそうなるでしょ？」＝**そのとおり。**
       ◎理由（2つとも「押して立てる印」ではない）
         ・アーカイブ … **返車済みになった時点で自動でそうなる**（archive-pit.js の物差し）。
         　 手で立てる欄を置くと、物差しと食い違う印を自分で作れてしまう。
         ・売上なし … **1つの操作**（印を付ける＋返車済みにする＋実績カウント日を空にする＋
         　 確定返車日を埋める）なので、札を1つ押すだけでは半端な形になる。
         　 ＝ 下の**「売上なしアーカイブで保存」**のボタン1本に寄せた。 */
    if (w.pitIsShaken && w.pitIsShaken(M)){
      h += '<div class="ms-chips" style="margin-top:11px">'
        +  chip(!!M.earlyDiscount, '早期割', "pitMasterToggle('earlyDiscount')") + '</div>';
    }
    h += '<div class="ms-hint" style="margin-top:9px">'
      + '※ 金額は税抜。諸費用（法定費用）は台単価・概算から外して扱う決まりのままです。<br>'
      + '※ <b>アーカイブは「いまどの列にいるか」を返車済みにすれば自動で付きます</b>（手で立てる欄はありません）。<br>'
      + '※ 売上に数えないで片付けるなら、下の <b>「売上なしアーカイブで保存」</b> を押してください。'
      + (M.noSale ? '<br><b style="color:var(--ins-c,#f59e0b)">いまこのカードは「売上なし」の印が付いています'
                    + (t(M.noSaleAt) ? '（' + esc(t(M.noSaleAt)) + ' ' + esc(t(M.noSaleBy)) + '）' : '') + '</b>' : '')
      + '</div>';
    return h + '</div></div>';
  }

  /* ===== 下＝このまま保存するとどうなるか（この画面のいちばん大事な所） =====
     🔴 実績と売上を直接書き換えられる画面なので、**押す前に見える**ようにしてある。
     ⚠ ここを消さないこと。 */
  function foot(){
    var r = checks(M);
    var amt = num(M.amountFinal), mo = t(M.completedAt).slice(5,7).replace(/^0/,'');
    var 返車済み = (M.status === 'returned');
    var col = ((((st().boards || [])[0] || {}).cols) || []).filter(function(x){ return x.id === M.status; })[0];
    var where = 返車済み ? '実績（返車済み）'
              : (M.status === 'reserved' ? '予約カレンダー' : ('タスクボード「' + ((col && col.name) || M.status) + '」'));
    var sales = (返車済み && !M.noSale && amt) ? (mo + '月に +' + yen(amt) + ' 円') : 'まだ乗りません';
    var lo = (st().loaners || []).filter(function(l){ return l && l.id === M.loanerId; })[0];
    var h = '<div class="ms-res"><div class="ms-resh">このまま保存するとどうなるか</div><div class="ms-resb">';
    h += '<div class="ms-rr"><div class="k">出る場所</div><div class="v">' + esc(where) + '</div></div>';
    h += '<div class="ms-rr"><div class="k">その月の売上</div><div class="v o">' + esc(sales) + '</div>'
      +  '<div class="s">' + ((返車済み && !M.noSale && amt) ? ('台数も ' + esc(mo) + '月に +1台') : '') + '</div></div>';
    h += '<div class="ms-rr"><div class="k">代車カレンダー</div><div class="v">'
      +  ((M.needLoaner && t(M.loanerId))
          ? esc((w.pitVehLabel ? w.pitVehLabel(lo) : t(M.loanerId)) + ' を ' + t(M.loanerFrom) + '〜' + t(M.loanerTo))
          : '何も入りません') + '</div></div>';
    h += '<div class="ms-rr"><div class="k">顧客控え</div><div class="v">'
      +  esc((t(M.customer) || t(M.kana) || '（無名）') + '／' + (t(M.plate) || 'ナンバーなし')) + '</div>'
      +  '<div class="s">' + (LOCKED ? '呼び出した控えに反映します' : '無ければ作ります') + '</div></div>';
    h += '</div><div class="ms-chkbox">';
    if (r.stop.length) h += '<div class="ms-chk ng"><b>いま保存できません（話として成立していません）</b><ul>'
      + r.stop.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    if (r.warn.length) h += '<div class="ms-chk wa"><b>押す前に、一度だけ聞きます</b><ul>'
      + r.warn.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    if (!r.stop.length && !r.warn.length) h += '<div class="ms-chk ok"><b>おかしな所はありません。</b>このまま保存できます。</div>';
    h += '</div><div class="ms-resf"><span class="ms-hint">操作ログに「マスターで作った／直した」と、変えた欄が全部残ります。</span>'
      + '<div class="ms-sp"></div>'
      + (MODE === 'fix' && BEFORE ? '<button class="ms-btn" onclick="pitMasterUndo()">開いた時に戻す</button>' : '')
      /* 🗑 売上なしアーカイブ＝予約詳細と同じ手順を1本のボタンで（ゆうた指定 2026-09-07） */
      + '<button class="ms-btn danger"' + (r.stop.length ? ' disabled' : '')
      + ' onclick="pitMasterNoSale()" title="実績にも売上にも入れずに片付けます">売上なしアーカイブで保存</button>'
      /* 🖨 表紙＝新規予約の「印刷して保存」と同じ道（保存が通った時だけ刷る） */
      + '<button class="ms-btn"' + (r.stop.length ? ' disabled' : '')
      + ' onclick="pitMasterSave(true)">表紙を印刷して保存</button>'
      + '<button class="ms-btn primary"' + (r.stop.length ? ' disabled' : '')
      + ' onclick="pitMasterSave()">保存してカードにする</button></div></div>';
    return h;
  }
  function paintFoot(){ var el = d.getElementById('ms-foot'); if (el && M) el.innerHTML = foot(); }
  function paintFind(){
    var el = d.getElementById('ms-find'); if (!el) return;
    var k = Q.replace(/[\s　-]/g,'').toLowerCase();
    el.innerHTML = (MODE === 'fix') ? findRows(k) : custRows(k);
  }

  function render(){
    var body = d.getElementById('master-body'); if (!body) return;
    if (!admin()){
      body.innerHTML = '<div class="ms-card"><div class="ms-pad"><div class="ms-chk ng">'
        + '<b>この画面は管理者以上だけが使えます。</b>実績と売上を直接書き換えられるためです。</div></div></div>';
      return;
    }
    if (!M) M = blank();
    var h = head() + callHtml() + findHtml();
    if (MODE === 'new' || (MODE === 'fix' && BEFORE)){
      h += sec1() + sec2() + sec3() + secShaken() + sec4() + '<div id="ms-foot">' + foot() + '</div>';
    } else {
      h += '<div class="ms-card"><div class="ms-pad"><div class="ms-hint">上で直すカードを探して選んでください。</div></div></div>';
    }
    body.innerHTML = h;
    if (w.icoBoot) try { w.icoBoot(body); } catch(e){}
  }
  w.renderMaster = function(){ if (!M) w.pitMasterOpen(); else render(); };

  console.log('[master-pit] ready（マスター入力）');
})(window, document);
