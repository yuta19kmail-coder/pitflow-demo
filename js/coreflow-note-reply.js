/* ========================================
   coreflow-note-reply.js  -  付箋の「返信」（全アプリ共通の本体）
   ----------------------------------------
   🔴 **本体はここ（_shared）だけ。** アプリ側の js\ にあるのは配られたコピー。
      直す時は必ずここを直して `sync-shared.ps1` を走らせること。
      アプリ側のコピーを直しても、次の配布で上書きされて消えます。

   ◎なにをするもの（ゆうた指定 2026-08-18）
     🗣「付箋機能の修正。**通常の付箋で返信が入れられるように。回覧でも返信を入れられるように**したい。
     　　またこれは**ピット、MHS、CarFlow 全部の付箋に実装**して」

     ＝ 付箋カードの下に、**その場で書ける返信欄**を出す部品。
     ・**通常（実行）の付箋も、回覧の付箋も、どちらも返信できる。**
     ・返信は**誰でも・何回でも**書ける（担当でなくても、回覧を確認していなくても）。
     ・🔴 **回覧の「✓ 自分が確認」とは別物。** 確認ボタンは今までどおり。返信は自由に書ける。

   ◎なぜ共通部品にしたか
     ⚠ 付箋は PitFlow / CarFlow / MHS の3つに**同じものが3本コピペ**されていた
        （CarFlow が元、PitFlow が移植、MHS が独自の書き直し）。
        そのため 返信の削除・時刻の表示・回覧で返信できるか が**3つともバラバラ**だった。
     🔴 **返信まわりだけはここ1本にした。** 次に直す時は1か所で済む。

   ◎使い方（アプリ側）
     ① 起動時に1回だけ setup を呼ぶ。アプリごとに違うところは**関数で渡す**（差し込み）。

        CFNoteReply.setup({
          getNote:    function (id) { ... 付箋1件を返す ... },
          getMe:      function ()   { ... 「自分」のID ... },
          avatarHtml: function (uid, px) { ... アバターのHTML ... },
          save:       function (note, done) { ... 保存して done() ... },
          rerender:   function () { ... 描き直し ... },
          toast:      function (msg, code) { ... },
          ask:        function (msg, cb) { ... 確認して cb(true/false) ... },
          formatText: function (text) { ... 本文の整形（省略＝エスケープだけ） ... },
          canWrite:   function (note) { ... 書ける人か（省略＝誰でも） ... },
          canDelete:  function (reply) { ... 消せるか（省略＝自分の返信だけ） ... }
        });

     ② 付箋カードのHTMLを作る所で `CFNoteReply.html(note)` を差し込む。
        （返信の一覧＋書く欄が、まとめて1つ返る）

   ◎作りの決めごと
     🔴 **データの形は3アプリで今までどおり同じ。**
        note.replies = [ { id, uid, text, at } ]  … at はミリ秒
        ＝古い返信もそのまま読めるし、他のアプリで書いた返信も読める。
     ⚠ **開いている返信欄の状態は画面の中だけ**（class の付け外し）。保存しない・描き直さない。
        ＝書いている途中で盤面が描き直されても消えないよう、**開閉は DOM を直接いじる**。
     ⚠ 付箋カードは `draggable="true"`（並び替え）なので、
        **書いている間だけカードのドラッグを切る**。切らないとブラウザが文字を選ばせてくれない。
   ======================================== */
(function (w, d) {
  'use strict';

  var MAX = 300;                 /* 返信1件の長さ（今までと同じ） */
  var cfg = {};
  var _restore = null;           /* 書いている間だけ切ったドラッグを戻すための控え */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function attr(s) { return esc(s).replace(/\n/g, ' '); }
  function call(fn) { try { return fn(); } catch (e) { console.warn('[note-reply]', e); return null; } }

  function getNote(id) { return cfg.getNote ? call(function () { return cfg.getNote(id); }) : null; }
  function me()        { return cfg.getMe   ? call(function () { return cfg.getMe(); })   : null; }
  function toast(m, c) { if (cfg.toast) call(function () { return cfg.toast(m, c); }); }
  function rerender()  { if (cfg.rerender) call(function () { return cfg.rerender(); }); }
  function fmt(t)      { return cfg.formatText ? cfg.formatText(t || '') : esc(t || ''); }
  function avatar(uid, px) {
    if (!cfg.avatarHtml) return '';
    var h = call(function () { return cfg.avatarHtml(uid, px || 22); });
    return h || '';
  }
  function canWrite(note) { return cfg.canWrite ? !!call(function () { return cfg.canWrite(note); }) : true; }
  function canDelete(reply) {
    if (cfg.canDelete) return !!call(function () { return cfg.canDelete(reply); });
    var m = me();
    return !!(reply && reply.uid && m && reply.uid === m);      /* 既定＝自分の返信だけ */
  }
  function save(note, done) {
    if (!cfg.save) { if (done) done(); return; }
    try { cfg.save(note, function () { if (done) done(); }); }
    catch (e) { console.error('[note-reply] 保存に失敗', e); toast('返信を保存できませんでした'); }
  }

  function newReplyId() {
    return 'rep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }
  /* M/D HH:MM。⚠ 日付の書き方をアプリごとに変えない（3つとも同じ見え方にする） */
  function timeText(ms) {
    if (!ms) return '';
    var dt = new Date(ms);
    if (isNaN(dt.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
  }

  /* ---------- 描く ---------- */

  /* 返信の一覧＋「返信を書く」欄。付箋カードのHTMLの中に、そのまま入れる。
     🔴 回覧かどうかで出し分けない（ゆうた指定「回覧でも返信を入れられるように」）。 */
  function html(note) {
    if (!note || !note.id) return '';
    var id = attr(note.id);
    var list = Array.isArray(note.replies) ? note.replies : [];
    var rows = list.map(function (r) {
      if (!r) return '';
      var del = canDelete(r)
        ? '<button type="button" class="cfr-del" title="この返信を消す"'
          + ' onclick="event.stopPropagation();CFNoteReply.del(\'' + id + '\',\'' + attr(r.id) + '\')">×</button>'
        : '';
      var t = timeText(r.at);
      return '<div class="cfr-item">'
           + '<span class="cfr-av">' + avatar(r.uid, 22) + '</span>'
           + '<div class="cfr-bubble">'
           +   '<div class="cfr-text">' + fmt(r.text) + '</div>'
           +   (t ? '<span class="cfr-time">' + esc(t) + '</span>' : '')
           + '</div>' + del + '</div>';
    }).join('');

    var listHtml = rows ? '<div class="cfr-list">' + rows + '</div>' : '';
    if (!canWrite(note)) return listHtml ? '<div class="cfr">' + listHtml + '</div>' : '';

    var form = '<div class="cfr-form">'
      + '<button type="button" class="cfr-open"'
      +   ' onclick="event.stopPropagation();CFNoteReply.open(event,\'' + id + '\')">'
      +   '返信を書く…</button>'
      + '<div class="cfr-edit" onclick="event.stopPropagation()">'
      +   '<textarea class="cfr-ta" rows="2" maxlength="' + MAX + '" placeholder="返信を書く…"'
      +     ' onkeydown="CFNoteReply.key(event,\'' + id + '\')"></textarea>'
      +   '<div class="cfr-btns">'
      +     '<button type="button" class="cfr-cancel" onclick="event.stopPropagation();CFNoteReply.cancel(event,\'' + id + '\')">やめる</button>'
      +     '<button type="button" class="cfr-send" onclick="event.stopPropagation();CFNoteReply.send(event,\'' + id + '\')">返信する</button>'
      +   '</div>'
      + '</div></div>';

    return '<div class="cfr" data-cfr="' + id + '">' + listHtml + form + '</div>';
  }

  /* ---------- 開く・閉じる ---------- */

  function box(noteId, ev) {
    /* 同じ付箋が2か所に出ている画面（ダッシュボードと重要タブ など）があるので、
       押されたボタンの側から探すのを優先する。無ければ id で引く。 */
    var el = null;
    if (ev && ev.target && ev.target.closest) el = ev.target.closest('.cfr');
    if (!el) el = d.querySelector('.cfr[data-cfr="' + String(noteId).replace(/"/g, '') + '"]');
    return el;
  }
  /* 🔴 書いている間だけカードのドラッグを切る。
     ⚠ 付箋カードは並び替えのため draggable="true"。そのままだと textarea の中で
        文字を選ぼうとした瞬間にドラッグが始まって、書き直しができない。 */
  function dragOff(el) {
    dragOn();
    var card = el && el.closest ? el.closest('[draggable="true"]') : null;
    if (!card) return;
    _restore = card;
    card.setAttribute('draggable', 'false');
  }
  function dragOn() {
    if (_restore) { try { _restore.setAttribute('draggable', 'true'); } catch (e) {} }
    _restore = null;
  }

  function open(ev, noteId) {
    var el = box(noteId, ev);
    if (!el) return;
    el.classList.add('is-open');
    dragOff(el);
    var ta = el.querySelector('.cfr-ta');
    if (ta) setTimeout(function () { try { ta.focus(); } catch (e) {} }, 30);
  }
  function cancel(ev, noteId) {
    var el = box(noteId, ev);
    if (!el) return;
    var ta = el.querySelector('.cfr-ta');
    if (ta) ta.value = '';
    el.classList.remove('is-open');
    dragOn();
  }

  /* ---------- 書く・消す ---------- */

  function send(ev, noteId) {
    var el = box(noteId, ev);
    var ta = el && el.querySelector('.cfr-ta');
    var text = ((ta && ta.value) || '').replace(/\s+$/, '');
    if (!text.trim()) { toast('返信を入力してください'); if (ta) ta.focus(); return; }
    var note = getNote(noteId);
    if (!note) { toast('この付箋が見つかりませんでした'); return; }
    if (!canWrite(note)) { toast('この付箋には返信できません'); return; }
    if (!Array.isArray(note.replies)) note.replies = [];
    note.replies.push({ id: newReplyId(), uid: me() || null, text: text.slice(0, MAX), at: Date.now() });
    if (ta) ta.value = '';
    if (el) el.classList.remove('is-open');
    dragOn();
    save(note, function () { rerender(); });
  }

  /* Ctrl+Enter（⌘+Enter）で送る／Esc でやめる。⚠ ただの Enter は改行のまま（本文が1行で切れないように） */
  function key(ev, noteId) {
    if (!ev) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); cancel(ev, noteId); return; }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(ev, noteId); }
  }

  function del(noteId, replyId) {
    var note = getNote(noteId);
    if (!note || !Array.isArray(note.replies)) return;
    var r = null, i;
    for (i = 0; i < note.replies.length; i++) { if (note.replies[i] && note.replies[i].id === replyId) { r = note.replies[i]; break; } }
    if (!r) return;
    if (!canDelete(r)) { toast('自分の返信だけ消せます'); return; }
    var go = function (yes) {
      if (!yes) return;
      note.replies = note.replies.filter(function (x) { return x && x.id !== replyId; });
      save(note, function () { rerender(); });
    };
    if (cfg.ask) cfg.ask('この返信を消しますか？', go);
    else go(true);
  }

  /* ---------- 差し込み口 ---------- */
  function setup(o) {
    cfg = o || {};
    return w.CFNoteReply;
  }

  w.CFNoteReply = {
    setup: setup, html: html,
    open: open, cancel: cancel, send: send, del: del, key: key,
    /* テスト・アプリ側から使うための小物 */
    timeText: timeText, MAX: MAX,
    _cfg: function () { return cfg; }
  };
  console.log('[coreflow-note-reply] ready（付箋の返信・全アプリ共通）');
})(window, document);
