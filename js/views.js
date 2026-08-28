/* ========================================
   views.js
   ビュー切替、共通ユーティリティ
   ※ openDetail/closeDetail は card-detail.js に分離
   ======================================== */

function showView(viewId){
  /* 🔴 v1.80.0 代車カレンダーに**未確定の下書き**がある時は、黙って離れさせない。
     ⚠ 下書きは state に直接書かれていて、よその画面の保存に巻き込まれると
        「動かしただけのつもり」が本当に変わってしまう。
     ⚠ 聞くのは1回だけ。答えが返ってから改めて showView をやり直す（写しを作らない）。 */
  if (state.currentView === 'loaner' && viewId !== 'loaner'
      && window.pitLoanerAskLeave && pitLoanerAskLeave(viewId)) return;
  /* 🔴 v1.95.0 **切り替える前のビュー**を覚えておく。
     ⚠ 画面のどこかが変わるたびに `showView(state.currentView)` で背後を描き直す作りなので、
        描き直し側からは「新しく開いたのか／同じ画面を描き直しただけなのか」が分からない。
        分からないと、代車カレンダーのように**スクロール位置を持っている画面が毎回いちばん上に戻る**。
     ⚠ 使うのは「同じ画面の描き直しか？」の判定だけ。画面の出し分けには使わないこと。 */
  window._pitPrevView = state.currentView || '';
  state.currentView = viewId;
  /* 🔴 v1.101.0（ゆうた指定）**当日を過ぎたものを、描く前に正しい箱へ落とす。**
     ・入庫日を過ぎた本予約 → 予約・未定の「未入庫」
     ・返車予定日を過ぎてまだ返していない車 → 日付を空にして「返車日未定」
     ⚠ 中身は overdue-pit.js の1本。ここで条件を書き写さないこと。
     ⚠ 変わったものが無ければ保存しない作りなので、毎回呼んでよい。 */
  if (window.pitAutoOverdue) { try { pitAutoOverdue(); } catch(e){} }
  // 付箋の表示先を既定（ダッシュボード）へ戻す。マイダッシュボードは renderMyDash 内で自分の器へ切替。
  window.PIT_BN_TARGET = 'board-notes-area';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.si-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.si-item[data-view="' + viewId + '"]')
    .forEach(i => i.classList.add('active'));

  // フライアウト：開いていたら閉じる＋アクティブな子を持つ親グループを淡くハイライト
  if (window.closeFlyoutNow) closeFlyoutNow();
  document.querySelectorAll('.si-flyout.has-active').forEach(g => g.classList.remove('has-active'));
  const activeChild = document.querySelector('.si-flyout-panel .si-item.active');
  if (activeChild){
    const grp = activeChild.closest('.si-flyout');
    if (grp) grp.classList.add('has-active');
  }

  if (viewId === 'today')   renderToday();
  if (viewId === 'availcal' && window.renderAvail) renderAvail();
  if (viewId === 'reserve') renderReserve();
  if (viewId === 'return')  renderReturn();
  if (viewId === 'carsales' && window.renderCarSales) renderCarSales();
  if (viewId === 'task')    renderTask();
  if (viewId === 'course1' && window.renderCourse) renderCourse('default', 'kanban-cols-1');
  if (viewId === 'course2' && window.renderCourse) renderCourse('import',  'kanban-cols-2');
  if (viewId === 'work')    renderWork();
  if (viewId === 'outsource' && window.renderOutsource) renderOutsource();
  if (viewId === 'result')  renderResult();
  if (viewId === 'loaner')  renderLoaner();
  if (viewId === 'customers' && window.renderCustomers) renderCustomers();
  if (viewId === 'dashboard' && window.renderMyDash) renderMyDash();   // ダッシュボード＝ビルダー（旧ダッシュ/整備ダッシュを統合）
  if (viewId === 'help' && window.renderHelp) renderHelp();
  if (viewId === 'shakencal' && window.renderShaken) renderShaken();
  if (viewId === 'shakenlog' && window.renderShakenLog) renderShakenLog();
  if (viewId === 'sales' && window.renderSales) renderSales();
  if (viewId === 'inspect' && window.renderInspect) renderInspect();   // 🩺 v1.170.0 データチェック（日常チェック／クォーターチェック）
  if (viewId === 'worksum' && window.renderWorkSummary) renderWorkSummary();   // <i data-ic=user data-ics=16></i> 作業サマリー（v0.129.0）
  if (viewId === 'parking' && window.renderParking) renderParking();
  if (viewId === 'fleet' && window.renderFleet) renderFleet();
  if (viewId === 'settings' && window.renderSettings) renderSettings();
  if (viewId === 'rules' && window.renderRules) renderRules();
  if (viewId === 'members' && window.renderMembers) renderMembers();
  if (viewId === 'oplog' && window.renderOplog) renderOplog();
  if (viewId === 'news' && window.renderNews) renderNews();
}

/* 📅 予約カレンダー（その日）へ飛ぶ（顧客履歴・検索結果から） */
function pitGotoReserveDate(dateStr){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  if (dateStr){
    const d = new Date(String(dateStr) + 'T00:00:00');
    if (!isNaN(d)){ state.reserveDate = d; state.reserveRange = 'day'; }
  }
  showView('reserve');
}
window.pitGotoReserveDate = pitGotoReserveDate;

/* 📊 実績カレンダー（その月）へ飛ぶ（返車済みから）
   🔎 v2.17.0 カードidを渡すと、飛んだ先で**その日とそのカードを光らせる**
      （ゆうた 2026-08-28「来店履歴から実績をクリックして飛んだ時も同様に」）。
   🔴 月は「返車日」ではなく**実績の日**（`pitResultDateOf`）で決める。
      ここを返車日のままにすると、実績の日が別の月の車で
      **月は動いたのに光る日が無い＝行き止まり**になる。
   🔴 段（実績カウント／非カウント）も、そのカードが居る方へ合わせる。
      合わせないと「飛んだのに1台も居ない」＝黙って嘘をつく。 */
function pitGotoResultMonth(dateStr, cardId){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  let base = dateStr;
  state.resultHit = null;
  if (cardId){
    const c = (state.cards || []).find(x => x && x.id === cardId);
    if (c){
      if (window.pitResultModeOf) state.resultMode = pitResultModeOf(c);
      if (window.pitResultDateOf){ const rd = pitResultDateOf(c); if (rd) base = rd; }
      state.resultHit = cardId;
      state.resultQ = '';                     /* 別の探し物なので、前の検索は持ち込まない */
    }
  }
  const d = base ? new Date(String(base) + 'T00:00:00') : new Date();
  if (!isNaN(d)) state.resultMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  showView('result');
}
window.pitGotoResultMonth = pitGotoResultMonth;

/* 🗂 カードを詳細で開く（モーダル等を閉じてから） */
function pitOpenCardDetail(cardId){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  if (window.openDetail) openDetail(cardId);
}
window.pitOpenCardDetail = pitOpenCardDetail;

/* ===== サイドバー フライアウト（親をホバー/タップ→右に小メニュー・StockFlow流用を汎用化）v0.33.0 =====
   HTML側：<div class="si-flyout" id="fly-<key>" onmouseenter="openFlyout('<key>')" onmouseleave="scheduleCloseFlyout()">
             <div class="si-item si-has-flyout" onclick="toggleFlyout(event,'<key>')">…<span class="si-caret"><i data-ic=chevRight data-ics=15></i></span></div>
             <div class="si-flyout-panel" id="flypanel-<key>" onmouseenter="openFlyout('<key>')" onmouseleave="scheduleCloseFlyout()">…子…</div>
           </div> */
let _flyCloseT = null;
let _flyCurrent = null;
function _isNarrowMenu(){ return window.matchMedia('(max-width:768px)').matches; }
function openFlyout(key){
  clearTimeout(_flyCloseT);
  if (_flyCurrent && _flyCurrent !== key) _closeFlyoutEl(_flyCurrent);
  _flyCurrent = key;
  const wrap = document.getElementById('fly-' + key);
  const panel = document.getElementById('flypanel-' + key);
  if (!wrap || !panel) return;
  wrap.classList.add('open-parent');
  const trig = wrap.querySelector('.si-has-flyout');
  const r = trig.getBoundingClientRect();
  panel.style.visibility = 'hidden';
  panel.classList.add('open');
  if (_isNarrowMenu()){
    panel.style.left = Math.max(8, r.left) + 'px';
    panel.style.top  = (r.bottom + 4) + 'px';
  } else {
    panel.style.left = (r.right + 2) + 'px';
    panel.style.top  = r.top + 'px';
    const ph = panel.offsetHeight;
    if (r.top + ph > window.innerHeight - 8){
      panel.style.top = Math.max(8, window.innerHeight - 8 - ph) + 'px';
    }
  }
  panel.style.visibility = '';
}
function _closeFlyoutEl(key){
  const wrap = document.getElementById('fly-' + key);
  const panel = document.getElementById('flypanel-' + key);
  if (wrap)  wrap.classList.remove('open-parent');
  if (panel) panel.classList.remove('open');
}
function scheduleCloseFlyout(){
  clearTimeout(_flyCloseT);
  _flyCloseT = setTimeout(function(){ if (_flyCurrent) _closeFlyoutEl(_flyCurrent); _flyCurrent = null; }, 180);
}
function closeFlyoutNow(){
  clearTimeout(_flyCloseT);
  if (_flyCurrent) _closeFlyoutEl(_flyCurrent);
  _flyCurrent = null;
}
function toggleFlyout(e, key){
  if (e) e.stopPropagation();
  const panel = document.getElementById('flypanel-' + key);
  if (panel && panel.classList.contains('open')) closeFlyoutNow();
  else openFlyout(key);
}
window.openFlyout = openFlyout;
window.scheduleCloseFlyout = scheduleCloseFlyout;
window.closeFlyoutNow = closeFlyoutNow;
window.toggleFlyout = toggleFlyout;

/* ☰ サイドバーをたたむ（v0.27.1・CarFlow/StockFlowと同じ操作感）。状態は端末に記憶 */
function toggleSidebar(){
  const app = document.getElementById('app');
  if (!app) return;
  const off = app.classList.toggle('sb-off');
  try { localStorage.setItem('pitflow_sb_off', off ? '1' : ''); } catch (e) {}
}
(function(){
  try {
    if (localStorage.getItem('pitflow_sb_off') === '1'){
      const app = document.getElementById('app');
      if (app) app.classList.add('sb-off');
    }
  } catch (e) {}
})();

function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  var _tt = document.querySelector('.theme-toggle');
  if (_tt) _tt.innerHTML = (window.ico ? ico(next === 'dark' ? 'moon' : 'sun', 17) : '');
}

function statusLabel(s){
  const map = {
    reserved: '予約',
    check:    '点検待ち',
    estim:    '見積り中',
    contact:  '連絡中',
    parts:    'パーツ待ち',
    work:     '作業待ち',
    workDone: '作業完了',
    returned: '返車完了',
    scrap:    '廃車・乗替',
    outsource:'外注',
  };
  return map[s] || s;
}

function statusColor(s){
  const map = {
    reserved: '#64748b',
    check:    '#3b82f6',
    estim:    '#f59e0b',
    contact:  '#a855f7',
    parts:    '#06b6d4',
    work:     '#26a269',
    workDone: '#1db97a',
    returned: '#10b981',
    scrap:    '#6b7280',
    outsource:'#f59e0b',
  };
  return map[s] || '#64748b';
}

function ymd(d){
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; }

/* ===== カードのホバー詳細用ヘルパー（共通） ===== */
function fmtMD(s){                                   // 'YYYY-MM-DD' → 'M/D'
  if (!s) return '';
  const p = String(s).split('-');
  return (p.length >= 3) ? (+p[1] + '/' + +p[2]) : s;
}
function daysFromToday(s){                            // s - 今日（整数日・未来=+）
  if (!s) return null;
  const d = new Date(s + 'T00:00:00'); if (isNaN(d)) return null;
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t) / 86400000);
}
/* ===================================================================
   📏 v1.59.0（ゆうた指定）**日数の数え方をここ1か所に決める。**
   -------------------------------------------------------------------
   ◎ゆうたの言葉
     「**基本的には入れた日を1日目と定めていい。ただし当日返車だと預かり日数としては0日と
       カウントしたい（朝預かって夕方返せば、実質 日をまたいで使わないというカウントになるため）**」
   ◎正体＝**ズレではなく、別々の2つの数字を同じ「日数」と呼んでいた。**
     ホテルの「3泊4日」と同じ。**日目 ＝ 泊数 ＋ 1**。式が1本あればどちらも嘘をつかない。

     | 呼び名 | 意味 | 入庫日に返したら |
     |---|---|---|
     | **◯日目**（`pitDayNo`） | 序数。**入れた日が1日目** | **1日目** |
     | **預かり日数**（`pitHoldDays`） | 泊数。**日をまたいだ数**＝返車日 − 入庫日 | **0日** |

   ⚠ すでに社内の定義は「0」側で揃っていた
      （概算 預かり日数の入力欄＝「当日仕上げは0」／ダッシュボードの占有＝入庫日＋預かり日数）。
      食い違っていたのは**実績カードの「預かり期間」表示だけ**（両端を数えていた）。
   🔴 **数え方はカレンダーの日付で。**（時刻は見ない＝夕方入庫でも翌日は2日目）
      ⚠ v1.58.0 まで外注・予約ビュー・カード詳細は「経過24時間」で数えていて、
        ホバー詳細だけカレンダーだった。**ここで揃えた。**
   🔴 **代車は別物**＝「使った日数」なので今までどおり両端を含める（ゆうた確認済み）。
   =================================================================== */
/* 「◯日目」＝入れた日を1日目。ISO日付（YYYY-MM-DD）から。 */
function pitDayNo(fromISO){
  const n = daysFromToday(fromISO);
  return (n == null) ? null : (1 - n);
}
/* 「◯日目」＝ミリ秒から（フローの記録・phaseAt 用）。時刻は切り捨ててカレンダーで数える。 */
function pitDayNoMs(ms){
  if (ms == null) return null;
  const d = new Date(+ms); if (isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((t - d) / 86400000) + 1;
}
/* 「預かり日数」＝泊数（日をまたいだ数）。当日返車は 0。分からなければ null。 */
function pitHoldDays(inISO, outISO){
  if (!inISO || !outISO) return null;
  const a = new Date(String(inISO) + 'T00:00:00'), b = new Date(String(outISO) + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}
/* 画面に出す「預かり日数」の言葉。⚠ 0 は「0日」ではなく **「当日返し」**（ゆうた選択）。 */
function pitHoldDaysText(inISO, outISO){
  const n = pitHoldDays(inISO, outISO);
  if (n == null) return null;
  if (n === 0) return '当日返し';
  return (n < 0) ? '—' : (n + '日');
}
window.pitDayNo = pitDayNo;
window.pitDayNoMs = pitDayNoMs;
window.pitHoldDays = pitHoldDays;
window.pitHoldDaysText = pitHoldDaysText;

function loanerDueLabel(c){                           // 代車期限：〜7/4（あと3日）
  if (!c.needLoaner) return '';
  if (!c.returnDate) return '代車（返車日 未定）';
  const n = daysFromToday(c.returnDate);
  let tail = '';
  if (n != null) tail = n > 0 ? '（あと' + n + '日）' : (n === 0 ? '（本日）' : '（' + Math.abs(n) + '日超過）');
  return '代車期限　〜' + fmtMD(c.returnDate) + tail;
}
function holdDaysLabel(c, workLabel){                 // 預かり：6/10〜（5日目）
  const head = workLabel ? (workLabel + '　') : '';
  if (!c.reserveDate) return head + '預かり日 未定';
  const dayNo = pitDayNo(c.reserveDate);              // 🔴 v1.59.0 数え方は pitDayNo に一本化（入庫日＝1日目）
  return head + '預かり ' + fmtMD(c.reserveDate) + '〜' + (dayNo ? '（' + dayNo + '日目）' : '');
}
function escAttr(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

function openNewReserve(){
  /* 🔴 v1.56.1（2026-08-06 の事故）**保存した直後（0.7秒以内）の「＋ 新規予約」は受け流す。**
     「＋ 新規予約」は上のバーにずっと出ているので、保存で画面が戻った**直後の2度目のクリック**が
     そのまま新しい予約を開いてしまう。ゆうたが「反応しないから6回押した」と言っていた日に、
     **空の予約が7〜8秒おきに6枚できた**のはこれ（押す → 保存されて戻る → 空の新規が開く →
     また押す → その空が保存される…の繰り返し）。
     ⚠ 黙って無視しない＝**必ず知らせる**（本当に壊れたと思われないため）。
     ⚠ 見張るのは「保存の直後」だけ。ふだんの「＋ 新規予約」は今までどおり効く。 */
  if (window.pitJustSaved && pitJustSaved()){
    if (window.pitToast) pitToast('保存しました。新しく予約を作るときは、もう一度押してください');
    return;
  }
  if (window.pitLog) pitLog('新規予約を開いた', { kind:'new' });
  const id = 'c' + Date.now();
  const card = {
    id, resNo: (window.pitGenResNo ? pitGenResNo() : ''),   // <i data-ic=numbers data-ics=16></i> 予約番号（ローマ字1＋5桁・例 K48201）
    status: 'reserved', boardId: null, bayId: null,   // 国産/輸入は未選択スタート（選ぶと片方のカレンダーが消える）
    division: null,   // 課は国産/輸入を選んだ瞬間に自動で入る
    log: [{ label: '予約作成', at: Date.now() }],
    customer: '', tel: '', maker: '', car: '', plate: '',
    reserveDate: ymd(new Date()), reserveTime: '', returnDate: '',
    bookedAt: ymd(new Date()),   // 予約受付日＝デフォルト今日（必要なら手で変更）v0.82.0
    // 予約担当＝ログインしている人の名前（本番ログイン接続後に自動入力）。今は空。v0.82.0
    reserveStaff: (typeof pitCurrentStaffName === 'function' ? (pitCurrentStaffName() || '') : ''),
    estHoldDays: '',   // 作業タイプ選択前は空欄（選ぶと自動で入る）
    estAmount: null,   // 概算金額＝作業タイプ選択で自動セット
    menu: '', workType: null, dropType: null, consult: false,
    needLoaner: false, needWash: false, urgent: false, memo: '',
    tentative: false,   // 仮予約フラグ（仮予約で登録ボタン／詳細の切替でON）v0.100.0
    workSpecials: [],  // その他・付加（保証/保険/社員）＝作業タイプとセットの時だけ付く。予約詳細/ホバー/印刷にのみ表示 v0.116.0
    internKind: ''     // その他・社内区分（''/used=中古/loanercar=代車/inhouse=内部）＝売上が立たないカード v2.6.0
  };
  /* v1.17.0：ここで作るカードは「下書き（_draft）」。
     ⚠ _draft が付いている間は **クラウドにも端末の本保存にも書かない**（db-pit.js が外す）＝
        「保存する／仮予約で登録／印刷して保存」を押すまで、どこにも数えられないし他の端末にも出ない。
     ⚠ ただし入力が消えると困るので、書きかけは blank-cards.js が
        **この端末の中だけ**に控える（次に新規予約を押すと「続きから？」と聞く）。 */
  card._draft = true;
  state.cards.push(card);
  if (window.PitDB) PitDB.save(true);   // 下書き以外の変化を反映（下書き自体は書かれない）
  openCard(id, 'page');   // 新規入庫予約＝全画面
}
function goToday(){
  state.reserveDate = new Date();
  if (state.currentView === 'reserve') renderReserve();
}
function addBoard(){    pitAlert('看板の追加は次フェーズで実装予定です', { code:'PF-0030' }); }
function editBays(){    pitAlert('PIT枠の編集は次フェーズで実装予定です', { code:'PF-0031' }); }
function editLoaners(){ pitAlert('代車の編集は次フェーズで実装予定です', { code:'PF-0032' }); }
/* ⚠ 月を送ったら、光らせていた1件は外す（別の月に居るものを光らせ続けない）。
   検索の語はそのまま＝月を送りながら探せる（v2.17.0） */
function prevMonth(){   state.resultMonth.setMonth(state.resultMonth.getMonth()-1); state.resultHit = null; renderResult(); }
function nextMonth(){   state.resultMonth.setMonth(state.resultMonth.getMonth()+1); state.resultHit = null; renderResult(); }
function closeMonth(){  pitAlert('月次集計締めは次フェーズで実装予定です', { code:'PF-0033' }); }
