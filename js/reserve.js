/* ========================================
   reserve.js
   予約ビュー（当日／週／月／2ヶ月）
   ======================================== */

function renderReserve(){
  renderReserveNav();
  const range = state.reserveRange;
  if (range !== 'tbd'){ const _t = document.getElementById('reserve-tbd'); if (_t) _t.style.display = 'none'; }
  if (range === 'day')    return renderReserveDay();
  if (range === 'week')   return renderReserveWeek();
  if (range === 'month')  return renderReserveMonth();
  if (range === '2month') return renderReserve2Month();
  if (range === 'tbd')    return renderReserveTbd();
  renderReserveDay();
}

function renderReserveNav(){
  const label = document.getElementById('reserve-label');
  if (!label) return;
  const d = state.reserveDate;
  const range = state.reserveRange;
  if (range === 'day'){
    const dow = '日月火水木金土'[d.getDay()];
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月 ' + d.getDate() + '日 (' + dow + ')';
  } else if (range === 'week'){
    const start = startOfWeek(d);
    const end = addDays(start, 6);
    label.textContent = (start.getMonth()+1) + '/' + start.getDate() + ' 〜 ' + (end.getMonth()+1) + '/' + end.getDate();
  } else if (range === 'month'){
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月';
  } else if (range === '2month'){
    const next = new Date(d); next.setMonth(next.getMonth()+1);
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月 〜 ' + (next.getMonth()+1) + '月';
  }
}

function renderReserveDay(){
  const list = document.getElementById('reserve-day-list');
  if (!list) return;
  list.style.display = '';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const _rt = document.getElementById('reserve-tbd'); if (_rt) _rt.style.display = 'none';

  const dateStr = ymd(state.reserveDate);
  const dow = state.reserveDate.getDay();
  /* 🚫 v1.50.0 営業日は MHS の定休日カレンダーが基準（PitCal）。曜日だけの判定はもうしない。 */
  const isClosed = PitCal.isClosed(dateStr);
  const dayNote  = PitCal.label(dateStr);   /* '定休' / 'お盆休み' / '午前休み' / '〜15:00締' */

  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  const todays = state.cards.filter(c =>
    c.reserveDate === dateStr && c.status === 'reserved'   // 入庫済み以降は予約から外れる
  );

  let html = '';
  html += PitCal.noticeHtml();
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;color:var(--text2);">';
  /* 🔴 v1.90.0 休み＝赤／短縮＝オレンジ／特別営業＝緑（PitCal.tone） */
  const dayTone = (window.PitCal && PitCal.tone) ? PitCal.tone(dateStr) : (isClosed ? 'closed' : '');
  if (dayNote) html += '<span class="cal-note ' + dayTone + '"><i data-ic=' + (isClosed ? 'ban' : 'clock') + ' data-ics=14></i> ' + dayNote + '</span>　';
  const holDay = (window.Holidays && Holidays.name(dateStr)) || null;
  if (holDay) html += '<span class="hol-badge"><i data-ic=flag data-ics=16></i> ' + holDay + '</span>　';
  html += '受付 ' + PitCal.openTime(dateStr) + ' 〜 ' + PitCal.cutoffTime(dateStr) + '　／　予約 ' + todays.length + ' 件';
  html += '</div></div>';

  /* 🔴 v1.34.0 枠分けは共通の物差し（pitTimeHour）へ。
     8:00・19:00 のような枠の外の時刻も端の枠に寄る。
     時刻不明（決まり次第・レッカー・鍵ポスト・未定・空）は下の「時刻未定」の枠へまとめる。
     🔴 v1.70.0 枠は「いちばん遅くなり得る時刻」で決まる＝**朝一は9時／AM は12時**の枠。 */
  const _hourOf = c => pitTimeHour(c.reserveTime, 9, 18);
  /* 🔴 v1.70.0（ゆうた確定）**枠の中も時間順に並べる。**
     ⚠ v1.69.0 まで並べ替えていなかったので、9時の枠に 09:45 → 09:05 の順で出ることがあった
        （週・月・当日ビューは時間順なので、同じ日の同じ車が画面によって違う順に見えていた）。 */
  const _bySort = (a, b) => pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime);
  slots.forEach(time => {
    const hh = time.slice(0,2);
    const inSlot = todays.filter(c => _hourOf(c) === hh).sort(_bySort);
    /* 🚫 その日の受付時間（午前休み・午後休み・早締めもここに出る） */
    const cutoffH = PitCal.cutoffHour(dateStr);
    const openH   = parseInt(String(PitCal.openTime(dateStr)).slice(0,2), 10) || 0;
    const slotH = parseInt(hh, 10);
    const isCutoff = slotH >= cutoffH || slotH < openH;
    html += '<div class="reserve-slot' + (isClosed ? ' closed' : '') + '">';
    html += '<div class="reserve-slot-time">' + time;
    if (isCutoff) html += ' <span style="color:var(--red);font-size:10px;">受付終了</span>';
    html += '</div>';
    html += '<div class="reserve-slot-cards" data-drop="reserveTime" data-drop-val="' + time + '">';
    if (inSlot.length === 0){
      html += '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>';
    } else {
      html += inSlot.map(c => cardHtml(c, { compact: true })).join('');
    }
    html += '</div></div>';
  });
  /* 時刻未定のカード＝いちばん下にまとめて出す（ここへドロップで時刻を空に戻せる）。
     🔴 v1.34.0 まで、この枠が無かったので**画面から消えていた**。 */
  const _noTime = todays.filter(c => _hourOf(c) === null).sort(_bySort);
  if (_noTime.length > 0){
    html += '<div class="reserve-slot"><div class="reserve-slot-time">時刻未定</div>';
    html += '<div class="reserve-slot-cards" data-drop="reserveTime" data-drop-val="">';
    html += _noTime.map(c => cardHtml(c, { compact: true })).join('');
    html += '</div></div>';
  }

  list.innerHTML = html;
}

/* 週ビュー用ミニカード（C案）＝当日タブのタスクカードを週グリッド向けに縮めた版。
   左ライン＝国産緑/輸入ピンク／1段目=客名様＋代車・作業バッジ（設定色）／2段目=車種＋担当。時刻はスロット行で分かるので出さない。 */
/* v1.34.0 slotHH（その行の「時」）を渡すと、**その行とぴったり同じ時刻でない場合だけ**時刻を出す。
   ＝「朝一」「09:30」「08:00（9時の行に寄せた分）」が、どれか分かるようにするため。 */
function weekMiniCard(c, slotHH, isRet){
  const at = (window.escAttr ? escAttr : function(s){ return String(s==null?'':s); });
  const _tv = String((isRet ? (c.returnTime || c.reserveTime) : c.reserveTime) || '').trim();
  const _showT = _tv && !(slotHH && _tv === slotHH + ':00');
  const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
  const wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
  let badges = '';
  if (c.tentative) badges += '<span class="kari-mini" title="仮予約">仮</span>';
  /* 🔵 v1.74.0 承認待ちの「承」。印のHTMLは approval-pit.js 1本（ここで組み立てない） */
  if (window.pitApprovalBadge) badges += pitApprovalBadge(c, 'mini');
  if (c.needLoaner) badges += '<span class="rwk-lo" title="代車">代</span>';
  wts.slice(0, 3).forEach(function(id){
    const w = state.workTypes.find(x => x.id === id);
    if (w) badges += '<span class="rwk-wb" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '66;">' + at(w.label) + '</span>';
  });
  const staff = c.frontStaff || c.staff || '';
  const _nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
  /* 🔴 v1.104.0 自社（小林モータース）は狭い枠だと入らないので「コバモ」（pit-share.js の1本） */
  const _stf = (window.pitStaffShort ? pitStaffShort(staff) : (window.pitSurname ? pitSurname(staff) : staff));
  let h = '<div class="rwk-card' + (c.codeRed ? ' rwk-claim' : '') + '" draggable="true" data-card-id="' + c.id + '" onclick="openDetail(\'' + c.id + '\')" style="border-left-color:' + teamColor + ';">';
  h += '<div class="rwk-r">' + (_showT ? '<span class="rwk-t">' + at(_tv) + '</span>' : '')
     + '<span class="rwk-name">' + _nm + ' 様</span><span class="rwk-badges">' + badges + '</span></div>';
  h += '<div class="rwk-r"><span class="rwk-car">' + (c.car || '') + '</span>' + (_stf ? '<span class="rwk-front">' + at(_stf) + '</span>' : '') + '</div>';
  h += '</div>';
  return h;
}
window.weekMiniCard = weekMiniCard;

function renderReserveWeek(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const wrap = document.getElementById('reserve-week');
  wrap.style.display = '';

  const start = startOfWeek(state.reserveDate);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  const todayStr = ymd(new Date());

  let html = '<div class="reserve-week-head"></div>';
  days.forEach(d => {
    const dStr = ymd(d);
    const dow = '日月火水木金土'[d.getDay()];
    const isToday = dStr === todayStr;
    const isClosed = PitCal.isClosed(dStr);
    const calNote = PitCal.label(dStr);
    const calTone = (PitCal.tone ? PitCal.tone(dStr) : (isClosed ? 'closed' : ''));
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    if (hol) html += '<span class="hol" title="' + hol + '">' + hol + '</span>';
    /* 🔴 v1.90.0 色は PitCal.tone 1本（休み=赤／短縮=オレンジ／特別営業=緑）。
       ⚠ 週ビューは**札だけ・マスは塗らない**（ゆうた指定）。 */
    if (calNote) html += '<span class="cal-chip ' + calTone + '" title="' + calNote + '">' + calNote + '</span>';
    html += '</div>';
  });

  for (let h = 9; h <= 18; h++){
    const hh = String(h).padStart(2,'0');
    html += '<div class="reserve-week-cell reserve-week-time">' + hh + ':00</div>';
    days.forEach(d => {
      const dStr = ymd(d);
      const isClosed = PitCal.isClosed(dStr);
      const inCell = state.cards.filter(c =>
        c.reserveDate === dStr &&
        pitTimeHour(c.reserveTime, 9, 18) === hh &&     /* v1.34.0 ショートカットもここで解決 */
        c.status === 'reserved'
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="reserveDateTime" data-drop-val="' + dStr + '|' + hh + ':00">';
      inCell.forEach(c => { html += weekMiniCard(c, hh); });
      html += '</div>';
    });
  }
  /* 🔴 v1.34.0 時刻未定の行（決まり次第・レッカー・鍵ポスト・未定）。
     いちばん下に1行足す＝時間の枠に入らないカードが**消えない**ようにする。 */
  {
    const tbd = days.map(d => state.cards.filter(c =>
      c.reserveDate === ymd(d) && c.status === 'reserved' && pitTimeHour(c.reserveTime, 9, 18) === null));
    if (tbd.some(a => a.length)){
      html += '<div class="reserve-week-cell reserve-week-time rwk-tbd-h">時刻未定</div>';
      days.forEach((d, i) => {
        const isClosed = PitCal.isClosed(ymd(d));
        html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="reserveDateTime" data-drop-val="' + ymd(d) + '|">';
        tbd[i].forEach(c => { html += weekMiniCard(c, null); });
        html += '</div>';
      });
    }
  }

  wrap.innerHTML = html;
}

/* 月ビュー（v0.26.0 ゆうた指示で刷新）＝左に日付・右にその日の予約を時間順で左詰め・下へ無限スクロール。
   月をまたぐと月見出しを挟んで永遠に続く。行へのドラッグ＝入庫日変更（×日は警告）。 */
function renderReserveMonth(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const wrap = document.getElementById('reserve-month');
  wrap.classList.add('rml-host');   // グリッド用CSSを無効化してリスト表示に
  wrap.style.display = '';

  const base = new Date(state.reserveDate.getFullYear(), state.reserveDate.getMonth(), 1);
  window._rmlStart = base;
  window._rmlN = 42;   // 初期6週間ぶん
  wrap.innerHTML = '<div class="rml-scroll" id="rml-scroll"><div id="rml-list">' + _rmlRows(0, window._rmlN) + '</div></div>';

  const sc = document.getElementById('rml-scroll');
  if (sc){
    sc.addEventListener('scroll', function(){
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 320){
        const from = window._rmlN;
        window._rmlN += 21;
        const list = document.getElementById('rml-list');
        if (list) list.insertAdjacentHTML('beforeend', _rmlRows(from, window._rmlN));
      }
    });
    // 今月を開いた時は今日の行まで自動スクロール
    const t = sc.querySelector('.rml-date.today');
    if (t) sc.scrollTop = Math.max(0, t.closest('.rml-row').offsetTop - 8);
  }
}

function _rmlRows(from, to){
  const todayStr = ymd(new Date());
  let html = '';
  for (let i = from; i < to; i++){
    const d = addDays(window._rmlStart, i);
    const ds = ymd(d);
    if (d.getDate() === 1 || i === 0){
      html += '<div class="rml-mhead">' + d.getFullYear() + '年 ' + (d.getMonth()+1) + '月</div>';
    }
    const dow = d.getDay();
    const isClosed = PitCal.isClosed(ds);
    const calNote = PitCal.label(ds);
    const hol = (window.Holidays && Holidays.name(ds)) || null;
    const cardsOfDay = state.cards
      .filter(c => c.reserveDate === ds && c.status === 'reserved')
      /* v1.33.0 ショートカット（AM・朝一・決まり次第…）も正しく並ぶよう共通の物差しで */
      .sort((a, b) => pitTimeMin(a.reserveTime) - pitTimeMin(b.reserveTime));

    let dCls = '';
    if (ds === todayStr) dCls += ' today';
    if (dow === 0 || hol) dCls += ' red';
    else if (dow === 6) dCls += ' sat';

    /* 🔴 v1.90.0 月ビュー（縦の一覧）も休み＝赤／短縮＝オレンジ。
       ⚠ 短縮の札は cal-soft（灰色固定）で出していたので、赤い「定休」の隣で読み飛ばされていた。 */
    const calTone = (PitCal.tone ? PitCal.tone(ds) : (isClosed ? 'closed' : ''));
    html += '<div class="rml-row' + (isClosed ? ' closed' : '') + (calTone === 'short' ? ' calshort' : '') + '">';
    html += '<div class="rml-date' + dCls + '">' + (d.getMonth()+1) + '/' + d.getDate() + '<span>' + '日月火水木金土'[dow] + (ds === todayStr ? '・今日' : '') + '</span>'
         + (hol ? '<span class="rml-hol"><i data-ic=flag data-ics=16></i>' + hol + '</span>' : '')
         + (calNote ? '<span class="rml-hol rml-cal ' + calTone + '">' + calNote + '</span>' : '') + '</div>';
    html += '<div class="rml-cards" data-drop="reserveDate" data-drop-val="' + ds + '">';
    if (!cardsOfDay.length){
      html += '<span class="rml-empty">' + (isClosed ? '休' : '—') + '</span>';
    } else {
      cardsOfDay.forEach(c => {
        const _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
        const wt = state.workTypes.find(w => w.id === _wid);
        const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';   // 左ライン＝国産緑/輸入ピンク
        const nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
        let side = '';
        if (c.needLoaner) side += '<span class="rme-loaner">代</span>';   // 2ヶ月と同じ並び＝代→作業
        if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
        html += '<div class="rml-ev' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"'
             + ' style="border-left-color:' + teamColor + '"'
             + ' onclick="openDetail(\'' + c.id + '\')">'
             + '<b>' + (c.reserveTime || '--:--') + '</b> ' + nm + ' 様' + (c.car ? ' ' + c.car : '')
             + (side ? '<span class="rml-side">' + side + '</span>' : '')
             + (c.tentative ? '<span class="kari-edge" title="仮予約">仮</span>' : '')   // 仮は右端に小さく（v0.100.1）
             + (window.pitApprovalBadge ? pitApprovalBadge(c, 'edge') : '')                // 🔵 v1.74.0 承認待ちの「承」
             + '</div>';
      });
    }
    html += '</div></div>';
  }
  return html;
}

function renderReserve2Month(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  const wrap = document.getElementById('reserve-2month');
  wrap.style.display = '';

  const m1 = new Date(state.reserveDate);
  const m2 = new Date(state.reserveDate); m2.setMonth(m2.getMonth()+1);

  let html = '';
  html += '<div>';
  html += '<div class="month-block-title">' + m1.getFullYear() + '年 ' + (m1.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCells(m1) + '</div>';
  html += '</div>';
  html += '<div>';
  html += '<div class="month-block-title">' + m2.getFullYear() + '年 ' + (m2.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCells(m2) + '</div>';
  html += '</div>';
  wrap.innerHTML = html;
}

function monthGridCells(refDate){
  const y = refDate.getFullYear();
  const mo = refDate.getMonth();
  const first = new Date(y, mo, 1);
  const last = new Date(y, mo+1, 0);
  const startDow = first.getDay();
  const totalDays = last.getDate();
  const todayStr = ymd(new Date());

  let html = '';
  ['日','月','火','水','木','金','土'].forEach(d => {
    html += '<div class="reserve-month-cell dow">' + d + '</div>';
  });

  for (let i = 0; i < startDow; i++){
    const d = new Date(y, mo, i - startDow + 1);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }

  for (let dd = 1; dd <= totalDays; dd++){
    const dateObj = new Date(y, mo, dd);
    const dateStr = ymd(dateObj);
    const dow = dateObj.getDay();
    const isToday = dateStr === todayStr;
    const isClosed = PitCal.isClosed(dateStr);
    const calNote = PitCal.label(dateStr);
    let dowClass = '';
    if (dow === 0) dowClass = ' sun';
    if (dow === 6) dowClass = ' sat';

    const cardsOfDay = state.cards.filter(c =>
      c.reserveDate === dateStr && c.status === 'reserved'
    );

    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;

    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    /* 🔴 v1.90.0 月ビューは短縮の日もうっすら色を敷く（週ビューは札だけ・ゆうた指定） */
    const calTone = (PitCal.tone ? PitCal.tone(dateStr) : (isClosed ? 'closed' : ''));
    // セルの「予約チップ以外」をクリック＝その日の全件表示（当日タブへドリル）
    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (calTone === 'short' ? ' calshort' : '') + (hol ? ' holiday' : '') + dowClass + '" data-drop="reserveDate" data-drop-val="' + dateStr + '"'
         + ' onclick="if(!event.target.closest(\'.reserve-month-event\'))pitReserveDayPopup(\'' + dateStr + '\',\'reserve\')">';
    html += '<div class="day-num">' + dd + '</div>';
    if (hol) html += '<div class="hol-name" title="' + hol + '">' + hol + '</div>';
    if (calNote) html += '<div class="cal-chip ' + calTone + '" title="' + calNote + '">' + calNote + '</div>';
    visible.forEach(c => {
      const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';   // 国産緑/輸入ピンク
      const nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
      const _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
      const wt = state.workTypes.find(w => w.id === _wid);
      let side = '';
      if (c.needLoaner) side += '<span class="rme-loaner">代</span>';   // 並び＝代→作業
      if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
      html += '<div class="reserve-month-event' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"';
      if (!c.urgent) html += ' style="border-left-color:' + teamColor + '"';
      html += ' onclick="event.stopPropagation();openDetail(\'' + c.id + '\')">';
      html += '<span class="rme-txt">' + nm + ' 様' + (c.car ? ' ' + c.car : '') + '</span>';   // 時間なし・苗字＋様・…省略
      if (side) html += '<span class="rme-side">' + side + '</span>';   // 右側＝代車＋作業(色付き)
      if (c.tentative) html += '<span class="kari-edge" title="仮予約">仮</span>';   // 仮は右端に小さく（v0.100.1）
      if (window.pitApprovalBadge) html += pitApprovalBadge(c, 'edge');                // 🔵 v1.74.0 承認待ちの「承」
      html += '</div>';
    });
    if (remaining > 0){
      html += '<div class="reserve-month-more">+' + remaining + ' 件</div>';
    }
    html += '</div>';
  }

  const cellsUsed = startDow + totalDays;
  const trailing = (7 - (cellsUsed % 7)) % 7;
  for (let i = 1; i <= trailing; i++){
    const d = new Date(y, mo+1, i);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }

  return html;
}

/* 月／2ヶ月ビューで日付セルをクリック＝その日の予約/返車を全件ポップアップ表示。
   mode='reserve'（入庫予定）/'return'（返車予定）。カードはタスクボードと同じコンパクトカード。 */
window.pitReserveDayPopup = function(dateStr, mode){
  mode = (mode === 'return') ? 'return' : 'reserve';
  /* v1.33.0 物差しは state.js に一本化（ショートカットの時間もここで解決される） */
  const _min = function(t){ return window.pitTimeMin ? pitTimeMin(t) : 99999; };
  const cards = state.cards.filter(function(c){
    /* 🔴 v1.65.0 セル本体と同じ物差し（pitReturnListDate）で拾う。
          ここが違うと「セルは1件なのに開くと3件」になる（実際にそうなっていた）。 */
    if (mode === 'return') return window.pitReturnListDate ? (pitReturnListDate(c) === dateStr)
                                                           : (c.returnDate === dateStr && c.status !== 'returned' && c.status !== 'scrap');
    return c.reserveDate === dateStr && c.status === 'reserved';
  }).sort(function(a, b){
    return _min(mode === 'return' ? (a.returnTime || a.reserveTime) : a.reserveTime) - _min(mode === 'return' ? (b.returnTime || b.reserveTime) : b.reserveTime);
  });

  let back = document.getElementById('pit-day-pop');
  if (!back){
    back = document.createElement('div');
    back.id = 'pit-day-pop';
    back.className = 'modal-backdrop';
    pitModalOutside(back, function(){ pitReserveDayPopClose(); });
    document.body.appendChild(back);
  }
  const d = new Date(dateStr + 'T00:00:00');
  const dow = '日月火水木金土'[d.getDay()];
  const head = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + dow + '）　' + (mode === 'return' ? '返車予定' : '入庫予定') + '　' + cards.length + '件';
  const body = cards.length
    ? cards.map(function(c){ return cardHtml(c, { compact: true }); }).join('')
    : '<div class="pdp-empty">予定はありません</div>';
  back.innerHTML = '<div class="pdp-box"><div class="pdp-head"><span>' + head + '</span><button class="pdp-x" onclick="pitReserveDayPopClose()"><i data-ic=close data-ics=16></i></button></div>'
    + '<div class="pdp-list" onclick="pitReserveDayPopClose()">' + body + '</div></div>';
  back.classList.add('show');
};
window.pitReserveDayPopClose = function(){ const b = document.getElementById('pit-day-pop'); if (b) b.classList.remove('show'); };

function startOfWeek(d){
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function reservePrev(){
  const range = state.reserveRange;
  const d = new Date(state.reserveDate);
  if (range === 'day')    d.setDate(d.getDate() - 1);
  if (range === 'week')   d.setDate(d.getDate() - 7);
  if (range === 'month')  d.setMonth(d.getMonth() - 1);
  if (range === '2month') d.setMonth(d.getMonth() - 1);
  state.reserveDate = d;
  renderReserve();
}
function reserveNext(){
  const range = state.reserveRange;
  const d = new Date(state.reserveDate);
  if (range === 'day')    d.setDate(d.getDate() + 1);
  if (range === 'week')   d.setDate(d.getDate() + 7);
  if (range === 'month')  d.setMonth(d.getMonth() + 1);
  if (range === '2month') d.setMonth(d.getMonth() + 1);
  state.reserveDate = d;
  renderReserve();
}

function cardHtml(c, opts){
  opts = opts || {};
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  const accent = wt ? wt.color : 'var(--brand)';

  /* === コンパクト版（整備ビュー＝看板/作業で統一）：客名・車種・作業内容(最大2)・預かり・代車・フロントだけ。移動はドラッグのみ === */
  if (opts.compact){
    const DROP_COLOR = { wait: '#f59e0b', sameDay: '#3b82f6', drop: '#26a269' };
    /* 左ハイライト＝国産/輸入の色（国産グリーン / 輸入ピンク） */
    const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
    const wts = (Array.isArray(c.workTypes) && c.workTypes.length)
      ? c.workTypes : (c.workType ? [c.workType] : []);
    // 右上＝左から：代車（ある時）→ 当/待（ある時・預かりは出さない）→ 作業内容（一番右固定）
    const at = (window.escAttr ? escAttr : function(s){ return String(s==null?'':s); });
    let top = '';
    if (c.needLoaner){
      /* 🔴 v1.82.0 返ってきたかは loaner-free.js に聞く（ここで日付を引き算しない）。
         ⚠ 以前は日付だけで見ていたので、**返却済みでも黒（超過）の代車バッジ**が出ていた。 */
      var _R = window.pitLoanerRemainOf ? pitLoanerRemainOf(c) : null;
      var _lrem = _R ? _R.rem : (window.loanerRem ? loanerRem(c) : null);
      var _lk = _R ? _R.level : ((window.loanerLevel ? loanerLevel(_lrem) : {key:'amber'}).key);
      var _LC = { green:'#1db97a', amber:'#f59e0b', red:'#ef4444', none:'#9fa8c7', back:'#8390a6' };
      // ※古い title（代車期限・入庫区分・預かり日数）は撤去＝情報はホバー情報カード(card-hover.js)に集約
      if (_lk==='back'){
        top += '<span class="pcm-loaner" style="background:#8390a622;color:#8390a6;border-color:#8390a666;" title="代車は返却済み">代車</span>';
      } else if (_lk==='dead'){
        top += '<span class="pcm-loaner pcm-dead">代車</span>';
      } else {
        var _lc = _LC[_lk] || '#f59e0b';
        top += '<span class="pcm-loaner" style="background:'+_lc+'22;color:'+_lc+';border-color:'+_lc+'66;">代車</span>';
      }
    }
    if (dt && (c.dropType2 || dt.id === 'wait' || dt.id === 'sameDay')){
      top += (window.pitDropBadges ? pitDropBadges(c, function(o){ const dc = DROP_COLOR[o.id] || 'var(--text2)'; return '<span class="pcm-drop" style="background:' + dc + '22;color:' + dc + ';border-color:' + dc + '66;">' + o.label + '</span>'; })
                                   : '<span class="pcm-drop">' + dt.label + '</span>');
    }
    wts.slice(0, 2).forEach(function(id){
      const w = state.workTypes.find(x => x.id === id);
      if (w){ const _cd = ((id==='coat1y'||id==='coat3m') && c.coatingDone) ? ' pcm-done' : '';   // コーティング完了＝済
        top += '<span class="pcm-wt' + _cd + '" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '66;">' + w.label + '</span>'; }
    });
    const staff = c.frontStaff || c.staff || '';
    const placed = !!(opts.kanban && c.bayId && window.PitPip && PitPip.isOpen());   // PITボード(PiP)が開いている時だけグレーアウト（閉じてる時は普通表示）
    // PITカードと同じ2行構成：上=客名＋様／車種、右上=内容・代車、右下=担当。名前/車種はホバーでフル表示
    // 看板内はカード自体をドロップ先(reorder)にして同フェーズ内の並び替えに対応
    var _reorderAttr = opts.kanban ? (' data-drop="reorder" data-drop-val="' + c.id + '"') : '';
    const _clickC = opts.onClick ? opts.onClick : ("openDetail('" + c.id + "')");
    let h = '<div class="pit-card pcm' + (c.codeRed ? ' pcm-claim' : '') + (c.resNo ? ' pcm-tab' : '') + (placed ? ' pcm-placed' : '') + (c.tentative ? ' is-tentative' : '') + (window.pitApprovalCardCls ? pitApprovalCardCls(c) : '') + '" draggable="true" data-card-id="' + c.id + '"' + _reorderAttr + ' onclick="' + _clickC + '" style="border-left-color:' + teamColor + ';">';
    h += (c.resNo ? '<div class="pcm-ear" style="border-left-color:' + (c.codeRed ? '#ef4444' : teamColor) + (c.codeRed ? ';border-top-color:#ef4444' : '') + '">' + at(c.resNo) + '</div><i class="pcm-ear-slide"></i>' : '');
    /* 車両注意タブ（左/M/T/車高/土禁・左M/T合体・最大3・該当時のみ・耳の右の上辺）
       🔴 v1.121.0 言い方は **pit-share.js の `pitCarCautions` 1本**にした（車検予定と同じ言葉になる）。
       ⚠ ここに条件を書き戻さないこと。出るものは今までと1文字も変わっていない。 */
    var _ct = (window.pitCarCautions ? pitCarCautions(c) : []);
    if (_ct.length) h += '<div class="pcm-cau">' + _ct.map(function(x){ return '<span class="pcm-caut">' + x + '</span>'; }).join('') + '</div>';
    /* 名前・車種・担当の title は撤去（ホバー情報カード card-hover.js で全文表示するため二重ツールチップを防ぐ） */
    var _nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
    /* 🔴 v1.104.0 自社（小林モータース）は狭い枠だと入らないので「コバモ」（pit-share.js の1本） */
    var _stf = (window.pitStaffShort ? pitStaffShort(staff) : (window.pitSurname ? pitSurname(staff) : staff));
    // 仮予約は「様」のすぐ後ろに小さな「仮」をインライン表示。名前が長い時は名前だけ…省略し「…様 仮」は必ず残る（v0.100.1）
    var _kn = c.tentative ? '<span class="kari-name" title="仮予約">仮</span>' : '';
    /* 🔵 v1.74.0 承認待ちは「様」のすぐ後ろに「承」（仮と同じ置き場所・色ちがい） */
    _kn += (window.pitApprovalBadge ? pitApprovalBadge(c, 'name') : '');
    h += '<div class="pcm-r"><span class="pcm-nm2"><span class="pcm-name">' + _nm + '</span><span class="pcm-sama">様</span>' + _kn + '</span><span class="pcm-badges">' + top + '</span></div>';
    // 完TEL待ち以降（returnStage）で洗車対象なら、担当の左に洗車バッジ（洗車完了＝済スタンプ）
    var _washB = (c.returnStage && c.needWash) ? '<span class="pcm-wash' + (c.washSalesDone?' pcm-done':'') + '" title="洗車対象">洗車</span>' : '';
    h += '<div class="pcm-r"><span class="pcm-car">' + (c.car || '') + '</span>' + _washB + (_stf ? '<span class="pcm-front">' + _stf + '</span>' : '') + '</div>';
    // 外注フェーズ＝外注先名(＋メモ)＋そのフェーズに入ってからの日数ラベル
    if (c.status === 'outsource'){
      /* 🔴 v1.58.0 起点は**フローの記録**（pitPhaseStartMs）。写しを直接見ない。 */
      var _odMs = window.pitPhaseStartMs ? pitPhaseStartMs(c) : (c.phaseAt || null);
      /* 🔴 v1.59.0 数え方は pitDayNoMs に一本化（カレンダー基準） */
      var _odN = window.pitDayNoMs ? pitDayNoMs(_odMs) : ((_odMs != null) ? (Math.floor((Date.now() - _odMs) / 86400000) + 1) : null);
      var _odTxt = (_odN != null) ? (_odN + '日目') : '';
      var _oName = (c.outsourceTo || '外注先未定') + (c.outsourceNote ? ' ' + c.outsourceNote : '');
      h += '<div class="pcm-out"><i data-ic=external data-ics=16></i> <span class="pcm-outn">' + at(_oName) + '</span>' + (_odTxt ? '<span class="pcm-outd">' + _odTxt + '</span>' : '') + '</div>';
    }
    h += '</div>';
    return h;
  }

  /* === 返車ビュー（returnView）：入庫カードと同じ作りのまま、時刻＝返車時刻・左アクセント＝緑で統一 === */
  const isRet = !!opts.returnView;
  const accent2 = isRet ? 'var(--green)' : accent;
  const timeStr = isRet ? (c.returnTime || c.reserveTime || '') : (c.reserveTime || '');

  let html = '';
  const _clickJs = opts.onClick ? opts.onClick : ("openDetail('" + c.id + "')");
  html += '<div class="pit-card' + (isRet ? ' return' : '') + (c.urgent ? ' is-urgent' : '') + (c.tentative ? ' is-tentative' : '') + (window.pitApprovalCardCls ? pitApprovalCardCls(c) : '') + '" draggable="true" data-card-id="' + c.id + '" onclick="' + _clickJs + '" style="min-width:200px;border-left-color:' + accent2 + ';">';
  if (c.tentative) html += '<span class="kari-stamp">仮</span>';   // 仮予約スタンプ v0.100.0
  if (window.pitApprovalBadge) html += pitApprovalBadge(c, 'stamp');   // 🔵 v1.74.0 承認待ちスタンプ
  html += '<div class="pc-line1">';
  html += '<span class="pc-time">' + timeStr + '</span>';
  html += '<span class="pc-status" style="--sc:' + statusColor(c.status) + ';">' + statusLabel(c.status) + '</span>';
  if (c.urgent) html += '<span class="pc-urg">緊急</span>';
  html += '</div>';
  html += '<div class="pc-customer">' + ((window.pitCustName?pitCustName(c):c.customer) || '（未入力）') + ' 様</div>';
  html += '<div class="pc-car">' + (c.car || '') + (c.menu ? ' ／ ' + c.menu : '') + '</div>';
  html += '<div class="pc-tags">';
  if (wt) html += '<span class="tag-work" style="background:' + wt.color + '22;color:' + wt.color + ';border-color:' + wt.color + ';">' + wt.label + '</span>';
  if (dt) html += (window.pitDropBadges ? pitDropBadges(c, function(o){ return '<span class="pc-tag drop">' + o.label + '</span>'; }) : '<span class="pc-tag drop">' + dt.label + '</span>');
  if (c.needLoaner) html += '<span class="pc-tag soft loaner">代車</span>';
  if (c.needWash)   html += '<span class="pc-tag soft wash">洗車</span>';
  if (c.staff)      html += '<span class="pc-tag staff">' + c.staff + '</span>';
  html += '</div>';
  if (opts.kanban){
    html += '<div class="pc-kbtns" onclick="event.stopPropagation()">';
    html += '<button class="pc-kbtn" title="前の工程へ" onclick="advanceCard(\'' + c.id + '\',-1)"><i data-ic=chevLeft data-ics=16></i></button>';
    html += '<button class="pc-kbtn next" title="次の工程へ" onclick="advanceCard(\'' + c.id + '\',1)">次へ <i data-ic=chevRight data-ics=16></i></button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}
window.cardHtml = cardHtml;
