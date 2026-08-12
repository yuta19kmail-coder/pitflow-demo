/* ========================================
   undetermined.js  -  未定ビュー（入庫：未定/未入庫 ・ 返車：未定）／PitFlow v0.31.0
   ----------------------------------------
   ◎工程の受け皿（ゆうた設計 2026-06-05）
     【入庫】
       ・未定（intakeTbd）＝予約は取ったが入庫日が未定（パーツ待ち等）。日付が決まったら予約へ。
       ・未入庫（cancelled）＝来店なし/連絡なしでキャンセル。1ヶ月後に自動アーカイブ（archived）。
     【返車】
       ・未定（returnTbd）＝作業完了したが返車日が未定（完TEL待ち）。完TELで返車カレンダーへ。
   ◎流れ：予約 →(入庫済)→ タスク →(作業完了)→ 返車・未定 →(完TEL)→ 返車カレンダー →(返車済)→ 実績
   ======================================== */

const UNDET_ARCHIVE_DAYS = 30;   // 未入庫の自動アーカイブまでの日数

/* 起動・描画時に走らせる：古い未入庫を自動アーカイブ */
function pitAutoArchive(){
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  (state.cards || []).forEach(c => {
    if (c.status === 'cancelled' && !c.archived && c.cancelledAt){
      const p = c.cancelledAt.split('-');
      const cd = new Date(+p[0], +p[1]-1, +p[2]);
      const days = Math.floor((today - cd) / 86400000);
      if (days >= UNDET_ARCHIVE_DAYS){ c.archived = true; changed = true; }
    }
  });
  if (changed && window.PitDB) PitDB.save();
}
window.pitAutoArchive = pitAutoArchive;

function _undTeamColor(c){ return (c.boardId === 'import') ? '#ec4899' : '#1db97a'; }

/* 予約ビュー内「未定」タブ：3カラム横並び（仮予約／未定（パーツ待ち）／未入庫（キャンセル））。
   返車ビュー未定と同じ通常カード方式（cardHtml compact）。v0.100.0 仮予約カラム新設。
   ・仮予約 ＝ status:reserved かつ tentative。入庫日が入っていれば予約カレンダーにも「仮」で出る。本予約化は予約詳細の⋮メニュー。
   ・未定（パーツ待ち）＝ intakeTbd（仮予約を除く）。カードの<i data-ic=calendar data-ics=16></i>で入庫日を入れて予約へ。
   ・未入庫（キャンセル）＝ cancelled。↩で予約に戻す。 */
function renderReserveTbd(){
  ['reserve-day-list','reserve-week','reserve-month','reserve-2month'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const wrap = document.getElementById('reserve-tbd');
  if (!wrap) return;
  wrap.style.display = '';
  pitAutoArchive();

  /* 🔵 v1.74.0（ゆうた指定）承認待ちBOX。
     ⚠ 予約段階だけで絞らない＝**承認されないまま入庫してしまった車も拾う**（決めごと②で通すため）。
        返車済み・キャンセル・アーカイブだけ外す。取り残したら「承認され忘れ」に誰も気づけない。 */
  const approval  = state.cards.filter(c => c.approvalPending && !c.archived
                                            && c.status !== 'returned' && c.status !== 'cancelled' && c.status !== 'scrap');
  const tentative = state.cards.filter(c => c.status === 'reserved' && c.tentative && !c.approvalPending);
  const intakeTbd = state.cards.filter(c => c.status === 'reserved' && c.intakeTbd && !c.tentative);
  const noShow    = state.cards.filter(c => c.status === 'cancelled' && !c.archived);

  const card = c => (typeof cardHtml === 'function') ? cardHtml(c, { compact: true }) : '';
  const item = (c, act) => '<div class="rtbd-item">' + card(c) + (act || '') + '</div>';
  const empty = '<div class="today-empty">なし</div>';
  const col = (title, n, bodyHtml, note) =>
    '<div class="ret-tbd-col"><div class="ret-tbd-h">' + title + '<span class="und-cnt">' + n + '</span></div>'
    + '<div class="ret-tbd-body">' + bodyHtml + '</div>'
    + (note ? '<div class="und-note">' + note + '</div>' : '') + '</div>';

  let h = '<div class="ret-tbd-cols">';

  /* 🔵 承認待ち＝いちばん左（ゆうた指定）。カードごとに「開いて承認する」を下げる。 */
  h += col('<span class="appr-edge">承</span> 承認待ち <small>（承認まち）</small>', approval.length,
    approval.length ? approval.map(c => item(c, '<button class="rtbd-act go" onclick="event.stopPropagation();openDetail(\'' + c.id + '\')"><i data-ic=check data-ics=16></i> 開いて承認する</button>')).join('') : empty,
    '承認待ちでも<b>入庫カレンダー・代車の枠は埋まっています</b>。開いて内容を確認し、表紙を印刷して承認すると、ここから消えて通常の予約になります。');

  h += col('<i data-ic=pencil data-ics=16></i> 仮予約 <small>（仮おさえ）</small>', tentative.length,
    tentative.length ? tentative.map(c => item(c, '')).join('') : empty,
    '入庫日が決まっている仮予約は、予約カレンダーにも「仮」で出ます。本予約に確定するときはカードを開いて⋮メニューから。');

  h += col('<i data-ic=parking data-ics=16></i> 未定 <small>（パーツ待ち・入庫日決まらず）</small>', intakeTbd.length,
    intakeTbd.length ? intakeTbd.map(c => item(c, '<button class="rtbd-act" onclick="event.stopPropagation();pitUndSetIntake(\'' + c.id + '\')"><i data-ic=calendar data-ics=16></i> 入庫日を入れる</button>')).join('') : empty,
    'カードの<i data-ic=calendar data-ics=16></i>で入庫日を入れると予約カレンダーへ移ります。');

  h += col('<i data-ic=ban data-ics=16></i> 未入庫 <small>（来店なし・キャンセル）</small>', noShow.length,
    noShow.length ? noShow.map(c => item(c, '<button class="rtbd-act" onclick="event.stopPropagation();pitUndRestore(\'' + c.id + '\')">↩ 予約に戻す</button>')).join('') : empty,
    '※ 1ヶ月（' + UNDET_ARCHIVE_DAYS + '日）たつと自動でキャンセル・アーカイブされます。');

  h += '</div>';
  wrap.innerHTML = h;
}
window.renderReserveTbd = renderReserveTbd;

/* 返車ビュー内「未定」タブ：4カラム（完TEL待ち／返車日未定／返車時間未定／入金待ち）。標準カード表示。
   🔴 v1.60.0（ゆうた指定）「返車未定」を **返車日未定** と **返車時間未定** の2つに割った。
   ・完TEL待ち　　＝完TEL依頼した（金額入力済・まだ電話していない）
   ・返車日未定　　＝完TEL済だが返車日がまだ
   ・返車時間未定　＝日にちは決まったが時間がまだ（空 か「未定」）
   ・入金待ち　　　＝返車済みで売掛（入金日待ち）
   振り分けの判断は **return-slot.js の pitReturnPlace 1本**。ここに条件を書き写さない。 */
function renderReturnTbd(){
  ['return-day-list','return-week','return-month','return-2month'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const wrap = document.getElementById('return-tbd');
  if (!wrap) return;
  wrap.style.display = '';

  /* 🔴 v1.60.0 **どの車がどこに出るかは return-slot.js の pitReturnPlace ひとつで決める。**
     ここに「returnStage が…かつ returnDate が…」と条件を書き写さないこと。
     書き写した瞬間、ホバー入力・返車ポップアップ・この一覧の3か所が食い違い、
     「入れたのに移動しない」（今回のバグ）が必ず戻ってくる。 */
  const at = p => state.cards.filter(c => (window.pitReturnPlace ? pitReturnPlace(c) : null) === p);
  const callWait = at('callWait');
  const dateTbd  = at('dateTbd');
  const timeTbd  = at('timeTbd');

  // クリックは予約詳細（openDetail）。完TEL/返車の入力はマウスオーバー情報カード(card-hover.js)で行う。
  const card = c => (typeof cardHtml === 'function') ? cardHtml(c, { compact: true }) : '';

  let h = '<div class="ret-tbd-cols">';
  h += '<div class="ret-tbd-col"><div class="ret-tbd-h"><i data-ic=phone data-ics=16></i> 完TEL待ち <small>（完TEL依頼ぶん）</small><span class="und-cnt">' + callWait.length + '</span></div>';
  h += '<div class="ret-tbd-body">' + (callWait.length ? callWait.map(card).join('') : '<div class="today-empty">なし</div>') + '</div>';
  h += '<div class="und-note">完TELしたら、カードにマウスを乗せて確定金額・返車日時を入れてください。</div></div>';

  h += '<div class="ret-tbd-col"><div class="ret-tbd-h"><i data-ic=calendar data-ics=16></i> 返車日未定 <small>（完TEL済・日にち待ち）</small><span class="und-cnt">' + dateTbd.length + '</span></div>';
  h += '<div class="ret-tbd-body">' + (dateTbd.length ? dateTbd.map(card).join('') : '<div class="today-empty">なし</div>') + '</div>';
  h += '<div class="und-note">返車日が入るとここから外れます（時間もそろえば返車カレンダーへ）。</div></div>';

  /* ⚠ ここの車は**返車カレンダーの「時刻未定」にも同時に出る**（ゆうた確認済み）。
     日にちは決まっているので、その日の予定として見えていないと困るため。 */
  h += '<div class="ret-tbd-col"><div class="ret-tbd-h"><i data-ic=clock data-ics=16></i> 返車時間未定 <small>（日にち決定・時間待ち）</small><span class="und-cnt">' + timeTbd.length + '</span></div>';
  h += '<div class="ret-tbd-body">' + (timeTbd.length ? timeTbd.map(card).join('') : '<div class="today-empty">なし</div>') + '</div>';
  h += '<div class="und-note">返車カレンダーの「時刻未定」にも出ています。時間が入るとここから外れます。</div></div>';

  // 💰 入金待ち（売掛）＝返車済みで「入金日を分ける」ON・入金日まだ の車。日付を入れると消えて実績に入金日が埋まる v0.121.0
  const payWait = state.cards.filter(c => c.status === 'returned' && c.paymentSeparate && !c.paymentDate);
  const _fmd = d => d ? (window.fmtMD ? fmtMD(d) : d) : '—';
  const _yen = n => (n != null && n !== '') ? '¥' + Number(n).toLocaleString() : '—';
  h += '<div class="ret-tbd-col"><div class="ret-tbd-h"><i data-ic=money data-ics=16></i> 入金待ち <small>（売掛・返車済）</small><span class="und-cnt">' + payWait.length + '</span></div>';
  h += '<div class="ret-tbd-body">' + (payWait.length ? payWait.map(c =>
        '<div class="rtbd-item">' + card(c)
        + '<div class="rtbd-pay"><span class="rtbd-payinfo">返車 ' + _fmd(c.returnDateFinal || c.returnDate) + ' ・ ' + _yen(c.amountFinal) + '</span>'
        + '<label class="rtbd-paylb">入金日 <input type="date" class="rtbd-paydate" value="" onclick="event.stopPropagation()" onchange="pitSetPaymentDate(\'' + c.id + '\',this.value)"></label></div>'
        + '</div>'
      ).join('') : '<div class="today-empty">なし</div>') + '</div>';
  h += '<div class="und-note">入金日を入れると、入金待ちから消え、実績カードに入金日が記録されます。</div></div>';

  h += '</div>';
  wrap.innerHTML = h;
}
window.renderReturnTbd = renderReturnTbd;

/* 💰 入金待ち → 入金日を確定（実績カードの入金日も同時に埋まる）v0.121.0 */
window.pitSetPaymentDate = function(id, v){
  const c = state.cards.find(x => x.id === id);
  if (!c || !v) return;
  c.paymentDate = v;
  if (window.logFlow) logFlow(c, '入金日を記録（' + v + '）');
  if (window.PitDB) PitDB.save();
  renderReturnTbd();
  if (window.pitToast) pitToast('入金日 '+ v + 'を記録しました');
};

function _undRow(c, kind){
  const wt = (state.workTypes || []).find(w => w.id === c.workType);
  const teamColor = _undTeamColor(c);
  let meta = '';
  if (kind === 'noShow' && c.cancelledAt){
    const p = c.cancelledAt.split('-');
    const left = UNDET_ARCHIVE_DAYS - Math.floor((new Date().setHours(0,0,0,0) - new Date(+p[0], +p[1]-1, +p[2])) / 86400000);
    meta = '<span class="und-meta">キャンセル ' + c.cancelledAt.slice(5).replace('-', '/') + '・あと' + Math.max(0, left) + '日</span>';
  }
  let act = '';
  if (kind === 'intakeTbd') act = '<button class="und-act" onclick="event.stopPropagation();pitUndSetIntake(\'' + c.id + '\')"><i data-ic=calendar data-ics=16></i> 入庫日を入れる</button>';
  if (kind === 'noShow')    act = '<button class="und-act" onclick="event.stopPropagation();pitUndRestore(\'' + c.id + '\')">↩ 予約に戻す</button>';
  if (kind === 'returnTbd') act = '<button class="und-act" onclick="event.stopPropagation();pitUndComplete(\'' + c.id + '\')"><i data-ic=phone data-ics=16></i> 完TEL → 返車日</button>';

  let h = '<div class="und-row" style="--team:' + teamColor + '" onclick="openDetail(\'' + c.id + '\')">';
  h += '<div class="und-main"><div class="und-headline"><b>' + ((window.pitCustName?pitCustName(c):c.customer) || '（未入力）') + ' 様</b>'
     + (c.car ? '<span class="und-car">' + (c.maker ? c.maker + ' ' : '') + c.car + '</span>' : '') + '</div>'
     + '<div class="und-sub">' + (c.plate ? c.plate + '　' : '') + (wt ? wt.label : '') + meta + '</div></div>';
  h += '<div class="und-actwrap">' + act + '</div>';
  h += '</div>';
  return h;
}

/* 入庫・未定 → 入庫日を入れて予約へ戻す（プロンプトで日付） */
window.pitUndSetIntake = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  /* 🔵 v1.75.0 ブラウザ純正の prompt をやめてアプリ内の入力ダイアログ（pitAskText）に。 */
  pitAskText('入庫日を入れてください（例 2026-06-20）', c.reserveDate || ymd(new Date()), { ok:'入れる' }).then(function (d) {
    if (!d) return;
    c.reserveDate = String(d).trim();
    c.intakeTbd = false;
    if (window.logFlow) logFlow(c, '入庫日を設定（予約へ）');
    if (window.PitDB) PitDB.save();
    renderReserveTbd();
    if (window.pitToast) pitToast(''+ c.reserveDate + 'の予約に入れました');
  });
};

/* 未入庫 → 予約に戻す（再度連絡が来た等） */
window.pitUndRestore = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  c.status = 'reserved';
  c.cancelled = false; c.cancelledAt = null; c.archived = false;
  if (!c.reserveDate) c.intakeTbd = true;   // 日付が無ければ未定へ
  if (window.logFlow) logFlow(c, '未入庫から予約に復帰');
  if (window.PitDB) PitDB.save();
  renderReserveTbd();
  if (window.pitToast) pitToast('↩ 予約に戻しました');
};

/* 返車・未定 → 完TEL：返車日を入れて返車カレンダーへ */
window.pitUndComplete = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  pitAskText('完TEL！ 返車日を入れてください（例 2026-06-20）', c.returnDate || ymd(new Date()), { ok:'入れる' }).then(function (d) {
    if (!d) return;
    c.returnDate = String(d).trim();
    c.returnTbd = false;
    c.completeCallAt = ymd(new Date());
    if (window.logFlow) logFlow(c, '完TEL → 返車日設定');
    if (window.PitDB) PitDB.save();
    renderReturnTbd();
    if (window.pitToast) pitToast(''+ c.returnDate + 'の返車予定に入れました');
  });
};
