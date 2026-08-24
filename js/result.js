/* ========================================
   result.js
   実績ビュー（予約2ヶ月ビュー流用＝固定枠・㈱略・名前＋車種＋作業・国産緑/輸入ピンク・+N・クリックで全件）
   v0.107.0：件数が増えても枠が伸びないよう、1日最大3件＋「+N件」表示。枠クリックでその日の全実績をポップアップ。
   実績＝作業完了日(completedAt)に「作業完了 or 返車済み」になったカード。
   ======================================== */

/* ===================================================================
   🔢🔢 v2.6.0（ゆうた案）実績ビューは **2段**。ボタン1つで入れ替える。
   -------------------------------------------------------------------
   🗣「実績ビューを2段にして、通常はカウントするビュー（いまのまま）で、ボタン一個で
   　　じゃないビューにして、いまの売上なし（noSale）も含めてカウントしないのを集める」
   ◎なぜこの形にしたか
     「数えない」の物差しは `pitCardNoSale()` **1本**で、すでに約20か所がぶら下がっている
     （売上・作業サマリー・整備ダッシュ・マイダッシュ・クォーター突合・データチェック・
     　期限の見張り・アーカイブ・来店履歴）。社内車両（中古・代車・内部）もそこに合流させたので、
     その20か所は1行も触らずに外れる。
     🔴 ただ **実績カレンダーだけは「乗せたい」**（アーカイブとして残す、というゆうた指定）。
        そこで **例外を1つ書くのではなく、見せる集合を入れ替える**形にした。
        ＝物差しは1本のまま。画面ごとに意味が違う、という一番あとで壊れる形を避けている。
     ◎おまけ … 今まで「売上なし」にした車は実績カレンダーから消えてどこにも見えなかった。
        2段目ができたことで居場所ができた。
   ⚠ 段の状態（`state.resultMode`）は画面の都合なので保存しない。
   =================================================================== */
function _resultNoCount(c){ return !!(window.pitCardNoSale && pitCardNoSale(c)); }
function _resultDayCards(dateStr){
  var nc = (state.resultMode === 'nocount');
  return (state.cards || []).filter(function(c){
    if (!c || c.completedAt !== dateStr) return false;
    if (c.status !== 'workDone' && c.status !== 'returned') return false;
    return _resultNoCount(c) === nc;
  });
}

/* 段の入れ替え（ボタン） */
window.pitResultToggleMode = function(){
  state.resultMode = (state.resultMode === 'nocount') ? 'count' : 'nocount';
  renderResult();
};

function renderResult(){
  const cal = document.getElementById('result-cal');
  if (!cal) return;
  const m = state.resultMonth;
  const y = m.getFullYear(), mo = m.getMonth();
  const nc = (state.resultMode === 'nocount');
  const lab = document.getElementById('result-month-label');
  if (lab) lab.textContent = y + '年 ' + (mo + 1) + '月';
  /* 段のボタン＝いま出ていない方の名前を出す（押したらそっちへ行く） */
  const btn = document.getElementById('result-mode-btn');
  if (btn) btn.textContent = nc ? '数える側へ' : '数えない側へ';
  const sec = document.getElementById('view-result');
  if (sec) sec.classList.toggle('result-nocount', nc);
  cal.innerHTML =
    '<div class="result-bar' + (nc ? ' nc' : '') + '">'
      + (nc
         ? '<b>数えない側</b>：社内車両（中古・代車・内部）と「売上なし」で片づけた車。'
           + '<span>売上・作業サマリー・フロントマンのPDFには乗りません。記録として残しています。</span>'
         : '<b>数える側</b>：売上に数えている実績。'
           + '<span>社内車両と「売上なし」は「数えない側へ」で見られます。</span>')
    + '</div>'
    + '<div class="reserve-month">' + _resultMonthCells(y, mo) + '</div>';
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
      /* 🏢 v2.6.0 社内車両は区分の名前（中古／代車車検／内部）を出す＝何の車か一目で分かる */
      const _in = window.pitInternLabel ? pitInternLabel(c) : '';
      if (_in) side += '<span class="rme-wt rme-intern">' + _in + '</span>';
      else if (wt) side += '<span class="rme-wt" style="color:' + wt.color + '">' + wt.label + '</span>';
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
  const head = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + dow + '）　実績'
             + (state.resultMode === 'nocount' ? '（数えない）' : '') + '　' + cards.length + '件';
  const body = cards.length
    ? cards.map(function(c){ return (typeof cardHtml === 'function') ? cardHtml(c, { compact: true })
        : ('<div>' + ((window.pitCustName ? pitCustName(c) : (c.customer || '')) || '') + '</div>'); }).join('')
    : '<div class="pdp-empty">実績はありません</div>';
  back.innerHTML = '<div class="pdp-box"><div class="pdp-head"><span>' + head + '</span><button class="pdp-x" onclick="pitReserveDayPopClose()"><i data-ic=close data-ics=16></i></button></div>'
    + '<div class="pdp-list" onclick="pitReserveDayPopClose()">' + body + '</div></div>';
  back.classList.add('show');
};
