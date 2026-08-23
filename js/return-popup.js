/* ========================================
   return-popup.js
   作業完了後 → 返車へ進めるポップアップ（PitReturnPopup）。
   2モード：
     ・callDone（完TEL済）：確定金額／返車予定日／返車時間／洗車(要不要+備考)／お礼LINE不要
        → c.returnStage='returnWait'（返車日があれば返車カレンダーへ・無ければ返車未定へ）
     ・callReq （完TEL依頼）：確定金額／洗車(要不要+備考)／お礼LINE不要
        → c.returnStage='callWait'（返車ビュー未定「完TEL待ち」へ）
   どちらも：タスクボードから外れ（returnStage がつくと盤面の filter で除外）、
            PIT枠(bayId)も外す。入力内容は予約詳細(表紙)と同じ項目に保存され相互反映。
   タスクボードのドラッグエリア(dnd.js)と、返車ビュー「完TEL待ち」カードのクリックから開く。

   🔴 v1.97.0（ゆうた指定）**待ち・当日返しの車だけ、先に1枚聞く。**
      「通常の完TEL済み（完TEL依頼）にしますか？ 実績化しますか？」
      ・通常   … 今までどおり。返車予定日を入れて返車カレンダー／完TEL待ちへ。
                 日付を変えれば返車カレンダーもそちらへ動き、当日ビューからは消える。
                 予定そのままなら当日ビューに残り、**そこで初めて「返車済みにする」が押せる**。
      ・実績化 … その場で返車済み。実績（確定売上）に固めて、当日ビューからは自動で消える。
      ⚠ 預かりの車（待・当が付いていない車）は今までどおり＝この1枚は出ない。
      ⚠ 「もう渡し終わった車を、過去の日付であとから登録する」道（v1.57.0）は今までどおり残す。
         行き先は同じ（実績化）なので、書き込みは apply() の1か所にまとめてある。
   ======================================== */
(function(){
  'use strict';

  var pending = null;   // { card, mode, toResult }
  var built = false;
  var kbuilt = false;   // 「通常か実績化か」の1枚（v1.97.0）

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function digits(s){ return String(s==null?'':s).replace(/[^\d]/g,'').replace(/^0+(?=\d)/,'').slice(0,9); }
  function comma(s){ var d=digits(s); return d ? Number(d).toLocaleString() : ''; }
  function todayISO(){ var d=new Date(); var p=function(n){return(n<10?'0':'')+n;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }

  function build(){
    if (built) return; built = true;
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'rp-backdrop';
    bd.innerHTML =
      '<div class="modal-box pp-box rp-box">'
      + '<div class="modal-head"><div class="modal-title" id="rp-title">返車へ</div>'
      + '<button class="modal-close" onclick="PitReturnPopup.close(false)"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="modal-body">'
      + '  <div class="pp-move" id="rp-move"></div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">確定金額（請求額）</label>'
      + '    <div class="pp-moneywrap"><span class="pp-yen">¥</span>'
      + '      <input class="pp-money" id="rp-amt" type="text" inputmode="numeric" placeholder="0" oninput="PitReturnPopup.onAmt(this)"></div>'
      /* 🧾 v1.65.1 打つたびに税込を出す（確認用）。物差しは state.js の pitTaxHint 1本。 */
      + '    <div class="pt-tax" id="rp-tax"></div>'
      + '  </div>'
      /* 💴 v1.185.0（ゆうた指定 2026-08-23）**売上日を、金額と一緒にここで入れる。**
         🗣「完TEL時のポップアップに金額と共に出るイメージ」
         ◎なぜここか＝**伝票を見ながら打つ場所**だから、いちばん正確な日が入る。
           実データ（8/1〜8/7・55台）で確かめたとおり、伝票は「作業完了 → 伝票 → 完TEL」の順で立つ。
           ＝ この画面を開いている時、伝票はもう手元にある。
         🔴 初期値は sales-date.js の1本（自分の売上日 → 完TEL日 → 今日）。ここで組み立てない。
         ⚠ 返車予定日とは**別物**。あちらは「いつ返すか」、こちらは「いつ売上が立ったか」。 */
      + '  <div class="pp-field">'
      /* ⚠ 見た目は**この窓にもとからある部品を借りる**（`pp-lb` / `pp-date` / `pp-ref`）。
         新しい見た目を作らない＝金額の欄と1ミリもズレない。 */
      + '    <label class="pp-lb">売上日 <small>（伝票の日付）</small></label>'
      + '    <input class="pp-date" id="rp-sales" type="date">'
      + '    <div class="pp-ref" id="rp-sales-note"></div>'
      + '  </div>'
      /* 🔴 v1.60.0（ゆうた指定）返車予定日の横に「返車日未定」のチェック。
         ⚠ 新しい項目は増やさない。**チェックが入っている＝日付が空**、それだけ。
            別に持つと、片方だけ直って必ず食い違う。 */
      + '  <div class="pp-field" id="rp-date-field">'
      + '    <label class="pp-lb">返車予定日</label>'
      + '    <div class="rp-dwrap">'
      + '      <input class="pp-date" id="rp-date" type="date" onchange="PitReturnPopup.onDate()">'
      + '      <label class="rp-tbdlb"><input type="checkbox" id="rp-datetbd" onchange="PitReturnPopup.onDateTbd(this)"> 返車日未定</label>'
      + '    </div>'
      + '  </div>'
      + '  <div class="pp-field" id="rp-time-field">'
      + '    <label class="pp-lb">返車時間</label>'
      + '    <div id="rp-time-slot"></div>'
      + '  </div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">洗車</label>'
      + '    <div class="rp-chips"><button type="button" class="rp-chip" id="rp-wash-1" onclick="PitReturnPopup.onWash(\'1\')">要</button>'
      + '      <button type="button" class="rp-chip" id="rp-wash-0" onclick="PitReturnPopup.onWash(\'0\')">不要</button></div>'
      + '    <input class="rp-text" id="rp-washnote" type="text" placeholder="洗車の備考（1行・任意）" style="margin-top:6px">'
      + '  </div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">お礼LINE</label>'
      + '    <div class="rp-chips"><button type="button" class="rp-chip" id="rp-line-1" onclick="PitReturnPopup.onLine(\'1\')">要</button>'
      + '      <button type="button" class="rp-chip" id="rp-line-0" onclick="PitReturnPopup.onLine(\'0\')">不要</button></div>'
      + '  </div>'
      + '  <div class="pp-actions">'
      + '    <button class="vh-btn" onclick="PitReturnPopup.close(false)">キャンセル</button>'
      + '    <button class="vh-btn primary" id="rp-ok" onclick="PitReturnPopup.close(true)">返車へ</button>'
      + '  </div>'
      + '</div></div>';
    document.body.appendChild(bd);
    /* 🔴 v1.109.0 外側を押したらやめる＝**押し始めが外側の時だけ**（modal-outside.js 1本）。
       ⚠ 返車時間の候補パネルが閉じてボタンが跳ねると、押したのに『やめました』になっていた。 */
    pitModalOutside(bd, function(){ PitReturnPopup.close(false); });
  }

  function setWash(on){   // 洗車備考は要/不要にかかわらず常時表示
    var a = el('rp-wash-1'), b = el('rp-wash-0');
    if (a) a.classList.toggle('on', !!on);
    if (b) b.classList.toggle('on', !on);
  }
  function setLine(on){   // on=お礼LINE「要」
    var a = el('rp-line-1'), b = el('rp-line-0');
    if (a) a.classList.toggle('on', !!on);
    if (b) b.classList.toggle('on', !on);
  }

  /* 🔴 v1.60.0 「返車日未定」チェックと日付欄は**同じ一つのこと**の裏表。
     チェックON＝日付は空・欄は使えない。日付が入っていればチェックは自動でOFF。
     どちらを触ってもここを通して合わせる（＝表示のズレを作らない）。 */
  function syncDateTbd(){
    var d = el('rp-date'), cb = el('rp-datetbd');
    if (!d || !cb) return;
    if (cb.checked) d.value = '';
    else if (d.value) cb.checked = false;
    d.disabled = cb.checked;
    d.classList.toggle('is-off', cb.checked);
  }

  /* いま返車時間の欄に入っている文字（整形済み） */
  function timeVal(){
    var w = el('rp-time-slot') && el('rp-time-slot').querySelector('.cf-time');
    if (w && window.pitTimeGuideValue) return pitTimeGuideValue(w);
    var i = w && w.querySelector('.cf-time-main');
    return i ? (window._normTime ? _normTime(i.value) : i.value) : '';
  }

  function openModal(card, mode, toResult){
    build();
    var isDone = (mode === 'callDone');
    /* 実績化＝もう渡した車。返車予定日・時間の欄は要らないので出さない。 */
    var showDate = isDone && !toResult;
    el('rp-title').textContent = toResult ? '実績化 — 確定金額を入れてください'
                               : (isDone ? '完TEL済 → 返車予定へ': '完TEL依頼（先に金額だけ）');
    el('rp-ok').textContent = toResult ? '実績に固める' : (isDone ? '返車予定に入れる' : '完TEL待ちへ');
    /* 🔴 v1.162.0 お名前は pitCustName の1本（漢字が無ければカナ）。ここは漢字だけを見ていた。 */
    el('rp-move').innerHTML = '<span class="pp-to">'+esc((((window.pitCustName?pitCustName(card):card.customer)||'（未入力）'))+' 様')+'</span>'
      + (card.car ? '<span class="pp-who">'+esc(card.car)+'</span>' : '');

    // 金額プレフィル＝確定→受注→見積→概算
    var amt = [card.amountFinal, card.amountOrder, card.amountQuote, card.estAmount].find(function(v){ return v!=null && v!==''; });
    el('rp-amt').value = (amt!=null && amt!=='') ? Number(amt).toLocaleString() : '';
    if (window.pitTaxHintSync) pitTaxHintSync(el('rp-amt'), el('rp-tax'));   /* 🧾 開いた時点のぶんも出す */

    /* 💴 v1.185.0 売上日＝初期値は sales-date.js の1本。
       ⚠ 「借り物（完TEL日から引っ張っただけ）」なのか「もう決まっている」のかを、一言で出す。
          黙って日付だけ置くと、確かめずにOKを押されて**間違った日が確定してしまう**。

       ⚠⚠ 分かっていて、そのままにしていること（v1.185.0・記録）
          v1.57.0 の「**もう渡し終わった車を、過去の日付であとから登録する**」道を通ると、
          売上日の初期値は**今日**なのに、実績日は**過去**になる（＝伝票より実績が後、が逆さになる）。
          🔴 ここで賢く直そうとしないこと。**返車予定日から売上日を機械が書き換える**と、
             人が入れた日を勝手に動かすことになり、そちらのほうが怖い。
          ＝ そのまま入っても、月がちがえば**データチェック（M11）が必ず拾う**。
            黙って辻褄を合わせず、**見つけて人が直す**形に寄せる。 */
    if (el('rp-sales')){
      el('rp-sales').value = window.pitSalesDateSeed ? pitSalesDateSeed(card) : '';
      var _own = window.pitSalesDateOwn ? pitSalesDateOwn(card) : '';
      el('rp-sales-note').textContent = _own ? '入っている売上日です。ちがったら直してください'
                                             : '伝票の日付とちがったら直してください';
    }

    // 日付・時間（完TEL済のみ／実績化では出さない）
    el('rp-date-field').style.display = showDate ? '' : 'none';
    el('rp-time-field').style.display = showDate ? '' : 'none';
    if (showDate){
      el('rp-date').value = '';   // 返車予定日はデフォルト空（その場で決めて入れる）
      el('rp-datetbd').checked = false;
      syncDateTbd();
      /* 返車時間＝新規予約とまったく同じ入力ガイド（打ち込み／ピッカー／ショートカット）。
         🔴 中身は return-slot.js の共通部品。ここでHTMLを書き写さない。 */
      el('rp-time-slot').innerHTML = window.pitTimeGuideHtml
        ? pitTimeGuideHtml(card.returnTime || '', { list: window.PIT_RETURN_TIME_QUICK, cls: 'rp-timeguide' })
        : '<input class="cf-input cf-time-main" type="text" value="'+esc(card.returnTime||'')+'">';
      /* 🔴 v1.109.0 keepOpen＝開いた候補パネルを閉じない（閉じるとボタンが跳ねて押せなくなる） */
      if (window.pitTimeGuideBind) pitTimeGuideBind(el('rp-time-slot').querySelector('.cf-time'), { keepOpen: true });
    }

    // 洗車＝デフォ要／お礼LINE＝デフォ要（初回＝盤面からのドラッグ時は必ず要。再編集時は保存値を尊重）
    setWash(card.returnStage ? (card.needWash !== false) : true);
    el('rp-washnote').value = card.washNote || '';
    setLine(card.returnStage ? !card.noThanksLine : true);

    el('rp-backdrop').classList.add('show');
    setTimeout(function(){ try{ el('rp-amt').focus(); }catch(e){} }, 30);
  }

  /* ===================================================================
     🔴 v1.97.0 「通常にしますか？ 実績化しますか？」の1枚（待ち・当日返しの車だけ）
     -------------------------------------------------------------------
     ⚠ ここでは**何も書き込まない**。どちらを選んだかを覚えて、次の金額の画面へ渡すだけ。
        書き込みは今までどおり apply() の1か所。
     =================================================================== */
  function kbuild(){
    if (kbuilt) return; kbuilt = true;
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'rk-backdrop';
    bd.innerHTML =
      '<div class="modal-box pp-box rk-box">'
      + '<div class="modal-head"><div class="modal-title" id="rk-title">どちらにしますか？</div>'
      + '<button class="modal-close" onclick="PitReturnPopup.kind(null)"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="modal-body">'
      + '  <div class="pp-move" id="rk-move"></div>'
      + '  <button type="button" class="rk-pick" onclick="PitReturnPopup.kind(0)">'
      + '    <b id="rk-normal">通常の完TEL済みにする</b>'
      + '    <small>返車予定日を入れて返車カレンダーに置きます。日付を変えれば返車カレンダーもそちらへ動き、'
      +      '当日ビューからは消えます。予定そのままなら当日ビューに残り、渡したときに「返車済みにする」が押せるようになります。</small>'
      + '  </button>'
      + '  <button type="button" class="rk-pick" onclick="PitReturnPopup.kind(1)">'
      + '    <b>実績化する</b>'
      + '    <small>返車済みとして、そのまま実績（確定売上）に固めます。当日ビューからは自動で消えます。'
      +      '返車カレンダーには置きません。</small>'
      + '  </button>'
      + '  <div class="rk-note">どちらを選んでも、このあと金額の入力に進みます。</div>'
      + '</div></div>';
    document.body.appendChild(bd);
    pitModalOutside(bd, function(){ PitReturnPopup.kind(null); });
  }
  /* この1枚を出すか＝**待ち・当日返しで、まだ完TELを通っていない車**だけ */
  function needKind(card){
    if (!card || card.returnStage) return false;
    return window.pitDropIsSameDay ? !!pitDropIsSameDay(card) : false;
  }
  function openKind(card, mode){
    kbuild();
    el('rk-title').textContent = (mode === 'callDone' ? '完TEL済' : '完TEL依頼') + ' → どちらにしますか？';
    el('rk-normal').textContent = (mode === 'callDone' ? '通常の完TEL済みにする' : '通常の完TEL依頼にする');
    el('rk-move').innerHTML = '<span class="pp-to">'+esc(((window.pitCustName?pitCustName(card):card.customer)||'（未入力）')+' 様')+'</span>'
      + (card.car ? '<span class="pp-who">'+esc(card.car)+'</span>' : '');
    el('rk-backdrop').classList.add('show');
    if (window.icHydrate) { try { icHydrate(el('rk-backdrop')); } catch(e){} }
  }
  function khide(){ var bd = el('rk-backdrop'); if (bd) bd.classList.remove('show'); }

  window.PitReturnPopup = {
    open: function(cardOrId, mode){
      var card = (typeof cardOrId === 'string')
        ? (window.state && state.cards || []).find(function(x){ return x.id === cardOrId; })
        : cardOrId;
      if (!card) return;
      pending = { card: card, mode: mode || 'callDone', toResult: false };
      if (needKind(card)){ openKind(card, pending.mode); return; }
      openModal(card, pending.mode, false);
    },
    /* 1枚目の答え：0＝通常／1＝実績化／null＝やめる */
    kind: function(v){
      khide();
      if (v == null){ pending = null; if (window.pitToast) pitToast('やめました', 'PF-4001'); return; }
      if (!pending) return;
      pending.toResult = (v === 1 || v === '1' || v === true);
      openModal(pending.card, pending.mode, pending.toResult);
    },
    onAmt: function(input){
      input.value = comma(input.value);
      if (window.pitTaxHintSync) pitTaxHintSync(input, el('rp-tax'));   /* 🧾 税込の確認表示をライブで */
    },
    onDate: function(){ var cb = el('rp-datetbd'); if (cb && el('rp-date').value) cb.checked = false; syncDateTbd(); },
    onDateTbd: function(){ syncDateTbd(); },
    onWash: function(v){ setWash(v === '1'); },
    onLine: function(v){ setLine(v === '1'); },
    close: function(ok){
      var p = pending;
      if (!ok){
        hide(); pending = null;
        if (p && window.pitToast) pitToast('やめました', 'PF-4002');
        return;
      }
      if (!p){ hide(); return; }

      /* ===================================================================
         🔴 v1.57.0（ゆうた指定）**完TEL済で、返車予定日が過去だったら1回聞く。**
         -------------------------------------------------------------------
         ◎なぜ
           もう渡し終わった車を、あとから記録することがある。そのまま入れると
           **過ぎた日の返車カレンダーに置かれて、誰も見に行かない**。
         ◎聞いた結果
           ・「実績に登録する」… **返車カレンダーを通さず、その日付でそのまま実績へ**（返車済み扱い）
           ・「日付を直す」　… ポップアップは閉じずに、日付欄へ戻す
         ⚠ **今日は過去ではない。今日より前**だけが対象。
         ⚠ 「完TEL依頼」には日付の欄が無いので、こちらは今までどおり（ゆうた確認済み）。
         =================================================================== */
      if (p.mode === 'callDone' && !p.toResult){
        var dChk = el('rp-date') ? el('rp-date').value : '';
        if (dChk && dChk < todayISO()){
          var msg = '過去の日付です。このまま実績に登録しますか？';
          var det = '返車予定日が ' + dChk + '（今日より前）になっています。'
                  + '「実績に登録する」を選ぶと、返車カレンダーには置かず、その日付でそのまま実績（売上）に入れます。';
          var ask = (window.UI && UI.confirm)
            ? UI.confirm(msg, { title: '過去の日付です', detail: det, ok: '実績に登録する', cancel: '日付を直す' })
            : Promise.resolve(window.confirm(msg + '\n\n' + det));
          ask.then(function (yes){
            if (!yes){ try { el('rp-date').focus(); } catch (e) {} return; }   /* 開けたまま直してもらう */
            hide(); pending = null; apply(p, true);
          });
          return;
        }
      }
      hide(); pending = null; apply(p, !!p.toResult);
    }
  };

  function hide(){ var bd = el('rp-backdrop'); if (bd) bd.classList.remove('show'); }

  /* 入力された内容をカードに書き込む。
     toResult=true ＝ 返車カレンダーを通さず、そのまま実績に入れる（＝実績化）。
     🔴 実績化に入る道は2つあるが、**書き込みはここ1か所**（形が食い違うと実績・売上・来店履歴でズレる）。
        ① v1.57.0 完TEL済で返車予定日が過去 → 「実績に登録する」を選んだ
        ② v1.97.0 待ち・当日返しの車で、1枚目の「実績化する」を選んだ */
  function apply(p, toResult){
      var c = p.card;
      var isDone = (p.mode === 'callDone');

      // 確定金額
      var amt = digits(el('rp-amt') ? el('rp-amt').value : '');
      if (amt !== '') c.amountFinal = Number(amt);
      // 洗車（要/不要）＋備考（不要でも備考は保存）
      c.needWash = !!(el('rp-wash-1') && el('rp-wash-1').classList.contains('on'));
      c.washNote = (el('rp-washnote') && el('rp-washnote').value.trim()) || '';
      // お礼LINE（要/不要）。要=on → noThanksLine=false
      c.noThanksLine = !(el('rp-line-1') && el('rp-line-1').classList.contains('on'));

      /* 💴 v1.185.0 売上日＝**3つの道（実績化／完TEL済／完TEL依頼）すべてで同じように入れる。**
         🔴 書き込みは sales-date.js の1本を通す。ここで `c.salesDate = …` と書かない。
         ⚠ 変わった時だけフローに残す（毎回書くとログが埋まって、本当の変更が見えなくなる）。 */
      var _sdBefore = window.pitSalesDate ? pitSalesDate(c) : '';
      if (window.pitSetSalesDate && el('rp-sales')){
        if (pitSetSalesDate(c, el('rp-sales').value) && window.logFlow){
          logFlow(c, '売上日を ' + (_sdBefore || '（なし）') + ' → ' + (c.salesDate || '（なし）') + ' にした');
        }
      }
      /* ☎ v1.185.0（ゆうた指定）**完TEL依頼でも、完TELのログを残す。**
         🗣「完TEL依頼ログも残して」
         ◎前まで＝「完TEL済」と「実績化」だけが日付を残していて、**依頼だけ何も残らなかった**。
           ＝ 依頼のまま返車まで行った車は、完TELをいつ通ったのか永久に分からなかった。
         🔴 記録は sales-date.js の1本（`pitMarkCompleteCall`）。**上書きしない**（最初に通った日が残る）。 */
      if (window.pitMarkCompleteCall) pitMarkCompleteCall(c);

      // 作業は完了扱いに（盤面からは returnStage で外れる）。PIT枠も外す。
      c.status = 'workDone';
      c.testDrive = false;
      c.bayId = null; c.baySlot = null;
      c.returnTbd = false;   // 旧フラグは使わない（returnStage に一本化）

      /* 画面に出ていた返車予定日・返車時間（実績化のときは欄自体が出ていないので空） */
      var d = (isDone && el('rp-date-field') && el('rp-date-field').style.display !== 'none')
            ? ((el('rp-datetbd') && el('rp-datetbd').checked) ? '' : (el('rp-date') ? el('rp-date').value : ''))
            : '';
      var t = (isDone && el('rp-time-field') && el('rp-time-field').style.display !== 'none') ? timeVal() : '';

      if (toResult){
        /* ===== 実績化＝もう渡した車。返車カレンダーには置かず、そのまま実績（確定売上）へ =====
           ⚠ 当日ビューの「返車済みにする」（today.js の pitTodayReturn）と**同じ形に揃える**こと。
              揃っていないと、実績ビュー・売上・来店履歴のどれかで見え方が食い違う。
              　status='returned' ／ completedAt＝実績に乗る日 ／ amountFinal＝売上を固める */
        var rd = d || todayISO();          /* 日付の欄が無い時（完TEL依頼・当日返し）は今日 */
        c.returnStage = 'returnWait';
        if (window.pitReturnSetDateTime) pitReturnSetDateTime(c, rd, t);
        else { c.returnDate = rd; c.returnTime = t || ''; }
        c.returnDateFinal = rd;
        /* ☎ 完TEL日（ログ）は上の1本ですでに記録済み。ここで書き写さない（v1.185.0） */
        if (c.coverCall && typeof c.coverCall === 'object'){ c.coverCall.done = true; if(!c.coverCall.at){ var dd0=new Date(); c.coverCall.at=(dd0.getMonth()+1)+'/'+dd0.getDate(); } }
        c.status = 'returned';
        c.completedAt = rd;
        /* 🔴 拾う順番は当日ビューの「返車済みにする」と同じ＝確定→受注→見積→概算 */
        /* 🔴 v1.103.0 拾う順番は pit-share.js の1本（当日ビューの「返車済みにする」と同じ道）。 */
        if (c.amountFinal == null || c.amountFinal === ''){
          c.amountFinal = window.pitFinalAmountOf ? pitFinalAmountOf(c) : 0;
        }
        if (window.logFlow) logFlow(c, (isDone ? '完TEL済' : '完TEL依頼') + ' → 実績化（返車済み・' + rd + '）');
        if (window.pitLog) pitLog('実績化した（返車済み）', { cardId: c.id, kind: 'out',
          label: ((window.pitCustName?pitCustName(c):c.customer) || '') + ' 様' + (c.car ? ' / ' + c.car : '')
               + ' / 実績日 ' + rd + (c.amountFinal ? ' / ¥' + Number(c.amountFinal).toLocaleString() : '') });
      } else if (isDone){
        /* 🔴 v1.60.0 日付・時間の書き込みは return-slot.js の pitReturnSetDateTime 1本を通す。
           行き先（完TEL待ち／返車日未定／返車時間未定／カレンダー）の決め方をここに書き写さない。 */
        c.returnStage = 'returnWait';
        if (window.pitReturnSetDateTime) pitReturnSetDateTime(c, d, t);
        else { c.returnDate = d || ''; c.returnTime = t || ''; }
        c.returnDateFinal = d || c.returnDateFinal || null;
        /* ☎ 完TEL日（ログ）は上の1本ですでに記録済み。ここで書き写さない（v1.185.0） */
        if (c.coverCall && typeof c.coverCall === 'object'){ c.coverCall.done = true; if(!c.coverCall.at){ var dd=new Date(); c.coverCall.at=(dd.getMonth()+1)+'/'+dd.getDate(); } }
        if (window.logFlow) logFlow(c, '完TEL済 → ' + ((window.pitReturnPlaceLabel ? pitReturnPlaceLabel(pitReturnPlace(c)) : '') || '返車未定')
                                      + (d ? '（' + d + (t ? ' ' + t : '') + '）' : ''));
      } else {
        c.returnStage = 'callWait';
        /* ☎ v1.185.0 依頼も「完TELの流れを通った」記録として日付ごと残す（ゆうた指定）。 */
        if (window.logFlow) logFlow(c, '完TEL依頼（金額入力・完TEL待ちへ）'
          + (c.completeCallAt ? '／完TEL日 ' + c.completeCallAt : ''));
      }

      if (window.PitDB) PitDB.save();
      if (state.currentView) showView(state.currentView);
      if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      /* 🔴 v1.60.0 「どこへ入ったか」の言い方も物差し1本（pitReturnPlaceLabel）から取る。
         画面のブロック名とお知らせの文言が食い違うと、探しに行っても見つからない。 */
      if (window.pitToast){
        pitToast(c.status === 'returned' ? ('実績に登録しました（' + c.completedAt + '）')
               : ((window.pitReturnPlaceLabel ? pitReturnPlaceLabel(pitReturnPlace(c)) : '返車未定') + 'へ入れました'));
      }
  }
})();
