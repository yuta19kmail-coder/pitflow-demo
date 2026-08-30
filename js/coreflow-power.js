/* ============================================================
   coreflow-power.js ── 全アプリ共通「電源ボタン」（2026-08-29・ゆうた指定）
   ------------------------------------------------------------
   ◎きっかけ
     🗣「全アプリ右上のログアウトボタンを電源マークに変更、隣のヘルプは消す。
     　　アバター・名前・リアル同期・電源ボタン の並びで。
     　　電源ボタンクリックでプルダウンメニュー：更新／画面を閉じる／ログアウト。
     　　ログアウトはポップアップ確認で本当にログアウト」
     🗣「マスターの俺だけには 全端末の強制更新／全端末全アプリの強制更新 が使えるように。
     　　**今回みたいな時の緊急対応に。** またapp化したやつだと更新がメンドイからこれで行きたい」
     ＝ 2026-08-28 の事故（古い画面が他人の作業を消した）と、8/29 の版番号の配布で
        「**全端末を早く新しくしたい**」が実際に効いた。その手を全アプリに持たせる。

   ◎🔴 いちばん大事な作り ── **アプリごとの事情を知らない**
     10個のアプリはヘッダーの作りがバラバラ（クラス名も、ログアウトの関数名も違う）。
     なので「関数の名前を覚える」ことは**一切しない**。
     🔴 **いま画面にあるログアウトボタンとヘルプボタンの「押した時の動き」をそのまま奪って持つ。**
        ＝ アプリが何をしていようと、同じ動きがメニューから出せる。
     ＝ この1本を配るだけでよく、**アプリ側の HTML は script タグ1行だけ**。

   ◎置き換えるもの
     [アバター][名前][同期][？ヘルプ][ログアウト]  →  [アバター][名前][同期][⏻ 電源]
     電源を押すと出るもの：
       ・更新
       ・画面を閉じる
       ・ヘルプ            （？ボタンがあったアプリだけ）
       ・ログアウト        （必ず1回聞く）
       ─────────────（マスターだけ）
       ・全員の この画面を更新
       ・全員の 全アプリを更新
       ・決めた人の この画面を更新    （2026-08-29 追加）
       ・決めた人の 全アプリを更新    （2026-08-29 追加）
     ＝ 🔴 「**誰を**（全員／決めた人）」×「**何を**（この画面／全アプリ）」の 2×2 ＝ 4通り。

   ◎⚠ 「画面を閉じる」は、ブラウザが拒むことがある
     スクリプトで開いた窓しか閉じられないのが原則。**キオスク起動やアプリ化した窓なら閉じられる**。
     🔴 閉じられなかった時に「押しても何も起きない」が一番たちが悪いので、
        少し待って**まだ開いていたら「Alt+F4 で閉じてください」と出す。**

   ◎⚠ 強制更新の合図の置き場
     `companies/{会社}/settings/forceReload` に `{ at, app, uid, email }` を1枚書くだけ。
     ・`app` が `'all'` なら全アプリ、アプリの名前（app-key）ならそのアプリだけ
     ・`uid` / `email` が入っていたら**その人の端末だけ**（空なら全員）
     ・各アプリはこの1枚を見張っていて、**前に見た時刻と変わったら**開き直す

   ◎🔴 「決めた人だけ」の当てかた ── uid と メールの**両方**で見る（2026-08-29・ゆうた指定）
     🗣「特定のアカウント、例えばAさんのログイン端末を全部更新する、はできる？」
     名簿（portalMembers）の**書類の名前が uid とは限らない**（招待から作った人は別のIDになる）。
     ＝ uid だけで当てると、招待から入った人には**永遠に届かない**のに、
        出した側には「出しました」としか見えない＝いちばんたちが悪い外し方。
     🔴 なので合図には uid と メールの**両方**を書き、受け取る側は**どちらか一致で自分ごと**とみなす。
     ⚠ メールは大文字小文字・全角を揃えてから比べる（名簿の打ち込みとGoogleの表記が違うことがある）。
     🔴 **開いた瞬間の値では開き直さない**（開くたびに開き直す無限ループになる）。
     🔴 ルールは触っていない＝既存の「設定」の決まり（読むのは社員・書くのは設定権限）にそのまま収まる。

   ◎🔴 2026-08-29：PitFlow が自前で持っていた強制更新（`force-reload-pit.js`）を**畳んでここに1本化した。**
     ただし**畳む時に、向こうの守りをこちらへ持ってきている**。向こうのほうが慎重だったため：
       ③ **1回の読み込みで読み直すのは1回まで**（合図が続けて来ても暴れない）
       ④ **打ち込み中は待つ**（入力欄・選択・contenteditable にカーソル／窓が開いている／`__appBusy`）。
          ⚠ ただし**待つのは最大60秒**。そもそも「全部止まっている」時に押す物なので、
             そこから先は業務より復旧を優先する。
     🔴 向こうの ①②（見た合図を localStorage に控える／控えられない端末では何もしない）は**要らない**。
        こちらは **開いた瞬間の値では動かない**作りなので、読み直した先の画面では合図が
        「開いた瞬間の値」になり、二度は反応しない＝**輪にならない**。
        控えを使わないぶん、**プライベートモードの端末でも効く**（向こうは丸ごと止まっていた）。

   ⚠ 直す時は `_shared\coreflow-power.js` を直して `sync-shared.ps1` を走らせること。
      アプリ側の `js\coreflow-power.js` を直しても、次の配布で消えます。
   ============================================================ */
(function (w, d) {
  'use strict';

  /* 🔴 マスター（ゆうた本人）の uid。Firestore のルールの `_isMaster()` と同じ値。
     ⚠ ここを変えるならルール（CarFlow\carflow\firestore.rules）も一緒に変えること。 */
  var MASTER_UID = 'cIZsMOEsaaWWVVM957TFe6tvql53';

  var _wired = false, _handlers = { logout: null, help: null }, _tries = 0;

  function $(id) { return d.getElementById(id); }
  function appKey() { try { return (d.querySelector('meta[name=app-key]') || {}).content || ''; } catch (e) { return ''; } }
  function meUid() { try { return (w.fb && w.fb.currentUser && w.fb.currentUser.uid) || ''; } catch (e) { return ''; } }
  function isMaster() { return meUid() === MASTER_UID; }
  /* 🔴🔴 2026-08-29 に見つけた穴：**会社IDの置き場がアプリごとにバラバラ。**
     `fb.currentCompanyId` を入れているのは PitFlow / CarFlow / StockFlow / CoreNote / CoreBoard / CoreTools だけ。
     **CoreMembers・MHS・CoreTemplate は `const COMPANY_ID = …` を script の中で宣言しているだけ**で、
     const は window に乗らない＝外からは**どこにも見えない**。
     ＝ そのままだと、この4アプリでは電源メニューの強制更新が
        「見張りも張られない・押しても『繋がっていません』」と**黙って死ぬ**。
        しかも押した側には出したように見えないだけなので、気づくのは事故のあと。
     🔴 なので順に探して、**最後は決め打ちで落とす**（うちは会社が1つしかない）。
     ⚠ 会社が増えたら、ここではなく**各アプリが `fb.currentCompanyId` を入れる**ように直すこと。 */
  var CID_FALLBACK = 'kobayashi_motors';
  function cid() {
    try {
      var c = (w.fb && w.fb.currentCompanyId) || w.COMPANY_ID || w.companyId || '';
      if (c) return String(c);
    } catch (e) {}
    return CID_FALLBACK;
  }

  /* ---------- 見た目（このファイルの中に持つ＝配るのは1本だけで済む） ---------- */
  function css() {
    if ($('cf-power-css')) return;
    var s = d.createElement('style');
    s.id = 'cf-power-css';
    s.textContent = [
      '.cf-power{position:relative;display:inline-flex}',
      '.cf-power-btn{width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;',
      '  border:1px solid var(--border2,var(--border,#2a2f3a));background:var(--bg3,#1f232c);color:var(--text2,#a9b1c1);',
      '  border-radius:9px;cursor:pointer;line-height:1;transition:background .12s,color .12s,border-color .12s}',
      '.cf-power-btn:hover{background:var(--red,#ef4444);border-color:var(--red,#ef4444);color:#fff}',
      '.cf-power.on .cf-power-btn{background:var(--red,#ef4444);border-color:var(--red,#ef4444);color:#fff}',
      '.cf-power-btn svg{width:16px;height:16px;display:block}',
      /* 🔴 メニューはトップバーの中に置かない（position:fixed で画面ぜんたいに対して置く）。
         ⚠ 中に置くと、アプリ側の重なり順に巻き込まれて**下の画面に隠れる**。
            実際 PitFlow で、検索バーがヘルプの行の上に乗って**1行だけ見えなくなった。**
            z-index を上げても直らない（親が作る重なりの箱から出られないため）。 */
      '.cf-power-menu{position:fixed;z-index:2147483000;min-width:236px;display:none;',
      '  background:var(--bg2,#171a21);border:1px solid var(--border2,var(--border,#2a2f3a));border-radius:12px;',
      '  padding:6px;box-shadow:0 18px 48px rgba(0,0,0,.5)}',
      '.cf-power-menu.on{display:block}',
      '.cf-power-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 11px;border:0;border-radius:9px;',
      '  background:transparent;color:var(--text,#e7eaf0);font-size:13px;font-weight:700;font-family:inherit;',
      '  text-align:left;cursor:pointer;line-height:1.4}',
      '.cf-power-item:hover{background:var(--bg3,#1f232c)}',
      '.cf-power-item .cf-i{width:16px;height:16px;flex:0 0 16px;opacity:.85}',
      '.cf-power-item.danger{color:var(--red,#ef4444)}',
      '.cf-power-item.danger:hover{background:rgba(239,68,68,.14)}',
      '.cf-power-sep{height:1px;margin:6px 4px;background:var(--border,#2a2f3a)}',
      '.cf-power-head{font-size:10.5px;font-weight:800;color:var(--text3,#79839a);padding:4px 11px 2px;letter-spacing:.03em}',
      '.cf-power-item .cf-t{display:block;min-width:0}',
      '.cf-power-item small{display:block;font-size:10.5px;font-weight:600;color:var(--text3,#79839a);margin-top:2px;line-height:1.45}',
      /* 「決めた人だけ更新」の名簿一覧（2026-08-29） */
      '.cf-power-find{width:calc(100% - 8px);margin:4px;padding:7px 10px;border-radius:9px;font-family:inherit;font-size:12.5px;',
      '  border:1px solid var(--border,#2a2f3a);background:var(--bg3,#1f232c);color:var(--text,#e7eaf0)}',
      '.cf-power-find:focus{outline:none;border-color:var(--accent,#3b82f6)}',
      '.cf-power-list{max-height:min(46vh,320px);overflow:auto;overscroll-behavior:contain}',
      '.cf-power-empty{padding:12px 11px;font-size:12px;color:var(--text3,#79839a);font-weight:700}',
      '.cf-power-av{width:22px;height:22px;flex:0 0 22px;border-radius:50%;overflow:hidden;display:inline-flex;',
      '  align-items:center;justify-content:center;font-size:10.5px;font-weight:800;color:#0e1117;background:#26314a}',
      '.cf-power-av img{width:100%;height:100%;object-fit:cover;display:block}',
      '.cf-power-note{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;',
      '  background:var(--bg2,#171a21);color:var(--text,#e7eaf0);border:1px solid var(--border2,var(--border,#2a2f3a));',
      '  border-left:3px solid var(--red,#ef4444);border-radius:10px;padding:11px 16px;font-size:13px;font-weight:700;',
      '  box-shadow:0 14px 40px rgba(0,0,0,.5);max-width:min(92vw,460px)}'
    ].join('');
    (d.head || d.documentElement).appendChild(s);
  }

  /* 線画のアイコン（共通のアイコン集に頼らない＝どのアプリでも同じ形で出る） */
  var IC = {
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.5 6.8a8 8 0 1 0 11 0"/></svg>',
    reload: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    close: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    help: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4"/><path d="M12 17h.01"/></svg>',
    out: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    bolt: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    user: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    back: '<svg class="cf-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
  };

  /* ---------- 1回聞く（純正の confirm は使わない＝全アプリ共通の決めごと） ---------- */
  function ask(title, opt) {
    if (w.UI && typeof UI.confirm === 'function') return Promise.resolve(UI.confirm(title, opt || {}));
    /* 万一 ui-dialog.js が無いアプリでも止まらないように、最低限の窓を自前で出す */
    return new Promise(function (res) {
      var wrap = d.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px';
      wrap.innerHTML = '<div style="background:var(--bg2,#171a21);color:var(--text,#e7eaf0);border:1px solid var(--border,#2a2f3a);border-radius:14px;padding:20px 22px;max-width:380px;font-size:14px;line-height:1.7">' +
        '<div style="font-weight:800;margin-bottom:14px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button data-no style="padding:7px 14px;border-radius:9px;border:1px solid var(--border,#2a2f3a);background:var(--bg3,#1f232c);color:var(--text2,#a9b1c1);font-weight:700;cursor:pointer;font-family:inherit">キャンセル</button>' +
        '<button data-yes style="padding:7px 14px;border-radius:9px;border:0;background:var(--red,#ef4444);color:#fff;font-weight:800;cursor:pointer;font-family:inherit">はい</button>' +
        '</div></div>';
      wrap.querySelector('div > div').textContent = title;
      var fin = function (v) { try { wrap.remove(); } catch (e) {} res(v); };
      wrap.querySelector('[data-yes]').onclick = function () { fin(true); };
      wrap.querySelector('[data-no]').onclick = function () { fin(false); };
      wrap.onclick = function (e) { if (e.target === wrap) fin(false); };
      (d.body || d.documentElement).appendChild(wrap);
    });
  }
  function note(msg) {
    var old = $('cf-power-note'); if (old) old.remove();
    var n = d.createElement('div'); n.id = 'cf-power-note'; n.className = 'cf-power-note'; n.textContent = msg;
    (d.body || d.documentElement).appendChild(n);
    setTimeout(function () { try { n.remove(); } catch (e) {} }, 9000);
  }

  /* ---------- メニューの中身 ---------- */
  function open(on) {
    var box = $('cf-power'), m = $('cf-power-menu'); if (!box || !m) return;
    var 出す = (on === undefined) ? !box.classList.contains('on') : !!on;
    box.classList.toggle('on', 出す);
    m.classList.toggle('on', 出す);
    if (!出す) { _pick = false; return; }
    _pick = false;
    build();
    place();
  }
  /* 🔴 位置決めは別にしておく＝**中身が入れ替わっても置き直せる**
     （名簿の一覧に切り替えると背が伸びるので、そのままだと画面からはみ出す） */
  function place() {
    var m = $('cf-power-menu'), btn = $('cf-power-btn'); if (!m || !btn) return;
    /* ボタンの真下・右そろえ。画面からはみ出さないように寄せる */
    var b = btn.getBoundingClientRect();
    m.style.visibility = 'hidden'; m.style.left = '0px'; m.style.top = '0px';
    var w2 = m.offsetWidth || 236, h2 = m.offsetHeight || 200;
    var left = Math.max(8, Math.min(b.right - w2, (w.innerWidth || 1200) - w2 - 8));
    var top = b.bottom + 8;
    if (top + h2 > (w.innerHeight || 800) - 8) top = Math.max(8, b.top - h2 - 8);
    m.style.left = Math.round(left) + 'px';
    m.style.top = Math.round(top) + 'px';
    m.style.visibility = '';
  }
  function build() {
    var m = $('cf-power-menu'); if (!m) return;
    var h = '';
    h += '<button class="cf-power-item" data-do="reload">' + IC.reload + '更新</button>';
    h += '<button class="cf-power-item" data-do="close">' + IC.close + '画面を閉じる</button>';
    if (_handlers.help) h += '<button class="cf-power-item" data-do="help">' + IC.help + 'ヘルプ</button>';
    h += '<div class="cf-power-sep"></div>';
    h += '<button class="cf-power-item danger" data-do="logout">' + IC.out + 'ログアウト</button>';
    if (isMaster()) {
      h += '<div class="cf-power-sep"></div>';
      h += '<div class="cf-power-head">マスターのみ</div>';
      /* 🔴 「誰を（全員／決めた人）」×「何を（このアプリ／全アプリ）」の**4つ**（2026-08-29・ゆうた指定） */
      h += '<button class="cf-power-item" data-do="fr-app">' + IC.bolt + '<span class="cf-t">全員の この画面を更新<small>いま開いている人ぜんぶ。このアプリだけ</small></span></button>';
      h += '<button class="cf-power-item" data-do="fr-all">' + IC.bolt + '<span class="cf-t">全員の 全アプリを更新<small>10アプリぜんぶ。緊急のとき用</small></span></button>';
      h += '<button class="cf-power-item" data-do="fr-one-app">' + IC.user + '<span class="cf-t">決めた人の この画面を更新<small>選んだ人が開いている、このアプリだけ</small></span></button>';
      h += '<button class="cf-power-item" data-do="fr-one-all">' + IC.user + '<span class="cf-t">決めた人の 全アプリを更新<small>選んだ人が開いている画面ぜんぶ</small></span></button>';
    }
    m.innerHTML = h;
  }

  /* ---------- それぞれの動き ---------- */
  /* ⚠ 見張り（テスト）だけが差し替える継ぎ目。本物のブラウザで「開き直す」を試すと
     テストの画面ごと消えてしまうため、開き直したことだけを数えられるようにしてある。
     ふつうの動きでは _reloadHook は必ず null。 */
  var _reloadHook = null;
  function doReload() {
    if (_reloadHook) { try { _reloadHook(); } catch (e) {} return; }
    try { w.location.reload(); } catch (e) {}
  }

  /* ⚠ ブラウザは「スクリプトで開いた窓」しか閉じさせてくれないことがある。
     キオスク起動・アプリ化した窓なら閉じられる。閉じられなかったら黙らずに言う。 */
  function doClose() {
    try { w.close(); } catch (e) {}
    setTimeout(function () {
      if (!w.closed) note('この画面はブラウザの決まりで閉じられませんでした。Alt+F4（Macは ⌘W）で閉じてください。');
    }, 400);
  }

  function doLogoutAsk() {
    ask('ログアウトします。よろしいですか？', { ok: 'ログアウト', cancel: 'やめる' }).then(function (yes) {
      if (!yes) return;
      if (_handlers.logout) { try { _handlers.logout(); } catch (e) { console.error('[power] ログアウトでつまずきました', e); } }
      else note('ログアウトの入口が見つかりませんでした。画面を開き直してください。');
    });
  }

  /* 🔴 全端末の強制更新＝合図を1枚書くだけ。各アプリがそれを見張っている。 */
  function doForce(scope) {
    var c = cid();
    if (!w.fb || !w.fb.db || !c) { note('いまはクラウドに繋がっていないので、強制更新は出せません。'); return; }
    var 何を = (scope === 'all') ? '全アプリを、全部の端末で' : 'このアプリを、全部の端末で';
    ask(何を + '更新します。よろしいですか？', { ok: '更新する', cancel: 'やめる' }).then(function (yes) {
      if (!yes) return;
      var body = { at: new Date().toISOString(), app: (scope === 'all') ? 'all' : appKey(),
                   by: (w.fb.currentUser && (w.fb.currentUser.displayName || w.fb.currentUser.email)) || '' };
      w.fb.db.collection('companies').doc(c).collection('settings').doc('forceReload').set(body)
        .then(function () { note('合図を出しました。開いている画面が数秒で新しくなります。'); })
        .catch(function (e) { console.error('[power] 強制更新の合図を出せませんでした', e); note('強制更新の合図を出せませんでした（権限か通信）。'); });
    });
  }

  /* ============================================================
     🔴 決めた人の端末だけ更新（2026-08-29・ゆうた指定）
       🗣「特定のアカウント、例えばAさんのログイン端末を全部更新する、はできる？」
     ⚠ 名簿は companies/{会社}/portalMembers。**書類の名前が uid とは限らない**ので、
        合図には uid とメールの両方を書く（受け取る側はどちらか一致で自分ごと）。
     ⚠ 名簿を読めるのは会社の人だけ。この入口はマスターにしか出さないので二重に守られている。
     ============================================================ */
  var _pick = false, _members = null, _memLoading = false, _memQ = '', _pickScope = 'all';

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* ⚠ 全角＠・全角英数・大文字小文字・前後の空白を揃えてから比べる（名簿の打ち込みは揺れる） */
  function normMail(v) { try { return String(v || '').normalize('NFKC').toLowerCase().trim(); } catch (e) { return String(v || '').toLowerCase().trim(); } }
  function meMail() { try { return normMail((w.fb && w.fb.currentUser && w.fb.currentUser.email) || ''); } catch (e) { return ''; } }

  function loadMembers() {
    if (_members || _memLoading) return;
    var c = cid(); if (!w.fb || !w.fb.db || !c) return;
    _memLoading = true;
    w.fb.db.collection('companies').doc(c).collection('portalMembers').get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (docu) {
          var m = docu.data() || {}; m.id = docu.id;
          if (m.active === false) return;                 /* 退職・停止の人は出さない */
          out.push(m);
        });
        out.sort(function (a, b) {
          var sa = (typeof a.sortOrder === 'number') ? a.sortOrder : 999999;
          var sb = (typeof b.sortOrder === 'number') ? b.sortOrder : 999999;
          if (sa !== sb) return sa - sb;
          return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
        });
        _members = out; _memLoading = false;
        if (_pick) { drawPick(); place(); }
      })
      .catch(function (e) {
        console.error('[power] 名簿を読めませんでした', e);
        _members = []; _memLoading = false;
        if (_pick) { drawPick(); place(); }
      });
  }

  function avatarHtml(m) {
    if (m.photo) return '<span class="cf-power-av"><img src="' + esc(m.photo) + '" alt=""></span>';
    var ini = esc(m.ini || String(m.name || m.email || '？').trim().charAt(0) || '？');
    return '<span class="cf-power-av" style="background:' + esc(m.color || '#26314a') + '">' + ini + '</span>';
  }

  function drawPick() {
    var m = $('cf-power-menu'); if (!m) return;
    var q = normMail(_memQ);
    var list = _members && _members.filter(function (x) {
      if (!q) return true;
      return normMail(x.name).indexOf(q) >= 0 || normMail(x.email).indexOf(q) >= 0 || normMail(x.dept).indexOf(q) >= 0;
    });
    var h = '';
    h += '<button class="cf-power-item" data-do="pick-back">' + IC.back + 'もどる</button>';
    h += '<div class="cf-power-sep"></div>';
    h += '<div class="cf-power-head">' + (_pickScope === 'all' ? '誰の 全アプリ を更新しますか' : '誰の この画面 を更新しますか') + '</div>';
    h += '<input class="cf-power-find" id="cf-power-find" type="text" placeholder="名前でしぼる" value="' + esc(_memQ) + '">';
    h += '<div class="cf-power-list">';
    if (!_members) h += '<div class="cf-power-empty">名簿を読んでいます…</div>';
    else if (!list.length) h += '<div class="cf-power-empty">' + (_memQ ? '見つかりませんでした' : '名簿が空です') + '</div>';
    else list.forEach(function (x) {
      var 名 = x.name || x.email || x.id;
      var 下 = x.dept || x.title || x.email || '';
      h += '<button class="cf-power-item" data-uid="' + esc(x.id) + '">' + avatarHtml(x) +
           '<span class="cf-t">' + esc(名) + (下 ? '<small>' + esc(下) + '</small>' : '') + '</span></button>';
    });
    h += '</div>';
    m.innerHTML = h;
    var f = $('cf-power-find');
    if (f) {
      f.addEventListener('input', function () { _memQ = f.value || ''; var pos = f.selectionStart; drawPick(); var g = $('cf-power-find'); if (g) { g.focus(); try { g.setSelectionRange(pos, pos); } catch (e) {} } });
      /* 🔴 一覧の中で Esc を押した時は、メニューごと閉じずに**もどる**だけにしたいので、ここで止める */
      f.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); _pick = false; build(); place(); } });
    }
  }

  function openPick(scope) {
    _pick = true; _memQ = ''; _pickScope = (scope === 'app') ? 'app' : 'all';
    drawPick(); place();
    loadMembers();
    setTimeout(function () { var f = $('cf-power-find'); if (f) f.focus(); }, 30);
  }

  /* 🔴 その人あての合図を1枚書く。app は 'all'＝その人が開いている画面はぜんぶ。 */
  function doForceOne(id) {
    var c = cid();
    var 人 = (_members || []).filter(function (x) { return x.id === id; })[0];
    if (!人) { note('その人が名簿から見つかりませんでした。'); return; }
    if (!w.fb || !w.fb.db || !c) { note('いまはクラウドに繋がっていないので、強制更新は出せません。'); return; }
    var 名 = 人.name || 人.email || 人.id;
    var tuid = String(人.uid || 人.id || '');
    var tmail = normMail(人.email);
    /* ⚠ 当てる手がかりが1つも無い人は、出しても**誰にも届かない**。黙って成功に見せない。 */
    if (!tuid && !tmail) { note(名 + 'さんは、当てる手がかり（IDもメール）が名簿にありません。'); return; }
    var 何を = (_pickScope === 'all') ? '開いている画面（全アプリ）' : '開いている この画面';
    var あて = (_pickScope === 'all') ? 'all' : appKey();
    ask(名 + 'さんが' + 何を + 'を更新します。よろしいですか？', { ok: '更新する', cancel: 'やめる' }).then(function (yes) {
      if (!yes) return;
      var body = { at: new Date().toISOString(), app: あて, uid: tuid, email: tmail, name: 名,
                   by: (w.fb.currentUser && (w.fb.currentUser.displayName || w.fb.currentUser.email)) || '' };
      w.fb.db.collection('companies').doc(c).collection('settings').doc('forceReload').set(body)
        .then(function () { note(名 + 'さんに合図を出しました。その人が開いている画面が数秒で新しくなります。'); })
        .catch(function (e) { console.error('[power] 強制更新の合図を出せませんでした', e); note('強制更新の合図を出せませんでした（権限か通信）。'); });
    });
  }

  /* ---------- 合図の見張り ---------- */
  var _seen = null, _watching = false;
  var _reloaded = false;            /* ③ 1回の読み込みで読み直すのは1回まで */
  var _waitT = 0, _waitSince = 0;   /* ④ 打ち込み中は待つ（最大60秒） */
  var _WAIT_MAX = 60000, _WAIT_TICK = 2000;

  /* ④ いま読み直しても人の手を止めないか（auto-update.js と同じ考え方）
     ⚠ 「打ち込み中かどうか」の物差しはここ1本。アプリごとに持たせない。 */
  function 手が空いている() {
    try {
      if (w.__appBusy) return false;
      var ae = d.activeElement;
      if (ae) {
        var tag = (ae.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return false;
      }
      var dlg = d.querySelector('[role="dialog"], .modal, #modal, .modal-backdrop, .overlay, .crop-box');
      if (dlg && dlg.offsetParent !== null) return false;
    } catch (e) {}
    return true;
  }

  /* 合図を受け取ってから、実際に読み直すまで。**判断はここ1本。** */
  function 読み直しを予約する() {
    if (_reloaded) return;
    if (!_waitSince) _waitSince = Date.now();
    if (手が空いている() || (Date.now() - _waitSince) > _WAIT_MAX) {
      _reloaded = true;
      if (_waitT) { clearInterval(_waitT); _waitT = 0; }
      note('新しい版が出ました。画面を更新します…');
      setTimeout(doReload, 1500);
      return;
    }
    /* 打ち込み中＝手が空くまで待つ。⚠ 黙って待たない（何も起きないように見えるのが一番こわい） */
    note('新しい版が出ました。手が空いたら画面を更新します…');
    if (!_waitT) _waitT = setInterval(読み直しを予約する, _WAIT_TICK);
  }
  function watch() {
    if (_watching) return;
    var c = cid(); if (!w.fb || !w.fb.db || !c) return;
    _watching = true;
    try {
      w.fb.db.collection('companies').doc(c).collection('settings').doc('forceReload')
        .onSnapshot(function (snap) {
          var v = (snap && snap.exists) ? (snap.data() || {}) : null;
          var at = v ? String(v.at || '') : '';
          /* 🔴 開いた瞬間の値では開き直さない（毎回開き直す無限ループになる） */
          if (_seen === null) { _seen = at; return; }
          if (!at || at === _seen) return;
          _seen = at;
          /* 🔴 誰あてか（uid かメールのどちらか一致で自分ごと）。両方 空 なら全員あて。
             ⚠ 名簿の書類の名前が uid とは限らないので、**片方だけで判定しない**。 */
          var tu = String(v.uid || ''), te = normMail(v.email);
          if (tu || te) {
            var mu = meUid(), mm = meMail();
            var 自分ごと = (tu && mu && mu === tu) || (te && mm && mm === te);
            if (!自分ごと) return;
          }
          var 対象 = String(v.app || '');
          if (対象 !== 'all' && 対象 !== appKey()) return;
          読み直しを予約する();
        }, function (e) { console.warn('[power] 強制更新の見張りを張れませんでした', e); _watching = false; });
    } catch (e) { _watching = false; }
  }

  /* ---------- 画面に組み込む ---------- */
  function findLogoutBtn() {
    var all = d.querySelectorAll('button,a,span');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.closest && e.closest('#cf-power')) continue;
      var t = (e.textContent || '').replace(/\s/g, '');
      var oc = e.getAttribute && (e.getAttribute('onclick') || '');
      if (t === 'ログアウト' || /ogout|signOut/i.test(oc || '')) {
        if (t.length <= 8) return e;                 /* 長い文の中の一致は拾わない */
      }
    }
    return null;
  }

  function wire() {
    if (_wired && $('cf-power')) return true;
    var out = findLogoutBtn();
    if (!out) return false;

    css();
    /* 🔴 いまの動きをそのまま奪って持つ（アプリごとの関数名を覚えない） */
    (function () {
      var oc = out.getAttribute && out.getAttribute('onclick');
      if (oc) { try { _handlers.logout = new Function(oc); } catch (e) { _handlers.logout = null; } }
      if (!_handlers.logout && out.onclick) { var f = out.onclick; _handlers.logout = function () { f.call(out); }; }
    })();

    var help = d.querySelector('.help-btn');
    if (help) {
      var hoc = help.getAttribute && help.getAttribute('onclick');
      if (hoc) { try { _handlers.help = new Function(hoc); } catch (e) { _handlers.help = null; } }
      if (!_handlers.help && help.onclick) { var g = help.onclick; _handlers.help = function () { g.call(help); }; }
      try { help.remove(); } catch (e) {}
    }

    var box = d.createElement('div');
    box.className = 'cf-power'; box.id = 'cf-power';
    box.innerHTML = '<button class="cf-power-btn" id="cf-power-btn" title="電源メニュー" aria-label="電源メニュー">' + IC.power + '</button>';
    try { out.parentNode.replaceChild(box, out); } catch (e) { return false; }
    /* 🔴 メニューは body の直下に置く＝アプリ側の重なり順・はみ出し切りに巻き込まれない */
    var menu = d.createElement('div');
    menu.className = 'cf-power-menu'; menu.id = 'cf-power-menu';
    (d.body || d.documentElement).appendChild(menu);

    $('cf-power-btn').addEventListener('click', function (ev) { ev.stopPropagation(); open(); });
    $('cf-power-menu').addEventListener('click', function (ev) {
      /* 🔴 メニューの中の押しは**必ずここで止める**。
         名簿をしぼる入力欄を触っただけで、下の「外側を押したら閉じる」に食われるため。 */
      ev.stopPropagation();
      var b = ev.target.closest && ev.target.closest('[data-do],[data-uid]'); if (!b) return;
      var u = b.getAttribute('data-uid');
      if (u !== null) { open(false); doForceOne(u); return; }
      var k = b.getAttribute('data-do');
      /* 一覧を出す／もどる は、メニューを閉じずに中身だけ入れ替える */
      if (k === 'fr-one-app') { openPick('app'); return; }
      if (k === 'fr-one-all') { openPick('all'); return; }
      if (k === 'pick-back') { _pick = false; build(); place(); return; }
      open(false);
      if (k === 'reload') doReload();
      else if (k === 'close') doClose();
      else if (k === 'help') { if (_handlers.help) { try { _handlers.help(); } catch (e) {} } }
      else if (k === 'logout') doLogoutAsk();
      else if (k === 'fr-app') doForce('app');
      else if (k === 'fr-all') doForce('all');
    });
    d.addEventListener('click', function () { open(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
    /* 画面が動いたら閉じる（浮いたまま置いていかれないように） */
    w.addEventListener('resize', function () { open(false); });
    /* 🔴 2026-08-29 直し：**メニューの中のスクロールでは閉じない。**
       名簿の一覧を指で送ろうとしただけで閉じてしまい、下のほうの人を選べなかった。
       （この見張りは capture＝下から上に伝わる前に拾うので、一覧の中のスクロールも届く） */
    w.addEventListener('scroll', function (e) {
      var m = $('cf-power-menu');
      var t = e && e.target;
      if (m && t && (t === m || (m.contains && t.nodeType === 1 && m.contains(t)))) return;
      open(false);
    }, true);

    _wired = true;
    return true;
  }

  /* ログイン前はヘッダーが無いアプリがあるので、見つかるまで少し粘る */
  function start() {
    if (wire()) { watch(); return; }
    if (++_tries > 60) return;                       /* 30秒であきらめる（無いものは無い） */
    setTimeout(start, 500);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
  /* ログインが済んでから会社が決まるアプリがあるので、見張りは何度か試す */
  setInterval(function () { if (!_watching) watch(); }, 4000);

  /* 見張り（テスト）から触る継ぎ目。ふつうは使わない。 */
  /* 🔴 外から呼べる入口。PitFlow の設定ページの「全端末を今すぐ更新する」がこれを呼ぶ。
     ＝ アプリ側に**判断を1行も持たせない**（持たせると必ず片方だけ直る）。 */
  w.CFPower = { wire: wire, open: open, isMaster: isMaster, _handlers: _handlers,
                force: doForce,
                _force: doForce, _forceOne: doForceOne, _pickOpen: openPick, _place: place,
                _close: doClose, _watch: watch, MASTER_UID: MASTER_UID,
                _setMembers: function (a) { _members = a; if (_pick) { drawPick(); place(); } },
                _members: function () { return _members; },
                _setReload: function (f) { _reloadHook = f || null; },
                _busyReset: function () { _reloaded = false; _waitSince = 0; if (_waitT) { clearInterval(_waitT); _waitT = 0; } } };
})(window, document);
