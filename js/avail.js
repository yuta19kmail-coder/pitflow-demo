/* ========================================
   avail.js
   空きカレンダービュー（v0.99.24）
   新規予約画面の右パネル部品を読み取り専用で再利用し、
   「国産車の最短＋空きカレンダー」「輸入車の最短＋空きカレンダー」
   「代車カレンダー」を 3 カラムで一同に表示する。
   ＋ カレンダーの日付をクリックすると、その日の「入庫」を
     国産カレンダーの下に国産車・輸入カレンダーの下に輸入車として
     2カラムで一覧表示する（返車は出さない＝入庫だけ）。
   ※ ここは見るためのビュー＝一覧の行クリックは予約詳細を開くだけ（編集しない）。
   ======================================== */

/* 簡易エスケープ（顧客名・車種にHTML特殊文字が入っても崩れないように） */
function _avEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 入庫1行（読み取り専用・クリックで予約詳細） */
function _availRow(c){
  const isImp = (c.boardId === 'import');
  const teamColor = isImp ? '#ec4899' : '#1db97a';
  const time = (c.reserveTime || '').trim();
  /* 🔴 v1.161.0（ゆうた報告「空きカレンダービューで名前の漢字→カナの仕組みが入ってない」）
     お名前は **pit-share.js の `pitCustSurname` 1本**を通す。
     ⚠ ここだけ `pitSurname(c.customer)` と直に書いていたので、
        **漢字がまだ分からずカナだけ入れたお客様が「（未入力）」**になっていた。
        （車検予定・車検ログで 8/16 に直したのとまったく同じ筋。ここが最後の1か所。） */
  const name = ((window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）') + ' 様';
  const done = !!(c.status && c.status !== 'reserved');   // 入庫済み等（予約から先へ進んだ）

  // 作業バッジ（基本＋併用・最大2個・設定の色）
  const wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
  let workTag = '';
  wts.slice(0, 2).forEach(function (id) {
    const w = (state.workTypes || []).find(function (x) { return x.id === id; });
    if (w) workTag += '<span class="av-it-work' + ((w.label || '').length >= 4 ? ' long' : '') + '" style="background:' + w.color + '20;color:' + w.color + ';border-color:' + w.color + ';">' + _avEsc(w.label) + '</span>';
  });
  // 添え物タグ（他の予約ビュー・当日ビューと同じ tag-side の配色に合わせる）
  let side = '';
  if (c.consult)    side += '<span class="tag-side consult">相談</span>';
  if (c.needLoaner) side += '<span class="tag-side loaner">代車</span>';

  let h = '<div class="av-it' + (c.urgent ? ' urgent' : '') + '" style="--team:' + teamColor + '" onclick="pitOpenCardDetail(\'' + c.id + '\')" title="クリックで予約詳細">';
  h += '<div class="av-it-time">' + (time || '—') + '</div>';
  h += '<div class="av-it-main">';
  h += '<div class="av-it-head"><span class="av-it-name">' + _avEsc(name) + '</span>' + (done ? '<span class="av-it-done">入庫済</span>' : '') + '</div>';
  if (c.car) h += '<div class="av-it-car">' + _avEsc(c.car) + '</div>';
  h += '</div>';
  h += '<div class="av-it-tags">' + side + workTag + '</div>';
  h += '</div>';
  return h;
}

/* 指定チーム・指定日の入庫一覧カード */
function _availList(team, ds){
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const teamName  = (team === 'import') ? '<i data-ic=globe data-ics=16></i> 輸入車の入庫' : '<i data-ic=car data-ics=16></i> 国産車の入庫';
  /* 入庫＝その日に入庫予定。返車済みは出さない。時間順。
     🔴 v1.161.0（ゆうた報告「キャンセルした車両が入庫済みとして表示されている」）
        **まだ生きているカードかの物差しは pit-share.js の `pitCardActive` 1本。**
        ⚠ ここは `scrap` と `returned` しか外していなかったので
           **予約キャンセル（`cancelled`）・未入庫・売上なしが残っていた**。
           しかも下の `done` は「`reserved` 以外＝入庫済」なので、
           **キャンセルした車に「入庫済」の札が付く**という見え方になっていた。
        ⚠ 条件をここに書き戻さないこと。何を外すかは全部あちらで決める。 */
  const _alive = window.pitCardActive || function (c) { return !!c && c.status !== 'scrap' && c.status !== 'cancelled'; };
  const cards = (state.cards || []).filter(function (c) {
    return c.boardId === team && c.reserveDate === ds && _alive(c) && c.status !== 'returned';
  }).sort(function (a, b) {
    /* 🔴 v1.70.0 物差しは state.js の pitTimeMin 1本。
       ⚠ v1.69.0 まで**文字くらべ**で並べていたので、「朝一」が「夕方」より後ろ、
          「お昼」が「PM」より先、空が「13:30」より先、という並びになっていた。 */
    var f = window.pitTimeMin || function (t){ return t ? 0 : 99999; };
    return f(a.reserveTime) - f(b.reserveTime);
  });

  let dlabel = '';
  if (ds){
    const d = new Date(ds + 'T00:00:00');
    if (!isNaN(d)) dlabel = (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）';
  }

  let h = '<div class="cfs-card av-list-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '"><span style="color:' + teamColor + '"><i data-ic=download data-ics=16></i> ' + teamName + '</span>'
     + '<span class="av-list-date">' + dlabel + (ds ? '　<b>' + cards.length + '</b>台' : '') + '</span></div>';
  h += '<div class="av-list-body">';
  if (!ds){
    h += '<div class="av-list-empty">上のカレンダーで日付をクリックすると、その日の入庫が出ます。</div>';
  } else if (!cards.length){
    h += '<div class="av-list-empty">この日の' + (team === 'import' ? '輸入車' : '国産車') + '入庫はありません。</div>';
  } else {
    cards.forEach(function (c) { h += _availRow(c); });
  }
  h += '</div></div>';
  return h;
}

/* 一覧だけ差し替え＋選択日のハイライト更新（カレンダー/代車ガントは再描画しない） */
function _availRefresh(){
  const pick = window._availPick;
  const ld = document.getElementById('av-list-default');
  const li = document.getElementById('av-list-import');
  if (ld) ld.innerHTML = _availList('default', pick);
  if (li) li.innerHTML = _availList('import', pick);
  const body = document.getElementById('view-availcal-body');
  if (body){
    body.querySelectorAll('.cfs-day.av-sel').forEach(function (el) { el.classList.remove('av-sel'); });
    if (pick) body.querySelectorAll('.cfs-day[data-ds="' + pick + '"]').forEach(function (el) { el.classList.add('av-sel'); });
  }
}
window._availRefresh = _availRefresh;

function renderAvail(){
  const body = document.getElementById('view-availcal-body');
  if (!body) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tStr = ymd(today);
  if (!window._cfsYM){ window._cfsYM = { y: today.getFullYear(), m: today.getMonth() }; }
  if (window._availPick === undefined) window._availPick = tStr;   // 既定の選択日＝今日
  const pick = window._availPick;

  // 読み取り専用の合成カード（実データは触らない）
  const c = { reserveDate: '', boardId: null, needLoaner: true };

  let h = '<div class="av-cols">';

  // 国産車（最短＋空きカレンダー＋その日の入庫一覧）
  h += '<div class="av-col">';
  h += _cfsShortHtml(c, 'default', today, tStr, true);
  h += _cfsCalHtml(c, 'default', tStr, true);
  h += '<div id="av-list-default">' + _availList('default', pick) + '</div>';
  h += '</div>';

  // 輸入車（最短＋空きカレンダー＋その日の入庫一覧）
  h += '<div class="av-col">';
  h += _cfsShortHtml(c, 'import', today, tStr, true);
  h += _cfsCalHtml(c, 'import', tStr, true);
  h += '<div id="av-list-import">' + _availList('import', pick) + '</div>';
  h += '</div>';

  // 代車カレンダー
  h += '<div class="av-col av-col-lg">';
  h += _cfsLoanerGanttHtml(today, tStr, c, true);
  h += '</div>';

  h += '</div>';

  body.innerHTML = h;

  // 日付クリック（委譲・bodyは保持されるので1回だけ登録）
  if (!body._availBound){
    body.addEventListener('click', function (e) {
      const cell = e.target.closest('.cfs-day[data-ds]');
      if (!cell || !body.contains(cell)) return;
      const ds = cell.getAttribute('data-ds');
      if (!ds) return;
      window._availPick = ds;
      _availRefresh();
    });
    body._availBound = true;
  }

  // 代車カレンダーは表示領域が高い（72vh）ため初期行だと縦にあふれず縦スクロールが出ない。
  // レイアウト確定後に、縦スクロールバーが出るまで行を先読みで埋める。
  requestAnimationFrame(function () { if (window.cfsLgFill) window.cfsLgFill(); });
}
window.renderAvail = renderAvail;
