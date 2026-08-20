/* ========================================
   dashboard.js  -  ダッシュボード＋混雑度（置き場ベース）／PitFlow v0.7.0
   ----------------------------------------
   ◎混雑度の考え方（小林モータース＝預かり中心）
     ・各車は「入庫日〜返車日」まで置き場を1台分専有する（当日仕上げは1日だけ）。
     ・ある日の混雑度 ＝ その日に預かっている台数 ÷ 置ける台数(settings.lotCapacity)。
     ・最短入庫 ＝ 今日から順に、預かり期間ぶん足しても置き場が溢れない最初の日。
     ・工数(整備士)・PIT枠は将来の補助指標（今は置き場が主ボトルネック）。
   ======================================== */

function _dashCap(){ return (state.settings && state.settings.lotCapacity) || 20; }

// その車が置き場を占有しているか（返車・廃車は除く）
// ⚠ v1.17.0：まだ保存していない新規予約（_draft）は数えない。
//    dashOccupancy / dashIntake / _dashHeldOnTeam は全部ここを通るので、1か所直せば全部に効く。
function _dashHeld(c){ return !c._draft && c.status !== 'returned' && c.status !== 'scrap'; }

// YYYY-MM-DD をローカル日付に
function _pd(s){ const p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
// 占有の終了日：返車日が確定していればそれ／無ければ概算預かり日数での「見込み」
function _dashEnd(c){
  if (c.returnDate) return c.returnDate;
  const est = (c.estHoldDays != null) ? c.estHoldDays : (window.pitEstHold ? pitEstHold(c.workType, c.dropType, window.pitTeamKey?pitTeamKey(c):'default') : 3);
  return ymd(addDays(_pd(c.reserveDate), est));
}
// 指定日(YYYY-MM-DD)の預かり台数（未来は概算日数での見込み＝予想）
function dashOccupancy(dStr){
  return state.cards.filter(function(c){
    if (!_dashHeld(c) || !c.reserveDate || c.reserveDate > dStr) return false;
    return _dashEnd(c) >= dStr;
  }).length;
}
// チーム別 その日の入庫（予約）台数
function dashIntake(team, dStr){
  return state.cards.filter(function(c){ return c.boardId === team && c.reserveDate === dStr && _dashHeld(c); }).length;
}

// チーム別の預かり台数（boardId: default＝国産 / import＝輸入）
function _dashHeldOnTeam(board, dStr){
  return state.cards.filter(function(c){
    if (!_dashHeld(c) || c.boardId !== board || !c.reserveDate || c.reserveDate > dStr) return false;
    return _dashEnd(c) >= dStr;
  }).length;
}
/* ===== ⏱ 最短入庫日（v0.24.0・チーム別×タイプ別） =====
   代車なし＝予約枠が空く最初の営業日（受付判定が×でない日）
   代車あり＝上に加えて、1台の代車が「預かり想定日数ぶん連続」で空く最初の日
   当日作業＝営業日ならOK（オイル等＝置き場・枠をほぼ使わない） */
function _vdTeam(ds, team){
  const v = window.pitVerdict ? pitVerdict(ds) : null;
  if (!v) return { mark: '○' };
  return team === 'import' ? v.import : v.default;
}
/* 🔴 v1.80.0 判定は loaner-free.js の1本に寄せた。
   ここで自前に数え直さないこと（**引退・緊急・代車自身の車検**を外す条件が付いている）。
   ⚠ 以前はこの関数が自分で数えていて、
      「引退した代車」「緊急車両」「車検入庫中の代車」まで空きに数えていた
      ＝**代車ありで入庫できる日が実際より早く出る**（約束したのに代車が無い）。 */
function _loanerFreeRun(startStr, days){
  return window.pitLoanerFreeRun ? pitLoanerFreeRun(startStr, days) : false;
}
/* 🔴🔴 v1.156.0（ゆうた指定 2026-08-20）**代車ありの最短入庫日を作り直した。**
   🗣「現状**代車が1日でも空いてたらOKの扱い**だから、結局最短入庫日が『今日』から動かない。
   　　ただ実態としてはさすがに違う」

   ◎前（v1.155.0 まで）
     `pitLoanerFreeRun(その日, 預かり日数)` ＝ **その日から預かり日数ぶん空いていればOK**。
     ⚠ 予備がゼロなので、**前の人が1日延びただけで約束が崩れる**。
     ⚠ しかも作業タイプ未選択のときは既定の3日しか見ていないので、実質いつでも「今日」になっていた。

   ◎今（判定は loaner-free.js の `pitLoanerPlanWindow` 1本。ここに条件を書き写さない）
     ・作業タイプ**未選択** … **1週間きっちり**取れる日から案内
     ・作業タイプ**選択済** … **前日〜入庫日＋預かり日数**（＝預かり日数＋2日）が取れる日
     ・お客様が**国産車**なら**輸入車の代車は数えない**（案内では避ける・あとから選ぶのは自由）
   ⚠ opt.board にお客様の車（default／import）を渡す。渡さなければ絞らない。 */
function dashEarliestIntake(team, kind, today, holdOverride, opt){
  const hold = (holdOverride && +holdOverride > 0) ? +holdOverride : null;
  const lopt = { board: (opt && opt.board) || null };
  for (let i = 0; i < 180; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const tv = _vdTeam(ds, team);
    if (tv.mark === '休') continue;                       // 定休・連休は受付なし
    if (kind === 'same') return d;                        // 当日作業＝営業日ならOK
    if (tv.mark === '×') continue;                        // 枠が埋まっている日は不可
    if (kind === 'noLoaner') return d;                    // 代車なし＝枠が空けばOK
    /* 代車あり＝**きちんと取れる窓**が要る（1週間 or 預かり日数＋前後1日） */
    if (window.pitLoanerPlanOk ? pitLoanerPlanOk(ds, hold, lopt)
                               : _loanerFreeRun(ds, hold || 7)) return d;
  }
  return null;
}

/* ===== 🗓 予約の埋まり＝横軸の無限カレンダー（v0.25.0） =====
   1日1列：日付／国産車／輸入車。セルは「埋まり/枠」＋ 可・終了・超過（黒）・休 のシンプル4種。
   右端近くまでスクロールすると30日ずつ継ぎ足し（初期60日・件数はその場で計算） */
window._dashCalN = window._dashCalN || 60;

function _dashCalCell(team, tgt, base, ds){
  const eff = window.pitEffective ? pitEffective(ds, tgt, base) : { value: base, closed: null, rules: [] };
  if (eff.closed) return '<div class="drc-c drc-closed" title="' + eff.closed + '＝受付なし">休</div>';
  const cnt = dashIntake(team, ds);
  const capEff = eff.value;
  if (capEff <= 0) return '<div class="drc-c drc-end"title="ルールで受付停止">停</div>';
  if (cnt > capEff)  return '<div class="drc-c drc-over" title="枠を超えて受けています（人の最終判断で挿入）">' + cnt + '/' + capEff + '<span>超過</span></div>';
  if (cnt >= capEff) return '<div class="drc-c drc-end">' + cnt + '/' + capEff + '<span>終了</span></div>';
  return '<div class="drc-c drc-okk">' + cnt + '/' + capEff + '<span>可</span></div>';
}

function _dashCalCols(from, to, today, tStr){
  const rc = (state.settings && state.settings.reserveCap) || { default: 5, import: 3 };
  const capD = rc.default != null ? rc.default : 5;
  const capI = rc.import  != null ? rc.import  : 3;
  let g = '';
  for (let i = from; i < to; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const hol = (window.Holidays && Holidays.name) ? Holidays.name(ds) : null;
    /* 🚫 v1.50.0 休み（MHSの定休日カレンダー）は見出しにも出す＝「なぜ休なのか」が分かるように */
    const calNote = (window.PitCal ? PitCal.label(ds) : '');
    const isClosed = (window.PitCal ? PitCal.isClosed(ds) : false);
    const cls = (d.getDay() === 0 || hol) ? ' red' : (d.getDay() === 6 ? ' sat' : '');
    g += '<div class="drc-col' + (ds === tStr ? ' today' : '') + '">';
    g += '<div class="drc-h'+ cls + (isClosed ? ' closed' : '') + '" title="'+ (calNote || hol || '') + '">'+ (d.getMonth()+1) + '/'+ d.getDate() + '<br>'+ '日月火水木金土'[d.getDay()] + (ds === tStr ? '・今日': (calNote ? '・' + calNote : '')) + '</div>';
    g += _dashCalCell('default', 'capDefault', capD, ds);
    g += _dashCalCell('import',  'capImport',  capI, ds);
    g += '</div>';
  }
  return g;
}

// 代車の最短空き（4台のうち1台でも空く最初の日）
function dashLoanerEarliestFree(today){
  /* 🔴 v1.80.0 空きの判定は loaner-free.js（引退・緊急・代車自身の車検を除く） */
  if (!window.pitLoanerFreeRun) return null;
  for (let i = 0; i < 120; i++){
    if (pitLoanerFreeRun(ymd(addDays(today, i)), 1)) return addDays(today, i);
  }
  return null;
}

// 混雑レベル → 色/ラベル
function _dashLevel(ratio){
  if (ratio >= 1)    return { c:'#ef4444', t:'満杯' };
  if (ratio >= 0.9)  return { c:'#f97316', t:'混雑' };
  if (ratio >= 0.7)  return { c:'#eab308', t:'やや混' };
  return { c:'#1db97a', t:'余裕' };
}

/* 🅿️ 駐車場の空き → 色（v0.25.2 ゆうた指定・しきい値は設定で変更可）
   ちょい超過は緊急+α・コインパで吸収できる「普通」＝赤を安売りしない。
   空き0以上＝緑／超過1〜warn(既定5)＝オレンジ／warn超〜danger未満＝濃いオレンジ／danger(既定10)以上＝赤 */
function dashParkCol(freeSigned){
  const ov = (state.settings && state.settings.lotOver) || { warn: 5, danger: 10 };
  if (freeSigned >= 0) return '#1db97a';
  const over = -freeSigned;
  if (over >= (ov.danger != null ? ov.danger : 10)) return '#ef4444';
  if (over >  (ov.warn   != null ? ov.warn   : 5))  return '#ea580c';
  return '#f97316';
}

function renderDashboard(){
  const wrap = document.getElementById('view-dashboard-body');
  if (!wrap) return;
  const cap = _dashCap();
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr = ymd(today);
  const dow = '日月火水木金土'[today.getDay()];

  const inToday   = state.cards.filter(function(c){ return c.reserveDate === tStr && _dashHeld(c); }).length;
  /* 🔴 v1.65.0 返車の日は return-slot.js の物差し1本から取る */
  const _outOn = function(c, ds){ return window.pitReturnListDate ? (pitReturnListDate(c) === ds) : (c.returnDate === ds && _dashHeld(c)); };
  const outToday  = state.cards.filter(function(c){ return _outOn(c, tStr); }).length;
  const heldNow   = dashOccupancy(tStr, tStr);
  const freeSigned = cap - heldNow;   // 今日の駐車場空き（マイナス＝オーバー）
  const parkCol = dashParkCol(freeSigned);

  // 2週間の混雑
  const days = [];
  for (let i = 0; i < 14; i++){
    const d = addDays(today, i);
    const occ = dashOccupancy(ymd(d), tStr);
    days.push({ d: d, occ: occ });
  }
  const maxOcc = Math.max(cap, days.reduce(function(m,x){ return Math.max(m, x.occ); }, 0));

  let h = '';

  // 見出し
  h += '<div class="dash-date">' + (today.getMonth()+1) + '月' + today.getDate() + '日（' + dow + '）の状況</div>';

  // KPI
  h += '<div class="dash-kpis">';
  h += dashKpi('<i data-ic=download data-ics=16></i>', '今日の入庫', inToday, '台');
  h += dashKpi('<i data-ic=upload data-ics=16></i>', '今日の返車', outToday, '台');
  h += dashKpi('<i data-ic=parking data-ics=16></i>', '預かり中', heldNow, '台');
  h += '</div>';

  // 🅿️ 駐車場サマリー（1ブロック・クリックで駐車場ビュー・v0.71.0）。詳細は parking.js
  h += (window.ParkingView ? ParkingView.summaryHtml() : '');

  // ⏱ 最短入庫日（チーム別×代車なし/代車あり/当日作業・v0.24.0）
  const holdN = (state.settings && state.settings.holdDaysDefault) || 3;
  function elCell(team, kind){
    const d = dashEarliestIntake(team, kind, today);
    if (!d) return '<td><b class="dash-el-d none">なし</b><span class="dash-el-w">180日内</span></td>';
    const isT = ymd(d) === tStr;
    return '<td><b class="dash-el-d' + (isT ? ' ok' : '') + '">' + (isT ? '今日' : (d.getMonth()+1) + '/' + d.getDate()) + '</b><span class="dash-el-w">' + (isT ? 'OK' : '日月火水木金土'[d.getDay()] + '曜') + '</span></td>';
  }
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span><i data-ic=clock data-ics=16></i> 最短入庫日</span><span class="dash-note">予約枠・定休・連休・代車の空きから自動計算（代車＝' + holdN + '日連続空きで判定）</span></div>';
  h += '<table class="dash-el"><tr><th></th><th>代車なし</th><th>代車あり</th><th>当日作業</th></tr>';
  h += '<tr><td class="dash-el-t"><i data-ic=car data-ics=16></i> 国産車</td>' + elCell('default','noLoaner') + elCell('default','loaner') + elCell('default','same') + '</tr>';
  h += '<tr><td class="dash-el-t"><i data-ic=globe data-ics=16></i> 輸入車</td>' + elCell('import','noLoaner')  + elCell('import','loaner')  + elCell('import','same')  + '</tr>';
  h += '</table>';
  h += '</div>';

  // 📌 全体タスク（付箋ボード・v0.63.0）＝最短入庫日の直下。中身は board-notes.js が描画
  h += '<div id="board-notes-area"></div>';

  // チーム別の状況（国産／輸入）
  const teams = [{ key:'default', name:'<i data-ic=car data-ics=16></i> 国産車チーム' }, { key:'import', name:'<i data-ic=globe data-ics=16></i> 輸入車チーム' }];
  h += '<div class="dash-card"><div class="dash-h"><span><i data-ic=users data-ics=16></i> チーム別の状況</span><span class="dash-note">国産 : 輸入 ＝ ざっくり 6 : 4</span></div><div class="dash-teams">';
  teams.forEach(function(t){
    const held = _dashHeldOnTeam(t.key, tStr, tStr);
    const tin  = state.cards.filter(function(c){ return c.boardId === t.key && c.reserveDate === tStr && _dashHeld(c); }).length;
    const tout = state.cards.filter(function(c){ return c.boardId === t.key && _outOn(c, tStr); }).length;
    h += '<div class="dash-team"><div class="dash-team-n">' + t.name + '</div>'
       + '<div class="dash-team-stats"><span class="big"><b>' + held + '</b>台 預かり</span><span>本日入庫 ' + tin + '</span><span>本日返車 ' + tout + '</span></div></div>';
  });
  h += '</div></div>';

  // （🅿️ 今日の駐車場空き／📅 直近2週間の駐車場予想 は v0.71.0 で駐車場ビューへ移設・上部サマリーに集約）

  // 🗓 予約の埋まり（横軸の無限カレンダー・v0.25.0 ゆうた指示のシンプル表示）
  //    可（緑）＝空きあり／終了（赤）＝満枠／超過（黒）＝人の判断で枠を超えて受けた分／休＝定休・連休
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span><i data-ic=calendar data-ics=16></i> 予約の埋まり</span><span class="dash-note">右へスクロールで無限に先まで｜<span style="color:#1db97a">可</span>＝空きあり・<span style="color:#ef4444">終了</span>＝満枠・<b>超過(黒)</b>＝人の判断で枠超え</span></div>';
  h += '<div class="drc-scroll" id="drc-scroll"><div class="drc-grid" id="drc-grid">';
  h += '<div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c"><i data-ic=car data-ics=16></i> 国産車</div><div class="drc-c"><i data-ic=globe data-ics=16></i> 輸入車</div></div>';
  h += _dashCalCols(0, window._dashCalN, today, tStr);
  h += '</div></div>';
  h += '</div>';

  h += '<div class="dash-foot">「置き場・代車・予約上限」は確定して読める部分。<b>未来の置き場は概算預かり日数による“予想（不確定）”</b>＝診断・見積もりが進むほど精度が上がる前提。置ける台数・1日の上限・概算日数は <a href="javascript:showView(\'settings\')" style="color:inherit;font-weight:700"><i data-ic=settings data-ics=16></i> 設定</a> から変更できます。</div>';

  wrap.innerHTML = h;

  // 📌 付箋ボードを描画（最短入庫日の下）
  if (window.renderBoardNotes) renderBoardNotes();

  // 🗓 予約の埋まり：右端近くで30日継ぎ足し（スクロール位置はそのまま＝カクつかない）
  const sc = document.getElementById('drc-scroll');
  if (sc && !sc._drcBound){
    sc._drcBound = true;
    sc.addEventListener('scroll', function(){
      if (sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 260){
        const from = window._dashCalN;
        window._dashCalN += 30;
        const grid = document.getElementById('drc-grid');
        if (grid) grid.insertAdjacentHTML('beforeend', _dashCalCols(from, window._dashCalN, today, tStr));
      }
    });
  }
}

function dashKpi(icon, label, num, unit){
  return '<div class="dash-kpi"><div class="dash-kpi-ic">' + icon + '</div><div class="dash-kpi-num">' + num + '<span>' + unit + '</span></div><div class="dash-kpi-l">' + label + '</div></div>';
}
