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
     🚙 v2.173.0 ①に**代車**も出す（次に出す日の前の営業日に洗う。戻っていなければグレー）＝ _csLoanerWash
        🔴 v2.180.0 ②（今週の洗車予定）には代車を出さない＝お客様の車だけ（ゆうた 2026-10-12）
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

/* ===================================================================
   🚙 v2.173.0（ゆうた指定 2026-10-12）**洗車の段に代車も出す。**
   🗣「代車は戻ってきてから、次の顧客に出す前日に洗車する」
   🗣「一番大切なのは、その代車がまだ前の客の返車が終わってなくて**もどってきていない**ということは往々にしておこりえる」
   ◎1枚＝「次に出す貸出（札）1枚」。洗う日＝**その札の「から」の前の営業日**（定休・祝日は飛ばす）。
   ◎戻ったか＝**1つ前の札**が返却済みか（返ったかの物差しは loaner-free.js の pitLoanerBackOf 1本）。
     戻っていなければ未完と同じグレー（views.css の .is-retpend）＋「未返却」。完了は**押せない**。
   ◎カード … 左の帯は青／名前の場所は代車の名前（代車5）／作業タイプは出さない／
     担当は**出す相手の予約の担当**／下は「入庫 日付 時間」。出す相手はカードに出さない（ホバーの文字だけ）。
   ◎押すと**出す相手の予約詳細**。予約を通さない貸出（手動・緊急）は代車カレンダーへ。
   ◎洗った印は**札の側**（washDone＝洗った代車のid）。代車を差し替えたら印は外れる（別の車は洗っていない）。
   ⚠ 仮押さえ（hold）は貸出ではないので出さない。引退した代車も出さない。
   ⚠ 「代車は要るが、どれかは未定」は札が無いので出ない（どの車を洗うか決まらない）。
   ⚠ 「戻りが間に合わない」の赤は**出さない**（ゆうた 2026-10-12）。グレーだけ。
   =================================================================== */
const CS_LO_COLOR = '#3b82f6';
function _csPrevBiz(ds){
  const p = String(ds).split('-'); let d = new Date(+p[0], +p[1]-1, +p[2]);
  for (let i=0;i<14;i++){
    d.setDate(d.getDate()-1);
    const s = ymd(d);
    const isClosed = (window.PitCal ? PitCal.isClosed(s) : false);
    const isHol = !!(window.Holidays && Holidays.name && Holidays.name(s));
    if (!isClosed && !isHol) return s;
  }
  return ymd(d);
}
function _csMDW(ds){
  const p = String(ds||'').split('-'); if (p.length !== 3) return '';
  const d = new Date(+p[0], +p[1]-1, +p[2]);
  return (d.getMonth()+1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）';
}
function _csLoWashDone(a){ return !!a.washDone && a.washDone === a.loanerId; }
/* 洗う代車の一覧 [{ a, prev, lo, card, prevCard, washDay, back }]（洗う日が今週日曜まで） */
function _csLoanerWash(todayStr, sun){
  const S = window.state || {};
  const cards = S.cards || [];
  const byId = id => cards.find(c => c.id === id) || null;
  const deadCard = c => !!c && (c.status === 'returned' || c.status === 'cancelled' || c.status === 'scrap');
  const byLo = {};
  (S.loanerAssigns || []).forEach(a => {
    if (!a || a.hold || !a.loanerId || !a.fromDate) return;
    (byLo[a.loanerId] = byLo[a.loanerId] || []).push(a);
  });
  const out = [];
  (S.loaners || []).forEach(lo => {
    if (!lo || lo.retired) return;
    const list = (byLo[lo.id] || []).slice().sort((x,y) => String(x.fromDate).localeCompare(String(y.fromDate)));
    list.forEach((a, i) => {
      if (a.returned || a.fromDate < todayStr) return;
      const card = a.cardId ? byId(a.cardId) : null;
      if (a.cardId && (!card || deadCard(card))) return;
      const washDay = _csPrevBiz(a.fromDate);
      if (washDay > sun) return;
      const prev = i > 0 ? list[i-1] : null;
      const prevCard = (prev && prev.cardId) ? byId(prev.cardId) : null;
      let back = true;
      if (prev && !prev.returned){
        /* 🔴 v1.81.0 の決まり「車を返したら、代車も返ってきたことにする」。
           札の自動返却は代車カレンダー・予約詳細を開いた時の同期で付くので、それを待たずに**予約の返車済み**も見る */
        back = !!(prevCard && (prevCard.status === 'returned'
                  || (window.pitLoanerBackOf && pitLoanerBackOf(prevCard).back)));
      }
      out.push({ a, prev, lo, card, prevCard, washDay, back });
    });
  });
  return out;
}
function _csLoCard(x){
  const a = x.a, lo = x.lo, c = x.card;
  const stf = c ? (c.frontStaff || c.staff || '') : '';
  const _stf = stf ? (window.pitStaffShort ? pitStaffShort(stf) : (window.pitSurname ? pitSurname(stf) : stf)) : '';
  const nm = (c && window.pitCustSurname ? pitCustSurname(c) : (c ? c.customer : a.customer)) || '';
  /* ホバーの文字だけ＝出す相手と、戻っていない時はどこにいるか */
  let tip = '出す相手：' + (nm ? nm + '様' : '（予約以外の貸出）') + ((c && c.car) || a.car ? '　' + ((c && c.car) || a.car) : '');
  if (!x.back && x.prev){
    const pc = x.prevCard;
    const pn = (pc && window.pitCustSurname ? pitCustSurname(pc) : (pc ? pc.customer : x.prev.customer)) || '';
    tip += '\n未返却：' + (pn ? pn + '様から ' : '') + _csMDW(x.prev.toDate) + ' 戻り予定';
  }
  const click = c ? ("openDetail('" + c.id + "')") : "showView('loaner')";
  let h = '<div class="pit-card pcm cs-lo' + (x.back ? '' : ' is-retpend') + '" onclick="' + click + '" title="' + _csEsc(tip) + '" style="border-left-color:' + CS_LO_COLOR + ';">';
  h += '<div class="pcm-r"><span class="pcm-nm2"><span class="pcm-name">' + _csEsc(lo.name || '代車') + '</span></span>'
     + (x.back ? '' : '<span class="pcm-badges"><span class="cs-lo-back">未返却</span></span>') + '</div>';
  h += '<div class="pcm-r"><span class="pcm-car">' + _csEsc(lo.model || '') + '</span><span class="pcm-wash">洗車</span>'
     + (_stf ? '<span class="pcm-front">' + _csEsc(_stf) + '</span>' : '') + '</div>';
  h += '</div>';
  return h;
}
function _csLoItem(x){
  const a = x.a, c = x.card;
  const tm = (c && c.reserveDate === a.fromDate && c.reserveTime) ? ' ' + c.reserveTime : '';
  const ex = '<div class="cs-extra cs-lo-ex"><i data-ic=calendar data-ics=16></i> ' + (c ? '入庫 ' : '貸出 ') + _csMDW(a.fromDate) + tm + '</div>';
  const btn = x.back
    ? '<button class="cs-done" onclick="event.stopPropagation();csLoDone(\'' + a.id + '\')">✓ 完了</button>'
    : '<div class="cs-wait">戻ってから洗車</div>';
  return '<div class="cs-item"><div class="cs-cardwrap">' + _csLoCard(x) + ex + '</div>' + btn + '</div>';
}
function _csLoDoneItem(x){
  return '<div class="cs-item cs-doneitem"><div class="cs-cardwrap">' + _csLoCard(x) + '</div>'
    + '<button class="cs-undo" onclick="event.stopPropagation();csLoUndo(\'' + x.a.id + '\')">↩ 戻す</button></div>';
}
/* 時刻の並び（入庫の時間。無ければ最後） */
function _csLoSort(p, q){
  const t = x => (x.card && x.card.reserveDate === x.a.fromDate && window.pitTimeMin) ? pitTimeMin(x.card.reserveTime || '') : 99999;
  return String(p.a.fromDate).localeCompare(String(q.a.fromDate)) || (t(p) - t(q));
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

  /* 🚙 v2.173.0 洗う代車。条件は _csLoanerWash の1本
     🔴 v2.180.0（ゆうた 2026-10-12「今週の洗車予定は非表示でOK。今日明日には代車も含めて出す。今週は客の車だけ」）
     ＝ 代車は**今日・明日の段だけ**。拾う範囲も翌営業日まで（今週の洗車予定には出さない） */
  const loWash = _csLoanerWash(todayStr, nextBiz);

  let h = '<div class="cs-cols">';

  // ① 洗車（今日・明日）＝枠は1つ。中を「今日」「明日」の2グループに分ける v0.123.4
  {
    const washToday = washAll.filter(c => _wd(c) === todayStr);
    const st = split(washToday.sort(sortTime), 'washSalesDone');
    const sm = split(washTomorrow.sort(sortTime), 'washSalesDone');
    /* 🚙 v2.173.0 代車（洗う日が今日以前＝今日／翌営業日＝明日）。お客様の車の後ろに並べる */
    const loT = loWash.filter(x => x.washDay <= todayStr).sort(_csLoSort);
    const loM = loWash.filter(x => x.washDay > todayStr && x.washDay <= nextBiz).sort(_csLoSort);
    const loOpen = arr => arr.filter(x => !_csLoWashDone(x.a)).map(_csLoItem).join('');
    const tH = st.open.map(c=>_csCard(c,'wash',_csWashLabel(c),'洗車')).join('') + loOpen(loT);
    const mH = sm.open.map(c=>_csCard(c,'wash',_csWashLabel(c),'洗車')).join('') + loOpen(loM);
    /* 🔴 v1.151.0 どの札の日で出ているのかが分からないと現場が困るので、**全部に返車予定を付ける**
       （確定／未完／暫定 の印つき。文字は _csWashLabel の1本） */
    const bodyHtml = '<div class="cs-subh"><i data-ic=sun data-ics=16></i> 今日</div>'
      + (tH || '<div class="cs-empty">なし</div>')
      + '<div class="cs-subh"><i data-ic=moon data-ics=16></i> 明日 <small>（翌営業日 ' + nextBiz.slice(5).replace('-','/') + '）</small></div>'
      + (mH || '<div class="cs-empty">なし</div>');
    const doneHtml = st.done.concat(sm.done).map(c=>_csDoneCard(c,'wash')).join('')
      + loT.concat(loM).filter(x => _csLoWashDone(x.a)).map(_csLoDoneItem).join('');
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
    /* 🔴 v2.180.0（ゆうた 2026-10-12「今週の洗車予定は非表示でOK。今日明日には代車も含めて出す。今週は客の車だけ」）＝ここは**お客様の車だけ**（代車は出さない） */
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
/* 🚙 v2.173.0 代車の洗車 完了／戻す（印は札の側。値＝洗った代車のid） */
window.csLoDone = function(aid){
  const a = (state.loanerAssigns||[]).find(x=>x.id===aid); if (!a) return;
  a.washDone = a.loanerId;
  if (window.PitDB) PitDB.save();
  renderCarSales();
  if (window.pitToast) pitToast('✓ 完了にしました');
};
window.csLoUndo = function(aid){
  const a = (state.loanerAssigns||[]).find(x=>x.id===aid); if (!a) return;
  delete a.washDone;
  if (window.PitDB) PitDB.save();
  renderCarSales();
};
window.csUndo = function(id, task){
  const c = (state.cards||[]).find(x=>x.id===id); if (!c) return;
  const f = CS_DONEFLAG[task]; if (!f) return;
  c[f] = false;
  if (window.PitDB) PitDB.save();
  renderCarSales();
};
