/* ========================================
   today.js  -  当日ビュー（朝イチ全員で見る今日の段取り紙）／PitFlow v0.29.0
   ----------------------------------------
   ◎時間軸レイアウト（ゆうた設計 2026-06-05）
     ・入庫と返車を縦に時間順で並べ、休憩枠（12:00-13:00 / 15:30-16:30）を
       両カラムで高さを揃えて差し込む。来店が休憩に被る時は枠内にカードを入れられる。
     ・足りない方の時間帯は空間を開ける＝「午前にどれだけ残ってるか」が体感で分かる。
   ◎チーム色：国産＝グリーン(#1db97a) / 輸入＝ピンク(#ec4899)。右端アクセント。
   ◎担当フロントを時間と客名の間に縦書きバッジ（1課=緑 / 2課=ピンク）。
   ◎当日/翌日トグル（カレンダーの月送りイメージ）。
   ======================================== */

const TODAY_BREAKS = [
  { from: '12:00', to: '13:00', label: '休憩' },
  { from: '15:30', to: '16:30', label: '休憩' },
];

window._todayOffset = 0;   // 0=当日 / 1=翌日 …
window._todayFull = false; // false=コンパクト（詰め・既定）/ true=フルビュー（左右で高さを揃える）

function _todTeamColor(c){ return (c.boardId === 'import') ? '#ec4899' : '#1db97a'; }

/* "09:30" や "09:00-10:00" の先頭時刻を分に。空は大きい値（末尾送り）。
   🔴 v1.33.0 ショートカット（AM・朝一・決まり次第 など）も扱えるよう、
      **物差しは state.js の pitTimeMin に一本化**した。ここで独自に数えないこと。 */
function _todMin(t){
  if (window.pitTimeMin) return pitTimeMin(t);
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 99999;
  return (+m[1]) * 60 + (+m[2]);
}
function _hm(min){ return String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0'); }

/* 当日メモ（クイック引継ぎ）＝当日ビューのナンバー横に1行。c.todayNote に保持（当日中の共有用に保存はするが、フェーズが変わった後は気にしない）v0.123.0 */
function _todEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
/* 🚗 v1.111.0（2026-08-17 ゆうた確定）**空っぽなら「代車：ハスラー」を出す。**
   ・書いてあればそれを出す ／ 全部消せばまた代車名に戻る（誤って消しても救われる）
   ・🔴 見た目は打ち込んだメモとまったく同じ（薄くしない・点線も付けない）＝ゆうた指定
   ・🔴 文字を作る所は `js/pit-share.js` の `pitTodayNoteText` 1本。**ここで組み立てない**
     （MHS の Todayボードが同じものを借りる。写しを作るとまた片方だけ古くなる）
   ⚠ 出しているだけで保存はしていない。保存されるのは人が触って確定した時だけ。 */
function _todNoteText(c){
  return window.pitTodayNoteText ? pitTodayNoteText(c) : (c.todayNote || '');
}
function _todNoteSpan(c){
  var v = _todNoteText(c);
  return '<span class="tr-note' + (v ? '' : ' empty') + '" data-id="' + c.id + '" onclick="event.stopPropagation();pitTodayNoteEdit(this)" title="クリックで当日メモ（例：間に合わないかも）">'
       + (v ? _todEsc(v) : '&nbsp;') + '</span>';
}
/* クリックで直入力→Enter/フォーカスアウトで確定（Escで取消）。当日ビュー内だけの簡単メモ v0.123.0 */
window.pitTodayNoteEdit = function(el){
  var id = el.getAttribute('data-id');
  var c = (state.cards || []).find(function(x){ return x.id === id; });
  if (!c) return;
  var inp = document.createElement('input');
  /* 🔴 v1.111.0 初期値は**画面に出ている文字**（＝空なら代車名が入った状態で始まる）。
     ここを c.todayNote に戻すと「代車：ハスラー と見えているのに、押すと空」になり、
     ゆうたの言う「一部だけ消して ハスラー・遅れるかも にする」ができなくなる。 */
  inp.type = 'text'; inp.className = 'tr-note-input'; inp.value = _todNoteText(c);
  inp.setAttribute('placeholder', '当日の引継ぎ（例：間に合わないかも）');
  inp.setAttribute('maxlength', '60');
  inp.addEventListener('click', function(e){ e.stopPropagation(); });
  inp.addEventListener('keydown', function(e){ e.stopPropagation(); if (e.key === 'Enter'){ inp.blur(); } else if (e.key === 'Escape'){ inp._cancel = true; inp.blur(); } });
  inp.addEventListener('blur', function(){
    /* 🔴 v1.112.2 保存する前に物差しへ通す。**自動で出していた文字そのままなら空にする**
       ＝ 押して何も打たずに閉じただけで「代車：ハスラー」が焼き付くのを止める。
       ⚠ ここを inp.value.trim() に戻すと、また同じ事故が起きる（2026-08-17 実害あり）。 */
    if (!inp._cancel){
      c.todayNote = window.pitTodayNoteToSave ? pitTodayNoteToSave(inp.value) : inp.value.trim();
      if (window.PitDB) PitDB.save();
    }
    var tmp = document.createElement('div'); tmp.innerHTML = _todNoteSpan(c);
    inp.replaceWith(tmp.firstChild);
  });
  el.replaceWith(inp);
  inp.focus(); inp.select();
};

function renderToday(){
  const wrap = document.getElementById('view-today-body');
  if (!wrap) return;

  const base = new Date(); base.setHours(0,0,0,0);
  const day = addDays(base, window._todayOffset || 0);
  const dayStr = ymd(day);
  const dow = '日月火水木金土'[day.getDay()];
  const isToday = (window._todayOffset || 0) === 0;

  /* 🔴 v1.99.0 「売上なしでアーカイブ」した車は返車済みの台数に数えない（物差し＝sales-count.js の pitCardNoSale）。
     ＝当日ビューの「返車 ◯／◯台」が、売上0で片付けた車のぶんだけ増えてしまうのを防ぐ。 */
  const _noSale = c => !!(window.pitCardNoSale && pitCardNoSale(c));
  // 入庫リスト＝まだ来ていない予約（status=reserved）。入庫済みにするとタスクへ移りここから消える
  const intake = state.cards
    .filter(c => c.reserveDate === dayStr && c.status === 'reserved')
    .sort((a,b) => _todMin(a.reserveTime) - _todMin(b.reserveTime));
  /* 返車リスト＝今日返車予定でまだ返していない。返車済みにすると実績へ移りここから消える
     🔴 v1.65.0 「どの日に出すか」は return-slot.js の pitReturnListDate 1本。ここで条件を書き写さない。
     🔴 並び順も1本。返車時間が無い車（待ち・当日返しで完TEL前）は**終日＝最後尾**（入庫時刻で代用しない）。 */
  const _rmin = c => (window.pitReturnSortMin ? pitReturnSortMin(c) : _todMin(c.returnTime));
  const returns = state.cards
    .filter(c => (window.pitReturnListDate ? pitReturnListDate(c) === dayStr
                                           : (c.returnDate === dayStr && c.status !== 'returned' && c.status !== 'scrap')))
    .sort((a,b) => _rmin(a) - _rmin(b));

  // 入庫：今日の予約総数（返車済み含む）を固定表示。残＝まだ来ていない（status=reserved）
  const intakeTotal = state.cards.filter(c => c.reserveDate === dayStr && c.status !== 'scrap' && !_noSale(c)).length;
  const inLeft  = state.cards.filter(c => c.reserveDate === dayStr && c.status === 'reserved').length;
  const inMoved = intakeTotal - inLeft;   // すでに入った台数（1台でも動けば残を表示）
  // 返車：今日の返車総数を固定。残＝まだ返してない
  const _retDone = c => !_noSale(c) && c.status === 'returned' && (c.completedAt === dayStr || c.returnDate === dayStr);
  const returnDone  = state.cards.filter(_retDone).length;
  const returnTotal = returns.length + returnDone;
  const outLeft = returnTotal - returnDone;
  const outMoved = returnDone;

  /* その日の営業（休み／午前休み・午後休み・早締め／特別営業）。届いていなければ空。 */
  const calNote = (window.PitCal && PitCal.label) ? PitCal.label(dayStr) : '';
  const calTone = (window.PitCal && PitCal.tone)  ? PitCal.tone(dayStr)  : '';
  const calHrs  = (window.PitCal && PitCal.hoursText) ? PitCal.hoursText(dayStr) : '';

  let html = '';

  // ===== ヘッダー（日付＋入庫返車カウント＋残） =====
  html += '<div class="today-head">';
  html += '<div class="today-date">';
  html += '<span class="big">' + (day.getMonth()+1) + '月 ' + day.getDate() + '日</span>';
  html += '<span class="dow">(' + dow + ')</span>';
  html += (isToday ? '<span class="today-badge">今日</span>' : '<span class="today-badge next">翌日</span>');
  /* 🔴 v1.90.0（ゆうた指摘 2026-08-13）**当日ビューは営業日カレンダーを一切見ていなかった。**
     休みの日も、午前休み・早締めの日も、この画面には何ひとつ出ていなかった。
     🔴 判定も色も PitCal 1本（休み=赤／短縮=オレンジ／特別営業=緑）。ここで曜日を数えない。 */
  if (calNote) html += '<span class="cal-note ' + calTone + '" style="margin-left:4px">'
                     + '<i data-ic=' + (calTone === 'closed' ? 'ban' : 'clock') + ' data-ics=14></i> ' + _todEsc(calNote) + '</span>';
  html += '</div>';

  html += '<div class="today-counts">';
  html += '<div class="count-chip in"><span class="num">' + intakeTotal + '</span><span class="lbl">入庫</span>'
        + (inMoved > 0 ? '<span class="rem">残' + inLeft + '</span>' : '') + '</div>';
  html += '<div class="count-chip out"><span class="num">' + returnTotal + '</span><span class="lbl">返車</span>'
        + (outMoved > 0 ? '<span class="rem">残' + outLeft + '</span>' : '') + '</div>';
  html += '<button class="tnav-btn full-btn' + (window._todayFull ? ' on' : '') + '" onclick="todayToggleFull()" title="入庫と返車の時間を左右で揃えて表示">'
        + (window._todayFull ? '<i data-ic=grid data-ics=15></i> コンパクト' : '<i data-ic=list data-ics=15></i> フルビュー') + '</button>';
  html += '</div>';

  // 当日/翌日トグル（旧 金庫/SNS/掃除 の位置）
  html += '<div class="today-nav">';
  html += '<button class="tnav-btn" onclick="todayShift(-1)" ' + (isToday ? 'disabled' : '') + '><i data-ic=chevLeft data-ics=16></i> 前日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(0)">今日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(1)">翌日 <i data-ic=chevRight data-ics=16></i></button>';
  html += '</div>';
  html += '</div>';

  // ===== 2カラム（時間軸・休憩バー） =====
  const intakeRows = _todBuildRows(intake, false);
  const returnRows = _todBuildRows(returns, true);
  // フルビュー＝左右で行数を揃える／コンパクト＝詰める（既定）
  const merged = window._todayFull
    ? _todMergeAlign(intakeRows, returnRows)
    : { left: _todPlain(intakeRows, false), right: _todPlain(returnRows, true) };

  /* 🔴 v1.90.0 営業日の帯。**入庫と返車で分けず、2列ぶちぬきで横1本**（ゆうた指定）
     ＝その日の店の話であって、入庫か返車かは関係ないため。 */
  if (calTone === 'closed'){
    html += '<div class="today-calbar closed"><i data-ic=ban data-ics=15></i> 本日は休業日です'
          + '<span class="sm">' + _todEsc(calNote) + '</span></div>';
  } else if (calTone === 'short'){
    html += '<div class="today-calbar short"><i data-ic=clock data-ics=15></i> ' + _todEsc(calNote)
          + (calHrs ? '<span class="sm">受付 ' + calHrs + '</span>' : '') + '</div>';
  } else if (calTone === 'open'){
    html += '<div class="today-calbar open"><i data-ic=check data-ics=15></i> ' + _todEsc(calNote)
          + (calHrs ? '<span class="sm">受付 ' + calHrs + '</span>' : '') + '</div>';
  }

  html += '<div class="today-cols' + (window._todayFull ? ' full' : '')
        + (calTone === 'closed' ? ' is-closed' : '') + '">';
  html += '<div class="today-col">';
  html += '<div class="today-col-head intake"><span class="ic"><i data-ic=download data-ics=16></i></span>入庫 <span class="cnt">' + intake.length + '</span></div>';
  html += '<div class="today-col-body">' + (_todHasAny(merged.left) ? merged.left : '<div class="today-empty">入庫予定なし</div>') + '</div>';
  html += '</div>';
  html += '<div class="today-col">';
  html += '<div class="today-col-head return"><span class="ic"><i data-ic=upload data-ics=16></i></span>返車 <span class="cnt">' + returns.length + '</span></div>';
  html += '<div class="today-col-body">' + (_todHasAny(merged.right) ? merged.right : '<div class="today-empty">返車予定なし</div>') + '</div>';
  html += '</div>';
  html += '</div>';

  /* 🔴 v1.131.0（ゆうた指定 2026-08-18）**当日ビューに車検の枠は出さない。**
     🗣 ゆうた「ごめん　**ピットの当日は車検はないか**」
     一度 v1.130.0 で入れたが、**取り消した**。当日ビューは入庫・返車を見るところで、
     車検は **車検予定の画面**（と工場の MHS）で見る。ここに足さないこと。
     ⚠ 物差し（`pitShakenOnDate` の kind / plate4）は**残してある**。MHS が借りているため。 */

  wrap.innerHTML = html;
}

window.todayToggleFull = function(){ window._todayFull = !window._todayFull; renderToday(); };

/* コンパクト（既定）：詰めて積む。休憩バーは被ったカードを枠内に入れる（パディングなし） */
function _todPlain(blocks, isReturn){
  let h = '';
  blocks.forEach(b => {
    if (b.type === 'break'){
      if (b.cards.length) h += _todBreakHtml(b, b.cards.length, isReturn);
      else h += _todBreakHtml(b, 0, isReturn);   // 空でもバーは出す（時間の目印）
    } else {
      b.cards.forEach(c => { h += todayRow(c, isReturn); });
    }
  });
  return h;
}

window.todayShift = function(n){
  if (n === 0) window._todayOffset = 0;
  else window._todayOffset = Math.max(0, (window._todayOffset || 0) + n);
  renderToday();
};

/* ===== カードタップ → アクションシート（入庫済み/返車済み・詳細を見る）v0.30.0 ===== */
window.pitTodayTap = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  let back = document.getElementById('today-action');
  if (!back){
    back = document.createElement('div');
    back.id = 'today-action';
    back.className = 'modal-backdrop';
    pitModalOutside(back, function(){ pitTodayActionClose(); });
    document.body.appendChild(back);
  }
  const wt = state.workTypes.find(w => w.id === c.workType);
  const team = (c.boardId === 'import') ? '<i data-ic=globe data-ics=16></i> 輸入車' : '<i data-ic=car data-ics=16></i> 国産車';
  const doneLabel = isReturn ? '<i data-ic=upload data-ics=16></i> 返車済みにする' : '<i data-ic=download data-ics=16></i> 入庫済みにする';
  const doneSub   = isReturn ? 'この日の実績（確定売上）に固めます' : 'タスクへ移動・予約から外れます';
  const doneFn    = isReturn ? 'pitTodayReturn' : 'pitTodayCheckIn';
  const cancelLabel = isReturn ? '<i data-ic=ban data-ics=16></i> 返車キャンセル' : '<i data-ic=ban data-ics=16></i> キャンセル（来店なし）';
  const cancelSub   = isReturn ? '返車予定を外して「返車・未定」へ戻す' : '「未入庫」へ（1ヶ月後に自動アーカイブ）';
  /* 🔴 v1.97.0（ゆうた指定）**完TELを通っていない車は「返車済みにする」を押せない。**
     ◎なぜ
       待ち・当日返しの車は、盤面を通らなくても返車の一覧に出る（今までどおり・これはOK）。
       だがそのまま返車済みにできてしまうと、**確定売上も担当者も入らないまま実績に固まる**。
     ◎押せるようになる時
       盤面で 完TEL済／完TEL依頼 へ入れた時（＝returnStage が付いた時）。
       ⚠ 判断はこの1つだけ。預かりの車はもともと完TELを通ってしか一覧に出ないので、今までどおり押せる。 */
  /* 🔴 v1.103.0 判断も文言も pit-share.js の1本から（MHS の Todayボードも同じものを借りる）。 */
  const canDone = !isReturn || (window.pitReturnCanDone ? pitReturnCanDone(c) : !!c.returnStage);
  const doneWhy = '<span class="ta-why">' + (window.PIT_RETURN_WHY || '') + '</span>';
  back.innerHTML =
    '<div class="ta-sheet">' +
      '<div class="ta-head"><b>' + ((window.pitCustName?pitCustName(c):c.customer) || '（未入力）') + ' 様</b>　' +
        (c.maker ? c.maker + ' ' : '') + (c.car || '') + (c.plate ? '<span class="ta-plate">' + c.plate + '</span>' : '') +
        '<div class="ta-sub">' + team + (wt ? '・' + wt.label : '') + (isReturn ? '・返車' : '・入庫') + '</div>' +
      '</div>' +
      '<button class="ta-btn primary' + (canDone ? '' : ' is-off') + '"' +
        (canDone ? ' onclick="' + doneFn + '(\'' + id + '\')"' : ' disabled') +
        '><b>' + doneLabel + '</b><span>' + doneSub + '</span>' + (canDone ? '' : doneWhy) + '</button>' +
      '<button class="ta-btn" onclick="pitTodayEditDt(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b><i data-ic=clock data-ics=16></i> 日時変更</b><span>' + (isReturn ? '返車' : '入庫') + 'の日付・時間だけ変更</span></button>' +
      '<button class="ta-btn" onclick="pitTodayDetail(\'' + id + '\')"><b><i data-ic=clipboard data-ics=16></i> 詳細を見る</b><span>カードを開いて確認・編集</span></button>' +
      '<button class="ta-btn danger" onclick="pitTodayCancel(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b>' + cancelLabel + '</b><span>' + cancelSub + '</span></button>' +
      '<button class="ta-cancel" onclick="pitTodayActionClose()">閉じる</button>' +
    '</div>';
  back.classList.add('show');
};

/* 🕒 日時変更：入庫/返車の日付・時間だけをシート内でサッと変更（詳細カードにも反映） */
window.pitTodayEditDt = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const back = document.getElementById('today-action');
  if (!back) return;
  const dVal = isReturn ? (c.returnDate || '') : (c.reserveDate || '');
  const tVal = isReturn ? (c.returnTime || '') : (c.reserveTime || '');
  back.innerHTML =
    '<div class="ta-sheet">' +
      '<div class="ta-head"><b><i data-ic=clock data-ics=16></i> ' + (isReturn ? '返車' : '入庫') + 'の日時変更</b>' +
        '<div class="ta-sub">' + ((window.pitCustName?pitCustName(c):c.customer) || '') + ' 様　' + (c.car || '') + '</div></div>' +
      '<label class="ta-f">日付<input type="date" id="ta-dt-d" value="' + dVal + '"></label>' +
      '<label class="ta-f">時間<input type="text" id="ta-dt-t" value="' + tVal + '" placeholder="例 09:30 / 09:00-10:00"></label>' +
      '<button class="ta-btn primary" onclick="pitTodaySaveDt(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b><i data-ic=save data-ics=16></i> 保存</b></button>' +
      '<button class="ta-cancel" onclick="pitTodayTap(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')">← 戻る</button>' +
    '</div>';
};
window.pitTodaySaveDt = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const d = (document.getElementById('ta-dt-d') || {}).value || '';
  const t = (document.getElementById('ta-dt-t') || {}).value || '';
  if (isReturn){
    /* 🔴 v1.65.0 返車の日時は return-slot.js の唯一の入口（pitReturnSetDateTime）を通す。
       ここで直に書いていたので、行き先の再判定も画面の描き直しもお知らせも出ていなかった
       （v1.60.0「入れたのに移動しない」と同じ形が、ここだけ残っていた）。
       ⚠ ここで入れるのは **C＝確定返車日**。待ち・当日返しの「やっぱり明日取りに行くわ」もここで動く。 */
    if (window.pitReturnSetDateTime){
      var res = pitReturnSetDateTime(c, d, t);
      pitTodayActionClose();
      if (window.pitReturnCommit) pitReturnCommit(c, res, { silent: true });
      renderToday();
      if (window.pitToast) pitToast('返車の日時を変更しました' + (res && res.moved && window.pitReturnPlaceLabel && res.after ? '（' + pitReturnPlaceLabel(res.after) + 'へ）' : ''));
      return;
    }
    c.returnDate = d; c.returnTime = t;
  }
  else { c.reserveDate = d; c.reserveTime = t; if (d) c.intakeTbd = false; }
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast('日時を変更しました');
};

/* 🚫 キャンセル：入庫＝未入庫へ（1ヶ月でアーカイブ）／返車＝返車未定へ差し戻し */
window.pitTodayCancel = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ（pitAsk）。
     ⚠ 聞き方は入庫／返車で2通りあるが、**続きは _go 1本**（写しを作らない）。 */
  const ask = isReturn
    ? pitAsk('返車予定をキャンセルして「返車・未定」へ戻しますか？', { danger:true, ok:'戻す' })
    : pitAsk('この入庫予約をキャンセルしますか？', { danger:true, ok:'キャンセルする',
              detail:'「未入庫」リストに残り、1ヶ月後に自動でアーカイブされます。' });
  ask.then(function(yes){ if (yes) _go(); });

  function _go(){
  if (isReturn){
    /* 🔴 v1.65.0 `returnTbd` は v1.60.0 で廃止した旧フラグ。日付を空にすれば「返車日未定」に戻る。
       書き込みは唯一の入口（pitReturnSetDateTime）を通す。 */
    if (window.pitReturnSetDateTime) pitReturnSetDateTime(c, '', '');
    else { c.returnDate = ''; c.returnTime = ''; }
    if (window.logFlow) logFlow(c, '返車予定キャンセル（未定へ）');
  } else {
    c.status = 'cancelled';
    c.cancelledAt = ymd(new Date());
    if (window.logFlow) logFlow(c, 'キャンセル（来店なし）');
  }
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast(isReturn ? '返車・未定へ戻しました': '未入庫へ移しました');
  }
};
window.pitTodayActionClose = function(){
  const back = document.getElementById('today-action');
  if (back) back.classList.remove('show');
};
window.pitTodayDetail = function(id){
  pitTodayActionClose();
  openDetail(id);
};
/* 入庫済み：予約 → タスクの最初の工程（点検待ち＝check）へ。予約系から消える */
window.pitTodayCheckIn = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  /* 🔵 v1.74.0（ゆうた指定）承認待ちのままなら**1回だけ聞いて通す**。止めない。
     🔴 聞き方は approval-pit.js の1本（ここに文言を書き写さない）。 */
  if (window.pitAskApprovalBeforeIntake && c.approvalPending){
    pitAskApprovalBeforeIntake(c, function(){ _pitTodayCheckInGo(c); });
    return;
  }
  _pitTodayCheckInGo(c);
};
function _pitTodayCheckInGo(c){
  c.status = 'check';
  if (!c.actualInAt) c.actualInAt = ymd(new Date());   // 実入庫日
  if (window.logFlow && typeof statusLabel === 'function') logFlow(c, '入庫（点検待ちへ）');
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitLog) pitLog('入庫済みにした', { cardId: c.id, kind: 'in', label: ((window.pitCustName?pitCustName(c):c.customer)? (window.pitCustName?pitCustName(c):c.customer)+' 様':'') + (c.car? ' / '+c.car:'') });
  if (window.pitToast) pitToast('入庫済み → タスク「点検待ち」へ移動しました');
}
/* 返車済み：実績へ。completedAtを今日に・売上を確定値で固める */
window.pitTodayReturn = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  /* 🔴 v1.97.0 完TELを通っていない車は、ここでも固めない（ボタンを消しただけにしない）。
     ⚠ 判断はアクションシートと同じ1つ＝returnStage が付いているか。 */
  if (window.pitReturnCanDone ? !pitReturnCanDone(c) : !c.returnStage){
    if (window.pitToast) pitToast(window.PIT_RETURN_WHY || '', 'PF-4010');
    return;
  }
  const t = ymd(new Date());
  c.status = 'returned';
  c.returnDate = c.returnDate || t;
  c.completedAt = t;                 // 実績カレンダーはこの日付で表示
  /* 🔴 v1.64.0 拾う順番を完TELのポップアップ（return-popup.js）と揃えた＝**確定→受注→見積→概算**。
     ここだけ概算しか見ていなかったので、クイック受注で人が打った受注金額が捨てられていた。
     ⚠ 「いくらの車か」を2か所が別々に決めない。 */
  /* 🔴 v1.103.0 拾う順番（確定→受注→見積→概算）は pit-share.js の1本。ここに書き写さない。 */
  if (c.amountFinal == null || c.amountFinal === ''){
    c.amountFinal = window.pitFinalAmountOf ? pitFinalAmountOf(c) : 0;   // 売上を固める
  }
  if (window.logFlow && typeof statusLabel === 'function') logFlow(c, '返車完了（実績へ）');
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitLog) pitLog('返車済みにした（実績へ）', { cardId: c.id, kind: 'out', label: ((window.pitCustName?pitCustName(c):c.customer)? (window.pitCustName?pitCustName(c):c.customer)+' 様':'') + (c.car? ' / '+c.car:'') + (c.amountFinal? ' / ¥'+Number(c.amountFinal).toLocaleString():'') });
  if (window.pitToast) pitToast('返車済み → 実績（確定売上）に固めました');
};

/* カードと休憩を時間順にブロック分け：[{break?, cards:[...]}] の配列を返す */
function _todBuildRows(cards, isReturn){
  /* 🔴 v1.70.0 **一覧を並べたのと同じ物差しで区切る。**
     ⚠ v1.69.0 までは、ここだけ「返車時間が無ければ入庫時刻」で代用していたので、
        並び自体は最後尾なのに**休憩ブロックだけ入庫時刻の位置**に紛れていた。 */
  const tOf = c => isReturn ? (window.pitReturnSortMin ? pitReturnSortMin(c) : _todMin(c.returnTime))
                            : _todMin(c.reserveTime);
  const blocks = [];
  let ci = 0;
  // 休憩の前→休憩→…→最後、の順にカードを割り振る
  const cut = TODAY_BREAKS.map(b => _todMin(b.from));
  for (let bi = 0; bi <= TODAY_BREAKS.length; bi++){
    /* ⚠ 最後の区切りは Infinity。99999 にすると「時刻なし（_todMin が 99999 を返す）」のカードが
       どの区切りにも入らず、当日ビューから丸ごと消える（v1.18.0 で修正） */
    const limit = (bi < TODAY_BREAKS.length) ? cut[bi] : Infinity;
    const seg = [];
    while (ci < cards.length && tOf(cards[ci]) < limit){ seg.push(cards[ci]); ci++; }
    blocks.push({ type: 'seg', cards: seg });
    if (bi < TODAY_BREAKS.length){
      // この休憩枠に被るカード（休憩開始〜終了の間に時刻があるもの）は枠内へ
      const b = TODAY_BREAKS[bi];
      const inBreak = [];
      const bf = _todMin(b.from), bt = _todMin(b.to);
      while (ci < cards.length && tOf(cards[ci]) >= bf && tOf(cards[ci]) < bt){ inBreak.push(cards[ci]); ci++; }
      blocks.push({ type: 'break', label: b.label, from: b.from, to: b.to, cards: inBreak });
    }
  }
  return blocks;
}

/* 左右のブロックを揃える＝休憩バーが必ず同じ高さで並ぶように、
   各セグメント／休憩ブロックを左右で同じ行数にパディングしてHTML化（少ない側を空き行で埋める） */
function _todMergeAlign(left, right){
  let L = '', R = '';
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++){
    const lb = left[i], rb = right[i];
    const lc = (lb && lb.cards) ? lb.cards.length : 0;
    const rc = (rb && rb.cards) ? rb.cards.length : 0;
    if ((lb && lb.type === 'break') || (rb && rb.type === 'break')){
      const rows = Math.max(lc, rc, 1);
      L += _todBreakHtml(lb, rows, false);
      R += _todBreakHtml(rb || lb, rows, true);
    } else {
      const rows = Math.max(lc, rc);   // セグメントも左右で揃える＝午前のスカスカが見える
      L += _todSegHtml(lb, rows, false);
      R += _todSegHtml(rb, rows, true);
    }
  }
  return { left: L, right: R };
}
function _todHasAny(html){ return /today-row/.test(html); }

function _todSegHtml(block, rows, isReturn){
  const cards = (block && block.cards) ? block.cards : [];
  let h = '';
  cards.forEach(c => { h += todayRow(c, isReturn); });
  for (let k = cards.length; k < rows; k++) h += '<div class="tod-seg-pad"></div>';   // 空き行＝相手側に合わせた余白
  return h;
}

/* 休憩バー：黄色斜線の枠。休憩中に来る客はこの枠の中に入れる。
   フルビューで相手側に合わせて行数(rows)が増える時は枠が縦に広がる（斜線の空き行で埋める） */
function _todBreakHtml(block, rows, isReturn){
  const cards = (block && block.cards) ? block.cards : [];
  let h = '<div class="tod-break">';
  h += '<div class="tod-break-bar"><i data-ic=cup data-ics=15></i> ' + block.from + '〜' + block.to + ' 休憩</div>';
  cards.forEach(c => { h += todayRow(c, isReturn, true); });
  for (let k = cards.length; k < rows; k++) h += '<div class="tod-break-pad"></div>';
  h += '</div>';
  return h;
}

/* カード1行 */
function todayRow(c, isReturn, inBreak){
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  const teamColor = _todTeamColor(c);
  const time = isReturn ? (c.returnTime || c.reserveTime || '') : (c.reserveTime || '');
  /* フロント担当（縦書きバッジ・1課=緑/2課=ピンク／課が空ならグレー）
     🔴 v1.104.0 名前は **pitStaffShort** を通す＝自社（小林モータース）は「コバモ」。
        幅 22px の縦書きにフルの会社名は入らない（ゆうた指定 2026-08-16）。 */
  const frontName = (window.pitStaffShort ? pitStaffShort(c.frontStaff || '')
                                          : (window.pitSurname ? pitSurname((c.frontStaff || '').trim()) : (c.frontStaff || '').trim()));
  /* 🔴 v1.98.0（ゆうた指定）**人が入っていない時は、代わりに課を出す。空欄にしない。**
     ◎なぜ
       時間の横のバッジが真っ白だと「誰の車か手がかりが何も無い」ので、
       せめて **どっちの課の車か** は分かるようにする。
     ⚠ 課は **c.division（予約画面のボタン）だけ**で決まる。国産／輸入からは逆算しない（v1.92.0の決めごと）。
     ⚠ 名前も色も **state.divisions の1本**から引く（既定＝1課は緑・2課はピンク）。ここに直に書かない。
     ⚠ 課のボタンも空なら、今までどおり空欄のまま（無いものを作らない）。 */
  const divLabel = frontName ? '' : (window.pitDivisionLabel ? pitDivisionLabel(c) : '');
  /* 🔴 v1.104.0（ゆうた指定）**バッジの色は課から引く。課が選ばれていなければグレー。**
     ⚠ 直す前は人のバッジだけ**車（国産／輸入）から色を作っていた**ので、
        課を何も押していなくても必ず緑かピンクが付き「入っている」ように見えていた。
     ⚠ 物差しは pit-share.js の pitDivisionColorOr 1本。ここに色を直に書かない。 */
  const badgeColor = window.pitDivisionColorOr ? pitDivisionColorOr(c)
                                               : ((window.pitDivisionColor ? pitDivisionColor(c) : '') || '#8390a6');

  /* 🔴 v1.104.0（ゆうた指定）**時間帯（09:00-10:00）は3段に折る。**
     時間の列は 62px しかなく、1行だと右がはみ出て隠れていた。折る判断は pitTimeLines 1本。 */
  const tLines = window.pitTimeLines ? pitTimeLines(time) : (time ? [time] : []);
  const timeHtml = (tLines.length > 1)
    ? '<div class="tr-time is-range">' + tLines.map((x,i) => '<span class="tt-l' + (i===1 ? ' tt-sep' : '') + '">' + _todEsc(x) + '</span>').join('') + '</div>'
    : '<div class="tr-time">' + _todEsc(tLines[0] || '') + '</div>';

  let h = '';
  h += '<div class="today-row' + (c.urgent ? ' is-urgent' : '') + (inBreak ? ' in-break' : '') + '" onclick="pitTodayTap(\'' + c.id + '\',' + (isReturn ? 'true' : 'false') + ')" style="--team:' + teamColor + '">';
  h += timeHtml;
  // 担当フロント縦書きバッジ（人が無ければ課）
  if (frontName){
    h += '<div class="tr-front" style="background:' + _todEsc(badgeColor) + '">' + frontName + '</div>';
  } else if (divLabel){
    h += '<div class="tr-front is-div" style="background:' + _todEsc(badgeColor) + '" title="担当者はまだ決まっていません（' + _todEsc(divLabel) + '）">' + _todEsc(divLabel) + '</div>';
  } else {
    h += '<div class="tr-front empty"></div>';
  }
  h += '<div class="tr-main">';
  h += '<div class="tr-headline"><span class="tr-customer">' + ((window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）') + ' 様</span>'
     + (c.car ? '<span class="tr-carname">' + c.car + '</span>' : '') + '</div>';
  // ナンバー＋当日メモ（クイック引継ぎ）を1行で。メモはクリックで直入力＝当日ビュー内だけの簡単メモ v0.123.0
  /* 🏷 v1.113.0 ナンバーの場所＝初回なら「初回顧客」／リピーターでナンバーが無ければ「初回車両」。
     🔴 判断は pit-share.js の pitTodayPlate 1本。ここで書かない（MHS も同じものを借りる）。 */
  const _pl = window.pitTodayPlate ? pitTodayPlate(c) : { text: (c.plate || ''), kind: (c.plate ? 'plate' : '') };
  h += '<div class="tr-plateline">'
     + (_pl.text ? '<span class="tr-plate' + (_pl.kind && _pl.kind !== 'plate' ? ' is-' + _pl.kind : '') + '">' + _todEsc(_pl.text) + '</span>' : '')
     + _todNoteSpan(c) + '</div>';
  h += '</div>';

  // 右側タグ：固定3スロット（添え物｜受付タイプ｜作業タイプ）で全幅揃え
  let side = '';
  if (c.consult)              side += '<span class="tag-side consult">相談</span>';
  if (c.needLoaner)           side += '<span class="tag-side loaner">代車</span>';
  if (isReturn && c.needWash) side += '<span class="tag-side wash'+(c.washSalesDone?' done':'')+'">洗車</span>';   // 入庫に洗車は出さない・済＝他ビューと同じ赤スタンプ v0.123.3
  const dropTag = dt ? (window.pitDropBadges ? pitDropBadges(c, function(o){ return '<span class="tag-drop tag-drop-' + o.id + '" title="' + o.desc + '">' + o.label + '</span>'; }) : '<span class="tag-drop tag-drop-' + dt.id + '" title="' + dt.desc + '">' + dt.label + '</span>') : '';
  // 作業バッジ＝基本＋併用を並べて表示（設定の色のまま）。当日ビューは枠固定なので最大2個・2個時は余白を詰めて1個ぶん幅に横並び。
  const _wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
  let workTag = '';
  _wts.slice(0, 2).forEach(id => {
    const w = state.workTypes.find(x => x.id === id);
    if (w) workTag += '<span class="tag-work' + (w.label.length >= 4 ? ' long' : '') + '" style="background:' + w.color + '20;color:' + w.color + ';border-color:' + w.color + ';">' + w.label + '</span>';
  });
  const workMulti = (workTag.match(/tag-work/g) || []).length >= 2;
  h += '<div class="tr-tags">'
     + '<div class="tr-tag-slot">' + side + '</div>'
     + '<div class="tr-tag-slot">' + dropTag + '</div>'
     + '<div class="tr-tag-slot tr-tag-work' + (workMulti ? ' multi' : '') + '">' + workTag + '</div>'
     + '</div>';

  h += '</div>';
  return h;
}
