/* ========================================
   loaner-free.js  -  代車の「空いているか」の物差し（PitFlow v1.80.0）
   ----------------------------------------
   🔴 **代車が空いているかどうかを判定するのは、このファイルだけ。**
      画面ごとに `a.fromDate <= ds && a.toDate >= ds` を書かないこと。

   ◎なぜ作ったか（2026-08-12・代車カレンダーの棚卸しで発覚）
     同じ判定が **10か所** にバラバラに書かれていて、除外の条件がそろっていなかった。
       ・引退した代車（retired）… カレンダーの列からは消えるのに、
         **最短入庫日・マイダッシュ・予約画面の帯では1台として数えていた**
       ・緊急車両（emergency）… 予約側からは外していたのに、**最短入庫日には混ざっていた**
       ・代車自身の車検・点検（fleetEvents）… カレンダーには色帯で出るのに、
         **最短入庫日では見ていなかった**＝出せない代車を空きと数えていた
     どれも「代車ありで入庫できる日が**実際より早く出る**」＝
     **お客様に約束したのに代車が無い**、につながる筋。

   ◎ここに集めたもの（4つだけ）
     pitLoanerUsable(l)                 … その代車、そもそも貸せるか
     pitLoanerBusyOn(l, ymd, opt)       … その日、ふさがっているか
     pitLoanerFreeRun(from, days, opt)  … 「N日連続で丸ごと空く代車」が1台でもあるか
     pitLoanerOverlap(aF,aT,bF,bT)      … 2つの期間がぶつかるか（当日かぶりは許す）

   🔴 期間は **fromDate 〜 toDate の両端を含む**（返却日当日も「埋まり」）。
      ただし **返却日＝次の貸出の開始日（当日かぶり）は、ぶつかりに数えない**。
      現場では「返ってきたその日に次の人へ渡す」が普通にあるため。
      ⚠ 以前は入口によって「怒られたり怒られなかったり」した。**ここで1本にした。**
   ======================================== */
(function () {
  var w = window;

  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ------------------------------------------------------------------
     ① その代車、そもそも貸せるか
     ⚠ 「カレンダーに出すか」とは別。カレンダーは緊急車両も出す（一番左）。
        ここは **お客様に貸せる見込みとして数えてよいか** を答える。
     ------------------------------------------------------------------ */
  function usable(l, opt) {
    if (!l) return false;
    if (l.retired) return false;                 /* 引退＝もう無い車 */
    if (!(opt && opt.withEmergency) && l.emergency) return false;
                                                 /* 緊急車両＝臨時。あてにして予約を取らない */
    return true;
  }

  /* 貸せる代車だけを返す（並びは元のまま） */
  function usableList(opt) {
    return arr(w.state && w.state.loaners).filter(function (l) { return usable(l, opt); });
  }

  /* ------------------------------------------------------------------
     ② その日、ふさがっているか
     ふさがる理由は2つ。**どちらも「貸せない日」として同じに扱う。**
       ・貸出（loanerAssigns）
       ・代車自身の予定（fleetEvents＝車検入庫・12ヶ月点検・リースアップ等）
     ⚠ opt.ignoreAssignId … その1件は無いものとして見る（自分自身を数えないため）
     ⚠ opt.noEvents      … 代車自身の予定は見ない（カレンダーの塗り分け用）
     ------------------------------------------------------------------ */
  function busyOn(l, ds, opt) {
    if (!l || !ds) return false;
    var skip = opt && opt.ignoreAssignId;
    var busy = arr(w.state && w.state.loanerAssigns).some(function (a) {
      if (skip && a.id === skip) return false;
      return a.loanerId === l.id && a.fromDate <= ds && a.toDate >= ds;
    });
    if (busy) return true;
    if (opt && opt.noEvents) return false;
    return arr(w.state && w.state.fleetEvents).some(function (e) {
      return e.vehicleId === l.id && e.fromDate <= ds && e.toDate >= ds;
    });
  }

  /* その日ふさがっている理由（画面の説明用）。空いていれば null */
  function busyWhy(l, ds, opt) {
    if (!l || !ds) return null;
    var skip = opt && opt.ignoreAssignId;
    var a = arr(w.state && w.state.loanerAssigns).find(function (x) {
      if (skip && x.id === skip) return false;
      return x.loanerId === l.id && x.fromDate <= ds && x.toDate >= ds;
    });
    if (a) return { kind: 'assign', assign: a };
    var e = arr(w.state && w.state.fleetEvents).find(function (x) {
      return x.vehicleId === l.id && x.fromDate <= ds && x.toDate >= ds;
    });
    if (e) return { kind: 'event', event: e };
    return null;
  }

  /* ------------------------------------------------------------------
     ③ 「N日連続で丸ごと空く代車」が1台でもあるか
     最短入庫日（代車あり）の心臓。
     ⚠ 1台でも見つかればよい（全部空いている必要はない）。
     ------------------------------------------------------------------ */
  function _pd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function _ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function _add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function freeRun(startStr, days, opt) {
    var n = Math.max(1, +days || 1);
    var ls = usableList(opt);
    if (!ls.length) return false;
    var base = _pd(startStr);
    return ls.some(function (l) {
      for (var j = 0; j < n; j++) {
        if (busyOn(l, _ymd(_add(base, j)), opt)) return false;
      }
      return true;
    });
  }

  /* その日ぜんぶ空いている代車の一覧（マイダッシュ・ダッシュボードの件数用） */
  function freeOn(ds, opt) {
    return usableList(opt).filter(function (l) { return !busyOn(l, ds, opt); });
  }

  /* ------------------------------------------------------------------
     ④ 2つの期間がぶつかるか
     🔴 **返却日＝次の貸出の開始日（当日かぶり）は、ぶつかりに数えない。**
        現場では「返ってきたその日に次の人へ渡す」が普通にあるため。
     ⚠ 以前は下書きのドラッグだけ当日かぶりを許し、貸出フォームは警告していた。
        同じことをしているのに入口で結果が変わるのはおかしいので、**こちらに寄せた。**
     ------------------------------------------------------------------ */
  function overlap(aF, aT, bF, bT) {
    if (!aF || !aT || !bF || !bT) return false;
    return !(bF >= aT || bT <= aF);
  }

  /* 期間に本当にぶつかる貸出の一覧（自分自身と、同じ予約のぶんは除く） */
  function conflicts(loanerId, from, to, opt) {
    var skipId   = opt && opt.ignoreAssignId;
    var skipCard = opt && opt.ignoreCardId;
    return arr(w.state && w.state.loanerAssigns).filter(function (a) {
      if (a.loanerId !== loanerId) return false;
      if (skipId && a.id === skipId) return false;
      if (skipCard && a.cardId && a.cardId === skipCard) return false;
      return overlap(from, to, a.fromDate, a.toDate);
    });
  }

  /* 期間にかかる「代車自身の予定」（車検入庫など）。貸出とは別に知らせたい時に使う */
  function eventsIn(loanerId, from, to) {
    return arr(w.state && w.state.fleetEvents).filter(function (e) {
      return e.vehicleId === loanerId && overlap(from, to, e.fromDate, e.toDate);
    });
  }

  /* ------------------------------------------------------------------
     ⑤ その予約の代車、返ってきているか／あと何日か
     -------------------------------------------------------------------
     🔴 v1.82.0（ゆうた指摘）**画面が「日付の引き算」だけで残りを出していた。**
        🗣「そもそも予約というか実績情報が持ってる代車情報とリンクしてる？
           実績になってても代車の返却とリンクしてないよな？」
        そのとおりで、**返却済みなのにカードには「超過5日」と赤く出ていた**
        （代車カレンダー側は灰色で返却済みになっているのに）。
        ＝「返ってきたか」を持っているのは**貸出（loanerAssigns）**なのに、
          画面は**カードの日付**しか見ていなかった。
     🔴 **代車の残りを出すのは、これ1本。** 画面で `loanerTo` を引き算しない。
     ⚠ **車は返したのに代車が戻っていない**（イレギュラー）時は、
        ちゃんと「超過」で赤く出す＝これは知らせるべき事故。消してはいけない。
     ------------------------------------------------------------------ */
  function _today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function _diffDays(fromStr, toStr) {
    return Math.round((_pd(toStr) - _pd(fromStr)) / 86400000);
  }

  /* 返ってきているか（＋返した日）。貸出が正・カードの印は予備。 */
  function backOf(c) {
    if (!c) return { back: false, at: '' };
    var a = arr(w.state && w.state.loanerAssigns).find(function (x) { return x.cardId === c.id; });
    if (a && a.returned) return { back: true, at: a.returnedAt || a.toDate || '' };
    if (c.loanerReturned === true) return { back: true, at: c.loanerTo || '' };
    return { back: false, at: '' };
  }

  /* 色の段階。閾値は設定（settings.loanerColors）から。 */
  function levelOf(rem) {
    if (rem == null) return 'none';
    var s = (w.state && w.state.settings && w.state.settings.loanerColors) || {};
    var g = (s.greenMin != null) ? s.greenMin : 4;
    var a = (s.amberMin != null) ? s.amberMin : 2;
    if (rem < 0)  return 'dead';    /* 期限を過ぎている＝まだ戻っていない */
    if (rem >= g) return 'green';
    if (rem >= a) return 'amber';
    return 'red';
  }

  /* 画面が使う唯一の物差し。
     戻り値 { has, back, at, due, rem, level }
       has   … その予約に代車が付いているか
       back  … 返ってきたか
       at    … 返した日（back の時）
       due   … 返却予定日
       rem   … あと何日（マイナス＝超過／null＝期限未設定）
       level … 'back' | 'green' | 'amber' | 'red' | 'dead' | 'none' */
  function remainOf(c) {
    if (!c || !c.needLoaner) return { has: false, back: false, at: '', due: '', rem: null, level: 'none' };
    var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
    var bk = backOf(c);
    if (bk.back) return { has: true, back: true, at: bk.at || due, due: bk.at || due, rem: null, level: 'back' };
    var rem = due ? _diffDays(_today(), due) : null;
    return { has: true, back: false, at: '', due: due, rem: rem, level: levelOf(rem) };
  }

  /* ------------------------------------------------------------------
     ⑥ 貸していた期間の文字（v1.83.0・ゆうた指定）
     -------------------------------------------------------------------
     🗣「**アーカイブの代車は 〇/〇〜〇/〇 みたいな表記で**」
     ＝**終わった貸出は「あと何日」ではなく「いつからいつまで借りていたか」**が知りたい情報。
     🔴 日付の書き方（8/2〜8/7）を画面ごとに組み立てないこと。ここ1本。
     ⚠ 元にするのは**貸出（loanerAssigns）の実際の期間**。無ければカードの予定を使う。
        ＝返却確定・自動返却で縮んだ（伸びた）実際の期間が出る。
     ------------------------------------------------------------------ */
  function _md(ds) {
    if (!ds) return '';
    var p = String(ds).split('-');
    return p.length === 3 ? (+p[1] + '/' + +p[2]) : String(ds);
  }
  /* その予約の貸出期間 { from, to, text }。text は '8/2〜8/7'（1日だけなら '8/2'） */
  function periodOf(c) {
    if (!c || !c.needLoaner) return { from: '', to: '', text: '' };
    var a = arr(w.state && w.state.loanerAssigns).find(function (x) { return x.cardId === c.id; });
    var from = (a && a.fromDate) || c.loanerFrom || '';
    var to   = (a && a.toDate)   || c.loanerTo   || from;
    if (!from) return { from: '', to: '', text: '' };
    return { from: from, to: to, text: (to && to !== from) ? (_md(from) + '〜' + _md(to)) : _md(from) };
  }

  /* ---- 公開（この名前で他のファイルから呼ぶ） ---- */
  w.pitLoanerPeriodOf    = periodOf;
  w.pitLoanerMD          = _md;
  w.pitLoanerBackOf      = backOf;
  w.pitLoanerRemainOf    = remainOf;
  w.pitLoanerLevelOf     = levelOf;
  w.pitLoanerUsable      = usable;
  w.pitLoanerUsableList  = usableList;
  w.pitLoanerBusyOn      = busyOn;
  w.pitLoanerBusyWhy     = busyWhy;
  w.pitLoanerFreeRun     = freeRun;
  w.pitLoanerFreeOn      = freeOn;
  w.pitLoanerOverlap     = overlap;
  w.pitLoanerConflicts   = conflicts;
  w.pitLoanerEventsIn    = eventsIn;
})();
