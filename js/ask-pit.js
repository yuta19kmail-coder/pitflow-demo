/* ========================================
   ask-pit.js  -  「聞く・知らせる」を1本に（v1.75.0）
   ----------------------------------------
   ◎なぜ作ったか（ゆうた報告 2026-08-10）
     「定休日に予約を入れようとすると **ブラウザ純正ポップアップ使用してる**」
     → 直したら、**ほかにも 45か所ほど残っていた**（付箋・代車・車両・設定・サンプル…）。
     全アプリの決めごと（2026-07-28）＝**ブラウザ標準の alert / confirm / prompt はやめる**。
     理由は3つ：
       ① 出ている間 **JS が止まる**ので「固まった・反応が悪い」と感じる
       ② 見た目がアプリと別物（どのサイトか分からない素っ気ない窓）
       ③ スマホでは URL が頭に出て**業務アプリらしくない**

   ◎使い方（この3つだけ覚えればいい）
     pitAlert('保存できませんでした')                                … 知らせるだけ
     pitAsk('この付箋を消しますか？', { danger:true }).then(ok => { if (!ok) return; …消す… })
     pitAskText('追加する部位名は？', '').then(v => { if (v == null) return; …足す… })

   ◎⚠ **第1引数が見出し**（大きい字）。`opt.title` を渡しても**上書きされて効かない**（ui-dialog.js の作り）。
     補足は `detail`（下の小さい字）へ。見出しは**1行で言い切る**こと。

   ◎🔴 いちばん大事な注意
     **答えが返るのは「後」になる（非同期）。**
     だから `if (!confirm(...)) return;` のように**その場で分岐できない**。
     続きは必ず `.then()` の中に入れること。
     ⚠ 続きが長い時は、**先に関数へ切り出してから** `.then(fn)` で呼ぶ。
        `.then` の中に本文を丸ごとコピーすると、聞く道と聞かない道で**写しができる**。

   ◎ui-dialog.js（全アプリ共通部品）が無い時だけ、純正に落ちる（保険）。
     ⚠ 保険の側を先に書かないこと。ふだんは必ずアプリ内ダイアログが出る。
   ======================================== */
(function () {
  'use strict';

  function _has(){ return !!(window.UI && UI.confirm && UI.alert); }

  /* 🔴 v1.75.1（ゆうた報告）**窓に出す文字から、アイコンのタグを落とす。**
     ◎何が起きたか
       確認の窓に `<i data-ic=parasol data-ics=16></i> お盆休業＝受付なし` と、
       **タグがそのまま**出た。
     ◎なぜ
       窓（ui-dialog.js）は中の文字を**そのまま文字として出す**（HTMLとして読まない＝安全のため正しい）。
       ところが渡した文字の中に、画面用のアイコンのタグが混ざっていた。
     ◎どう直したか
       ① 元を直した（`rules.js` の reason / closed から**タグを外した**＝中身は文字だけにする）
       ② そのうえで、ここでも**保険として落とす**。
          ⚠ 窓に出す文字は、あちこちから来る（作業タイプ名・外注先名・休みの名前…）。
             どこかで混ざっても、**現場に読めない文字を見せない**ようにするのがここの役目。
     ⚠ 消すだけ（絵文字に置き換えない）。窓は文字だけの場所、という線引きを崩さないため。 */
  function _plain(v){
    if (v == null) return v;
    return String(v)
      .replace(/<i\b[^>]*><\/i>/gi, '')     /* <i data-ic=…></i>（中身なしのアイコン） */
      .replace(/<[^>]+>/g, '')              /* 念のため、ほかのタグも落とす */
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^[ \t]+|[ \t]+$/g, '');
  }
  function _clean(opt){
    if (!opt) return opt;
    var o = {};
    for (var k in opt) if (Object.prototype.hasOwnProperty.call(opt, k)) o[k] = opt[k];
    ['title', 'detail', 'ok', 'cancel', 'placeholder'].forEach(function (k) {
      if (typeof o[k] === 'string') o[k] = _plain(o[k]);
    });
    return o;
  }
  window.pitPlainText = _plain;   /* トーストなど「文字だけの場所」でも使える */

  /* 🔴 v1.110.0 エラー番号（`code:'PF-0412'`）。
     窓（ui-dialog.js）は**全アプリ共通の本体**なので、ここでは触らずに
     開いた直後へ番号の札を差し込む（errcode-pit.js の pitErrInject）。
     ⚠ 窓は同期で組み立てられるので、呼んだ直後にはもう出来ている。 */
  function _code(opt){ return (opt && opt.code) ? String(opt.code) : ''; }
  function _mark(code, p){
    if (code && window.pitErrInject) { try { pitErrInject(code); } catch (e) {} }
    return p;
  }

  /* 知らせるだけ（OKボタン1つ）。戻り値は Promise だが、待たなくてよい場面がほとんど。 */
  window.pitAlert = function (msg, opt) {
    var code = _code(opt);
    msg = _plain(msg); opt = _clean(opt);
    if (_has()) return _mark(code, UI.alert(msg, opt || {}));
    try { window.alert(msg + (opt && opt.detail ? '\n\n' + opt.detail : '') + (code ? '\n\n番号 ' + code : '')); } catch (e) {}
    return Promise.resolve(true);
  };

  /* はい／いいえ。**必ず .then で受ける**（true＝はい） */
  window.pitAsk = function (msg, opt) {
    var code = _code(opt);
    msg = _plain(msg); opt = _clean(opt);
    if (_has()) return _mark(code, UI.confirm(msg, opt || {}));
    return Promise.resolve(!!window.confirm(msg + (opt && opt.detail ? '\n\n' + opt.detail : '')));
  };

  /* 文字を入れてもらう。**やめたら null**（空文字と区別すること） */
  window.pitAskText = function (msg, value, opt) {
    var code = _code(opt);
    msg = _plain(msg); opt = _clean(opt);
    if (window.UI && UI.prompt) return _mark(code, UI.prompt(msg, value == null ? '' : value, opt || {}));
    var v = window.prompt(msg, value == null ? '' : value);
    return Promise.resolve(v == null ? null : v);
  };

})();
