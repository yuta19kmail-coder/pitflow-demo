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
      if (days >= UNDET_ARCHIVE_DAYS){
        c.archived = true; changed = true;
        /* 🔴 v1.155.0（ゆうた確定）**ここで代車の予定も一緒に消す。**
           🗣「もしくは30日後、消去したタイミングで同時にスケジュールも消滅するって流れでいいでしょ？」
           ＝ 未入庫に入った時点では残す（あとから連絡が来ることがよくあるため）。
              30日たって自動アーカイブまで来たら**もう戻らない**ので、そこで外す。
           🔴 中身は loaner.js の `pitLoanerReleaseForCard` 1本（返却済みの貸出には触らない）。 */
        if (window.pitLoanerReleaseForCard){
          try { pitLoanerReleaseForCard(c.id, UNDET_ARCHIVE_DAYS + '日たって自動アーカイブ'); } catch (e) {}
        }
      }
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
  /* 🔴 v1.101.0 未入庫＝**来なかっただけ**の車。
     ⚠ 人が押した「予約キャンセル」（`cancelled:true`）は、押した時点でアーカイブして
        お客様の来店履歴へ移すので、ここには並べない（＝もう待たないから）。 */
  const noShow    = state.cards.filter(c => c.status === 'cancelled' && !c.archived && !c.cancelled);

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

  h += col('<i data-ic=ban data-ics=16></i> 未入庫 <small>（来店なし）</small>', noShow.length,
    noShow.length ? noShow.map(c => item(c, _undNoShowActs(c))).join('') : empty,
    '<b>入庫日を過ぎても入庫済みにならなかった予約は、ここへ自動で入ります</b>（仮予約と承認待ちは動きません）。'
    /* 🔴 v1.139.0 アーカイブされたあと**どうなるか**まで書く。
       ⚠ v1.138.0 までは「自動でアーカイブされます」だけで、
          そのあと**このボタンが消える**ことが誰にも見えていなかった。
       ⚠ v1.139.0 からは「戻せなくなる」ではなく「**管理者だけになる**」＝カードの ⋮ から戻せる。 */
    + '連絡が来たら「↩ 予約に戻す」。<br>'
    /* 🔴 v1.155.0（ゆうた確定）代車の扱いを**ここに書く**。
       ⚠ 書かないと「未入庫なのに代車が押さえられたまま」に誰も気づけない。 */
    + '🚗 <b>代車の予定はそのまま残ります</b>（あとから連絡が来てそのまま入庫することがあるため）。'
    + '外していいと決まったら「代車予定クリア」。<br>'
    + '※ ' + UNDET_ARCHIVE_DAYS + '日たつと自動でアーカイブされ、'
    + '<b>そのあと戻せるのは管理者だけ</b>になります（カードを開いて ⋮ から）。'
    + 'このとき<b>代車の予定も一緒に消えます</b>。');

  h += '</div>';
  wrap.innerHTML = h;
}
window.renderReserveTbd = renderReserveTbd;

function _undEsc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

/* 🆕 v1.155.0（ゆうた指定 2026-08-20）未入庫のカードの下に出すボタン。
   🗣「**未入庫に入る時点では残しておいて、で代車有の場合は
   　　下に出る予約に戻るを半分サイズにして 代車予定クリア ボタンを作って
   　　ポップアップの確認画面を挟む。この部分はあくまで人が判断する**」

   ・代車の予定が無い車 … 今までどおり「↩ 予約に戻す」1つ（幅いっぱい）
   ・代車の予定がある車 … **半分ずつ2つ**（予約に戻す／代車予定クリア）＋
   　　　　　　　　　　　 **何の代車がいつまで押さえられているか**を1行で出す
   🔴 判定も文字も loaner.js の `pitLoanerPlanOf` 1本。ここで組み立てない。 */
function _undNoShowActs(c){
  const back = 'event.stopPropagation();pitUndRestore(\'' + c.id + '\')';
  const lo = (window.pitLoanerPlanOf ? pitLoanerPlanOf(c.id) : { n: 0, text: '' });
  if (!lo.n) return '<button class="rtbd-act" onclick="' + back + '">↩ 予約に戻す</button>';
  return '<div class="rtbd-lo"><i data-ic=car data-ics=14></i> 代車の予定あり：' + _undEsc(lo.text) + '</div>'
    + '<div class="rtbd-acts">'
    + '<button class="rtbd-act half" onclick="' + back + '">↩ 予約に戻す</button>'
    + '<button class="rtbd-act half warn" onclick="event.stopPropagation();pitUndClearLoaner(\'' + c.id + '\')">'
    + '<i data-ic=car data-ics=14></i> 代車予定クリア</button>'
    + '</div>';
}

/* 🆕 v1.155.0 未入庫の車の代車の予定を、**人が決めて**外す。
   🔴 ポップアップで**何が消えるかを全部言う**（代車キャンセルの窓と同じ決めごと）。
   🔴 外す中身は loaner.js の1本（返却済みの貸出には触らない）。ここに書き写さない。 */
window.pitUndClearLoaner = function(id){
  const c = (state.cards || []).find(x => x.id === id);
  if (!c) return;
  const lo = (window.pitLoanerPlanOf ? pitLoanerPlanOf(id) : { n: 0, text: '' });
  if (!lo.n){
    if (window.pitToast) pitToast('この予約に外せる代車の予定はありません', 'PF-3034');
    renderReserveTbd(); return;
  }
  const nm = ((window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || 'この予約');
  const ask = window.pitAsk
    ? pitAsk(nm + ' の代車の予定を外しますか？', { danger: true, ok: '代車予定をクリアする',
        detail: '外すもの：' + lo.text + '\n'
              + '代車カレンダーから消え、予約カードの代車の設定（代車 必要のチェック・使用代車・貸出日・返却日）も空になります。\n'
              + '⚠ このあと「予約に戻す」で戻しても、代車は戻りません（押さえ直しになります）。' })
    : Promise.resolve(true);
  ask.then(function(yes){
    if (!yes) return;
    const r = (window.pitLoanerReleaseForCard ? pitLoanerReleaseForCard(id, '未入庫の一覧から手で外した') : { n: 0, text: '' });
    if (window.PitDB) PitDB.save();
    renderReserveTbd();
    if (window.pitToast) pitToast('代車の予定を外しました（' + r.text + '）');
  });
};

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

/* ===================================================================
   未入庫 → 予約に戻す（再度連絡が来た等）
   🔴 v1.101.1（ゆうた指定）**押した瞬間に戻すのをやめて、入庫日を選ばせる。**

   ◎なぜ変えたか
     v1.101.0 は押すとその場で予約へ戻していたが、**入庫日は過ぎたまま**。
     過ぎた日付の予約は、次に画面を描いた瞬間に**また未入庫へ落ちる**（overdue-pit.js）。
     ＝押した人から見ると「戻したのに戻らない」「日付が消えて未定に行った」になる。
     🔴 **未入庫から戻す＝新しい入庫日を決めること**、と割り切った。

   ◎出す窓（ゆうた指定）
     ・**今日の入庫予定にする**
     ・**N月N日（カレンダーピッカー）の入庫予定にする**
     の2つから選んで実行。

   ⚠ **過ぎた日は選ばせない**（`min`＝今日）。選べてしまうと、また未入庫へ落ちて堂々巡りになる。
   ⚠ ブラウザ純正のダイアログは使わない（v1.75.0）。当日ビューのアクションシートと同じ見た目を借りる。
   =================================================================== */
function _undFmtMD(sv){
  const p = String(sv || '').split('-');
  if (p.length < 3) return '';
  const d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  if (isNaN(d.getTime())) return String(sv || '');
  return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
}
function _undEsc(sv){ return String(sv == null ? '' : sv).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

window.pitUndRestore = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const td = ymd(new Date());
  let back = document.getElementById('pit-und-restore');
  if (!back){
    back = document.createElement('div');
    back.id = 'pit-und-restore';
    back.className = 'modal-backdrop';
    pitModalOutside(back, function(){ pitUndRestoreClose(); });
    document.body.appendChild(back);
  }
  const nm = (window.pitCustName ? pitCustName(c) : c.customer) || '（未入力）';
  back.innerHTML =
    '<div class="ta-sheet">'
    + '<div class="ta-head"><b>' + _undEsc(nm) + ' 様</b>　' + _undEsc((c.maker ? c.maker + ' ' : '') + (c.car || ''))
      + (c.plate ? '<span class="ta-plate">' + _undEsc(c.plate) + '</span>' : '')
      + '<div class="ta-sub">予約に戻します。<b>入庫日を決めてください</b>'
      + (c.reserveDate ? '（元の入庫予定 ' + _undFmtMD(c.reserveDate) + '）' : '')
      + '</div></div>'
    + '<button class="ta-btn primary" onclick="pitUndRestoreGo(\'' + c.id + '\',\'' + td + '\')">'
      + '<b>今日（' + _undFmtMD(td) + '）の入庫予定にする</b><span>今日の入庫リストに出ます</span></button>'
    /* 🔴 v1.101.2（ゆうた指定）**上の「今日」と、下の「日付を選ぶ＋ボタン」を線で区切る。**
       ⚠ ボタン→日付→ボタン と並んでいると、どの日付がどのボタンのものか分からない。 */
    + '<div class="ta-sep"></div>'
    + '<label class="ta-f">日付を選ぶ<input type="date" id="und-rs-date" value="' + td + '" min="' + td + '"></label>'
    + '<button class="ta-btn" onclick="pitUndRestoreGo(\'' + c.id + '\')">'
      + '<b>この日の入庫予定にする</b><span>選んだ日の予約カレンダーに入ります</span></button>'
    + '<button class="ta-cancel" onclick="pitUndRestoreClose()">やめる</button>'
    + '</div>';
  back.classList.add('show');
};
window.pitUndRestoreClose = function(){
  const back = document.getElementById('pit-und-restore');
  if (back) back.classList.remove('show');
};
/* 実行＝ここ1本。今日ボタンも日付ボタンも同じ道を通る（写しを作らない）。 */
window.pitUndRestoreGo = function(id, forced){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  /* 🔴 v1.139.0 **アーカイブまで行ったものを戻せるのは管理者だけ。**
     ⚠ 30日たつ前（未入庫BOXに並んでいる間）は `archived` が立っていないので、今までどおり誰でも戻せる。
     ⚠ ボタンを消しただけにしない＝ここでも止める（⋮ からも未入庫BOXからも同じ道を通る）。 */
  if (window.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c)
      && PitArchive.canRestore && !PitArchive.canRestore()){
    if (PitArchive.denyRestore) PitArchive.denyRestore();
    return;
  }
  const el = document.getElementById('und-rs-date');
  const d = String(forced || (el ? el.value : '') || '').trim();
  if (!d){ if (window.pitToast) pitToast('入庫日を選んでください', 'PF-1020'); return; }
  /* 🔴 過ぎた日は入れない。入れるとまた未入庫へ落ちて、戻したことにならない。 */
  if (d < ymd(new Date())){
    if (window.pitToast) pitToast('過ぎた日は選べません（また未入庫に戻ってしまいます）', 'PF-1021');
    return;
  }
  c.status = 'reserved';
  c.cancelled = false; c.cancelledAt = null; c.archived = false;
  /* 自動で付いた未入庫の印と、キャンセルの理由も一緒に外す（戻したのに残っていると嘘になる） */
  c.noShow = false; delete c.noShowAt; delete c.cancelReason; delete c.cancelledBy;
  c.reserveDate = d;
  c.intakeTbd = false;
  if (window.logFlow) logFlow(c, '未入庫から予約に復帰（入庫日 ' + d + '）');
  if (window.PitDB) PitDB.save();
  pitUndRestoreClose();
  renderReserveTbd();
  if (window.pitToast) pitToast('↩ ' + _undFmtMD(d) + 'の予約に戻しました');
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
