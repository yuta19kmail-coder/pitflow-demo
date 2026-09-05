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
         🅿 v2.40.0 **仮押さえ（hold:true）も同じ箱に入っている＝ここでは貸出と同じ「埋まり」。**
         　 ゆうた指定「新規予約などからその部分は埋まっているのと同義で扱ってほしい」がこれ。
         　 ⚠ わざと分けていない。分けると、この物差しを使う画面すべてに
         　 　「仮押さえも見る」を足して回る羽目になり、必ずどこかで抜ける。
       ・代車自身の予定（fleetEvents＝車検入庫・12ヶ月点検・リースアップ等）
     ⚠ opt.ignoreAssignId … その1件は無いものとして見る（自分自身を数えないため）
     ⚠ opt.noEvents      … 代車自身の予定は見ない（カレンダーの塗り分け用）
     ------------------------------------------------------------------ */
  /* 🧩 v2.42.0 中身は下の部品（dayOf）1本に寄せた。**答えは前と同じ。**
     ⚠ ここに自前の読み方を書き戻さないこと。種類が増えた時に**ここだけ古くなる。** */
  function busyOn(l, ds, opt) {
    if (!l || !ds) return false;
    return dayOf(l.id, ds, opt).busy;
  }

  /* その日ふさがっている理由（画面の説明用）。空いていれば null */
  /* 🧩 v2.42.0 中身は下の部品（dayOf）1本に寄せた。**返す形は今までのまま**
     （kind:'assign'|'event'／仮押さえは kind:'assign' ＋ hold:true）
     ＝古い呼び方をしている画面（新規予約の右カラム）をここで守る。
     ⚠ 新しく書く画面は dayOf を直に使うこと。items を回せるので、種類が増えても直さなくていい。 */
  function busyWhy(l, ds, opt) {
    if (!l || !ds) return null;
    var m = dayOf(l.id, ds, opt).main;
    if (!m) return null;
    if (m.kind === 'event') return { kind: 'event', event: m.event, item: m };
    return { kind: 'assign', assign: m.assign, hold: (m.kind === 'hold'), item: m };
  }



  /* ==================================================================
     🧩🧩 v2.42.0（2026-08-31・ゆうた合意）**「この代車の、この日に何が乗っているか」はここが答える。**
     ------------------------------------------------------------------
     🗣 ゆうた「代車のスケジュールはあくまで**代車カレンダーが本流でありマスター**で、
     　　車両管理カレンダーはあくまで**必要な情報をそこから抜き出して見やすくしたよ**、ってイメージ。
     　　新規予約の右カラムの代車カレンダーと同じ扱いって意味合い」

     ◎なぜ作ったか（2026-08-31・🅿仮押さえを入れた時に実際に踏んだ）
       出す場所は4つ（代車カレンダー／車両管理の月・日／新規予約の右カラム）あるのに、
       **どの画面も自前で `state.loanerAssigns` を読んで札を組み立てていた。**
       だから 🅿仮押さえ を足した時、`fleet.js` を**手で直さないと出なかった。**
       このまま 🔧整備の枠 を足すと、また4画面ぶん手で書くことになる（そして必ずどれか忘れる）。

     🔴🔴 **種類（kind）を増やすのはここ1か所。** 画面は items を回して自分の軸で描くだけ。
       ⚠ 軸は画面ごとに違う（代車カレンダー＝縦が日／車両管理＝横が日や月）ので、
          **描き方は共有しない。共有するのは「何が乗っているか」だけ。**

     ◎kind（いまは3つ）
       'lend'  … 貸出（予約から／予約以外／緊急）
       'hold'  … 🅿 仮押さえ
       'event' … 代車自身の予定（車検入庫・12ヶ月点検・リースアップ・その他）
       ⏭ 🔧整備の枠を入れる時は、ここに 'maint' を足す（画面は触らない）

     ◎使い方
       pitLoanerDay(loanerId, 'YYYY-MM-DD', opt)  … その日に乗っているもの
       pitLoanerSpan(loanerId, from, to, opt)     … その期間にかかっているもの（月表示用）
       opt.ignoreAssignId … その貸出1件は無かったことにする（自分自身を数えないため）
       opt.noEvents       … 代車自身の予定は見ない（カレンダーの塗り分け用）
       opt.kinds          … 欲しい種類だけ（例 ['event']）
     ================================================================== */
  /* 🔴 `busy` ＝ **その日、代車として貸せないか**。
     ⚠ 🔧整備の枠の「候補」だけ false。理由は下の「候補は塞がない」を読むこと。 */
  var MAINT_WORKS = {
    shaken: { label: '車検',      slide: false },
    '12pt': { label: '12ヶ月点検', slide: true  },
    general:{ label: '一般',      slide: true  },
    bp:     { label: 'B.P',       slide: true  },
    fix:    { label: '修理',      slide: true  }
  };
  var KINDS = {
    lend:  { label: '貸出',    busy: true  },
    hold:  { label: '仮押さえ', busy: true  },
    event: { label: '予定',    busy: true  },
    maint: { label: '整備の枠', busy: null  }   /* null＝stage で決まる（下の _maintBusy） */
  };

  /* ==================================================================
     🔧 整備の枠（v2.43.0・2026-08-31 ゆうた確定）
     ------------------------------------------------------------------
     🗣「Aという代車の車検が10月です → 結局予定が詰まってるし、緊急で出さなきゃならない場合もあるしで、
     　4〜6／12〜16／22〜24 が空いてるからここのどこかで車検して！ みたいなスケジュールになる事が多い。
     　だから黄色の枠でとっておいて、そこから実際に作業する場合はタスクボードにカードとして入庫する」

     ◎3つの顔（同じ1件が、決まり具合で見え方を変える）＝`stage`
       ⚠ **`status` という名前は使わない。**このアプリで `status` は**カードの状態**（予約・入庫…）を指す。
       　 同じ名前を別の意味で使うと、見張り（test_pit_rules の「知らない状態の名前」）が正しく鳴らなくなる。
       'month'     … 月の目標（10月に車検）。**日はまだ無い**
                     🔴 **保存しない。**満了日・12ヶ月点検日から**計算で出す**（裏で勝手に書かない）
                     🔴 **日のカレンダーには出さない**（縮尺が違うものを日軸に乗せると必ず破綻する）
       'candidate' … 日の候補（飛び地でいくつでも）。**人が手で置く**＝保存する
       'fixed'     … 確定（実際に入庫した期間）。1つだけ

     🔴🔴 **候補は代車を塞がない（ゆうた確定＝C案）。**
        ただし **「代車ありの最短入庫日」の案内からは外す**（planWindow が避ける）。
        ＝ 現場が手で貸すのは自由。自動で「この日に入庫できます」と**約束する側**だけが遠慮する。
        ⚠ 候補も塞ぐと、候補3本で10月がほぼ全滅に見えて最短入庫日が後ろに飛ぶ。
        ⚠ 逆にどこにも効かせないと、全部の候補日を埋めてしまって車検に出す日が無くなる。

     🔴🔴 **車検の満了を過ぎても、貸出は止めない。**（ゆうた指定 2026-08-31）
        🗣「どんなにあっても、もともと生命線だから落とすことはない」
        ＝ 出すのは**警告だけ**。`pitLoanerUsable` からは外さない。**ここに貸出停止を書き足さないこと。**
     ================================================================== */
  function _maintBusy(it) { return it && it.stage === 'fixed'; }

  function _assignItem(a) {
    return {
      kind: a.hold ? 'hold' : 'lend',
      id: a.id, from: a.fromDate, to: a.toDate,
      assign: a, cardId: a.cardId || null,
      emergency: !!a.emergency, returned: !!a.returned,
      memo: a.hold ? (a.memo || '') : (a.purpose || ''),
      label: a.hold ? '仮押さえ' : (a.customer || (a.emergency ? '緊急' : '貸出'))
    };
  }
  /* 🔴🔴 v2.49.0 **整備の枠は「予約カードの候補」から作る**（fleetEvents ではもう無い）。
     カード1枚＝作業1本、候補（飛び地）は `maintSpans` の1本ずつ。形は pit-share.js に書いた。
     ⚠ 名前は**作業タイプから出す**（書き込み忘れで「整備の枠」に落ちると、何の作業か分からなくなる）。 */
  function _maintItem(c, sp) {
    var work = c.workType || '';
    return {
      kind: 'maint', id: c.id + '#' + sp.sid, from: sp.from, to: sp.to,
      card: c, maintOf: c, cardId: c.id, sid: sp.sid,
      stage: (c.maintFixSid === sp.sid) ? 'fixed' : 'candidate',
      work: work,                    /* shaken / 12pt / general / bp */
      groupId: c.id,
      urgent: !!c.urgent,
      skipped: Array.isArray(c.maintSkipped) ? c.maintSkipped : [],
      memo: c.memo || '',
      /* 🏁 v2.72.0 「完了する」を押したか。押してあれば画面はグレーで出す（車両管理と同じ意味）。 */
      done: !!c.maintDone,
      label: (MAINT_WORKS[work] && MAINT_WORKS[work].label) || '整備の枠',
      color: '#d6a846'
    };
  }
  function _eventItem(e) {
    /* ⚠ `FL_EVT_TYPES` は fleet.js の **const**＝`window.FL_EVT_TYPES` にはならない。
       `w.FL_EVT_TYPES` で取ろうとすると必ず undefined になり、
       **車検入庫の赤・12ヶ月点検の橙・リースアップの紫が全部あおに落ちる**（画面は出るので気づけない）。
       ⚠ このファイルは fleet.js より**前**に読むので、読み込み時には居ない。呼ばれる時には居る。 */
    var TY = (typeof FL_EVT_TYPES !== 'undefined') ? FL_EVT_TYPES : null;
    var t = (TY && TY[e.type]) || null;
    return {
      kind: 'event', id: e.id, from: e.fromDate, to: e.toDate,
      event: e, auto: !!e.auto,
      memo: '', label: e.label || (t ? t.label : '予定'), color: t ? t.color : '#3b82f6'
    };
  }
  function _pick(items, opt) {
    if (opt && opt.kinds && opt.kinds.length) {
      items = items.filter(function (x) { return opt.kinds.indexOf(x.kind) >= 0; });
    }
    if (opt && opt.noEvents) items = items.filter(function (x) { return x.kind !== 'event'; });
    /* 並びは 貸出 → 整備の確定 → 仮押さえ → 整備の候補 → 予定
       （画面が「主役」を取りたい時は先頭を見る。**決まっているものほど前**） */
    var ord = { lend: 0, maintFixed: 1, hold: 2, maint: 3, event: 4 };
    var rank = function (x) { return ord[(x.kind === 'maint' && x.stage === 'fixed') ? 'maintFixed' : x.kind]; };
    return items.slice().sort(function (a, b) { return (rank(a) - rank(b)) || (a.from < b.from ? -1 : 1); });
  }
  function _collect(loanerId, from, to, opt) {
    var skip = opt && opt.ignoreAssignId;
    var out = [];
    arr(w.state && w.state.loanerAssigns).forEach(function (a) {
      if (!a || a.loanerId !== loanerId) return;
      if (skip && a.id === skip) return;
      if (!(a.fromDate <= to && a.toDate >= from)) return;
      out.push(_assignItem(a));
    });
    /* 代車自身の予定（車検入庫・リースアップなど）＝いままでどおり fleetEvents */
    arr(w.state && w.state.fleetEvents).forEach(function (e) {
      if (!e || e.vehicleId !== loanerId) return;
      if (!(e.fromDate <= to && e.toDate >= from)) return;
      if (e.maint) return;   /* ⚠ v2.49.0 まで整備の枠もここに居た。**もうカードにある**ので拾わない */
      /* 🔴🔴 v2.70.1（ゆうた報告 2026-09-05「整備の仕組みになる以前の車検の予定が代車カレンダーに残ってる」）
         **アプリが勝手に作った予定（auto）は、もうどの画面にも出さない。**
         ◎正体 … v1.12 のころ、車を保存するたびに「車検入庫（赤）」「12ヶ月点検（橙）」を
           `fleetEvents` に自動で作っていた（`auto_<車id>_shakenIn` / `_tenken`）。
           車両カレンダーは v2.46.0 で**画面側で** `!x.auto` として外したが、
           **代車カレンダーは外していなかった**＝そこだけ古い車検の予定が残って見えていた。
           しかも車を保存するたびに**作り直されて**いたので、消しても戻ってきた。
         ◎いま … 作るのをやめた（fleet.js の `_flSyncVehEvent` を廃止）。
           残っている古いぶんは `pitCleanupAutoVehEvents` が画面を開いた時に片付ける。
         ⚠ ここで弾くのは**その片付けが回るまでの間**と、古い端末の控えのため。
            画面側の `!x.auto` は**もう要らない**（物差しが1本で弾く）。
         ⚠ 手で入れた「車検入庫」は auto が付かない＝**消えない**（人が入れたものは勝手に消さない）。 */
      if (e.auto) return;
      out.push(_eventItem(e));
    });
    /* 🔧 整備の枠＝予約カードの候補（v2.49.0）。
       🔴 **月の目標（候補が1本も無いカード）は日の軸には出ない**（配列が空なので自然に出ない）。
          縮尺が違うものを日のカレンダーに乗せると必ず破綻する（2026-08-31 の整理）。
       ⚠ v2.48.0 まではここに `opt.withMonth` という逃げ道があった。月と日が同じ箱に居たため。
          **カードに分けたら要らなくなったので消した。**（逃げ道は要らなくなったら残さない） */
    arr(w.state && w.state.cards).forEach(function (c) {
      if (!c || c.internKind !== 'loanercar' || !Array.isArray(c.maintSpans)) return;
      if (c.maintVehId !== loanerId) return;
      if (c.status === 'cancelled' || c.status === 'scrap') return;
      arr(c.maintSpans).forEach(function (sp) {
        if (!sp || !sp.from || !sp.to) return;
        if (!(sp.from <= to && sp.to >= from)) return;
        out.push(_maintItem(c, sp));   /* 整備の枠は「代車自身の予定（青帯）」と kind を分ける */
      });
    });
    return _pick(out, opt);
  }
  function dayOf(loanerId, ds, opt) {
    var items = _collect(loanerId, ds, ds, opt);
    items.forEach(function (x) { x.isStart = (x.from === ds); x.isEnd = (x.to === ds); });
    return {
      ds: ds, loanerId: loanerId, items: items,
      lends:  items.filter(function (x) { return x.kind === 'lend'; }),
      holds:  items.filter(function (x) { return x.kind === 'hold'; }),
      events: items.filter(function (x) { return x.kind === 'event'; }),
      main:   items[0] || null,
      maints: items.filter(function (x) { return x.kind === 'maint'; }),
      /* 🔴 貸せないか。整備の枠は **確定だけ** 数える（候補は塞がない＝ゆうた確定） */
      busy:   items.some(function (x) {
                var k = KINDS[x.kind];
                if (!k) return false;
                return (k.busy === null) ? _maintBusy(x) : !!k.busy;
              }),
      /* 案内（最短入庫日）で避けたいか＝塞がるもの ＋ **整備の候補**も避ける */
      avoid:  items.some(function (x) {
                var k = KINDS[x.kind];
                if (!k) return false;
                if (k.busy === null) return true;   /* 整備の枠は候補も確定も避ける */
                return !!k.busy;
              })
    };
  }
  function spanOf(loanerId, from, to, opt) { return _collect(loanerId, from, to, opt); }

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

  /* 🔧 v2.43.0 **案内（最短入庫日）は `avoid` を見る**＝整備の枠は候補でも避ける。
     ⚠ 「実際に貸せるか」は今までどおり `busyOn`（候補では塞がらない）。**2つを取り違えないこと。** */
  function avoidOn(l, ds, opt) {
    if (!l || !ds) return false;
    return dayOf(l.id, ds, opt).avoid;
  }
  function freeRun(startStr, days, opt) {
    var n = Math.max(1, +days || 1);
    var ls = usableList(opt);
    if (!ls.length) return false;
    var base = _pd(startStr);
    return ls.some(function (l) {
      for (var j = 0; j < n; j++) {
        if (avoidOn(l, _ymd(_add(base, j)), opt)) return false;
      }
      return true;
    });
  }

  /* その日ぜんぶ空いている代車の一覧（マイダッシュ・ダッシュボードの件数用） */
  function freeOn(ds, opt) {
    return usableList(opt).filter(function (l) { return !busyOn(l, ds, opt); });
  }

  /* ==================================================================
     🆕 v1.156.0（ゆうた指定 2026-08-20）＝**案内できる最短入庫日の物差し**
     ------------------------------------------------------------------
     🗣「現状**代車が1日でも空いてたらOKの扱い**だから、結局最短入庫日が『今日』から動かない。
     　　ただ実態としてはさすがに違う。だから最短可能日の日付は
     　　**1週間きちっと枠がとれる日程**から案内するようにして。
     　　加えて、作業タイプを選んだ場合はそこに入っている**暫定預かり日数と前後1日ずつの予備**が
     　　とれる日程を最短入庫日に指定したい」
     🗣「客の車が国産車／輸入車かバッジが入力された場合は、
     　　**国産車→国産車、輸入車→国産車・輸入車**で、国産車の場合は**輸入車の代車も避けて**案内してほしい
     　　（最終的に輸入車の代車で予約することは可能）。**あくまで初期の案内の日付の付け方として**」

     ◎いる窓（ゆうた確定）
       ・作業タイプ**未選択** … 入庫日から **7日連続**（1週間きっちり取れる日から案内）
       ・作業タイプ**選択済** … **入庫日の前日 〜 入庫日＋預かり日数** ＝ **預かり日数＋2日 連続**
         　　　　　　　　　　　（前の人が延びても、この人が延びても、こたえられる幅）
       ⚠ 前日が「今日より前」になる時は今日から数える（過ぎた日は押さえられない）。

     ◎車格（ゆうた確定）
       ・お客様が**国産車** … 🔴 **輸入車の代車は数えない**（案内では避ける）
       ・お客様が**輸入車** … 国産車も輸入車も数える
       ・まだ選んでいない   … 絞らない
       🔴 **これは「初期の案内」だけの決まり。**あとから輸入車の代車を選んで予約するのは自由。
          ここで**貸せなくするのではない**＝カレンダーの列も減らさない。

     ⚠ 実際に貸すかどうか・ぶつかりの判定は今までどおり busyOn / conflicts。ここは**案内専用**。
     ================================================================== */

  /* お客様の車（国産＝default／輸入＝import）に合う代車か（案内のときだけ使う） */
  function fitsBoard(l, board) {
    if (!l) return false;
    if (board === 'default') return l.category !== 'import';   /* 国産のお客様＝輸入の代車は避ける */
    return true;                                               /* 輸入のお客様・未選択＝全部 */
  }

  /* 案内にいる窓（何日ぶん・前に何日ぶら下げるか）。hold＝暫定預かり日数（未選択なら null）

     🔴🔴 v1.158.0（ゆうた確定 2026-08-20）**預かり 0日 は「無し」ではない。**
     🗣「**0日あり得る。いって帰ってくるだけで代車使いたいと。代車的には1日利用として存在する**」
       ＝ 泊まらない（当日返し）だけで、**代車はその日1日ぶん、ちゃんと押さえる**。
     ⚠ v1.157.1 まではここで `h <= 0` をまとめて弾き、**0 を「まだ決まっていない」と同じ扱い**にして
        **1週間の窓**を出していた。
        ＝ 当日返しのお客様に「1週間まるごと空いている日」しか案内できず、
           **最短入庫日が本当より先に出ていた**（しかもエラーは出ない）。
     🔴 **0 と 未選択を混ぜないこと。**
        | hold | 意味 | いる窓 |
        |---|---|---|
        | `null` / `''` | まだ決まっていない | **7日**（1週間きっちり） |
        | `0` | **当日返し＝代車は1日** | **3日**（前日・当日・翌日） |
        | `1以上` | その日数 | 日数＋前後1日 |                          */
  var PLAN_WEEK = 7;          /* 作業タイプ未選択のときに要る連続日数 */
  var PLAN_PAD  = 1;          /* 作業タイプ選択時の予備（前後1日ずつ） */
  var PLAN_MIN  = 1;          /* 🔴 代車が要る最小の日数。0泊（当日返し）でも1日は使う */
  function planNeed(hold) {
    if (hold == null || hold === '') return { days: PLAN_WEEK, back: 0, why: '1週間' };
    var h = +hold;
    if (!isFinite(h) || h < 0) return { days: PLAN_WEEK, back: 0, why: '1週間' };
    var use = Math.max(PLAN_MIN, Math.round(h));   /* 代車を使う日数（0泊でも1日） */
    return { days: use + PLAN_PAD * 2, back: PLAN_PAD,
             why: (h === 0 ? '当日返し（代車1日）' : '預かり' + h + '日') + '＋前後' + PLAN_PAD + '日' };
  }

  /* その日を入庫日にしたとき、案内していい窓が取れるか。
     戻り値 { ok, from, to, days, why, car }（car＝その窓を丸ごと取れる代車。ok の時だけ入る） */
  function planWindow(dateStr, hold, opt) {
    opt = opt || {};
    var need = planNeed(hold);
    var d = _pd(dateStr);
    if (isNaN(d.getTime())) return { ok: false, from: '', to: '', days: 0, why: need.why, car: null };
    var rawFrom = _add(d, -need.back);
    var to = _add(rawFrom, need.days - 1);
    /* 過ぎた日は押さえられないので、今日より前には遡らない */
    var today = _pd(_ymd(new Date()));
    var from = (rawFrom < today) ? today : rawFrom;
    var ls = usableList(opt).filter(function (l) { return fitsBoard(l, opt.board); });
    var car = null;
    ls.some(function (l) {
      for (var x = new Date(from); x <= to; x = _add(x, 1)) {
        if (avoidOn(l, _ymd(x), opt)) return false;   /* 🔧 整備の候補も避ける（案内だけ） */
      }
      car = l; return true;
    });
    return { ok: !!car, from: _ymd(from), to: _ymd(to), days: need.days, why: need.why, car: car };
  }
  function planOk(dateStr, hold, opt) { return planWindow(dateStr, hold, opt).ok; }


  /* ==================================================================
     🔧 月の目標（v2.43.0）＝「10月に車検」。**保存しない。計算で出す。**
     ------------------------------------------------------------------
     🔴 裏で勝手にレコードを書かない＝開いただけでクラウドに書き込まないため。
        保存するのは、人が作った **日の候補・確定・修理・「今日はやらない」** だけ。
     🔴 **日のカレンダーには出さない**（月の目標を日軸に乗せると必ず破綻する）。
        出すのは **作業予定ボード** と **月カレンダーのバッジ**。

     ◎車検（ゆうた確定 2026-08-31）
       「車検は満了日から2ヵ月前から」＝ 受けられるのは **満了の2ヶ月前 〜 満了日**。
       バッジを立てるのは **満了月＋その前2ヶ月の3ヶ月**（満了 10/31 なら 8月・9月・10月）。
       🔴 満了を過ぎたら **翌月へスライドしない。赤の別扱い。**
       🔴🔴 ただし **貸出は止めない**（🗣「どんなにあっても、もともと生命線だから落とすことはない」）。
     ◎12ヶ月点検
       日は `pitTenkenFromShaken` が出す（車検の手前／過ぎていれば次の年）。
       できなかった月は **翌月へスライド**＋ボードで警告（回数は数えない＝ゆうた指定）。
     ⚠ `pitTenkenFromShaken` は loaner.js の側にある（このファイルより後ろで読む）。
        **呼ばれる時には居る**ので typeof で見る。`w.` 経由では取らない。
     ================================================================== */
  function _ym(ds) { return String(ds || '').slice(0, 7); }
  function _ymAdd(ym, n) {
    var p = String(ym).split('-'), y = +p[0], m = +p[1] - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function _monthAgo(ds, n) {
    var p = String(ds).split('-'); if (p.length !== 3) return '';
    var d = new Date(+p[0], +p[1] - 1 - n, +p[2]);
    /* 末日はみ出し（3/31 の2ヶ月前＝1/31）は Date が勝手に繰り上げるので戻す */
    if (d.getDate() !== +p[2]) d = new Date(+p[0], +p[1] - 1 - n + 1, 0);
    return _ymd(d);
  }
  function maintPlans(v, todayStr) {
    var today = todayStr || _ymd(new Date());
    var out = [];
    if (!v) return out;
    if (v.shakenDate) {
      var openFrom = _monthAgo(v.shakenDate, 2);
      out.push({
        work: 'shaken', label: '車検', vehicleId: v.id,
        dueDate: v.shakenDate, openFrom: openFrom, openTo: v.shakenDate,
        months: [_ymAdd(_ym(v.shakenDate), -2), _ymAdd(_ym(v.shakenDate), -1), _ym(v.shakenDate)],
        ym: _ym(v.shakenDate),
        overdue: today > v.shakenDate,           /* 🚨 満了超過（赤・スライドしない） */
        slipped: false,
        inWindow: (today >= openFrom && today <= v.shakenDate)
      });
      var tk = (typeof pitTenkenFromShaken === 'function') ? pitTenkenFromShaken(v.shakenDate) : '';
      if (tk) {
        var slip = tk < today;
        out.push({
          work: '12pt', label: '12ヶ月点検', vehicleId: v.id,
          dueDate: tk, openFrom: _ym(tk) + '-01', openTo: tk,
          /* 🔴 v2.71.0（ゆうた指定 2026-09-05）**12ヶ月点検も帯にする＝目安の月＋その前1ヶ月の2ヶ月。**
             🗣「12点も車検のように2ヵ月分でバーで表示してほしい」
             ⚠ 車検は「満了月＋その前2ヶ月＝3ヶ月」。12点は**2ヶ月**（期限ではなく目安なので短い）。
             ⚠ `months` は**カレンダーで帯を出す月**。「本来いつまでか」は `dueDate` の方を見ること
                （`months[0]` を期限の月として読むと、ここを変えた時に必ずズレる）。 */
          months: [_ymAdd(_ym(tk), -1), _ym(tk)],
          ym: slip ? _ym(today) : _ym(tk),       /* できなかったら今の月へスライド */
          overdue: false, slipped: slip,
          inWindow: (_ym(today) === _ym(tk)) || slip
        });
      }
    }
    return out;
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

  /* 🔴 v1.146.0（ゆうた指定 2026-08-19）返ってきたか・何色か の中身は
     **全アプリ共通の部品（_shared/coreflow-loaner-remain.js）に移した。**
     🗣「（CarFlow は）あくまで **PitFlow の出張画面**だから、**PitFlow に完全に準拠**してほしい」
     ⚠ CarFlow が同じ計算を**写しで持っていて、返したかどうかを見ていなかった**（返却済みでも赤い「超過」）。
     　 写しを直すのではなく、**判定を1本にして両方がそれを使う**形にした。
     ⚠ ここは**昔の名前で呼んでいる所のための入口**。中身は部品に渡すだけ。
     ⚠ 部品が読み込めていない時のための保険だけ残してある（下の _backFallback / _levelFallback）。
     ⚠ 部品に渡すもの（貸した札・色の境目）は、このファイルの下のほうで setup している。 */
  function backOf(c) {
    if (w.CFLoanerRemain) return CFLoanerRemain.backOf(c);
    return _backFallback(c);
  }
  function _backFallback(c) {
    if (!c) return { back: false, at: '' };
    var a = arr(w.state && w.state.loanerAssigns).find(function (x) { return x.cardId === c.id; });
    if (a && a.returned) return { back: true, at: a.returnedAt || a.toDate || '' };
    if (c.loanerReturned === true) return { back: true, at: c.loanerTo || '' };
    return { back: false, at: '' };
  }
  function levelOf(rem) {
    if (w.CFLoanerRemain) return CFLoanerRemain.levelOf(rem);
    return _levelFallback(rem);
  }
  function _levelFallback(rem) {
    if (rem == null) return 'none';
    var s = (w.state && w.state.settings && w.state.settings.loanerColors) || {};
    var g = (s.greenMin != null) ? s.greenMin : 4;
    var a = (s.amberMin != null) ? s.amberMin : 2;
    if (rem < 0)  return 'dead';
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
    if (w.CFLoanerRemain) return CFLoanerRemain.of(c);
    return _remainFallback(c);
  }
  function _remainFallback(c) {
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
  /* 🔴 v1.146.0 共通部品に「PitFlow のデータ」を差し込む。**判定の中身は部品が持つ。**
     ⚠ 渡すのは 貸した札 と 色の境目 の2つだけ。ここに条件を書き足さない。 */
  if (w.CFLoanerRemain) {
    CFLoanerRemain.setup({
      assigns: function () { return (w.state && w.state.loanerAssigns) || []; },
      colors:  function () { return (w.state && w.state.settings && w.state.settings.loanerColors) || null; }
    });
  }

  w.pitLoanerRemainOf    = remainOf;
  w.pitLoanerLevelOf     = levelOf;
  w.pitLoanerUsable      = usable;
  w.pitLoanerUsableList  = usableList;
  w.pitLoanerBusyOn      = busyOn;
  w.pitLoanerBusyWhy     = busyWhy;
  /* 🧩 v2.42.0 「その日／その期間に何が乗っているか」＝画面はこれを呼ぶ */
  w.pitLoanerDay         = dayOf;
  w.pitLoanerAvoidOn     = avoidOn;      /* 案内で避けるか（整備の候補も避ける） */
  w.pitLoanerMaintPlans  = maintPlans;   /* 🔧 月の目標（計算・保存しない） */
  w.PIT_MAINT_WORKS      = MAINT_WORKS;
  w.pitLoanerSpan        = spanOf;
  w.PIT_LOANER_KINDS     = KINDS;
  w.pitLoanerFreeRun     = freeRun;
  w.pitLoanerFitsBoard   = fitsBoard;
  w.pitLoanerPlanNeed    = planNeed;
  w.pitLoanerPlanWindow  = planWindow;
  w.pitLoanerPlanOk      = planOk;
  w.pitLoanerFreeOn      = freeOn;
  w.pitLoanerOverlap     = overlap;
  w.pitLoanerConflicts   = conflicts;
  w.pitLoanerEventsIn    = eventsIn;
})();
