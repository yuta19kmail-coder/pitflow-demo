/* ========================================
   return-slot.js  ── PitFlow v1.60.0
   「返車の車が、いま画面のどこに出るか」を決める**たった1本の物差し**と、
   返車時間の**入力ガイド（ピッカー＋ショートカット）の共通部品**。
   ----------------------------------------
   ◎なぜ作ったか（ゆうた報告）
     「**完TEL待ちのエリアで日時を入れたのに返車カレンダーに移動しない**」
     正体は、入れる場所ごとに“行き先の決め方”がバラバラで、しかも入れたあと
     画面を描き直していなかったこと。行き先の判断を**ここ1か所**に集めて、
     どこから入れても同じ結論・同じ描き直し・同じお知らせになるようにした。

   ◎行き先は4つだけ（pitReturnPlace）
     'callWait'  … 完TEL待ち   （完TEL依頼ぶん・まだお客さんに電話していない）
     'dateTbd'   … 返車日未定  （完TEL済だが返車日がまだ）
     'timeTbd'   … 返車時間未定（日は決まったが時間がまだ＝「未定」か空）
     'calendar'  … 返車予定カレンダー（日と時間がそろった）
     null        … 返車の待ち行列にいない（実績・廃車など）
     ⚠ 'timeTbd' の車は**返車カレンダーの「時刻未定」にも同時に出る**（ゆうた指定）。
        カレンダー側のふるい（return.js）は returnDate があるかどうかで見ているので、
        こちらを足しても向こうは触らなくてよい。

   ◎「時刻不明」と「時間未定」は別もの（ここを混ぜない）
     決まり次第・レッカー・勝手に取る … **決めた上での時刻不明** → カレンダーの「時刻未定」へ
     未定・空                          … **まだ決めていない**     → 「返車時間未定」に残る
     判定は state.js の pitTimeTbd（表は PIT_TIME_ALL の1本）。
   ======================================== */
(function () {
  'use strict';

  function _esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

  /* ===============================================================
     ⓪ 返車日の3段チェーン（v1.65.0・ゆうた指定）  A → B → C
     ---------------------------------------------------------------
     🔴 **今回の根本原因＝「返車予定日」という1つの欄に、意味の違う3つの日付を詰め込んでいた。**

     | | 名前 | いつ決まるか | 誰が入れるか | 時間 |
     |---|---|---|---|---|
     | **A** | 概算返車日 | 予約を取った時点 | **自動**（入庫日＋概算預かり日数） | なし |
     | **B** | 返車予定日 | 受注完了（連絡中→パーツ待ち） | 人が入れる＝お客様への**約束** | なし |
     | **C** | 確定返車日 | 完TELのとき | 人が入れる＝**確定** | **あり** |

     ◎どこが何を見るか（ゆうた確定 2026-08-07）
       ・返車カレンダー／当日ビュー … **C だけ**（＋待・当は入庫日で自動＝下の②）
       ・売上の見込み（今月に入るか） … **C → B → A** の順に見る
       ・売上の実績 … 実績カウント日（`completedAt`／sales-count.js）
       ・返車時間は **C にしか付かない**

     ◎保存の形
       ・**A は持たない。毎回計算する。**（入庫日も預かり日数も既にあるので、写しを作ると必ず食い違う）
       ・**B ＝ `returnDatePlan`**（v1.65.0 で新設）
       ・**C ＝ `returnDate`**（従来どおり。返車カレンダーはこれを見ているので作りは変わらない）
     ⚠ **旧データの吸収**：v1.65.0 より前は、盤面にいる車の `returnDate` に「受注時の約束」が入っていた。
        それは **B とみなして読む**（データは書き換えない＝移行スクリプトを走らせない）。
   =============================================================== */

  /* 受付タイプに「待」か「当」が付いているか（2つ選択にも対応）。
     🔴 この2つは**入庫日にそのまま返る**ので、完TEL関門を通らなくても返車の一覧に出す（ゆうた指定）。
     ⚠ 駐車場の占有判定（pitDropEffective＝預>当>待）とは考え方が違う。あちらは「いちばん重い方」、
        こちらは「1つでも付いていれば当日返しがあり得る」。取りこぼさない側に倒す。 */
  function pitDropIsSameDay(c){
    if (!c) return false;
    return [c.dropType, c.dropType2].some(function(t){ return t === 'wait' || t === 'sameDay'; });
  }

  function _pad(n){ return (n < 10 ? '0' : '') + n; }
  function _ymd(d){ return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate()); }
  function _today(){ var t = new Date(); t.setHours(0,0,0,0); return _ymd(t); }
  function _addDays(str, n){
    var p = String(str||'').split('-'); if (p.length !== 3) return '';
    var d = new Date(+p[0], (+p[1])-1, +p[2]); if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n); return _ymd(d);
  }

  /* A＝概算返車日（入庫日＋概算預かり日数）。持たずに毎回計算する。 */
  function pitReturnA(c){
    if (!c || !c.reserveDate) return '';
    var hold = 5;
    if (window.pitSalesHoldOf) hold = +pitSalesHoldOf(c) || 0;
    else if (c.estHoldDays != null && c.estHoldDays !== '') hold = +c.estHoldDays || 0;
    else if (window.pitEstHold) { try { hold = +pitEstHold(c.workType, c.dropType, window.pitTeamKey?pitTeamKey(c):'default') || 0; } catch(e){} }
    return _addDays(c.reserveDate, Math.max(0, hold));
  }

  /* B＝返車予定日（受注のときにお客様へ伝えた約束の日） */
  function pitReturnB(c){
    if (!c) return '';
    if (c.returnDatePlan) return String(c.returnDatePlan);
    /* 旧データの吸収：まだ盤面にいて（完TEL前）、待・当でもない車の日付は「約束」だった */
    if (!c.returnStage && !pitDropIsSameDay(c) && c.returnDate) return String(c.returnDate);
    return '';
  }

  /* C＝確定返車日
     ・完TELを通った車（returnStage あり）＝その日付が確定
     ・待・当の車＝完TEL前でも確定日を持てる（「やっぱり明日取りに行くわ」に対応・ゆうた指定） */
  function pitReturnC(c){
    if (!c) return '';
    if (c.returnStage) return String(c.returnDate || '');
    if (pitDropIsSameDay(c)) return String(c.returnDate || '');
    return '';
  }

  function pitReturnDates(c){ return { a: pitReturnA(c), b: pitReturnB(c), c: pitReturnC(c) }; }

  /* ---------------------------------------------------------------
     ⓪-2 「返車の一覧に、どの日で出すか」＝ここ1本で決める
     🔴 返車カレンダー・当日ビュー・ダッシュボード・新規予約の右パネルは、**全部これを呼ぶだけ**。
        「returnDate が…かつ returnStage が…」と条件を書き写さないこと。

     ・C が入っていれば → その日
     ・待・当で C がまだ → **入庫日**。ただし **その日にならないと出さない**（ゆうた指定：入庫前は出さない）
     ・預かりで完TEL前 → **出さない**（盤面で入れた日付はあくまで約束＝B なので、カレンダーには使わない）
     --------------------------------------------------------------- */
  function pitReturnListDate(c, todayStr){
    if (!c || c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled') return '';
    var C = pitReturnC(c);
    if (C) return C;
    if (pitDropIsSameDay(c) && c.reserveDate){
      var td = todayStr || _today();
      if (String(c.reserveDate) <= td) return String(c.reserveDate);   /* その日になったら自動で入る */
    }
    return '';
  }

  /* 並び順の分（時刻）。返車時間は C にしか付かないので、無い車は時間の枠に入れない。
     ⚠ 入庫時刻で代用しないこと（ゆうた指定「終日予定で最後尾。C が入った段階で並び替える」）。
     🔴 v1.70.0（ゆうた確定）その日の並びは
        **時間の枠 → 終日（80000）→ 時刻未定・空（90000台〜99999）** の順。
        ＝終日は PM の後ろだが、**時刻未定より前**。 */
  var ALLDAY_MIN = 80000;
  function _timeMin(t){
    if (!t) return null;
    var m = window.pitTimeMin ? pitTimeMin(t) : null;
    return (m == null || m >= 99999) ? null : m;
  }
  function pitReturnSortMin(c){
    if (!c) return 99999;
    var m = _timeMin(c.returnTime);
    if (m != null) return m;                            /* 時刻／時刻不明の言葉（90000台） */
    if (pitReturnAllDay(c)) return (window.PIT_TIME_ALLDAY || ALLDAY_MIN);   /* 終日 */
    return 99999;                                       /* 時刻未定＝いちばん最後 */
  }
  /* 「終日」＝**完TEL前の待ち・当日返し**で、まだ返車時間が決まっていない車。
     🔴 完TEL済で時間だけ未定の車は「終日」ではなく **「時刻未定」**（意味が違うので混ぜない）。
        ・時刻未定 … 日は決まった（完TEL済）が、時間がまだ
        ・終日     … 入庫日に返るのは決まっているが、そもそも確定返車日をまだ持っていない */
  function pitReturnAllDay(c){
    if (!c) return false;
    if (c.returnStage || !pitDropIsSameDay(c)) return false;
    return _timeMin(c.returnTime) == null;              /* 時間があるなら終日ではない */
  }

  window.pitDropIsSameDay  = pitDropIsSameDay;
  window.pitReturnA        = pitReturnA;
  window.pitReturnB        = pitReturnB;
  window.pitReturnC        = pitReturnC;
  window.pitReturnDates    = pitReturnDates;
  window.pitReturnListDate = pitReturnListDate;
  window.pitReturnSortMin  = pitReturnSortMin;
  window.pitReturnAllDay   = pitReturnAllDay;

  /* ---------------------------------------------------------------
     ① 行き先の物差し
     --------------------------------------------------------------- */
  function pitReturnPlace(c){
    if (!c) return null;
    if (c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled') return null;  // もう実績・廃車・未入庫
    if (!c.returnStage){
      /* 🔴 v1.101.0（ゆうた指定）**待ち・当日返しで、返るはずの日を過ぎてもまだ手元にある車**は
         「返車日未定」に出す。＝日が過ぎるとどの一覧からも消えて、取り残しに気づけなかった。
         ⚠ 盤面からは外さない（作業はまだ続いている）。**データも書き換えない**
            ＝入庫日は本当に入庫した日なので消せない。だから「出す側」で拾う。
         ⚠ まだ入庫していない車（reserved）は入庫側の話なので、ここでは拾わない。 */
      if (pitDropIsSameDay(c) && c.status !== 'reserved'){
        var _d = pitReturnC(c) || String(c.reserveDate || '');
        if (_d && _d < _today()) return 'dateTbd';
      }
      return null;                                                     // まだ作業中（盤面にいる）
    }
    if (c.returnStage === 'callWait') return 'callWait';
    if (!c.returnDate) return 'dateTbd';
    if (window.pitTimeTbd ? pitTimeTbd(c.returnTime) : !c.returnTime) return 'timeTbd';
    return 'calendar';
  }
  window.pitReturnPlace = pitReturnPlace;

  var PLACE_LABEL = {
    callWait: '完TEL待ち',
    dateTbd:  '返車日未定',
    timeTbd:  '返車時間未定',
    calendar: '返車予定カレンダー'
  };
  function pitReturnPlaceLabel(p){ return PLACE_LABEL[p] || ''; }
  window.pitReturnPlaceLabel = pitReturnPlaceLabel;

  /* ---------------------------------------------------------------
     ② 返車の日付・時間を書き込む**唯一の入口**
        date / time は「渡さなければ触らない」。空文字を渡せば消す。
        戻り値 { before, after, moved } … 行き先が変わったかどうか。
     🔴 **日付が入った＝完TEL済** とみなして returnStage を 'returnWait' に上げる。
        （完TEL待ちの車に返車日を入れたのに完TEL待ちのまま、が今までのバグ）
     --------------------------------------------------------------- */
  function pitReturnSetDateTime(c, date, time){
    if (!c) return null;
    var before = pitReturnPlace(c);

    if (date !== undefined){
      c.returnDate = date || '';
      if (c.returnDate){
        /* 🔴 日付が入った＝完TEL済とみなして返車待ちへ上げる（v1.60.0）。
           ⚠ v1.65.0 例外＝**待・当の車**。完TEL前でも確定日を持てる決まり（「やっぱり明日取りに行くわ」）なので、
              まだ盤面にいる（returnStage が無い）うちは、日付を入れただけで完TEL済にしない。
              勝手に完TEL済にすると、作業が終わっていないのに盤面から消える。 */
        if (c.returnStage || !pitDropIsSameDay(c)) c.returnStage = 'returnWait';
        c.returnDateFinal = c.returnDate;
      }
    }
    if (time !== undefined){
      c.returnTime = (window._normTime ? _normTime(time || '') : (time || ''));
    }
    /* 🔴 v1.71.0（ゆうた報告「完TEL待ちから日付と時間を入れても返車カレンダーに行かない」）
       **返車の日か時間を人が入れた＝完TELは済んでいる。**
       ⚠ v1.70.0 まで「完TEL済とみなす」のは**日付を入れた時だけ**だった。
          ところが完TEL待ちの車は、盤面で入れた「お客様への約束の日」を**すでに持っていることがある**。
          その車に時間だけ入れても（＝日付欄は変えていないので change が飛ばない）
          returnStage が callWait のまま残り、日も時間もそろっているのに
          **ずっと完TEL待ちの箱から出られなかった**。
       ⚠ 空にした時（取り消し）は上げない。上げると「返車済みの取り消し」で完TEL待ちに戻せなくなる。 */
    var _wroteDate = (date !== undefined && String(date == null ? '' : date).trim() !== '');
    var _wroteTime = (time !== undefined && String(time == null ? '' : time).trim() !== '');
    if (c.returnStage === 'callWait' && (_wroteDate || _wroteTime)) c.returnStage = 'returnWait';

    c.returnTbd = false;   // 旧フラグは使わない（returnStage / 日付 に一本化）

    var after = pitReturnPlace(c);
    return { before: before, after: after, moved: (before !== after) };
  }
  window.pitReturnSetDateTime = pitReturnSetDateTime;

  /* 書き込んだあとの後始末を1か所に。保存・描き直し・お知らせをまとめてやる。
     🔴 ここを通さないと「入れたのに画面が変わらない（＝移動しないように見える）」が起きる。 */
  function pitReturnCommit(c, res, opt){
    opt = opt || {};
    if (window.logFlow && res && res.moved && res.after){
      logFlow(c, '返車の予定を更新 → ' + pitReturnPlaceLabel(res.after)
              + (c.returnDate ? '（' + c.returnDate + (c.returnTime ? ' ' + c.returnTime : '') + '）' : ''));
    }
    if (window.PitDB && PitDB.save) PitDB.save(true);
    if (window.state && state.currentView && window.showView) showView(state.currentView);
    if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
    if (!opt.silent && res && res.moved && res.after && window.pitToast){
      pitToast(pitReturnPlaceLabel(res.after) + 'へ移しました');
    }
    return res;
  }
  window.pitReturnCommit = pitReturnCommit;

  /* ---------------------------------------------------------------
     ③ 時間の入力ガイド（共通部品）
        見た目は新規予約の入庫時間とまったく同じ（css/polish.css の .cf-time を借りる）。
        🔴 **HTMLを書き写さないこと。** 予約も返車もここを呼ぶ。
        opt.list … ボタンに出す一覧（PIT_TIME_QUICK / PIT_RETURN_TIME_QUICK）
        opt.cls  … 外枠に足すクラス（見分け用）
     --------------------------------------------------------------- */
  /* 時間ピッカー(input type=time)に入れる値。単一の HH:MM の時だけ返す
     （範囲「09:00-10:00」やショートカットの言葉は空＝ピッカーは空表示）。
     🔴 予約側（card-detail.js の _timePickVal）もこれを呼ぶ。書き写さないこと。 */
  function _pickVal(v){
    var n = (window._normTime ? _normTime(v || '') : String(v || ''));
    var m = (String(n).split('-')[0] || '').match(/^\d{2}:\d{2}$/);
    return m ? m[0] : '';
  }
  window.pitTimePickVal = _pickVal;

  function pitTimeGuideHtml(cur, opt){
    opt = opt || {};
    var list = opt.list || window.PIT_TIME_QUICK || [];
    var val  = String(cur == null ? '' : cur);
    var h = '<div class="cf-time' + (opt.cls ? ' ' + opt.cls : '') + '">';
    h += '<input type="text" class="cf-input cf-time-main" value="' + _esc(val) + '" placeholder="'
       + _esc(opt.placeholder || '900 / 9時半 / 9:00-10:00 など') + '" autocomplete="off">';
    h += '<div class="cf-time-guide">';
    h += '<div class="cf-time-l">時間で選ぶ</div><input type="time" class="cf-input cf-time-pick" value="' + _esc(_pickVal(val)) + '">';
    h += '<div class="cf-time-l">ショートカット</div><div class="cf-time-quick">';
    /* ⚠ ボタンに出すのは**ラベルだけ**。（）内の時間は出さない（マウスを乗せた時の説明にだけ入れる）。 */
    list.forEach(function (it){
      var label = (typeof it === 'string') ? it : it.label;
      var q = (window.pitTimeQuick ? pitTimeQuick(label) : null) || {};
      var tip = q.tbd ? 'まだ決めていない扱い（「返車時間未定」に残ります）'
              : q.unknown ? '時間が決まっていない扱い（その日のいちばん後ろに並びます）'
              : (q.from ? ('目安 ' + q.from + '〜' + (q.to || '') + '（この時間で並びます）') : '');
      h += '<button type="button" class="cf-chip cf-chip-tm' + (q.unknown ? ' cf-chip-tbd' : '')
         + (val === label ? ' active' : '') + '" data-val="' + _esc(label) + '"'
         + (tip ? ' title="' + _esc(tip) + '"' : '') + '>' + _esc(label) + '</button>';
    });
    h += '</div></div></div>';
    return h;
  }
  window.pitTimeGuideHtml = pitTimeGuideHtml;

  /* ガイドの配線。wrap＝pitTimeGuideHtml が作った .cf-time の要素。
       onInput (v)  … 打っている最中（保存はしない）
       onCommit(v)  … 確定した（整形済み。ここで保存する）
     二重配線しないよう、済んだ枠には印（data-tgbound）を付ける。 */
  function pitTimeGuideBind(wrap, o){
    if (!wrap || wrap.getAttribute('data-tgbound') === '1') return;
    wrap.setAttribute('data-tgbound', '1');
    o = o || {};
    var mainEl = wrap.querySelector('.cf-time-main');
    var pickEl = wrap.querySelector('.cf-time-pick');
    var sync = function (v){
      wrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function (b){ b.classList.toggle('active', b.dataset.val === v); });
      if (pickEl) pickEl.value = _pickVal(v);
    };
    var commit = function (v){ if (mainEl) mainEl.value = v; sync(v); if (o.onCommit) o.onCommit(v); };

    if (mainEl){
      mainEl.addEventListener('focus', function (){ wrap.classList.add('open'); });
      mainEl.addEventListener('input', function (){
        var v = (window._timeHalf ? _timeHalf(mainEl.value) : mainEl.value);
        if (mainEl.value !== v) mainEl.value = v;
        sync(v);
        if (o.onInput) o.onInput(v);
      });
      mainEl.addEventListener('change', function (){
        commit(window._normTime ? _normTime(mainEl.value) : mainEl.value);
      });
    }
    if (pickEl){
      pickEl.addEventListener('change', function (){ if (pickEl.value) commit(pickEl.value); });
    }
    wrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function (btn){
      btn.addEventListener('mousedown', function (e){ e.preventDefault(); });
      btn.addEventListener('click', function (){ commit(btn.dataset.val); if (mainEl) mainEl.focus(); });
    });
    wrap.addEventListener('focusout', function (e){ if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('open'); });
  }
  window.pitTimeGuideBind = pitTimeGuideBind;

  /* いま枠に入っている時間（整形済み）を読む。ポップアップの「返車へ」で使う。 */
  function pitTimeGuideValue(wrap){
    var m = wrap && wrap.querySelector('.cf-time-main');
    var v = m ? m.value : '';
    return window._normTime ? _normTime(v) : v;
  }
  window.pitTimeGuideValue = pitTimeGuideValue;
})();
