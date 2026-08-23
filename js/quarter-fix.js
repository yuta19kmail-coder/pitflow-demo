/* ================================================================================
   quarter-fix.js  -  🛠 突き合わせた一覧を**その場で片づける**  PitFlow v2.0.0
   ================================================================================
   ◎なぜ要るか（ゆうた指定 2026-08-23）
     🗣「**確かに付け合わせしてズレているものはそのままそこで修正できなきゃ意味ないもんね。
     　　個別に日付を修正できるボタンを出すようにしよう**」
     🗣「**基本的には 修正 or 伝票側を直したからそのまま の2択がほしい**」

   ◎🔴🔴 いちばん大事な決めごと ── **1行につき、答えは2つだけ。**
     ① **直す** …… PitFlow を**伝票に合わせる**（押すとカードが実際に書き換わる）
     ② **伝票を直した** … 整備ソフト側を直したので、PitFlow は**このままでよい**
        ＝ その行に**印**を付ける。次に同じ期間を走らせても**片づいたもの**として扱う。
     ⚠ この2つ以外の道（「あとで」「無視」）は**作らない**。
        作った瞬間に、同じ行が毎回出続けて**一覧が信用されなくなる**（データチェックで学んだこと）。

   ◎🔴🔴 **印**を付けても、合計・差・内訳・検算は1円も動かさない。
     手元の PDF は**直す前のもの**なので、そこに出ている数字は**事実**。
     印は「もう手を打った」という**人の判断**であって、**数字の書き換えではない**。
     ＝ 印で数字が動くと、検算（合計が合うまで数字を出さない）が意味を失う。
   ◎⚠ **「直す」のほうは、数字が動く。** カードそのものを書き換えるので、
     数え直せば PitFlow 側の合計が変わり、差が縮む。それは**本当に変わったから**であって、
     上の決めごとと矛盾しない。**印＝動かさない／直す＝動く**。ここを取り違えないこと。

   ◎直せるもの（ゆうた確定＝日付2つ＋金額）
     | 種類 | 何を | 誰が | 押すと動くもの |
     |---|---|---|---|
     | **売上日** | カードの売上日 ＝ 伝票の日 | **誰でも** | 🟢 **売上の数字は1円も動かない** |
     | **実績日** | 実績カウント日 ＝ 伝票の日（返車日も揃う） | **管理者だけ** | 🔴 **締めた月の数字が動く** |
     | **金額** | 確定金額 ＝ 伝票の金額 | **管理者だけ** | 🔴 **売上の金額が動く** |
     🔴 鍵（誰が直せるか）は **card-view.js の `pitCanEditFinal` 1本**を借りる。ここで役割を判定しない。
     🔴 実績日の書き込みは **card-view.js の `pitApplyResultDate` 1本**（実績日・返車日・確定返車日の3つを揃える）。
     🔴 売上日の書き込みは **sales-date.js の `pitSetSalesDate` 1本**。

   ◎印の置き場所（🔴 Firestore のルールを1文字も触っていない）
     `companies/{cid}/pitSettings/qmarks` の `一覧`。
     ⚠ 鍵は **売上日｜伝票番号｜カードid｜種類**。
        伝票番号だけだと**月がかわると同じ番号が出る**ので、売上日を頭に付けて一意にする。

   ◎ここが返すもの
     pitQFixKinds(pair)              … その行の「ズレ」一覧
     pitQFixApply(kind, pair)        … 直す（Promise<bool>・確認つき）
     pitQMarkKey(kind, soft, cardId) … 印の鍵
     pitQMarkOf(kind, soft, cardId)  … いま付いている印（無ければ null）
     pitQLoadMarks()                 … 印を読む（Promise）
     pitQMark(kind, soft, cardId, on)… 印を付ける／外す（Promise）

   ⚠ 読み込みは quarter-match.js／card-view.js／sales-date.js より後ろ、quarter.js より前。
   ================================================================================ */
(function (w) {
  'use strict';

  function s(v){ return String(v == null ? '' : v); }
  function t(v){ return s(v).trim(); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function yen(n){ return num(n).toLocaleString(); }
  var CAP = 800;

  function co(){ try { return (w.fb && w.fb.company) ? w.fb.company() : null; } catch (e) { return null; } }
  function cloud(){ return !!(w.PIT_CLOUD && co()); }
  function me(){ try { return (w.pitFlowMe && w.pitFlowMe()) || ''; } catch (e) { return ''; } }
  function card(id){
    return ((w.state && w.state.cards) || []).filter(function (c) { return c && c.id === id; })[0] || null;
  }
  /* 🔴 「確定金額・実績日を直せる人か」は card-view.js の1本。ここで pitIsAdmin と書かない。 */
  function canFinal(){ return w.pitCanEditFinal ? !!w.pitCanEditFinal() : false; }

  /* ================================================================
     0. 🔢 1行ごとの番号（v2.0.0・ゆうた指定 2026-08-23）
     ----------------------------------------------------------------
     🗣「**こちも1件ずつにナンバーを入れて**」
        ＝ データチェックと同じ。**番号ひとつで「どの行の話か」が決まる**ようにする。
          「◯◯番、実績日を押しといて」で通じる。電話でもLINEでも。

     🔴 **作り方はデータチェックの1本（`pitInspectNo`）をそのまま借りる。**
        ここで別のハッシュを書かない。＝ 番号の作り方が2つに割れない。
     🔴 元にするのは **売上日｜伝票番号｜カードid** だけ。
        日付・件数・並び順・ログインしている人など**変わるものを1つも混ぜない**
        （混ぜた瞬間に「毎回おなじ」が壊れる。v1.178.0 の決めごと）。

     ◎頭の2文字で、どこの行かが分かる
       `Q-######`  … 結びついた行（伝票とカードが1対1で結ばれたもの）
       `QS-######` … 整備ソフトだけ（PitFlow に実績が無い伝票）
       `QP-######` … PitFlow だけ（PDF に載っていない実績）
     ⚠ データチェックの番号（`F05-483102`）とは**頭がちがう**ので混ざらない。
     ⚠ エラー番号（`PF-0412`）とも別物。
     ================================================================ */
  function rowNo(prefix, soft, cardId){
    var k = t(prefix) + ':' + [t(soft && soft.売上日), t(soft && soft.伝票), t(cardId)].join('|');
    return w.pitInspectNo ? w.pitInspectNo(k) : '';
  }
  function pairNo(p){
    return rowNo('Q', p && p.soft, t(p && p.pit && p.pit.生 && p.pit.生.id));
  }
  function softOnlyNo(r){ return rowNo('QS', r && r.soft, t(r && r.カード && r.カード.生 && r.カード.生.id)); }
  function pitOnlyNo(r){ return rowNo('QP', { 売上日: t(r && r.数える日), 伝票: '' }, t(r && r.生 && r.生.id)); }

  /* ================================================================
     1. 印（伝票を直したから、このままでよい）
     ================================================================ */
  function markKey(kind, soft, cardId){
    return [t(soft && soft.売上日), t(soft && soft.伝票), t(cardId), t(kind)].join('|');
  }
  function marks(){ return (w._pitQMarks = w._pitQMarks || []); }
  function markOf(kind, soft, cardId){
    var k = markKey(kind, soft, cardId);
    return marks().filter(function (x) { return x && x.key === k; })[0] || null;
  }

  function loadMarks(){
    var c = co();
    if (!cloud() || !c){ w._pitQMarks = []; return Promise.resolve([]); }
    return c.collection('pitSettings').doc('qmarks').get().then(function (snap) {
      w._pitQMarks = (snap.exists && snap.data() && snap.data().一覧) || [];
      return w._pitQMarks;
    }).catch(function () { w._pitQMarks = []; return []; });
  }

  /* ⚠ 練習用サイト（本番でない）では**この端末の中だけ**に置く。
     🔴 ただし「残った」と嘘をつかない＝戻り値 false で伝え、画面がそう書く。
        （黙って消えるのがいちばん困る。2026-08-13 の決めごと） */
  function saveMarks(){
    var c = co();
    var list = marks().slice(0, CAP);
    if (!cloud() || !c) return Promise.resolve(false);
    return c.collection('pitSettings').doc('qmarks').set({ 一覧: list }).then(function () { return true; });
  }

  /* 印を付ける／外す。⚠ **消さない**＝外した記録も残さないが、付けた記録は誰がいつを持つ。 */
  function mark(kind, soft, pit, on){
    var cardId = t(pit && pit.生 && pit.生.id);
    var k = markKey(kind, soft, cardId);
    var list = marks().filter(function (x) { return x && x.key !== k; });
    if (on){
      list.unshift({
        key: k, 種類: t(kind),
        売上日: t(soft && soft.売上日), 伝票: t(soft && soft.伝票),
        ナンバー: t(soft && soft.ナンバー), お客様: t(soft && soft.顧客名),
        カードid: cardId,
        at: (new Date()).toISOString(), by: me()
      });
    }
    w._pitQMarks = list;
    return saveMarks().then(function (saved) {
      var c = card(cardId);
      if (c && w.logFlow){
        logFlow(c, on ? ('整備ソフト側を直した（' + t(kind) + '／伝票 ' + t(soft && soft.伝票) + '）'
                         + '＝PitFlow はこのままでよい、と決めた')
                     : ('整備ソフト側を直した印を外した（' + t(kind) + '）'));
      }
      if (w.pitLog){
        pitLog(on ? '突き合わせ：整備ソフト側を直したと決めた' : '突き合わせ：その印を外した',
               { cardId: cardId, kind: 'inspect',
                 label: t(kind) + '／伝票 ' + t(soft && soft.伝票) + '／' + t(soft && soft.顧客名) });
      }
      if (w.PitDB && w.PitDB.save) PitDB.save();
      if (!saved && w.pitToast) pitToast('練習用サイトなので、この印はこの端末にしか残りません');
      return true;
    });
  }

  /* ================================================================
     2. その行の「ズレ」＝直せるものを並べる
     ----------------------------------------------------------------
     🔴 **判定はここ1本。** 画面（quarter.js）でズレの条件を書き写さないこと。
     ⚠ 出す順番＝**安いものから**（売上日→実績日→金額）。
        押した時に動く数字が小さい順。並びが逆だと、勢いで重いほうを押してしまう。
     ================================================================ */
  function fixKinds(p){
    if (!p || !p.soft || !p.pit) return [];
    var out = [];
    var to = t(p.soft.売上日);

    /* ① 売上日（🟢 数字は動かない・誰でも） */
    if (to && t(p.pit.売上日) !== to){
      out.push({
        kind: '売上日',
        now: t(p.pit.売上日) || '（なし）',
        to: to,
        label: '売上日を ' + to + ' にする',
        why: t(p.pit.売上日) ? 'カードの売上日が伝票とちがいます' : 'カードに売上日が入っていません',
        can: true,
        重い: false
      });
    }
    /* ② 実績日（🔴 締めた月の数字が動く・管理者だけ）
       ⚠ 出すのは**日付がズレている行だけ**。同じQの中の1〜2日ちがいは実務でふつうに起きるので出さない
          （出すと毎週何十行にボタンが並び、本当に直すべき行が埋もれる）。 */
    var k = p.日付 && p.日付.kind;
    if (to && (k === 'crossMonth' || k === 'crossQ' || p.期間の外) && t(p.pit.数える日) !== to){
      out.push({
        kind: '実績日',
        now: t(p.pit.数える日) || '（なし）',
        to: to,
        label: '実績日を ' + to + ' にする',
        why: p.期間の外 ? 'この期間の外にいます（まとめて返車済みにした日かもしれません）'
                        : (p.日付.label || '日付がズレています'),
        can: canFinal(),
        重い: true
      });
    }
    /* ③ 担当（🟡 売上の合計は動かない。動くのは**フロント別の内訳**だけ・誰でも）
       ----------------------------------------------------------------
       🗣 ゆうた「**またPDFと担当者のズレは別途追加チェックして**」（2026-08-23）
       🔴 名前は **quarter-match.js の名寄せ表（`pitQStaffName`）**を通してから比べる／入れる。
          伝票側は「専務」「チーフ」のように**役職で書かれる**ので、そのまま入れると別人になる。
       🔴 **PitFlow のメンバー名簿にある名前だけ**入れる。無い名前は入れられない
          （フロント別の売上が、名簿に無い人の所へ消える）。その時はボタンを出さず、印だけ出す。
       ⚠ 「金額」より後ろに置く＝押した時に動くものが小さい順（売上日→実績日→金額→担当）ではない。
          担当は**合計が動かない**ので、本当は売上日の次に軽い。ただし
          **フロントの評価に効く**ので、金額の後ろに置いて「ついでに押す」を避ける。 */
    if (!p.担当一致 && t(p.soft.受付担当) && t(p.pit.フロント担当)){
      var want = w.pitQStaffName ? w.pitQStaffName(p.soft.受付担当) : t(p.soft.受付担当);
      var known = ((w.state && w.state.staff) || []).filter(function (x) {
        return x && (w.pitQStaffName ? w.pitQStaffName(x.name) : t(x.name)) === want;
      })[0];
      out.push({
        kind: '担当',
        now: t(p.pit.フロント担当),
        to: known ? t(known.name) : want,
        label: known ? ('フロント担当を ' + t(known.name) + ' にする') : ('名簿に「' + want + '」がいません'),
        why: '伝票の受付担当は ' + t(p.soft.受付担当) + '（＝' + want + '）です',
        can: !!known,
        重い: false
      });
    }
    /* ④ 金額（🔴 売上の金額が動く・管理者だけ） */
    if (!p.金額一致){
      out.push({
        kind: '金額',
        now: yen(p.pit.確定金額) + '円',
        to: num(p.soft.金額),
        label: '確定金額を ' + yen(p.soft.金額) + '円 にする',
        why: '伝票と ' + (p.差 > 0 ? '+' : '') + yen(p.差) + '円 ちがいます',
        can: canFinal(),
        重い: true
      });
    }
    return out;
  }

  /* ================================================================
     3. 直す（🔴 書き込みは全部ここを通る）
     ----------------------------------------------------------------
     ⚠ **重いもの（実績日・金額）は必ず聞いてから。** 押した勢いで締めた月が動かないように。
     ⚠ 売上日は聞かない（数字が1円も動かないので、確認を出すほうが邪魔になる）。
     ================================================================ */
  function apply(kind, p){
    var c = card(t(p && p.pit && p.pit.生 && p.pit.生.id));
    if (!c) return Promise.resolve(false);
    var to = t(p.soft.売上日);

    if (kind === '売上日'){
      if (!w.pitSetSalesDate) return Promise.resolve(false);
      var b1 = w.pitSalesDate ? w.pitSalesDate(c) : '';
      if (!w.pitSetSalesDate(c, to)) return Promise.resolve(false);
      if (w.logFlow) logFlow(c, '売上日を ' + (b1 || '（なし）') + ' → ' + to + ' にした（突き合わせの画面から）');
      if (w.pitLog) pitLog('突き合わせ：売上日を直した', { cardId: c.id, kind: 'result',
        label: t(p.soft.顧客名) + '　' + (b1 || '（なし）') + ' → ' + to });
      if (w.PitDB) PitDB.save();
      if (w.pitToast) pitToast('売上日を ' + to + ' にしました（売上の数字は動いていません）');
      return Promise.resolve(true);
    }

    if (kind === '実績日'){
      if (!canFinal()){
        if (w.pitAlert) pitAlert('実績日を直せるのは、設定権限（管理）のある人だけです。', { title:'変更できません' });
        return Promise.resolve(false);
      }
      var from2 = t(w.pitSalesCountDate ? w.pitSalesCountDate(c) : c.completedAt);
      var amt2 = num(w.pitFinalAmountOf ? w.pitFinalAmountOf(c) : c.amountFinal);
      var mFrom = from2.slice(0, 7), mTo = to.slice(0, 7);
      var det = ['・実績日 ' + (from2 || '（なし）') + ' → ' + to,
                 '・返車日・確定返車日も同じ日に揃います',
                 (mFrom && mTo && mFrom !== mTo)
                   ? '🔴 月がまたぎます。' + (+mFrom.slice(5)) + '月の売上が ' + yen(amt2) + '円 減り、'
                     + (+mTo.slice(5)) + '月が ' + yen(amt2) + '円 増えます'
                   : '・同じ月の中の移動です（月の合計は変わりません）',
                 '⚠ 締めた月の数字が動きます。'].join('\n');
      return pitAsk('実績日を ' + to + ' にしますか？\n' + t(p.soft.顧客名) + ' 様 / ' + t(p.soft.ナンバー),
                    { detail: det, ok: '実績日を直す' })
        .then(function (yes) {
          if (!yes) return false;
          if (w.pitApplyResultDate) w.pitApplyResultDate(c, to);
          else { c.completedAt = to; c.returnDate = to; c.returnDateFinal = to; }
          if (w.logFlow) logFlow(c, '実績カウント日を ' + (from2 || '（なし）') + ' → ' + to
                                  + ' に変更（返車日も同じ日に／突き合わせの画面から）');
          if (w.pitLog) pitLog('突き合わせ：実績カウント日を直した', { cardId: c.id, kind: 'result',
            label: t(p.soft.顧客名) + ' 様　' + (from2 || '（なし）') + ' → ' + to
                 + '　' + yen(amt2) + '円' });
          if (w.PitDB) PitDB.save();
          if (w.pitToast) pitToast('実績日を ' + to + ' にしました');
          return true;
        });
    }

    if (kind === '担当'){
      var want2 = w.pitQStaffName ? w.pitQStaffName(p.soft.受付担当) : t(p.soft.受付担当);
      var known2 = ((w.state && w.state.staff) || []).filter(function (x) {
        return x && (w.pitQStaffName ? w.pitQStaffName(x.name) : t(x.name)) === want2;
      })[0];
      if (!known2){
        if (w.pitAlert) pitAlert('PitFlow のメンバーに「' + want2 + '」がいません。\n'
                               + '先にメンバーを登録するか、整備ソフト側の受付担当を直してください。',
                                 { title: '入れられません' });
        return Promise.resolve(false);
      }
      var b4 = t(c.frontStaff || c.staff), to4 = t(known2.name);
      if (b4 === to4) return Promise.resolve(false);
      c.frontStaff = to4;
      if (w.logFlow) logFlow(c, 'フロント担当を ' + (b4 || '（なし）') + ' → ' + to4
                              + ' に変更（伝票の受付担当に合わせた／突き合わせの画面から）');
      if (w.pitLog) pitLog('突き合わせ：フロント担当を直した', { cardId: c.id, kind: 'inspect',
        label: t(p.soft.顧客名) + '　' + (b4 || '（なし）') + ' → ' + to4 });
      if (w.PitDB) PitDB.save();
      if (w.pitToast) pitToast('フロント担当を ' + to4 + ' にしました（売上の合計は動いていません）');
      return Promise.resolve(true);
    }

    if (kind === '金額'){
      if (!canFinal()){
        if (w.pitAlert) pitAlert('確定金額を直せるのは、設定権限（管理）のある人だけです。', { title:'変更できません' });
        return Promise.resolve(false);
      }
      var from3 = num(c.amountFinal), to3 = num(p.soft.金額);
      return pitAsk('確定金額を ' + yen(to3) + '円 にしますか？\n' + t(p.soft.顧客名) + ' 様 / ' + t(p.soft.ナンバー),
                    { detail: ['・' + yen(from3) + '円 → ' + yen(to3) + '円（' + (to3 - from3 > 0 ? '+' : '') + yen(to3 - from3) + '円）',
                               '・伝票 ' + t(p.soft.伝票) + ' の金額（伝票計 − 消費税 − 非課税）です',
                               '⚠ 売上の実績がこの数字で決まります。'].join('\n'),
                      ok: '確定金額を直す' })
        .then(function (yes) {
          if (!yes) return false;
          c.amountFinal = to3;
          if (w.logFlow) logFlow(c, '確定金額を ' + yen(from3) + '円 → ' + yen(to3) + '円 に変更（伝票 '
                                  + t(p.soft.伝票) + '／突き合わせの画面から）');
          if (w.pitLog) pitLog('突き合わせ：確定金額を直した', { cardId: c.id, kind: 'result',
            label: t(p.soft.顧客名) + ' 様　' + yen(from3) + '円 → ' + yen(to3) + '円' });
          if (w.PitDB) PitDB.save();
          if (w.pitToast) pitToast('確定金額を ' + yen(to3) + '円 にしました');
          return true;
        });
    }
    return Promise.resolve(false);
  }

  /* その行に「まだ片づいていないズレ」がいくつ残っているか。
     🔴 タブの件数はこれで数える＝**押した行が減っていくのが見える**。
     ⚠ 合計・差・内訳・検算には**1ミリも触らない**（あちらは PDF が言っている事実）。 */
  function rowLeft(p){
    var id = t(p && p.pit && p.pit.生 && p.pit.生.id);
    return fixKinds(p).filter(function (k) { return !markOf(k.kind, p.soft, id); }).length;
  }

  w.pitQMarkKey   = markKey;
  w.pitQRowLeft   = rowLeft;
  w.pitQRowNo     = pairNo;
  w.pitQSoftNo    = softOnlyNo;
  w.pitQPitNo     = pitOnlyNo;
  w.pitQMarkOf    = markOf;
  w.pitQLoadMarks = loadMarks;
  w.pitQMark      = mark;
  w.pitQFixKinds  = fixKinds;
  w.pitQFixApply  = apply;
})(window);
