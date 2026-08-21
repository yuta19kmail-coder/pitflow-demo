/* ========================================
   result.js
   実績ビュー（予約2ヶ月ビュー流用＝固定枠・㈱略・名前＋車種＋作業・国産緑/輸入ピンク・+N・クリックで全件）
   v0.107.0：件数が増えても枠が伸びないよう、1日最大3件＋「+N件」表示。枠クリックでその日の全実績をポップアップ。
   実績＝作業完了日(completedAt)に「作業完了 or 返車済み」になったカード。
   ======================================== */

/* 🔴 v1.99.0 「売上なしでアーカイブ」した車は実績に出さない（物差しは sales-count.js の pitCardNoSale 1本）。
   ⚠ そもそも実績カウント日を入れない作りだが、**昔のデータや手直しで日付が入っていても出さない**
      ように、ここでも止める（二重の守り）。 */
function _resultDayCards(dateStr){
  return (state.cards || []).filter(function(c){
    if (window.pitCardNoSale && pitCardNoSale(c)) return false;
    return c && c.completedAt === dateStr && (c.status === 'workDone' || c.status === 'returned');
  });
}

function renderResult(){
  const cal = document.getElementById('result-cal');
  if (!cal) return;
  const m = state.resultMonth;
  const y = m.getFullYear(), mo = m.getMonth();
  const lab = document.getElementById('result-month-label');
  if (lab) lab.textContent = y + '年 ' + (mo + 1) + '月';
  cal.innerHTML = '<div class="reserve-month">' + _resultMonthCells(y, mo) + '</div>';
}

function _resultMonthCells(y, mo){
  const first = new Date(y, mo, 1);
  const last  = new Date(y, mo + 1, 0);
  const startDow = first.getDay();
  const totalDays = last.getDate();
  const todayStr = ymd(new Date());

  let html = '';
  ['日','月','火','水','木','金','土'].forEach(function(d){ html += '<div class="reserve-month-cell dow">' + d + '</div>'; });

  for (let i = 0; i < startDow; i++){
    const d = new Date(y, mo, i - startDow + 1);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }

  for (let dd = 1; dd <= totalDays; dd++){
    const dateObj = new Date(y, mo, dd);
    const dateStr = ymd(dateObj);
    const dow = dateObj.getDay();
    const isToday = dateStr === todayStr;
    const isClosed = (window.PitCal ? PitCal.isClosed(dateStr) : false);   /* 🚫 MHSの定休日カレンダー */
    let dowClass = ''; if (dow === 0) dowClass = ' sun'; if (dow === 6) dowClass = ' sat';

    const cardsOfDay = _resultDayCards(dateStr);
    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;
    const hol = (window.Holidays && Holidays.name(dateStr)) || null;

    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + dowClass + '"'
         + ' onclick="if(!event.target.closest(\'.reserve-month-event\'))pitResultDayPopup(\'' + dateStr + '\')">';
    html += '<div class="day-num">' + dd + '</div>';
    if (hol) html += '<div class="hol-name" title="' + hol + '">' + hol + '</div>';

    visible.forEach(function(c){
      const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';   // 国産緑/輸入ピンク
      /* 🔴 v1.162.0 お名前は pitCustSurname の1本（漢字が無ければカナ）。ここは直に組み立てていた。 */
      const nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
      const _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
      const wt = state.workTypes.find(function(w){ return w.id === _wid; });
      let side = '';
      if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
      html += '<div class="reserve-month-event" data-card-id="' + c.id + '" style="border-left-color:' + teamColor + '"'
           + ' onclick="event.stopPropagation();openDetail(\'' + c.id + '\')">';
      html += '<span class="rme-txt">' + nm + ' 様' + (c.car ? ' ' + c.car : '') + '</span>';   // 苗字＋様＋車種（…省略）
      if (side) html += '<span class="rme-side">' + side + '</span>';   // 右＝作業(色付き)
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
    const d = new Date(y, mo + 1, i);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }
  return html;
}

/* その日の実績を全件ポップアップ（タスクボードと同じコンパクトカード）。予約ビューの pitReserveDayPopClose を流用 */
window.pitResultDayPopup = function(dateStr){
  const _amt = function(c){ return (c.amountFinal != null ? c.amountFinal : (c.amountOrder != null ? c.amountOrder : (c.estAmount || 0))); };
  const cards = _resultDayCards(dateStr).sort(function(a, b){ return _amt(b) - _amt(a); });
  let back = document.getElementById('pit-day-pop');
  if (!back){
    back = document.createElement('div');
    back.id = 'pit-day-pop';
    back.className = 'modal-backdrop';
    pitModalOutside(back, function(){ if (window.pitReserveDayPopClose) pitReserveDayPopClose(); });
    document.body.appendChild(back);
  }
  const d = new Date(dateStr + 'T00:00:00');
  const dow = '日月火水木金土'[d.getDay()];
  const head = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + dow + '）　実績　' + cards.length + '件';
  const body = cards.length
    ? cards.map(function(c){ return (typeof cardHtml === 'function') ? cardHtml(c, { compact: true })
        : ('<div>' + ((window.pitCustName ? pitCustName(c) : (c.customer || '')) || '') + '</div>'); }).join('')
    : '<div class="pdp-empty">実績はありません</div>';
  back.innerHTML = '<div class="pdp-box"><div class="pdp-head"><span>' + head + '</span><button class="pdp-x" onclick="pitReserveDayPopClose()"><i data-ic=close data-ics=16></i></button></div>'
    + '<div class="pdp-list" onclick="pitReserveDayPopClose()">' + body + '</div></div>';
  back.classList.add('show');
};
