/* ========================================
   return.js
   返車ビュー（当日／週／月／2ヶ月）
   ----------------------------------------
   🔴 v1.65.0（ゆうた確定）**「どの日に出すか」は return-slot.js の `pitReturnListDate()` 1本で決める。**
      ここに「returnDate が…かつ returnStage が…」と条件を書き写さないこと。
      ・完TELを通った車 … 確定返車日（C）の日
      ・待・当の車       … **入庫日**。ただし**その日にならないと出さない**（入庫前は出さない）
      ・作業完了で確定返車日だけ入っている（完TEL前）… **「未完」としてグレーで出す**（v1.149.0）
        ⚠ 見えるだけ＝**つかめない・返車済みにできない**。返すには今までどおり完TELのドラッグを通る
      ・それ以外の預かりで完TEL前 … 出さない（盤面で入れた日付は「約束」＝B なので使わない）
   🔴 並び順も1本（`pitReturnSortMin`）。**返車時間は確定返車日にしか付かない**ので、
      時間がまだ無い車は「終日」として**いちばん後ろ**に置く（入庫時刻で代用しない）。
   ======================================== */

function renderReturn(){
  renderReturnNav();
  const range = state.returnRange;
  if (range !== 'tbd'){ const _t = document.getElementById('return-tbd'); if (_t) _t.style.display = 'none'; }
  if (range === 'day')    return renderReturnDay();
  if (range === 'week')   return renderReturnWeek();
  if (range === 'month')  return renderReturnMonth();
  if (range === '2month') return renderReturn2Month();
  if (range === 'tbd')    return renderReturnTbd();
  renderReturnDay();
}

function renderReturnNav(){
  const label = document.getElementById('return-label');
  if (!label) return;
  const d = state.returnDate;
  const range = state.returnRange;
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

function renderReturnDay(){
  const list = document.getElementById('return-day-list');
  if (!list) return;
  list.style.display = '';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';

  const dateStr = ymd(state.returnDate);
  const dow = state.returnDate.getDay();
  /* 🚫 v1.50.0 営業日は MHS の定休日カレンダーが基準（PitCal）。 */
  const isClosed = PitCal.isClosed(dateStr);
  const dayNote  = PitCal.label(dateStr);

  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  const todays = state.cards.filter(c => pitReturnListDate(c) === dateStr);

  let html = '';
  html += PitCal.noticeHtml();
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;color:var(--text2);">';
  /* 🔴 v1.90.0 休み＝赤／短縮＝オレンジ／特別営業＝緑（PitCal.tone・予約カレンダーと同じ） */
  const dayTone = (window.PitCal && PitCal.tone) ? PitCal.tone(dateStr) : (isClosed ? 'closed' : '');
  if (dayNote) html += '<span class="cal-note ' + dayTone + '"><i data-ic=' + (isClosed ? 'ban' : 'clock') + ' data-ics=14></i> ' + dayNote + '</span>　';
  const holDay = (window.Holidays && Holidays.name(dateStr)) || null;
  if (holDay) html += '<span class="hol-badge"><i data-ic=flag data-ics=16></i> ' + holDay + '</span>　';
  html += '本日の返車予定 ' + todays.length + ' 件';
  html += '</div></div>';

  if (todays.length === 0){
    html += '<div style="text-align:center;color:var(--text3);padding:30px;">本日の返車予定はありません</div>';
  } else {
    /* 🔴 v1.65.0 返車時間だけで枠に入れる。**入庫時刻で代用しない**。
       🔴 v1.70.0 枠は「いちばん遅くなり得る時刻」で決まる＝**朝一は9時／AM は12時**の枠。
          並びは **時間の枠 → 終日 → 時刻未定**（ゆうた確定）。 */
    const _hourOf = c => (window.pitReturnAllDay && pitReturnAllDay(c)) ? null : pitTimeHour(c.returnTime || '', 9, 18);
    const _allDay = c => (window.pitReturnAllDay ? pitReturnAllDay(c) : !c.returnTime);
    /* 🔴 v1.70.0 枠の中も時間順（並べ替えていなかったので登録順で出ていた） */
    const _min = c => (window.pitReturnSortMin ? pitReturnSortMin(c) : pitTimeMin(c.returnTime || ''));
    const _bySort = (a, b) => _min(a) - _min(b);
    slots.forEach(time => {
      const hh = time.slice(0,2);
      const inSlot = todays.filter(c => _hourOf(c) === hh).sort(_bySort);
      html += '<div class="reserve-slot' + (isClosed ? ' closed' : '') + '">';
      html += '<div class="reserve-slot-time">' + time + '〜</div>';
      html += '<div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="' + time + '">';
      if (inSlot.length === 0){
        html += '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>';
      } else {
        html += inSlot.map(c => cardHtml(c, { compact: true, retView: true })).join('');
      }
      html += '</div></div>';
    });
    /* 🔴 v1.70.0 終日＝待ち・当日返しで、まだ返車時間が決まっていない車（ゆうた指定）。
       **PM の後ろ・時刻未定の前**。確定返車日＋時間が入った段階で上の枠へ並び替わる。
       ⚠ v1.69.0 までは時刻未定より下だった。 */
    const allDay = todays.filter(c => _allDay(c)).sort(_bySort);
    if (allDay.length > 0){
      html += '<div class="reserve-slot rs-allday"><div class="reserve-slot-time">終日<small>待ち・当日返し</small></div><div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="">';
      html += allDay.map(c => cardHtml(c, { compact: true, retView: true })).join('');
      html += '</div></div>';
    }
    /* 時刻未定＝完TEL済で日は決まったが時間がまだ（ここへドロップで時刻を未定に戻せる）。
       🔴 v1.70.0 **いちばん最後**（ゆうた確定「時間未定系は一番最後」）。 */
    const noTime = todays.filter(c => _hourOf(c) === null && !_allDay(c)).sort(_bySort);   /* v1.34.0 */
    if (noTime.length > 0){
      html += '<div class="reserve-slot"><div class="reserve-slot-time">時刻未定</div><div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="">';
      html += noTime.map(c => cardHtml(c, { compact: true, retView: true })).join('');
      html += '</div></div>';
    }
  }

  list.innerHTML = html;
}

function renderReturnWeek(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';
  const wrap = document.getElementById('return-week');
  wrap.style.display = '';

  const start = startOfWeek(state.returnDate);
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
    const cnt = state.cards.filter(c =>
      pitReturnListDate(c) === dStr
    ).length;
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    if (hol) html += '<span class="hol" title="' + hol + '">' + hol + '</span>';
    /* ⚠ 週ビューは**札だけ・マスは塗らない**（ゆうた指定） */
    if (calNote) html += '<span class="cal-chip ' + ((PitCal.tone ? PitCal.tone(dStr) : (isClosed ? 'closed' : ''))) + '" title="' + calNote + '">' + calNote + '</span>';
    if (cnt > 0) html += '<span style="font-size:10px;color:var(--green);font-weight:600;">' + cnt + '台</span>';
    html += '</div>';
  });

  for (let h = 9; h <= 18; h++){
    const hh = String(h).padStart(2,'0');
    html += '<div class="reserve-week-cell reserve-week-time">' + hh + ':00</div>';
    days.forEach(d => {
      const dStr = ymd(d);
      const isClosed = PitCal.isClosed(dStr);
      const inCell = state.cards.filter(c =>
        pitReturnListDate(c) === dStr &&
        !(window.pitReturnAllDay && pitReturnAllDay(c)) &&
        pitTimeHour(c.returnTime || '', 9, 18) === hh   /* v1.65.0 返車時間だけで見る */
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="returnDateTime" data-drop-val="' + dStr + '|' + hh + ':00">';
      inCell.forEach(c => { html += (window.weekMiniCard ? weekMiniCard(c, hh, true) : ''); });
      html += '</div>';
    });
  }
  /* 🔴 v1.34.0 時刻未定の行（返車側も同じ）。枠に入らないカードを消さない。 */
  {
    const tbd = days.map(d => state.cards.filter(c =>
      pitReturnListDate(c) === ymd(d) &&
      pitTimeHour(c.returnTime || '', 9, 18) === null));
    if (tbd.some(a => a.length)){
      html += '<div class="reserve-week-cell reserve-week-time rwk-tbd-h">時刻未定</div>';
      days.forEach((d, i) => {
        const isClosed = PitCal.isClosed(ymd(d));
        html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="returnDateTime" data-drop-val="' + ymd(d) + '|">';
        tbd[i].forEach(c => { html += (window.weekMiniCard ? weekMiniCard(c, null, true) : ''); });
        html += '</div>';
      });
    }
  }

  wrap.innerHTML = html;
}

/* 月ビュー（v0.45.0）＝入庫(予約)ビューと同じ日付リスト型（左に日付・右にその日の返車を時刻順・下へ無限スクロール）。
   reserve.js の renderReserveMonth のミラー。フィルタは returnDate。 */
function renderReturnMonth(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';
  const wrap = document.getElementById('return-month');
  wrap.classList.add('rml-host');
  wrap.style.display = '';

  const base = new Date(state.returnDate.getFullYear(), state.returnDate.getMonth(), 1);
  window._rmlStartR = base;
  window._rmlNR = 42;   // 初期6週間ぶん
  wrap.innerHTML = '<div class="rml-scroll" id="rml-scroll-r"><div id="rml-list-r">' + _rmlRowsReturn(0, window._rmlNR) + '</div></div>';

  const sc = document.getElementById('rml-scroll-r');
  if (sc){
    sc.addEventListener('scroll', function(){
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 320){
        const from = window._rmlNR;
        window._rmlNR += 21;
        const list = document.getElementById('rml-list-r');
        if (list) list.insertAdjacentHTML('beforeend', _rmlRowsReturn(from, window._rmlNR));
      }
    });
    const t = sc.querySelector('.rml-date.today');
    if (t) sc.scrollTop = Math.max(0, t.closest('.rml-row').offsetTop - 8);
  }
}

function _rmlRowsReturn(from, to){
  const todayStr = ymd(new Date());
  let html = '';
  for (let i = from; i < to; i++){
    const d = addDays(window._rmlStartR, i);
    const ds = ymd(d);
    if (d.getDate() === 1 || i === 0){
      html += '<div class="rml-mhead">' + d.getFullYear() + '年 ' + (d.getMonth()+1) + '月</div>';
    }
    const dow = d.getDay();
    const isClosed = PitCal.isClosed(ds);
    const calNote = PitCal.label(ds);
    const hol = (window.Holidays && Holidays.name(ds)) || null;
    const cardsOfDay = state.cards
      .filter(c => pitReturnListDate(c) === ds)
      /* 🔴 v1.70.0 並びは return-slot.js の物差し1本。
         ⚠ v1.69.0 まで、ここだけ**返車時間が無いと入庫時刻で代用**していた。
            当日ビュー・日ビューは「代用しない＝終日」なので、同じ車が画面によって違う位置に出ていた。 */
      .sort((a, b) => (window.pitReturnSortMin ? pitReturnSortMin(a) : pitTimeMin(a.returnTime || ''))
                    - (window.pitReturnSortMin ? pitReturnSortMin(b) : pitTimeMin(b.returnTime || '')));

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
    html += '<div class="rml-cards" data-drop="returnDate" data-drop-val="' + ds + '">';
    if (!cardsOfDay.length){
      html += '<span class="rml-empty">' + (isClosed ? '休' : '—') + '</span>';
    } else {
      cardsOfDay.forEach(c => {
        const tt = (c.returnTime || c.reserveTime || '--:--');
        const _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
        const wt = state.workTypes.find(w => w.id === _wid);
        const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
        const nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
        /* 🆕 v1.149.0 未完＝盤面のまま確定返車日だけ入っている車。判定は return-slot.js の1本 */
        const _pd = !!(window.pitReturnIsPending && pitReturnIsPending(c));
        let side = '';
        if (_pd && window.pitPendingBadge) side += pitPendingBadge('mini');
        if (c.needLoaner) side += '<span class="rme-loaner">代</span>';
        if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
        html += '<div class="rml-ev return' + (c.urgent ? ' urgent' : '') + (_pd ? ' is-retpend' : '') + '" draggable="' + (_pd ? 'false' : 'true') + '" data-card-id="' + c.id + '"'
             + ' style="border-left-color:' + teamColor + '"'
             + ' onclick="openDetail(\'' + c.id + '\')">'
             + '<b>' + tt + '</b> ' + nm + ' 様' + (c.car ? ' ' + c.car : '')
             + (side ? '<span class="rml-side">' + side + '</span>' : '')
             + '</div>';
      });
    }
    html += '</div></div>';
  }
  return html;
}

function renderReturn2Month(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  const wrap = document.getElementById('return-2month');
  wrap.style.display = '';

  const m1 = new Date(state.returnDate);
  const m2 = new Date(state.returnDate); m2.setMonth(m2.getMonth()+1);

  let html = '';
  html += '<div>';
  html += '<div class="month-block-title">' + m1.getFullYear() + '年 ' + (m1.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCellsReturn(m1) + '</div>';
  html += '</div>';
  html += '<div>';
  html += '<div class="month-block-title">' + m2.getFullYear() + '年 ' + (m2.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCellsReturn(m2) + '</div>';
  html += '</div>';
  wrap.innerHTML = html;
}

function monthGridCellsReturn(refDate){
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

    const cardsOfDay = state.cards.filter(c => pitReturnListDate(c) === dateStr);

    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;

    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    // セルの「予約チップ以外」をクリック＝その日の返車を全件ポップアップ
    /* 🔴 v1.90.0 月ビューは短縮の日もうっすら色を敷く */
    const calTone = (PitCal.tone ? PitCal.tone(dateStr) : (isClosed ? 'closed' : ''));
    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (calTone === 'short' ? ' calshort' : '') + (hol ? ' holiday' : '') + dowClass + '" data-drop="returnDate" data-drop-val="' + dateStr + '"'
         + ' onclick="if(!event.target.closest(\'.reserve-month-event\'))pitReserveDayPopup(\'' + dateStr + '\',\'return\')">';
    html += '<div class="day-num">' + dd + '</div>';
    if (hol) html += '<div class="hol-name" title="' + hol + '">' + hol + '</div>';
    if (calNote) html += '<div class="cal-chip ' + calTone + '" title="' + calNote + '">' + calNote + '</div>';
    visible.forEach(c => {
      const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';   // 国産緑/輸入ピンク
      const nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
      const _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
      const wt = state.workTypes.find(w => w.id === _wid);
      /* 🆕 v1.149.0 未完＝盤面のまま確定返車日だけ入っている車。判定は return-slot.js の1本 */
      const _pd = !!(window.pitReturnIsPending && pitReturnIsPending(c));
      let side = '';
      if (_pd && window.pitPendingBadge) side += pitPendingBadge('mini');
      if (c.needLoaner) side += '<span class="rme-loaner">代</span>';   // 並び＝代→作業
      if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
      html += '<div class="reserve-month-event return' + (c.urgent ? ' urgent' : '') + (_pd ? ' is-retpend' : '') + '" draggable="' + (_pd ? 'false' : 'true') + '" data-card-id="' + c.id + '"';
      if (!c.urgent) html += ' style="border-left-color:' + teamColor + '"';
      html += ' onclick="event.stopPropagation();openDetail(\'' + c.id + '\')">';
      html += '<span class="rme-txt">' + nm + ' 様' + (c.car ? ' ' + c.car : '') + '</span>';
      if (side) html += '<span class="rme-side">' + side + '</span>';
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

function returnPrev(){
  const range = state.returnRange;
  const d = new Date(state.returnDate);
  if (range === 'day')    d.setDate(d.getDate() - 1);
  if (range === 'week')   d.setDate(d.getDate() - 7);
  if (range === 'month')  d.setMonth(d.getMonth() - 1);
  if (range === '2month') d.setMonth(d.getMonth() - 1);
  state.returnDate = d;
  renderReturn();
}
function returnNext(){
  const range = state.returnRange;
  const d = new Date(state.returnDate);
  if (range === 'day')    d.setDate(d.getDate() + 1);
  if (range === 'week')   d.setDate(d.getDate() + 7);
  if (range === 'month')  d.setMonth(d.getMonth() + 1);
  if (range === '2month') d.setMonth(d.getMonth() + 1);
  state.returnDate = d;
  renderReturn();
}
function returnToday(){
  state.returnDate = new Date();
  renderReturn();
}

/* v0.45.0：返車カードを入庫(予約)ビューと同じリッチカードに統一。
   返車時刻を表示し、左アクセントは緑（返車アイデンティティを維持）。 */
function returnCardHtml(c){
  return (typeof cardHtml === 'function') ? cardHtml(c, { returnView: true }) : '';
}
