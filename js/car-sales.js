/* ========================================
   car-sales.js
   車販作業ビュー（v0.99.42）
   1Y/3Mのコーティング作業・完TEL時のサービス洗車・ヘッドライト磨き等＝車販部門の仕事を別枠でまとめる。
   セクション：
     ① 洗車            ＝洗車対象(needWash)。枠内を「今日」「明日（翌営業日）」の2グループに分割 v0.123.4
   🔴 v1.151.0 洗車は**完TELを待たない**＝タスクボードにいる車も拾う。
      「いつ返す予定か」は **_shared/coreflow-return-plan.js の1本**（確定→未完→暫定→待・当の入庫日）。
      ⚠ 返車カレンダー・当日ビューは今までどおり「確定だけ」。**物差しが違う。混ぜない。**
     ② 今週の洗車予定  ＝翌営業日より後〜今週末(日曜)の洗車。**返車日が決まっていない車も同じ並びに混ぜる**（v1.152.0）
     ③ 車検ヘッドライト磨き ＝headlight フラグ（受注時に車検車へ設定）
     ④ コーティング・その他依頼 ＝**受注が取れたぶん**（v2.51.0）。依頼メモもここに出す
     ⑤ 直近1か月のコーティング・その他予定 ＝**まだ受注前のぶん**（v2.51.0）
   🔴🔴 v2.51.0（D-1・ゆうた 2026-09-01）**段を6つ→5つにした。「その他依頼事項」は畳んだ。**
      車販依頼は「バッジ」と「工程の印」の2つがあったが、**重複ではなく同じ1つのことの前半と後半**だった。
      ・バッジ … 予定側（拾い上げて予定を組む）／・工程の印 … 受注側（受注が取れた＝動ける）
      → **段を分ける軸は「受注が取れたか」1本。**入庫したかどうかでは分けない。
      ⚠ 新しい段を足す前に、「受注前か受注後か」で置き場所が決まらないか先に考えること。
   完了＝各カードの項目別「✓完了」で done フラグ→セクション下部にグレーで残し「↩戻す」可。本体フローは継続。
   カードは予約/タスクと同じコンパクトカード（クリックで予約詳細）。＝同じ客のカードが二重に存在する設計。
   ======================================== */

const CS_INTASK = ['check','estim','contact','parts','work','workDone','outsource'];

function _csEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];}); }

/* 翌営業日（定休・祝日をスキップ） */
function _csNextBizDay(){
  let d = new Date(); d.setHours(0,0,0,0);
  for (let i=0;i<14;i++){
    d.setDate(d.getDate()+1);
    const ds = ymd(d);
    const isClosed = (window.PitCal ? PitCal.isClosed(ds) : false);   /* 🚫 MHSの定休日カレンダー */
    const isHol = !!(window.Holidays && Holidays.name && Holidays.name(ds));
    if (!isClosed && !isHol) return d;
  }
  return d;
}
/* 今週末＝今週の日曜（今日が日曜なら今日）の日付文字列 */
function _csThisSunday(){
  let d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));   // 次の日曜（今日が日曜なら今日）
  return ymd(d);
}

/* 1Y/3M（コーティング）または 車販依頼（v2.6.0）が付いているか
   🚗 v2.6.0（ゆうた指定）「車販依頼」バッジは、この一覧に**拾い上げるための合図**。
   ⚠ v2.7.1 で名前だけ「車販」→「車販依頼」に変えた。**id（carsale）は同じ**。
      実際にやること（ルームクリーニング等）は依頼事項に直接書く。 */
function _csHasCoat(c){
  const ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes
            : (Array.isArray(c.workAddons) ? c.workAddons.concat(c.workType?[c.workType]:[]) : (c.workType?[c.workType]:[]));
  return ids.indexOf('coat1y') >= 0 || ids.indexOf('coat3m') >= 0 || ids.indexOf('carsale') >= 0;
}
function _csIsShaken(c){
  const ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType?[c.workType]:[]);
  return c.workType === 'shaken' || ids.indexOf('shaken') >= 0;
}
function _csActive(c){ return c.status !== 'returned' && c.status !== 'scrap'; }
/* 🔴🔴 v2.51.0（D-1・ゆうた 2026-09-01）**車販依頼は1つ。段は「受注が取れたか」で分ける。**
   🗣「バッジにしろ工程にしろ**受注後に発生**でしょ？受注前には結局は手はかけられないんだから、
   　　まだ直近1か月にいていい。**受注が取れた段階で車販部署としても実際に動ける**わけだから、
   　　コーティング・その他依頼に入れば成立しない？」
   🗣「6がなくなる」＝**「その他依頼事項」の段を畳む**
   ◎分かったこと … バッジと工程の印は**重複ではなかった**。同じ1つのことの前半と後半。
     ・作業タイプの「車販依頼」バッジ … 予定側（拾い上げて予定を組む）
     ・工程の窓の「その他 車販依頼」   … 受注側（受注が取れた＝動ける）
   ◎これで直る穴 … 前は「直近1か月」が受注済みを外していなかったので、
     受注OKを1台付けた瞬間に**上下2つの段に同時に出る**ところだった。
   ⚠ 物差し（受注が取れたか）は pit-share.js の `pitCarSalesOrdered` 1本。ここで条件を書かない。 */
function _csSalesish(c){ return _csHasCoat(c) || !!c.salesReq; }
function _csOrdered(c){ return window.pitCarSalesOrdered ? pitCarSalesOrdered(c) : !!(c.coatingOK || c.salesReq); }
/* 済んだ印＝「その他依頼事項」を畳んだので、そちらで押してあった印も引き継ぐ */
function _csCoatDone(c){ return !!c.coatingDone || !!c.salesReqDone; }
/* 🆕 v2.51.0（D-2）同じ車が2つ以上の段に出ている時の「他にもあり」 */
var _CSWHERE = {};

/* カード1枚＋完了ボタン（task=wash/headlight/coating/salesReq・doneは戻すボタン） */
const CS_DONEFLAG = { wash:'washSalesDone', headlight:'headlightDone', coating:'coatingDone', salesReq:'salesReqDone' };
function _csDupLine(c, sec){
  var w = (_CSWHERE[c.id] || []).filter(function(x){ return x !== sec; });
  if (!w.length) return '';
  return '<div class="cs-dup">他にもあり：' + w.join('・') + '</div>';
}
function _csCard(c, task, extra, sec){
  const inner = (typeof cardHtml === 'function') ? cardHtml(c, { compact:true }) : '';
  const ex = extra ? ('<div class="cs-extra">' + extra + '</div>') : '';
  /* 🔴 「他にもあり」は**完了ボタンの下**。上に入れると車ごとに高さが変わって、緑のボタンの列がガタつく */
  const dup = _csDupLine(c, sec);
  if (task){
    return '<div class="cs-item"><div class="cs-cardwrap">' + inner + ex + '</div>'
      + '<button class="cs-done" onclick="event.stopPropagation();csDone(\'' + c.id + '\',\'' + task + '\')">✓ 完了</button>' + dup + '</div>';
  }
  return '<div class="cs-item"><div class="cs-cardwrap">' + inner + ex + '</div>' + dup + '</div>';
}
function _csDoneCard(c, task){
  const inner = (typeof cardHtml === 'function') ? cardHtml(c, { compact:true }) : '';
  return '<div class="cs-item cs-doneitem"><div class="cs-cardwrap">' + inner + '</div>'
    + '<button class="cs-undo" onclick="event.stopPropagation();csUndo(\'' + c.id + '\',\'' + task + '\')">↩ 戻す</button></div>';
}

/* セクション枠 */
function _csSec(title, sub, bodyHtml, doneHtml){
  let h = '<div class="cs-sec">';
  h += '<div class="cs-sec-h">' + title + (sub ? ' <small>' + sub + '</small>' : '') + '</div>';
  h += '<div class="cs-sec-body">' + (bodyHtml || '<div class="cs-empty">なし</div>') + '</div>';
  if (doneHtml) h += '<div class="cs-done-strip"><div class="cs-done-lb">完了済み</div><div class="cs-done-row">' + doneHtml + '</div></div>';
  h += '</div>';
  return h;
}

function renderCarSales(){
  const body = document.getElementById('carsales-body');
  if (!body) return;
  const cards = state.cards || [];
  const nextBiz = ymd(_csNextBizDay());
  const sun = _csThisSunday();

  /* 🔴🔴 v1.151.0（ゆうた指定 2026-08-20）**洗車は完TELを待たない。**
     🗣「今日明日、今週の洗車予定に関しては、さっきの未完も含めて、**タスクボード上にあったとしても**、
     　　暫定返車予定・確定返車予定が今日明日 or 今週末にかぶるようなら**基本表示させる**」
     🗣「**とにかく状況によっては整備完了を待たずに洗車も始めないとスケジュールが追いつかなくなる**」

     ◎前（v1.150.0 まで）＝ `needWash` かつ **完TELを通った車だけ**。
       ＝ 今週返す約束をしている車でも、完TELを通るまで洗車の一覧に1台も出てこなかった。
     ◎今 ＝ **needWash なら、まだ盤面にいても拾う。**
       日付は `pitReturnPlanDate`（確定 → 未完 → 暫定 → 待・当の入庫日）1本で決める。
     ⚠ **まだ入庫していない車（reserved）とキャンセルは拾わない**（洗う車がここに無い）。
     ⚠ 🔴 **返車カレンダー・当日ビューは今までどおり「確定だけ」。** ここだけ物差しが違う（段取り用）。 */
  const washAll = cards.filter(c => c.needWash && _csActive(c)
                                 && c.status !== 'reserved' && c.status !== 'cancelled');
  /* 「いつ返す予定か」＝ return-slot.js の1本。ここで組み立てない */
  const _wd = c => (window.pitReturnPlanDate ? pitReturnPlanDate(c) : (c.returnDate || ''));

  // ① 明日の洗車
  const washTomorrow = washAll.filter(c => _wd(c) === nextBiz);
  // ② 今週の洗車予定（翌営業日より後〜今週日曜）＋ 返車日未定（区別）
  const washWeek = washAll.filter(c => { const d = _wd(c); return d && d > nextBiz && d <= sun; });
  /* ⚠ 「洗車で返車日未定」は**今までどおり完TELを通った車だけ**。
     　 ここまで広げると、日付がまだ何も決まっていない車が全部並んで一覧が埋まる（＝役に立たなくなる）。
     　 この枠の意味は「**完TELまで来たのに返車日が決まっていない＝要注意**」。変えない。 */
  const washNoDate = washAll.filter(c => c.returnStage && !_wd(c));

  // ③ 車検ヘッドライト磨き
  const headlight = cards.filter(c => c.headlight && _csActive(c));
  // ④ コーティング・その他依頼（1Y/3M・車販依頼＋受注OK）
  const coatReq = cards.filter(c => _csSalesish(c) && _csOrdered(c) && _csActive(c));
  // ⑤ 直近1か月のコーティング・その他予定（1Y/3M・車販依頼で 予約 or 入庫中）
  const monthAhead = (function(){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+31); return ymd(d); })();
  const todayStr = ymd(new Date());
  const coatPlan = cards.filter(c => _csSalesish(c) && !_csOrdered(c) && _csActive(c) && !c.returnStage && (
        (c.status==='reserved' && c.reserveDate && c.reserveDate <= monthAhead) ||
        (CS_INTASK.indexOf(c.status) >= 0)
      ));
  /* 🗑 v2.51.0（D-1）「その他依頼事項」は畳んだ。受注前＝直近1か月／受注後＝コーティング・その他依頼 の2つで足りる */

  /* 🔴 v1.70.0 物差しは state.js の pitTimeMin 1本（v1.69.0 まで文字くらべで並びが狂っていた）。
     ⚠ ここは洗車・コーティングの「その日にやる作業」の一覧なので、
        返車時間が無ければ入庫時刻で見る（カレンダーの「代用しない」とは別の目的）。 */
  const _tmin = t => (window.pitTimeMin ? pitTimeMin(t) : (t ? 0 : 99999));
  const sortTime = (a,b) => _tmin(a.returnTime||a.reserveTime||'') - _tmin(b.returnTime||b.reserveTime||'');
  /* 🔴 v1.151.0 並びも「いつ返す予定か」1本で（確定だけを見ていたので、暫定の車が最後尾に固まっていた） */
  const sortDate = (a,b) => String(_wd(a)||'9999').localeCompare(String(_wd(b)||'9999'));

  const split = (arr, flag) => ({ open: arr.filter(c=>!c[flag]), done: arr.filter(c=>c[flag]) });

  /* 🆕 v2.51.0（D-2・ゆうた 2026-09-01）**他にもあり**＝同じ車が2つ以上の段に出ている時に、欄外で知らせる。
     🗣「各カードの欄外でいいから **他あり** みたいな、ダブりがある事を伝える仕組みだけほしい」
     ⚠ 段の名前に「・」を入れないこと（区切りの「・」と混ざって読めなくなる）。ここは短い名前を使う。 */
  _CSWHERE = {};
  (function(){
    var put = function(name, arr){ (arr||[]).forEach(function(c){ (_CSWHERE[c.id] = _CSWHERE[c.id] || []).push(name); }); };
    put('洗車', washAll.filter(function(c){ var d=_wd(c); return d===todayStr || d===nextBiz; }));
    put('今週の洗車', washWeek.concat(washNoDate));
    put('ライト磨き', headlight);
    put('コーティング依頼', coatReq);
    put('1か月の予定', coatPlan);
  })();

  let h = '<div class="cs-cols">';

  // ① 洗車（今日・明日）＝枠は1つ。中を「今日」「明日」の2グループに分ける v0.123.4
  {
    const washToday = washAll.filter(c => _wd(c) === todayStr);
    const st = split(washToday.sort(sortTime), 'washSalesDone');
    const sm = split(washTomorrow.sort(sortTime), 'washSalesDone');
    /* 🔴 v1.151.0 どの札の日で出ているのかが分からないと現場が困るので、**全部に返車予定を付ける**
       （確定／未完／暫定 の印つき。文字は _csWashLabel の1本） */
    const bodyHtml = '<div class="cs-subh"><i data-ic=sun data-ics=16></i> 今日</div>'
      + (st.open.length ? st.open.map(c=>_csCard(c,'wash',_csWashLabel(c),'洗車')).join('') : '<div class="cs-empty">なし</div>')
      + '<div class="cs-subh"><i data-ic=moon data-ics=16></i> 明日 <small>（翌営業日 ' + nextBiz.slice(5).replace('-','/') + '）</small></div>'
      + (sm.open.length ? sm.open.map(c=>_csCard(c,'wash',_csWashLabel(c),'洗車')).join('') : '<div class="cs-empty">なし</div>');
    const doneHtml = st.done.concat(sm.done).map(c=>_csDoneCard(c,'wash')).join('');
    h += _csSec('<i data-ic=drop data-ics=16></i> 洗車', '今日・明日ぶん（暫定・未完も出します）', bodyHtml, doneHtml);
  }
  /* ② 今週の洗車予定
     🔄 v1.152.0（ゆうた指摘）**「洗車で返車日未定」を別枠から出して、同じ並びに混ぜた。**
     🗣「そうすると今度**このエリアの重要度が分からなくなる**から、
     　　**未定バッジをつけて一緒に並べちゃった方がよくない？**」
     ◎なぜ別枠がまずかったか
       枠が分かれていると「今週のぶん」と「未定のぶん」が**別の仕事に見える**。
       実際は **どちらも今週中に洗う車**で、未定の方はむしろ**日を決めに行かないといけない**＝重い。
       枠に隔離すると、下にあるほど軽く見える＝**重要度が逆に伝わる**。
     🔴 だから **1本の並びにして、確からしさは札で出す**（確定＝札なし／未完／暫定／未定）。
     ⚠ 日付が無い車は並びの最後（sortDate が 9999 として扱う）。**消えはしない。** */
  {
    const weekAll = washWeek.concat(washNoDate);
    const sw = split(weekAll.sort(sortDate), 'washSalesDone');
    let bodyHtml = (sw.open.length ? sw.open.map(c=>_csCard(c,'wash',_csWashLabel(c),'今週の洗車')).join('')
                                   : '<div class="cs-empty">なし</div>');
    const doneHtml = sw.done.map(c=>_csDoneCard(c,'wash')).join('');
    h += _csSec('<i data-ic=calendar data-ics=16></i> 今週の洗車予定', '〜今週日曜（暫定・未完・未定も一緒に）', bodyHtml, doneHtml);
  }
  // ③ 車検ヘッドライト磨き
  {
    const s = split(headlight.sort(sortDate), 'headlightDone');
    h += _csSec('<i data-ic=search data-ics=16></i> 車検ヘッドライト磨き', '',
      s.open.map(c=>_csCard(c,'headlight','','ライト磨き')).join(''),
      s.done.map(c=>_csDoneCard(c,'headlight')).join(''));
  }
  // ④ コーティング・その他依頼
  {
    /* 🔴 v2.51.0（D-1）受注が取れたぶん。畳んだ「その他依頼事項」の依頼メモもここに出す。
       ⚠ 済んだ印は**2本とも見る**＝畳む前に押してあった印を引き継ぐ（済んだ仕事がまた出てこないように）。 */
    const s = { open: coatReq.sort(sortDate).filter(function(c){ return !_csCoatDone(c); }),
                done: coatReq.filter(_csCoatDone) };
    const _memo = function(c){
      var m = (c.salesReqMemo || '').trim();
      return _csRetLabel(c) + (m ? '<div class="cs-memo"><i data-ic=pencil data-ics=16></i> ' + _csEsc(m) + '</div>' : '');
    };
    h += _csSec('<i data-ic=sparkle data-ics=16></i> コーティング・その他依頼', '受注が取れたぶん／返車予定日つき',
      s.open.map(c=>_csCard(c,'coating',_memo(c),'コーティング依頼')).join(''),
      s.done.map(c=>_csDoneCard(c,'coating')).join(''));
  }
  // ⑤ 直近1か月のコーティング・その他予定（完了なし＝予定一覧）
  {
    h += _csSec('<i data-ic=calendar data-ics=16></i> 直近1か月のコーティング・その他予定', 'まだ受注前のぶん（受注が取れたら上の段へ移ります）',
      coatPlan.sort((a,b)=>String(a.reserveDate||'9999').localeCompare(String(b.reserveDate||'9999'))).map(c=>_csCard(c,null,_csInLabel(c),'1か月の予定')).join(''),
      '');
  }
  /* 🗑 v2.51.0（D-1・ゆうた 2026-09-01）「その他依頼事項」の段は畳んだ。
     ＝ 車販依頼はバッジでも工程の印でも同じ1つ。**受注が取れたかどうか**だけで段が決まる。
     ⚠ ここに新しい段を足す前に、「受注前か受注後か」で置き場所が決まらないか先に考えること。 */

  h += '</div>';
  body.innerHTML = h;
}
window.renderCarSales = renderCarSales;

/* 返車予定日ラベル */
function _csRetLabel(c){
  if (c.returnDate){
    const d = new Date(c.returnDate+'T00:00:00');
    if (!isNaN(d)) return '<i data-ic=car data-ics=16></i> 返車 ' + (d.getMonth()+1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）' + (c.returnTime?' '+c.returnTime:'');
  }
  return '<i data-ic=car data-ics=16></i> 返車日未定';
}
/* 🆕 v1.151.0 洗車の行に出す「いつ返す予定か」＋その確からしさ。
   🔴 日付も印も return-slot.js の1本から。ここで条件を書き写さない。
     ・確定 … 完TELを通った日（印なし＝ふつう）
     ・未完 … 盤面のまま確定返車日が入っている（🟠 未完）
     ・暫定 … 受注のときのお客様への約束（🟠枠 暫定＝日が動くことがある）
     ・待・当 … 入庫日に返る車（暫定と同じ扱いで出す） */
function _csWashLabel(c){
  const d = window.pitReturnPlanDate ? pitReturnPlanDate(c) : (c.returnDate || '');
  const k = window.pitReturnPlanKind ? pitReturnPlanKind(c) : '';
  let badge = '';
  if (k === 'pending' && window.pitPendingBadge) badge = pitPendingBadge('mini') + ' ';
  else if ((k === 'plan' || k === 'sameday') && window.pitPlanBadge) badge = pitPlanBadge('mini') + ' ';
  else if (k === 'tbd' && window.pitTbdBadge) badge = pitTbdBadge('mini') + ' ';   /* 🆕 v1.152.0 */
  if (d){
    const dt = new Date(d + 'T00:00:00');
    if (!isNaN(dt)) return badge + '<i data-ic=car data-ics=16></i> 返車 ' + (dt.getMonth()+1) + '/' + dt.getDate()
      + '（' + '日月火水木金土'[dt.getDay()] + '）' + (c.returnTime ? ' ' + c.returnTime : '');
  }
  return badge + '<i data-ic=car data-ics=16></i> 返車日未定';
}

/* 入庫/予約ラベル（コーティング予定用） */
function _csInLabel(c){
  if (c.status === 'reserved'){
    if (c.reserveDate){ const d=new Date(c.reserveDate+'T00:00:00'); if(!isNaN(d)) return '<i data-ic=calendar data-ics=16></i> 入庫予約 '+(d.getMonth()+1)+'/'+d.getDate(); }
    return '<i data-ic=calendar data-ics=16></i> 予約';
  }
  /* 🔴 v1.164.0 カードの状態の言葉は pit-share.js の pitCardStatusText 1本（予約キャンセル／未入庫を言い分ける） */
  return '<i data-ic=factory data-ics=16></i> 入庫中（' + (window.pitCardStatusText ? pitCardStatusText(c) : (window.statusLabel ? statusLabel(c.status) : c.status)) + '）';
}

/* 完了／戻す */
window.csDone = function(id, task){
  const c = (state.cards||[]).find(x=>x.id===id); if (!c) return;
  const f = CS_DONEFLAG[task]; if (!f) return;
  c[f] = true;
  if (window.logFlow) logFlow(c, '車販作業 完了（'+task+'）');
  if (window.PitDB) PitDB.save();
  renderCarSales();
  if (window.pitToast) pitToast('✓ 完了にしました');
};
window.csUndo = function(id, task){
  const c = (state.cards||[]).find(x=>x.id===id); if (!c) return;
  const f = CS_DONEFLAG[task]; if (!f) return;
  c[f] = false;
  if (window.PitDB) PitDB.save();
  renderCarSales();
};
