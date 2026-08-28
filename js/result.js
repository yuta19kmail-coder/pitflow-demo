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
/* 🗓🗓 v2.9.5（ゆうた 2026-08-25「実績の数えない側のカレンダーに反映されない」）
   ----------------------------------------------------------------
   ◎正体 …… ここは `c.completedAt !== dateStr` だけで日を決めていた。
     ところが**売上なしアーカイブは `completedAt` を入れない**（v1.99.0 の決めごと。
     実績・売上に乗る道を塞ぐための二重の守り）。
     ＝ **数えない側のカレンダーにも、永久に1台も出てこない。**
     v2.6.0 で「数えない側」を作った時に、日付をどこから取るかを見落としていた。
   🔴 数える側は今までどおり `completedAt` **だけ**（ここを緩めると実績の日がブレる）。
   🔴 数えない側は **`completedAt` があればそれ。無ければ**来店履歴と同じ落とし方
      （`pitCardDoneDate`＝customers.js の1本）に落とす。
      ⚠⚠ 順番が肝。**社内車両（中古・代車・内部）は `pitInternReturn` が `completedAt` を入れている。**
         いきなり `pitCardDoneDate` に投げると、あちらは「売上なし＝来た日」と決めているので
         社内車両の日が空になって**逆に消える**（試験がこれを捕まえた）。 */
function _resultDateOf(c, nc){
  var done = String(c.completedAt || '');
  if (!nc) return done;
  if (done) return done;
  if (window.pitCardDoneDate) { try { return String(window.pitCardDoneDate(c) || ''); } catch (e) {} }
  return String(c.returnDateFinal || c.returnDate || c.reserveDate || '');
}
function _resultDayCards(dateStr){
  var nc = (state.resultMode === 'nocount');
  return (state.cards || []).filter(function(c){
    if (!c) return false;
    if (c.status !== 'workDone' && c.status !== 'returned') return false;
    if (_resultNoCount(c) !== nc) return false;
    return _resultDateOf(c, nc) === dateStr;
  });
}

/* 🔎 v2.17.0 このカードの「実績の日」と「どちらの段の住人か」を外から聞けるようにする。
   ⚠ 来店履歴から飛ぶ時に使う（返車日ではなく**実績の日**で月を決めないと、
      月は合っているのに光る日が無い＝行き止まりになる）。 */
window.pitResultDateOf = function(c){ return _resultDateOf(c, _resultNoCount(c)); };
window.pitResultModeOf = function(c){ return _resultNoCount(c) ? 'nocount' : 'count'; };

/* ===================================================================
   🔎🔎 v2.17.0（ゆうた指定 2026-08-28）実績ボードに検索の箱
   -------------------------------------------------------------------
   🗣「+N件の表示で隠れているのもあるし、〇〇さんを見たいなとか思っても、
   　　その月にあるのが分かっていても探すのが一苦労になっちゃってる」
   ◎やること
     ① 打つと、箱の下にヒットした一覧（**月をまたいで実績ぜんぶ**から）
     ② その月に当たりがあれば、**日付の数字と枠を光らせる**
     ③ 当たったカードは、その日の**先頭に出す**＝ +N件 に隠れたままにしない
   🔴 探し方（何が当たるか）は **search.js の `pitCardFields` 1本**を借りる。
      ここに書き写さない＝上の検索と当たり方がズレない。
   🔴 集める集合は **カレンダーと同じ**（`_resultDayCards` と同じ条件）。
      別に数え直さない＝「一覧には出るのにカレンダーに居ない」を作らない。
   🔴 **数字は1つも動かさない。** 並べ替えも光らせるのも画面の中だけで、
      カードには1バイトも書かない（検索をやめれば元どおり）。
   ⚠ `state.resultQ` / `state.resultHit` は保存しない（段と同じ＝画面の都合）。
   =================================================================== */
var _RQ = { words: [], hits: [], ids: {}, other: 0, nodate: 0 };

function _resultRunSearch(){
  var q = String(state.resultQ || '').trim();
  var words = (window.pitSearchWords ? pitSearchWords(q) : []);
  _RQ = { words: words, hits: [], ids: {}, other: 0, nodate: 0 };
  if (!words.length) return _RQ;
  var nc = (state.resultMode === 'nocount');
  (state.cards || []).forEach(function(c){
    if (!c) return;
    if (c.status !== 'workDone' && c.status !== 'returned') return;
    var blob = window.pitCardBlob ? pitCardBlob(c) : '';
    if (!words.every(function(w){ return blob.indexOf(w) >= 0; })) return;
    /* 🔴 もう片方の段に居るものは、黙って落とさず数える（下の1行で行き先を出す） */
    if (_resultNoCount(c) !== nc) { _RQ.other++; return; }
    var d = _resultDateOf(c, nc);
    if (!d) { _RQ.nodate++; return; }        /* 日が無い＝カレンダーに置き場所が無い。黙らない */
    _RQ.hits.push({ id: c.id, c: c, date: d });
    _RQ.ids[c.id] = 1;
  });
  _RQ.hits.sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); });   /* 新しい順 */
  return _RQ;
}

/* 打っている間は描き直さない（v1.177.0 の作法をそのまま借りる） */
window.pitResultSearchSoon = function(ev){
  var v = (ev && ev.target) ? ev.target.value : '';
  if (!String(v).trim() || !window.pitTypeSoon) { window.pitResultSearchInput(v); return; }
  pitTypeSoon('resultq', ev, function(){ window.pitResultSearchInput(v); });
};
window.pitResultSearchInput = function(q){
  state.resultQ = String(q == null ? '' : q);
  state.resultHit = null;                    /* 語が変わったら、光らせていた1件は外す */
  renderResult();
};
window.pitResultSearchClear = function(){
  state.resultQ = ''; state.resultHit = null;
  var inp = document.getElementById('result-q');
  if (inp) { inp.value = ''; inp.focus(); }
  renderResult();
};
/* 一覧の行を押した時＝**その月へ飛んで光らせるだけ**（開くのは本人・ゆうた選択 2026-08-28） */
window.pitResultHitGo = function(id){
  var c = (state.cards || []).find(function(x){ return x && x.id === id; });
  if (!c) return;
  var d = _resultDateOf(c, _resultNoCount(c));
  if (d){ var q = String(d).split('-'); state.resultMonth = new Date(+q[0], (+q[1]) - 1, 1); }
  state.resultHit = id;
  renderResult();
};

function _rsMark(t, words){
  return window.pitSearchMark ? pitSearchMark(t == null ? '' : t, words || [])
                              : escAttr(t == null ? '' : t);
}
function _rsMonthPrefix(){
  return state.resultMonth.getFullYear() + '-' + String(state.resultMonth.getMonth() + 1).padStart(2, '0');
}
var _RS_CAP = 200;                            /* 一覧に並べる上限。切ったら正直に出す（v1.184.0） */

function _resultHitsHtml(){
  var R = _RQ;
  if (!R.words.length) return '';
  var nc  = (state.resultMode === 'nocount');
  var pre = _rsMonthPrefix();
  var inMonth = R.hits.filter(function(h){ return String(h.date).indexOf(pre) === 0; }).length;
  var h = '<div class="rs-hits">';
  h += '<div class="rs-head"><b>' + R.hits.length + '件</b>'
     + (R.hits.length ? '<span>この月 ' + inMonth + '件</span>' : '') + '</div>';
  if (R.other){
    h += '<div class="rs-other">' + (nc ? '実績カウント一覧' : '非カウント一覧') + 'に ' + R.other + '件'
       + '<button class="rs-go" onclick="pitResultToggleMode()">そちらを見る</button></div>';
  }
  if (R.nodate){
    h += '<div class="rs-other">実績の日が入っていないものが ' + R.nodate + '件（カレンダーには出せません）</div>';
  }
  var list = R.hits.slice(0, _RS_CAP);
  list.forEach(function(x){
    var c = x.c;
    var dd = String(x.date).split('-');
    var dow = '日月火水木金土'[new Date(x.date + 'T00:00:00').getDay()] || '';
    var nm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
    var _wid = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    var wt = (state.workTypes || []).find(function(w){ return w.id === _wid; });
    var _in = window.pitInternLabel ? pitInternLabel(c) : '';
    var side = _in ? '<span class="rme-wt rme-intern">' + escAttr(_in) + '</span>'
                   : (wt ? '<span class="rme-wt" style="color:' + wt.color + '">' + escAttr(wt.label) + '</span>' : '');
    var w = (window.pitSearchWhere && window.pitCardFields) ? pitSearchWhere(pitCardFields(c), R.words) : [];
    var where = w.length
      ? '<span class="rs-where">' + w.map(function(o){ return escAttr(o.label) + (o.as ? ' ' + escAttr(o.as) : ''); }).join('・') + '</span>'
      : '';
    h += '<button class="rs-hit' + (String(x.date).indexOf(pre) === 0 ? ' now' : '')
       + (state.resultHit === c.id ? ' sel' : '') + '" onclick="pitResultHitGo(\'' + escAttr(c.id) + '\')">'
       + '<span class="rs-d">' + (+dd[1]) + '/' + (+dd[2]) + '<em>(' + dow + ')</em></span>'
       + '<span class="rs-n">' + _rsMark(nm, R.words) + ' 様</span>'
       + (c.car ? '<span class="rs-c">' + _rsMark(c.car, R.words) + '</span>' : '')
       + (c.plate ? '<span class="rs-p">' + _rsMark(c.plate, R.words) + '</span>' : '')
       + side + where + '</button>';
  });
  if (R.hits.length > list.length){
    h += '<div class="rs-other">ほか ' + (R.hits.length - list.length) + '件（もう少し絞ってください）</div>';
  }
  if (!R.hits.length && !R.other) h += '<div class="rs-none">見つかりません</div>';
  return h + '</div>';
}

/* 段の入れ替え（ボタン） */
window.pitResultToggleMode = function(){
  state.resultMode = (state.resultMode === 'nocount') ? 'count' : 'nocount';
  state.resultHit = null;                    /* 段が変われば、光らせていた1件はもう居ない */
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
  /* 🏷 v2.9.6（ゆうた 2026-08-25）名前を変えた。**押したら行く先の名前**を出す。
     「数える側／数えない側」→「**実績カウント一覧／非カウント一覧**」 */
  if (btn) btn.textContent = nc ? '実績カウント一覧' : '非カウント一覧';
  const sec = document.getElementById('view-result');
  if (sec) sec.classList.toggle('result-nocount', nc);
  /* 🔎 v2.17.0 探す（打った字は画面の持ち物。箱そのものは index.html にあるので描き直さない
     ＝打っている最中に焦点が飛ばない・v1.157.0 の教訓）。 */
  const inp = document.getElementById('result-q');
  if (inp && document.activeElement !== inp && inp.value !== String(state.resultQ || '')) inp.value = String(state.resultQ || '');
  const bar = document.getElementById('result-search-bar');
  if (bar) bar.classList.toggle('on', !!String(state.resultQ || '').trim());
  _resultRunSearch();
  const hits = document.getElementById('result-hits');
  if (hits) hits.innerHTML = _resultHitsHtml();

  cal.innerHTML =
    /* 🏷 v2.9.6 ふつうの実績側には**何も書かない**（ゆうた「はいらない」）。
       ⚠ 非カウント側だけは、なぜここに居るのかが分からないと困るので1行だけ残す。 */
    (nc
      ? '<div class="result-bar nc"><b>非カウント一覧</b>：社内車両（中古・代車・内部）と「売上なし」で片づけた車。'
        + '<span>売上・作業サマリー・フロントマンのPDFには乗りません。記録として残しています。</span></div>'
      : '')
    + '<div class="reserve-month">' + _resultMonthCells(y, mo, { ids: _RQ.ids, words: _RQ.words, one: state.resultHit }) + '</div>';
  /* 光らせた1件は画面の中へ（隠れた所で光っていても意味が無い） */
  if (state.resultHit){
    const el = cal.querySelector('.rs-day-one');
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'center' }); } catch (e) {} }
  }
}

/* opt（省略可・v2.17.0）＝ { ids:当たったカードid, words:塗る語, one:光らせる1件 }
   ⚠ 省略すると今までとまったく同じ（マイダッシュの小さいカレンダーはこちら）。 */
function _resultMonthCells(y, mo, opt){
  opt = opt || {};
  const _ids = opt.ids || {}, _words = opt.words || [], _one = opt.one || null;
  const _rank = function(c){ return (_one === c.id ? 2 : 0) + (_ids[c.id] ? 1 : 0); };
  const _any  = (_words.length > 0) || !!_one;
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

    let cardsOfDay = _resultDayCards(dateStr);
    /* 🔎 v2.17.0 当たったカードはその日の先頭へ＝ +N件 に隠れたままにしない。
       🔴 並べ替えるのは**画面に出す順だけ**。カードにも state.cards にも1バイトも書かない。 */
    if (_any) cardsOfDay = cardsOfDay.slice().sort(function(a, b){ return _rank(b) - _rank(a); });
    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;
    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    const dayHit = _any && cardsOfDay.some(function(c){ return _ids[c.id]; });
    const dayOne = !!(_one && cardsOfDay.some(function(c){ return c.id === _one; }));

    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + dowClass
         + (dayHit ? ' rs-day' : '') + (dayOne ? ' rs-day-one' : '') + '"'
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
      const evHit = _ids[c.id] ? ' rs-ev' : '';
      const evOne = (_one === c.id) ? ' rs-ev-one' : '';
      html += '<div class="reserve-month-event' + evHit + evOne + '" data-card-id="' + c.id + '" style="border-left-color:' + teamColor + '"'
           + ' onclick="event.stopPropagation();openDetail(\'' + c.id + '\')">';
      /* 🔎 v2.17.0 当たった字を塗る（塗るのは元の字・v1.176.0）。語が無ければ今までどおりの見た目 */
      html += '<span class="rme-txt">' + _rsMark(nm, _words) + ' 様' + (c.car ? ' ' + _rsMark(c.car, _words) : '') + '</span>';   // 苗字＋様＋車種（…省略）
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
  /* 🔎 v2.17.0 探している時は、当たったものを先頭に（枠に出しきれなかったぶんはここで拾う）。
     ⚠ 並べ替えるのは出す順だけ。件数も金額も1つも変わらない。 */
  const _hit = _RQ.ids || {};
  const _lit = (_RQ.words && _RQ.words.length) ? cards.slice().sort(function(a, b){ return (_hit[b.id] ? 1 : 0) - (_hit[a.id] ? 1 : 0); }) : cards;
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
             + (state.resultMode === 'nocount' ? '（非カウント）' : '') + '　' + cards.length + '件';
  const body = _lit.length
    ? _lit.map(function(c){
        const one = (typeof cardHtml === 'function') ? cardHtml(c, { compact: true })
          : ('<div>' + ((window.pitCustName ? pitCustName(c) : (c.customer || '')) || '') + '</div>');
        return _hit[c.id] ? ('<div class="pdp-hit">' + one + '</div>') : one;
      }).join('')
    : '<div class="pdp-empty">実績はありません</div>';
  back.innerHTML = '<div class="pdp-box"><div class="pdp-head"><span>' + head + '</span><button class="pdp-x" onclick="pitReserveDayPopClose()"><i data-ic=close data-ics=16></i></button></div>'
    + '<div class="pdp-list" onclick="pitReserveDayPopClose()">' + body + '</div></div>';
  back.classList.add('show');
};
