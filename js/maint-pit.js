/* ========================================
   maint-pit.js  -  🔧 代車の作業予定ボード（PitFlow v2.44.0）
   ----------------------------------------
   ◎なにをするもの（2026-08-31・ゆうた指定）
     🗣「代車管理の仕組みの変更。車両カレンダーと代車一覧の間に **代車作業予定** の欄を追加。
     　ココには直近半年分の予定が入る。また壊れた場合の予定の入力もここから手入力。
     　ここではあくまで **月の目標（やるべきこと）** として入力。修理の場合は **急ぎ** もあり。
     　今の車両カレンダーに予定が乗る。この時 **枠を抑えてない場合は警告** というか
     　『早くやれよ』の合図がでる」
     🗣「基本的な考え方は作業予定ボードの各カードに、**飛び地の作業予定とか、各種警告、等がまとまる**イメージ」

   ◎このファイルが持つもの
     pitMaintRows(today)   … ボードに出す行（月の目標＋保存済みの候補/確定＋警告を1つにまとめたもの）
     flMaintBoardHtml()    … ボードのHTML（renderFleet が呼ぶ）
     pitMaintBadges(v, ym) … 月カレンダーのバッジ（fleet.js が呼ぶ）
     flMaintAdd/Save/Drop  … 修理の手入力・取り下げ
     flMaintGoto           … 「日を決める」＝代車カレンダーへ飛ぶ

   🔴 **月の目標は保存しない。**車検・12ヶ月点検は満了日から計算で出す（loaner-free.js の pitLoanerMaintPlans）。
      保存するのは **人が作ったものだけ**＝修理の月の目標／日の候補／確定／「今日はやらない」。
      ＝ 画面を開いただけでクラウドに書かない。

   🔴🔴 **車検の満了を過ぎても貸出は止めない**（ゆうた指定「どんなにあっても、もともと生命線だから落とすことはない」）。
      ここは **赤で知らせるだけ**。`pitLoanerUsable` には絶対に手を出さないこと。

   ⚠ 置き場所は `state.fleetEvents` に `maint:true`（箱を増やさない＝「開くたび全件2回読む」の宿題を重くしない）。
   ⚠ 読み込みは loaner-free.js より後ろ・fleet.js より前。
   ======================================== */
(function (w) {
  'use strict';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function ymOf(ds){ return String(ds || '').slice(0, 7); }
  function ymAdd(ym, n){
    var p = String(ym).split('-'), y = +p[0], m = +p[1] - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function _pd(s){ var p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function md(ds){ var p = String(ds).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) : ds; }
  function ymText(ym){ var p = String(ym).split('-'); return p.length === 2 ? (+p[1]) + '月' : ym; }
  function daysBetween(a, b){
    var pa = String(a).split('-'), pb = String(b).split('-');
    return Math.round((new Date(+pb[0],+pb[1]-1,+pb[2]) - new Date(+pa[0],+pa[1]-1,+pa[2])) / 86400000);
  }
  function vehicles(){ return arr(w.state && w.state.loaners).concat(arr(w.state && w.state.companyCars)); }
  function vehName(v){ return (v && (v.model || v.name)) || '（車種未登録）'; }
  function vehNo(v){ return (v && v.number != null && v.number !== '') ? String(v.number) : ''; }
  function isLoaner(v){ return arr(w.state && w.state.loaners).some(function(x){ return x.id === v.id; }); }

  /* 保存してあるもの（fleetEvents の maint:true） */
  function recs(){ return arr(w.state && w.state.fleetEvents).filter(function(e){ return e && e.maint; }); }
  /* 同じ整備予定どうしを束ねる鍵。**計算で決まる**ので、月の目標を保存しなくても候補と結べる */
  function groupIdOf(vehId, work, ym){ return 'mg_' + vehId + '_' + work + '_' + ym; }

  /* 🔴 作業タイプは **社内区分「代車」の相方4つ（PIT_LOANER_MATES）と同じ**にそろえる。
     ＝入庫でカードを起こす時、そのまま `workType` に渡せる（変換表を持たない）。
     ⚠ 「修理」は独立した作業タイプではない＝**一般**（設定の説明も「通常の修理作業」）。
        独自の 'fix' を作ると、カードにする時に必ず変換表が要る＝そこが古くなる。 */
  var WORK_LB = { shaken:'車検', '12pt':'12ヶ月点検', general:'一般（修理）', bp:'B.P' };
  var WORK_CLS = { shaken:'mb-k-shaken', '12pt':'mb-k-12', general:'mb-k-fix', bp:'mb-k-gen' };

  /* ==================================================================
     ボードに出す行を組み立てる
     ------------------------------------------------------------------
     1行 ＝ 1つの整備予定。中身は
       plan（月の目標・計算） ＋ candidates（保存） ＋ fixed（保存） ＋ 状態 ＋ 警告
     ⚠ **直近半年ぶん**（ゆうた指定）。ただし**過ぎたもの・超過は必ず出す**（消えると事故る）。
     ================================================================== */
  function rows(todayStr){
    var td = todayStr || today();
    var horizon = ymAdd(ymOf(td), 6);      /* 直近半年 */
    var out = [];
    vehicles().forEach(function(v){
      if (v.retired) return;
      /* ① 車検・12ヶ月点検＝計算で出る目標 */
      var plans = (w.pitLoanerMaintPlans ? w.pitLoanerMaintPlans(v, td) : []);
      plans.forEach(function(p){
        if (!p.overdue && !p.slipped && p.ym > horizon) return;   /* 半年より先はまだ出さない */
        out.push(buildRow(v, p, td));
      });
      /* ② 修理など＝手で入れた月の目標（保存してある） */
      recs().forEach(function(r){
        if (r.vehicleId !== v.id || (r.stage || '') !== 'month') return;
        if (r.done) return;
        var ym = r.ym || ymOf(r.fromDate);
        var slip = ym < ymOf(td);
        out.push(buildRow(v, {
          work: r.work || 'general', label: WORK_LB[r.work || 'general'] || '整備', vehicleId: v.id,
          dueDate: '', openFrom: (slip ? ymOf(td) : ym) + '-01', openTo: '',
          months: [ym], ym: (slip ? ymOf(td) : ym), overdue: false, slipped: slip,
          inWindow: true, manualId: r.id, urgent: !!r.urgent, memo: r.memo || ''
        }, td));
      });
    });
    /* 並び＝赤 → 警告 → 動いているもの → まだ先。同じ強さなら期限が近い順 */
    var rank = { bad:0, warn:1, doing:2, go:3, idle:4 };
    out.sort(function(a, b){
      return (rank[a.level] - rank[b.level]) || (String(a.sortKey) < String(b.sortKey) ? -1 : 1);
    });
    return out;
  }

  function buildRow(v, p, td){
    var gid = p.manualId || groupIdOf(v.id, p.work, p.ym);
    var mine = recs().filter(function(r){
      if (r.vehicleId !== v.id) return false;
      if ((r.stage || '') === 'month') return false;
      return (r.groupId || '') === gid;
    });
    var cands = mine.filter(function(r){ return (r.stage || 'candidate') === 'candidate'; })
                    .sort(function(a,b){ return a.fromDate < b.fromDate ? -1 : 1; });
    var fixed = mine.filter(function(r){ return r.stage === 'fixed'; })[0] || null;

    var live = cands.filter(function(r){ return r.toDate >= td; });     /* まだ来ていない候補 */
    var level = 'idle', msg = '', msgCls = 'g';

    if (fixed && fixed.started){ level = 'doing'; msg = '作業中。完TELを通ると、残っている候補は消えます'; }
    else if (fixed){ level = 'go'; msg = '当日ビューに出ます。入庫したらタスクボードへカードが起きます'; }
    else if (p.overdue){
      level = 'bad'; msgCls = 'b';
      msg = '🚨 車検の満了を過ぎています（' + daysBetween(p.dueDate, td) + '日超過）。すぐ手配してください';
    }
    else if (!live.length && p.inWindow){
      level = 'warn'; msgCls = 'w';
      /* ⚠ 言い方は3通り。**満了があるもの／繰り越したもの／手で入れたもの**で噛み合う文が違う。
         「今月に入りましたが」を修理に出すと意味が通らない（満了が無いので）。 */
      if (p.slipped){
        msg = '⚠ ' + ymText(p.months[0]) + 'にできませんでした。' + ymText(p.ym) + 'へスライドしています';
      } else if (p.manualId){
        msg = p.urgent ? '🚨 急ぎです。まだ日が決まっていません。早めに枠を取ってください'
                       : '⚠ まだ日が決まっていません。早めに枠を取ってください';
        if (p.urgent) msgCls = 'b';
      } else {
        msg = '⚠ 今月に入りましたが候補がまだ1本もありません。早めに枠を取ってください';
      }
    }
    else if (live.length){ level = 'go'; msg = '候補 ' + live.length + '本。当日ビューに毎日出ています'; }
    else { level = 'idle'; msg = ''; }

    return {
      vehicleId: v.id, veh: v, isLoaner: isLoaner(v),
      work: p.work, workLabel: p.label || WORK_LB[p.work] || '整備',
      groupId: gid, plan: p, candidates: cands, live: live, fixed: fixed,
      level: level, msg: msg, msgCls: msgCls,
      urgent: !!p.urgent, memo: p.memo || '',
      sortKey: p.dueDate || (p.ym + '-99')
    };
  }

  /* ==================================================================
     月カレンダーのバッジ（fleet.js が1マスごとに呼ぶ）
     🔴 車検は **満了月＋その前2ヶ月の3ヶ月**（ゆうた指定「満了日の前2月分にも」）。
     ================================================================== */
  function badges(v, ym, todayStr){
    var td = todayStr || today();
    var out = [];
    if (!v || v.retired) return out;
    rows(td).forEach(function(r){
      if (r.vehicleId !== v.id) return;
      var p = r.plan;
      /* 満了超過＝今月の列に赤で出す（消えないように） */
      if (p.overdue && ym === ymOf(td)){
        out.push({ cls:'bad', text:'🚨 ' + r.workLabel + '超過', title:'満了 ' + p.dueDate + '（貸出は止めていません）', gid:r.groupId, ym:ym });
        return;
      }
      if (p.months.indexOf(ym) < 0 && p.ym !== ym) return;
      /* 確定・候補がその月にあれば実体のバッジ */
      var inMonth = r.candidates.filter(function(c){ return ymOf(c.fromDate) === ym; });
      var hit = (r.fixed && ymOf(r.fixed.fromDate) === ym) ? r.fixed : inMonth[0];
      if (hit){
        /* ⚠ 1マスしかないので、同じ月に候補が2本以上ある時は**まとめて数で出す**
           （1本目だけ出すと、残りが無いように見える） */
        var txt = (hit.stage !== 'fixed' && inMonth.length > 1)
                ? (r.workLabel + ' 候補' + inMonth.length + '本')
                : (r.workLabel + ' ' + md(hit.fromDate) + (hit.fromDate === hit.toDate ? '' : ('〜' + md(hit.toDate))));
        out.push({ cls: (hit.stage === 'fixed' ? 'fixed' : 'plan'), text: txt,
                   title: (hit.stage === 'fixed' ? '確定' : ('候補 ' + inMonth.map(function(c){ return md(c.fromDate) + '〜' + md(c.toDate); }).join(' / '))),
                   gid:r.groupId, ym:ym });
      } else {
        out.push({ cls:'plan' + (r.level === 'warn' ? ' warn' : ''), text:r.workLabel + (r.plan.slipped ? '（繰越）' : ''),
                   title:'日を決めるにはクリック', gid:r.groupId, ym:ym });
      }
      /* 満了日そのものの月には、赤で満了日 */
      if (p.dueDate && ymOf(p.dueDate) === ym){
        out.push({ cls:'due', text:'満了 ' + md(p.dueDate), title:p.dueDate, gid:r.groupId, ym:ym });
      }
    });
    return out;
  }

  /* ==================================================================
     ボードのHTML
     ================================================================== */
  function boardHtml(){
    var td = today();
    var list = rows(td);
    var nBad = list.filter(function(r){ return r.level === 'bad'; }).length;
    var nWarn = list.filter(function(r){ return r.level === 'warn'; }).length;

    var h = '<div class="fl-card">'
      + '<div class="fl-h"><span><i data-ic=wrench data-ics=16></i> 代車作業予定'
      + (nBad ? '<span class="mb-cnt bad">要対応 ' + nBad + '</span>' : '')
      + (nWarn ? '<span class="mb-cnt warn">警告 ' + nWarn + '</span>' : '')
      + '</span>'
      + '<span class="fl-note">直近半年ぶん／過ぎたものは消えずに残ります　'
      + '<button class="vh-btn" onclick="flMaintAdd()"><i data-ic=plus data-ics=16></i> 予定を足す</button></span></div>';

    if (!list.length){ h += '<div class="fl-empty">予定はありません</div></div>'; return h; }

    h += '<div class="mb-rows">';
    list.forEach(function(r){
      var p = r.plan;
      h += '<div class="mb-row mb-' + r.level + '">'
        + '<div class="mb-veh"><div class="mb-nm">' + esc(vehName(r.veh)) + '</div>'
        + '<div class="mb-no">' + (r.isLoaner ? ('代車' + esc(vehNo(r.veh))) : '社用車') + '</div>'
        + '<span class="mb-kind ' + (WORK_CLS[r.work] || 'mb-k-gen') + '">' + esc(r.workLabel) + '</span>'
        + (r.urgent ? '<span class="mb-urgent">急ぎ</span>' : '')
        + '</div>'
        + '<div class="mb-mid">';

      /* 1行目＝期限まわり */
      h += '<div class="mb-line">';
      if (p.dueDate){
        h += '<span class="mb-due">満了 ' + esc(p.dueDate) + '</span>';
        var dd = daysBetween(td, p.dueDate);
        h += '<span>' + (dd >= 0 ? ('あと' + dd + '日') : ((-dd) + '日超過')) + '</span>';
        if (p.openFrom) h += '<span>受けられる期間 ' + md(p.openFrom) + '〜' + md(p.openTo) + '</span>';
      } else {
        h += '<span class="mb-due">' + esc(ymText(p.months[0])) + ' の予定</span>';
        if (p.slipped) h += '<span>→</span><span class="mb-due">' + esc(ymText(p.ym)) + ' へ繰り越し</span>';
        if (r.memo) h += '<span>' + esc(r.memo) + '</span>';
      }
      h += '</div>';

      /* 2行目＝飛び地の候補 */
      h += '<div class="mb-line"><span>候補</span><span class="mb-slots">';
      if (r.fixed){
        h += '<span class="mb-chip fixed">' + md(r.fixed.fromDate) + '〜' + md(r.fixed.toDate) + ' で確定</span>';
      }
      r.candidates.forEach(function(c){
        var gone = c.toDate < td;
        h += '<span class="mb-chip' + (gone ? ' gone' : '') + '" title="' + esc(c.fromDate + '〜' + c.toDate) + '">'
           + md(c.fromDate) + (c.fromDate === c.toDate ? '' : ('〜' + md(c.toDate))) + '</span>';
      });
      if (!r.fixed) h += '<span class="mb-chip add" onclick="flMaintGoto(\'' + r.vehicleId + '\',\'' + p.ym + '\')">＋ 候補を置く</span>';
      h += '</span></div>';

      if (r.msg) h += '<div class="mb-msg ' + r.msgCls + '">' + esc(r.msg) + '</div>';
      h += '</div><div class="mb-act">'
        + (r.fixed ? '' : '<button class="vh-btn" onclick="flMaintGoto(\'' + r.vehicleId + '\',\'' + p.ym + '\')">日を決める</button>')
        + (p.manualId ? '<button class="vh-btn mb-del" onclick="flMaintDrop(\'' + p.manualId + '\')">取り下げ</button>' : '')
        + '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  /* ==================================================================
     修理などを手で足す（月の目標。**日はここでは決めない**）
     ================================================================== */
  w.flMaintAdd = function(){
    var td = today();
    var vs = vehicles().filter(function(v){ return !v.retired; });
    var opts = vs.map(function(v){
      return '<option value="' + v.id + '">' + esc(vehName(v)) + (vehNo(v) ? ('（' + esc(vehNo(v)) + '）') : '') + '</option>';
    }).join('');
    var yms = []; for (var i = 0; i < 7; i++){ var y = ymAdd(ymOf(td), i); yms.push('<option value="' + y + '">' + y.replace('-', '年') + '月</option>'); }
    _modal(
      '<h3 class="lo-modal-h"><i data-ic=wrench data-ics=16></i> 代車の作業予定を足す</h3>'
      + '<label class="lo-modal-f">車両<select id="mba-veh">' + opts + '</select></label>'
      + '<div class="lo-modal-row">'
      + '<label class="lo-modal-f">作業<select id="mba-work">'
      + '<option value="general">一般（修理）</option><option value="bp">B.P</option>'
      + '<option value="12pt">12ヶ月点検</option><option value="shaken">車検</option></select></label>'
      + '<label class="lo-modal-f">いつまでに<select id="mba-ym">' + yms + '</select></label>'
      + '</div>'
      + '<label class="lo-modal-f">ひとことメモ<input id="mba-memo" maxlength="40" placeholder="例：エアコンが効かない"></label>'
      + '<label class="lo-modal-f" style="display:flex;align-items:center;gap:7px"><input type="checkbox" id="mba-urgent" style="width:auto;margin:0"> 急ぎ</label>'
      + '<div class="lo-modal-note">ここで決めるのは<b>月の目標（やるべきこと）</b>だけです。日は「日を決める」から代車カレンダーで置きます。</div>'
      + '<div class="lo-modal-foot"><button onclick="flMaintClose()">キャンセル</button>'
      + '<button class="primary" onclick="flMaintSave()">足す</button></div>'
    );
  };
  w.flMaintSave = function(){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var veh = g('mba-veh'), work = g('mba-work'), ym = g('mba-ym'), memo = String(g('mba-memo') || '').trim();
    var urgent = !!(document.getElementById('mba-urgent') || {}).checked;
    if (!veh || !work || !ym){ w.pitAlert('車両・作業・いつまでに を入れてください', { code:'PF-3050' }); return; }
    if (!memo){ w.pitAlert('ひとことメモを入れてください', { code:'PF-3051',
      detail:'あとで見た人が「何の作業か」分かるように、ひとことだけ入れてください。' }); return; }
    if (!Array.isArray(w.state.fleetEvents)) w.state.fleetEvents = [];
    var p = ym.split('-'), last = new Date(+p[0], +p[1], 0).getDate();
    w.state.fleetEvents.push({
      id: 'mm' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      vehicleId: veh, maint: true, stage: 'month', work: work, ym: ym,
      urgent: urgent, memo: memo, label: (WORK_LB[work] || '整備'),
      fromDate: ym + '-01', toDate: ym + '-' + String(last).padStart(2,'0')
    });
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog('代車の作業予定を足した', { kind:'loaner', label: (WORK_LB[work]||'') + ' ' + ym + '（' + memo + '）' }); } catch(e){}
    flMaintClose(); if (w.renderFleet) w.renderFleet();
  };
  w.flMaintDrop = function(id){
    var r = recs().filter(function(x){ return x.id === id; })[0];
    if (!r) return;
    w.pitAsk('この予定を取り下げますか？', { code:'PF-3052', title:'作業予定の取り下げ', danger:true, ok:'取り下げる',
      detail:(WORK_LB[r.work] || '整備') + '　' + (r.ym || '') + '\n' + (r.memo || '') })
      .then(function(yes){
        if (!yes) return;
        w.state.fleetEvents = arr(w.state.fleetEvents).filter(function(x){ return x.id !== id && x.groupId !== id; });
        if (w.PitDB) w.PitDB.save();
        try { if (w.pitLog) w.pitLog('代車の作業予定を取り下げた', { kind:'loaner', label:(WORK_LB[r.work]||'') + ' ' + (r.ym||'') }); } catch(e){}
        if (w.renderFleet) w.renderFleet();
      });
  };

  /* 「日を決める」＝**いまもある「月をクリック → 日ビュー」をそのまま使う**（ゆうた指定 2026-08-31）。
     🔴 代車カレンダーへは飛ばさない。車両管理の中で完結させる。
     　 （車両管理の日ビューは代車カレンダーの出張所＝データは同じ部品から来ている） */
  w.flMaintGoto = function(vehId, ym){
    var p = String(ym || '').split('-');
    if (w.flZoomTo && p.length === 2) w.flZoomTo(vehId, +p[0], +p[1] - 1);
    else if (w.flZoom && p.length === 2) w.flZoom(+p[0], +p[1] - 1);
  };

  /* 軽量モーダル（代車カレンダーのものを借りる＝写しを作らない） */
  function _modal(html){
    flMaintClose();
    var ov = document.createElement('div'); ov.id = 'mb-modal'; ov.className = 'lo-modal-ov';
    ov.innerHTML = '<div class="lo-modal-box">' + html + '</div>';
    ov.addEventListener('click', function(e){ if (e.target === ov) flMaintClose(); });
    document.body.appendChild(ov);
  }
  w.flMaintClose = function flMaintClose(){ var m = document.getElementById('mb-modal'); if (m) m.remove(); };
  var flMaintClose = w.flMaintClose;


  /* ==================================================================
     段取り3 ── 日ビューで「日の候補」を置く／直す／取り下げ
     ------------------------------------------------------------------
     🗣「カレンダーに飛ぶのではなくて、**今も管理カレンダーの月をクリックすると日ビューにかわる仕様**、
     　それをそのまま使うイメージで」
     🔴 置く場所は**車両管理の日ビュー**（代車カレンダーではない）。
     🔴 セルを押したら**選択肢を出す**（代車カレンダーの空きと同じ考え方）。
        いままでの「セル＝代車自身の予定を追加」は**3つ目として残す**（消さない）。
     ================================================================== */

  /* その車・その日に置ける整備予定（月の目標）の一覧 */
  function plansFor(vehId, ds){
    var ym = ymOf(ds);
    return rows(today()).filter(function(r){
      if (r.vehicleId !== vehId) return false;
      if (r.fixed) return false;                       /* もう確定しているものには置かない */
      var p = r.plan;
      if (p.openFrom && ds < p.openFrom) return false; /* 受けられる期間より前には置けない */
      return p.months.indexOf(ym) >= 0 || p.ym === ym || (p.overdue || p.slipped);
    });
  }

  /* 🔧 v2.46.0 なぞった範囲（from〜to）で受ける。クリックだけなら from===to。 */
  w.flMaintCellMenu = function(vehId, ds, to){
    to = to || ds;
    var ps = plansFor(vehId, ds);
    var per = (ds === to) ? md(ds) : (md(ds) + '〜' + md(to));
    var h = '<div class="lo-bpop-h">' + esc(per) + (ds === to ? '' : '<small>（' + (Math.round((_pd(to) - _pd(ds)) / 86400000) + 1) + '日）</small>') + '</div>';
    ps.forEach(function(r){
      h += '<button class="lo-bpop-b" onclick="flMaintPlace(\'' + r.groupId + '\',\'' + vehId + '\',\'' + ds + '\',\'candidate\',\'\',\'' + r.work + '\',\'' + to + '\')">'
         + '<span class="mb-dot"></span>🔧 ' + esc(r.workLabel) + ' の<b>候補</b>を置く<small>この期間のどこかでやる、の提示</small></button>';
      h += '<button class="lo-bpop-b" onclick="flMaintPlace(\'' + r.groupId + '\',\'' + vehId + '\',\'' + ds + '\',\'fixed\',\'\',\'' + r.work + '\',\'' + to + '\')">'
         + '<span class="mb-dot fixed"></span>🔧 ' + esc(r.workLabel) + ' を<b>ここで確定</b><small>枠を押さえる（代車は貸せなくなる）</small></button>';
    });
    if (!ps.length){
      h += '<div class="lo-bpop-note">この車に、この月の整備予定がありません。<br>作業予定ボードの「＋ 予定を足す」から先に置いてください。</div>';
    }
    h += '<button class="lo-bpop-b" onclick="flMaintPopClose();flOpenEventModal(\'' + vehId + '\',\'' + ds + '\')">'
       + '🗓 代車自身の予定を追加<small>車検入庫・リースアップなど（いままでどおり）</small></button>';
    _pop(h);
  };

  /* 置く／直す の窓（期間） */
  /* ⚠ `work` は**呼ぶ側から渡す**。ここで groupId から引き直すと、
     引けなかった時に黙って「一般」に落ちる（画面には出るので気づけない）。 */
  w.flMaintPlace = function(gid, vehId, ds, mode, recId, work, dsTo){
    flMaintPopClose();
    var cur = recId ? recs().filter(function(r){ return r.id === recId; })[0] : null;
    var from = cur ? cur.fromDate : ds, to = cur ? cur.toDate : (dsTo || ds);
    var lb = (mode === 'fixed') ? '確定' : '候補';
    _modal(
      '<h3 class="lo-modal-h">🔧 整備の' + lb + (cur ? 'を直す' : 'を置く') + '</h3>'
      + '<div class="lo-modal-row"><label class="lo-modal-f">から<input type="date" id="mbp-from" value="' + from + '"></label>'
      + '<label class="lo-modal-f">まで<input type="date" id="mbp-to" value="' + to + '"></label></div>'
      + '<div class="lo-modal-note">'
      + (mode === 'fixed'
          ? '<b>確定</b>＝この期間は代車を貸せなくなります（枠を押さえます）。'
          : '<b>候補</b>＝「この期間のどこかでやる」の提示です。<b>代車は今までどおり貸せます</b>が、'
            + '「代車ありの最短入庫日」の案内からは外れます。')
      + '</div>'
      + '<div class="lo-modal-foot"><button onclick="flMaintClose()">キャンセル</button>'
      + '<button class="primary" onclick="flMaintPlaceSave(\'' + gid + '\',\'' + vehId + '\',\'' + mode + '\',\'' + (recId || '') + '\',\'' + (work || (cur && cur.work) || '') + '\')">'
      + (cur ? '直す' : '置く') + '</button></div>'
    );
  };
  w.flMaintPlaceSave = function(gid, vehId, mode, recId, work){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var from = g('mbp-from'), to = g('mbp-to');
    if (!from || !to){ w.pitAlert('期間を入れてください', { code:'PF-3053' }); return; }
    if (to < from){ w.pitAlert('「まで」は「から」以降にしてください', { code:'PF-3054' }); return; }
    if (!work){
      var r0 = rows(today()).filter(function(x){ return x.groupId === gid; })[0];
      work = r0 ? r0.work : '';
    }
    if (!work){ w.pitAlert('どの作業か分かりませんでした', { code:'PF-3056',
      detail:'作業予定ボードの「日を決める」から置き直してください。' }); return; }
    if (!Array.isArray(w.state.fleetEvents)) w.state.fleetEvents = [];
    var cur = recId ? recs().filter(function(x){ return x.id === recId; })[0] : null;
    if (cur){ cur.fromDate = from; cur.toDate = to; cur.stage = mode; }
    else {
      w.state.fleetEvents.push({
        id: 'mc' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        vehicleId: vehId, maint: true, stage: mode, work: work, groupId: gid,
        fromDate: from, toDate: to, skipped: [], label: (WORK_LB[work] || '整備')
      });
    }
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog(mode === 'fixed' ? '整備の枠を確定した' : '整備の候補を置いた',
      { kind:'loaner', label:(WORK_LB[work]||'') + ' ' + md(from) + '〜' + md(to) }); } catch(e){}
    flMaintClose(); if (w.renderFleet) w.renderFleet();
  };

  /* 日ビューの黄色いチップを押した時 */
  w.flMaintChip = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var isC = (r.stage || 'candidate') === 'candidate';
    _pop('<div class="lo-bpop-h">🔧 ' + esc(WORK_LB[r.work] || '整備') + ' <small>' + md(r.fromDate) + '〜' + md(r.toDate)
        + '（' + (isC ? '候補' : '確定') + '）</small></div>'
      + (isC ? '<button class="lo-bpop-b" onclick="flMaintPopClose();flMaintFix(\'' + recId + '\')"><span class="mb-dot fixed"></span>この枠で確定する</button>' : '')
      + '<button class="lo-bpop-b" onclick="flMaintPopClose();flMaintPlace(\'' + r.groupId + '\',\'' + r.vehicleId + '\',\'' + r.fromDate + '\',\'' + (r.stage||'candidate') + '\',\'' + recId + '\',\'' + (r.work||'') + '\')">期間を直す</button>'
      + '<button class="lo-bpop-b danger" onclick="flMaintPopClose();flMaintDelRec(\'' + recId + '\')">この' + (isC ? '候補' : '確定') + 'を取り消す</button>');
  };
  w.flMaintFix = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    r.stage = 'fixed';
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog('整備の枠を確定した', { kind:'loaner', label:(WORK_LB[r.work]||'') + ' ' + md(r.fromDate) + '〜' + md(r.toDate) }); } catch(e){}
    if (w.renderFleet) w.renderFleet();
  };
  w.flMaintDelRec = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    w.state.fleetEvents = arr(w.state.fleetEvents).filter(function(x){ return x.id !== recId; });
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog('整備の枠を取り消した', { kind:'loaner', label:(WORK_LB[r.work]||'') + ' ' + md(r.fromDate) + '〜' + md(r.toDate) }); } catch(e){}
    if (w.renderFleet) w.renderFleet();
  };

  /* ==================================================================
     段取り4 ── 当日ビュー
     ------------------------------------------------------------------
     🗣「当日ビュー→未入庫→消滅」＝候補の枠は「この期間のどの日でもいいですよ」の提示なので、
        **1日ずつ出て、やらなかった日はその日ぶんだけ消える。**
     🔴🔴 **未入庫に溜めない。**ふつうの予約と違って追いかける相手がいないので、
        残すと未入庫が黄色で埋まって誰も見なくなる。
     🗣（見せ方）「基本は既存の物を出来る限り代車に寄せるレベルでいいよ。
     　名前　自社代車　車種名　作業バッチ　車検・代車　みたいな感じで」
     ⚠ v1.131.0 の「当日ビューに車検の枠は出さない」は**お客様の車検予定**の話。
        これは**自社の代車を入庫させる**話なので別物（入庫の列に出る）。
     ================================================================== */
  function vehOf(id){ return vehicles().filter(function(v){ return v.id === id; })[0] || null; }

  function todayList(ds){
    var out = [];
    recs().forEach(function(r){
      var st = r.stage || 'candidate';
      if (st === 'month' || r.done) return;
      if (!(r.fromDate <= ds && r.toDate >= ds)) return;
      if (arr(r.skipped).indexOf(ds) >= 0) return;      /* 「今日はやらない」を押した日 */
      var v = vehOf(r.vehicleId); if (!v || v.retired) return;
      out.push({ rec:r, veh:v, work:r.work, label:(WORK_LB[r.work] || '整備'),
                 fixed:(st === 'fixed'), urgent:!!r.urgent, memo:r.memo || '' });
    });
    /* 確定が先・急ぎが先 */
    out.sort(function(a,b){ return (b.fixed - a.fixed) || (b.urgent - a.urgent); });
    return out;
  }

  /* 当日ビューの1行。**既存のカードと同じ見た目**（クラスをそのまま借りる） */
  function todayHtml(ds){
    var list = todayList(ds);
    if (!list.length) return '';
    var h = '';
    list.forEach(function(x){
      var wt = arr(w.state && w.state.workTypes).filter(function(t){ return t.id === x.work; })[0];
      h += '<div class="today-row tod-maint' + (x.urgent ? ' is-urgent' : '') + '"'
         + ' onclick="pitMaintTodayTap(\'' + x.rec.id + '\')" style="--team:#d6a846">'
         + '<div class="tr-time">終日</div>'
         + '<div class="tr-front is-div" style="background:#d6a846" title="自社の代車">代車</div>'
         + '<div class="tr-main">'
         + '<div class="tr-headline"><span class="tr-customer">自社代車</span>'
         + '<span class="tr-carname">' + esc(vehName(x.veh)) + '</span></div>'
         + '<div class="tr-plateline">'
         + (x.veh.plate ? '<span class="tr-plate">' + esc(x.veh.plate) + '</span>' : '')
         + '<span class="tod-note">' + esc(x.fixed ? (md(x.rec.fromDate) + '〜' + md(x.rec.toDate) + ' で確定')
                                                   : ('候補 ' + md(x.rec.fromDate) + '〜' + md(x.rec.toDate) + ' のうち今日')) + '</span>'
         + '</div></div>'
         + '<div class="tr-side">'
         + (x.urgent ? '<span class="tag-side">急ぎ</span>' : '')
         + '<span class="tag-side loaner">代車</span>'
         + (wt ? '<span class="tag-work" style="background:' + wt.color + '20;color:' + wt.color + ';border-color:' + wt.color + ';">' + esc(wt.label) + '</span>' : '')
         + '</div></div>';
    });
    return h;
  }

  w.pitMaintTodayTap = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var v = vehOf(r.vehicleId);
    _pop('<div class="lo-bpop-h">🔧 ' + esc(vehName(v)) + ' <small>' + esc(WORK_LB[r.work] || '整備') + '</small></div>'
      + '<button class="lo-bpop-b primary" onclick="flMaintPopClose();pitMaintIntake(\'' + recId + '\')">'
      + '<i data-ic=download data-ics=16></i> 入庫する<small>タスクボードにカードが起きます</small></button>'
      + '<button class="lo-bpop-b" onclick="flMaintPopClose();pitMaintSkip(\'' + recId + '\')">'
      + '今日はやらない<small>この日ぶんだけ消えます（次の候補日を待ちます）</small></button>');
  };

  /* 「今日はやらない」＝その日だけ消す（枠そのものは残る） */
  w.pitMaintSkip = function(recId, ds){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var d = ds || today();
    if (!Array.isArray(r.skipped)) r.skipped = [];
    if (r.skipped.indexOf(d) < 0) r.skipped.push(d);
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog('整備の枠を今日は見送った', { kind:'loaner',
      label:(WORK_LB[r.work]||'') + ' ' + md(d) }); } catch(e){}
    if (w.renderToday) w.renderToday();
  };

  /* ==================================================================
     段取り5 ── 入庫 → タスクボードにカードを起こす
     ------------------------------------------------------------------
     🔴 受け皿（社内区分「代車」＋相方・売上非カウント）は **v2.6.0 でもう出来ている。**
        ここでやるのは「その形のカードを作って、点検待ちに置く」だけ。
     🔴 お客様は **自社（小林モータース）**。代車マスタに結び先が無いので、
        **ナンバーで顧客控えを引いて当てる**（見つかった時だけ代車マスタに覚える＝人の操作の中で書く）。
     ================================================================== */
  function ownerOf(v){
    if (!v) return null;
    /* すでに結んであればそれ */
    if (v.custId){
      var c0 = arr(w.state && w.state.customers).filter(function(c){ return c.id === v.custId; })[0];
      if (c0) return { cust:c0, veh: arr(c0.vehicles).filter(function(x){ return x.id === v.custVehId; })[0] || null };
    }
    var key = String(v.plate || '').replace(/\s/g, '');
    if (!key) return null;
    var hit = null;
    arr(w.state && w.state.customers).forEach(function(c){
      if (hit) return;
      arr(c.vehicles).forEach(function(x){
        if (hit) return;
        if (String(x.plate || '').replace(/\s/g, '') === key) hit = { cust:c, veh:x };
      });
    });
    return hit;
  }
  w.pitMaintOwner = ownerOf;

  w.pitMaintIntake = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var v = vehOf(r.vehicleId);
    if (!v){ w.pitAlert('この車両が見つかりません', { code:'PF-3055' }); return; }
    var td = today();
    var own = ownerOf(v);
    var det = 'お客様＝自社（社内区分「代車」）。売上・完TEL・洗車・伝票はありません。\n'
            + (own ? ('顧客控え：' + (own.cust.name || '（名前なし）')) : '⚠ ナンバーで顧客控えを引けませんでした（カードは作れます）');
    w.pitAsk('この代車を入庫させますか？', { title:(WORK_LB[r.work] || '整備') + '　' + vehName(v), ok:'入庫する', detail:det })
      .then(function(yes){ if (yes) _intakeGo(r, v, own, td); });
  };
  function _intakeGo(r, v, own, td){
    /* ① 枠を「確定・作業中」にする（④ 実際に合わせて縮む／伸びるのはここから始まる） */
    r.stage = 'fixed'; r.started = true;
    r.fromDate = td;
    if (r.toDate < td) r.toDate = td;
    /* ② 見つかったら代車マスタに覚える（人が押した操作の中なので書いてよい） */
    if (own && own.cust){ v.custId = own.cust.id; if (own.veh) v.custVehId = own.veh.id; }
    /* ③ カードを起こす＝**社内区分「代車」**。受け皿は v2.6.0 のまま使う */
    var card = {
      id: 'c' + Date.now(), resNo: (w.pitGenResNo ? w.pitGenResNo() : ''),
      status: 'check',                      /* 入庫済み＝タスクの最初の工程（点検待ち） */
      boardId: 'default', bayId: null, division: null,
      customer: (own && own.cust && own.cust.name) ? own.cust.name : '自社代車',
      customerId: (own && own.cust) ? own.cust.id : '',
      kana: '', tel: '', maker: v.maker || '', car: vehName(v), plate: v.plate || '',
      karteNo: (own && own.veh && own.veh.karteNo) ? own.veh.karteNo : '',
      reserveDate: td, reserveTime: '', bookedAt: td, actualInAt: td, returnDate: '',
      workType: r.work, workTypes: [r.work], dropType: null,
      internKind: 'loanercar',              /* 🔴 これで売上・台数・突合から外れる（v2.6.0） */
      consult:false, needLoaner:false, needWash:false, urgent: !!r.urgent,
      memo: r.memo || '', workSpecials: [], tentative:false, approvalPending:false,
      maintGroupId: r.groupId, maintRecId: r.id,
      log: [{ label:'代車の整備で入庫', at: Date.now() }]
    };
    if (!Array.isArray(w.state.cards)) w.state.cards = [];
    w.state.cards.push(card);
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog) w.pitLog('代車を整備で入庫した', { cardId:card.id, kind:'in',
      label: vehName(v) + ' / ' + (WORK_LB[r.work] || '整備') }); } catch(e){}
    if (w.pitToast) w.pitToast('入庫しました → タスク「点検待ち」へ');
    if (w.renderToday) w.renderToday();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  }

  /* 🏁 完TEL関門を通った時＝**残りの候補をまとめて消す**（ゆうた指定「入庫時ではなく完TELで」）。
     ＋ ④ 本黄色を**実際の入庫〜返車に合わせる**。
     ⚠ 呼ぶのは intern-pit.js（社内車両の実績化）の1か所だけ。ここに条件を書き写さない。 */
  w.pitMaintOnComplete = function(c){
    if (!c || !c.maintGroupId) return;
    var td = today();
    var gone = 0;
    arr(w.state && w.state.fleetEvents).forEach(function(r){
      if (!r.maint || r.groupId !== c.maintGroupId) return;
      if (r.id === c.maintRecId){
        r.done = true; r.stage = 'fixed';
        r.toDate = c.returnDate || c.completedAt || td;   /* 実際に合わせて縮む／伸びる */
        if (r.toDate < r.fromDate) r.toDate = r.fromDate;
      } else if ((r.stage || 'candidate') === 'candidate'){ r._drop = true; gone++; }
    });
    if (gone) w.state.fleetEvents = arr(w.state.fleetEvents).filter(function(r){ return !r._drop; });
    if (w.PitDB) w.PitDB.save();
    try { if (w.pitLog && gone) w.pitLog('整備が終わったので残りの候補を消した', { cardId:c.id, kind:'loaner',
      label:'候補 ' + gone + '本' }); } catch(e){}
  };

  /* 小窓（代車カレンダーのものを借りる） */
  function _pop(html){
    flMaintPopClose();
    var p = document.createElement('div');
    p.id = 'mb-pop'; p.className = 'lo-bpop mb-pop'; p.innerHTML = html;
    document.body.appendChild(p);
    setTimeout(function(){ document.addEventListener('mousedown', _popOut, true); }, 0);
  }
  function _popOut(e){
    var p = document.getElementById('mb-pop');
    if (p && !p.contains(e.target)) flMaintPopClose();
  }
  w.flMaintPopClose = function(){
    var p = document.getElementById('mb-pop'); if (p) p.remove();
    document.removeEventListener('mousedown', _popOut, true);
  };

  w.pitMaintToday     = todayList;
  w.pitMaintTodayHtml = todayHtml;
  w.pitMaintPlansFor  = plansFor;

  w.pitMaintRows   = rows;
  w.pitMaintBadges = badges;
  w.flMaintBoardHtml = boardHtml;
  w.PIT_MAINT_WORK_LB = WORK_LB;
})(window);
