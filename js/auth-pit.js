/* ========================================
   auth-pit.js  -  ログイン（PitFlow）
   ----------------------------------------
   2つのモードがある。どちらで動くかは firebase-init.js が決める（window.PIT_CLOUD）。

   ① 本番モード（pitflow.kobayashi-motors.com など）
      Google でログイン → CoreFlow の名簿（portalMembers）で入室を判定する。
      入れる条件＝名簿に居る／在籍中（active）／CoreFlowで「PitFlow＝使える」がオン。
      （マスター＝ゆうたは常に入れる）
      入れたら state.staff を CoreFlow の実メンバーに差し替える（members-pit.js）。

   ② サンプルモード（github.io・localhost・デモ版）
      いままでどおり。ボタンひとつで入れて、この端末だけに保存される。

   ⚠ ログイン画面と本体の出し分けは、どちらのモードでも
      #pit-login の表示／body.pit-authed で行う（今までと同じ作り）。
   ======================================== */
(function () {
  var FLAG = 'pitflow_sample_authed';
  var COMPANY_ID = 'kobayashi_motors';
  var _busy = false;

  function el(id) { return document.getElementById(id); }

  function showApp() {
    var lg = el('pit-login');
    if (lg) lg.style.display = 'none';
    document.body.classList.add('pit-authed');
    /* 🔴 v1.68.0 お知らせ＝ログインしたら未読を出す（CarFlow と同じ考え方）。
       ここは**本番もサンプルも必ず通るログインの出口**なので、呼ぶのはここ1か所だけ。
       ⚠ 各画面や main.js に書き写さないこと。二重にポップアップが出る。
       少し待つのは、サイドバーと名簿の読み込みが済んでから丸を付けたいため。 */
    setTimeout(function () {
      if (window.pitNewsRefreshBadge) try { pitNewsRefreshBadge(); } catch (e) {}
      if (window.pitNewsMaybePopup)   try { pitNewsMaybePopup(); } catch (e) {}
    }, 900);
  }
  function showLogin() {
    var lg = el('pit-login');
    if (lg) lg.style.display = 'flex';
    document.body.classList.remove('pit-authed');
  }
  function loginError(msg) {
    var e = el('pl-error');
    if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
  }
  function setBusy(b) {
    _busy = !!b;
    var btn = el('pl-google');
    if (!btn) return;
    btn.disabled = !!b;
    /* ⚠ ここで btn.textContent を書くと Googleロゴの<svg>ごと消える（v1.18.1で修正）。
       文字は中の .pl-label だけ差し替える。 */
    var lab = btn.querySelector('.pl-label');
    if (lab) lab.textContent = b ? 'ログイン中…' : (window.PIT_CLOUD ? 'Google でログイン' : 'サンプルで入る');
  }

  /* 🔴 認証状態の確認が終わった＝「認証状態を確認中…」を消してログインボタンを出す。
     ⚠ index.html は #pl-loading を出しっぱなし・#pl-google を display:none で置いている。
        これを戻すコードがどこにも無かったので、**ログアウト状態だと永久にボタンが出ず、
        誰もログインできなかった**（v1.18.1で修正）。ログイン済みの人は showApp() で
        ログイン画面ごと隠れるため、今まで表に出ていなかった。
     ⚠ 認証の分岐（入れた/入れない/エラー/時間切れ）から必ずここを通すこと。 */
  function authReady() {
    var ld = el('pl-loading');
    if (ld) ld.style.display = 'none';
    var btn = el('pl-google');
    if (btn && !isInAppBrowser()) btn.style.display = '';
  }

  /* ---- アプリ内ブラウザ（LINE/Instagram等）は Google ログインが弾かれる ---- */
  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    if (/Line\//i.test(ua)) return true;
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return true;
    if (/Instagram/i.test(ua)) return true;
    if (/Twitter/i.test(ua)) return true;
    if (/Slack\//i.test(ua)) return true;
    if (/MicroMessenger/i.test(ua)) return true;
    if (/KAKAOTALK/i.test(ua)) return true;
    if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return true;
    return false;
  }
  function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''); }

  /* =======================================================
     ② サンプルモード（今までと同じ）
     ======================================================= */
  function initSampleMode() {
    /* 🔴 v1.49.2 練習用サイトの時だけ、ログイン画面に注意書きを出す（CSSで出し分け）。
       ⚠ 既定は「出さない」＝本番で一瞬でも出ないように（ゆうた指摘）。 */
    var _lb = el('pit-login');
    if (_lb) _lb.classList.add('pl-sample');

    window.pitSampleLogin = function () {
      try { localStorage.setItem(FLAG, '1'); } catch (e) {}
      showApp();
    };
    window.pitLogout = function () {
      try { localStorage.removeItem(FLAG); } catch (e) {}
      showLogin();
    };
    /* サンプルでは「誰でログインしているか」を特定できないので空を返す＝予約担当は空のまま */
    window.pitCurrentStaffName = function () { return ''; };
    window.pitIsAdmin = function () { return true; };   // サンプルは全部さわれる
    /* 🔴 v1.84.0 操作ログの「1件だけ消す」に使う。
       サンプル（練習用サイト）の操作ログは**この端末の中だけの記録**なので、
       消しても誰にも影響しない＝全員に出してよい。本番だけがマスター限定。 */
    window.pitIsMaster = function () { return true; };

    var authed = false;
    try { authed = localStorage.getItem(FLAG) === '1'; } catch (e) {}
    if (authed) { showApp(); } else { showLogin(); setBusy(false); authReady(); }
  }

  /* =======================================================
     ① 本番モード
     ======================================================= */
  function normEmail(s) {
    return (typeof s === 'string') ? s.normalize('NFKC').toLowerCase().trim() : '';
  }

  /* 名簿から自分を探す（uid → メール → 大文字小文字・全角＠違いを救済） */
  function findMyMember(user) {
    var coll = window.fb.company().collection('portalMembers');
    return coll.doc(user.uid).get().then(function (doc) {
      if (doc.exists) { var m = doc.data() || {}; m.id = doc.id; return m; }
      if (!user.email) return null;
      var norm = normEmail(user.email);
      return coll.where('email', '==', user.email).limit(1).get().then(function (snap) {
        if (!snap.empty) { var d = snap.docs[0]; var m2 = d.data() || {}; m2.id = d.id; return m2; }
        return coll.where('email', '==', norm).limit(1).get().then(function (s2) {
          if (!s2.empty) { var d2 = s2.docs[0]; var m3 = d2.data() || {}; m3.id = d2.id; return m3; }
          return coll.limit(300).get().then(function (all) {
            var hit = null;
            all.forEach(function (x) {
              if (hit) return;
              if (normEmail(String((x.data() || {}).email || '')) === norm) hit = x;
            });
            if (!hit) return null;
            var m4 = hit.data() || {}; m4.id = hit.id; return m4;
          });
        });
      });
    }).catch(function (e) {
      console.warn('[auth-pit] 名簿の照会に失敗', e);
      return null;
    });
  }

  /* 入室できるか（CoreFlowで「PitFlow＝使える」がオンの人だけ。マスターは常に可） */
  function canUse(m) {
    if (m.master === true) return true;
    return !!(m.pitflow && m.pitflow.on === true);
  }
  /* PitFlow の中の権限（管理／メンバー）。メンバーの設定を触れるのは管理だけ。 */
  function isAdminRole(m) {
    if (!m) return false;
    if (m.master === true || m.admin === true) return true;
    return !!(m.pitflow && m.pitflow.role === '管理');
  }

  window.doPitLogin = function () {
    if (_busy || !window.fb || !window.fb.auth) return;
    if (window.fb.auth.currentUser) return;
    loginError('');
    setBusy(true);
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    var p = isMobile() ? window.fb.auth.signInWithRedirect(provider)
                       : window.fb.auth.signInWithPopup(provider);
    p.catch(function (err) {
      console.error('[auth-pit] ログイン失敗', err);
      var msg = 'ログインに失敗しました';
      var code = err && err.code;
      if (code === 'auth/popup-closed-by-user') msg = 'ログインが途中で閉じられました';
      else if (code === 'auth/popup-blocked') msg = 'ポップアップがブロックされました。ブラウザで許可してください';
      else if (code === 'auth/unauthorized-domain') msg = 'このアドレスはまだ Firebase に登録されていません（承認済みドメイン）';
      loginError(msg);
      setBusy(false);
    });
  };

  window.pitLogout = function () {
    if (!window.fb || !window.fb.auth) { showLogin(); return; }
    window.fb.auth.signOut().catch(function (e) { console.error('[auth-pit] ログアウト失敗', e); });
  };
  /* ログイン画面のボタンはモードで中身が変わる（本番では Google ログインになる） */
  window.pitSampleLogin = function () { window.doPitLogin(); };

  /* いまログインしている人の名前。新規予約の「予約担当」や個人BOXの「自分」がこれを見る。
     ⚠ v1.7.1：ここは**通称（CoreMembers の表示名）**を返す。
        画面の担当セレクトや付箋は通称で並んでいるので、本名を返すと
        「候補に無い名前」になって予約担当が空欄に見えてしまうため。
        ヘッダー右のログイン名は本名のまま（theme.js が名簿の名前を直接見ている）。 */
  window.pitCurrentStaffName = function () {
    var m = window.fb && window.fb.currentMember;
    if (!m) return '';
    var s = (window.pitStaffById && window.pitStaffById(m.id))
         || (window.pitStaffByName && window.pitStaffByName(m.name));
    return (s && s.name) || m.name || '';
  };
  window.pitIsAdmin = function () { return isAdminRole(window.fb && window.fb.currentMember); };

  /* 🔴 v1.84.0 **マスター（ゆうた）かどうか。** 操作ログを1件消せるのはこの人だけ。
     ⚠ 「管理（admin）」とは別物。広げないこと。
        Firestore のルールが `pitAuditLogs` の delete を `_isMaster()` に締めてあるので、
        ここを admin まで広げると**押せるのに消えないボタン**（サーバー側で拒否）になる。
        ルールは `CarFlow\carflow\firestore.rules`（全アプリ共通の1枚）にある。 */
  window.pitIsMaster = function () {
    var m = window.fb && window.fb.currentMember;
    return !!(m && m.master === true);
  };

  function kickOut(msg) {
    loginError(msg);
    setBusy(false);
    authReady();
    try { window.fb.auth.signOut(); } catch (e) {}
    showLogin();
  }

  function onSignedIn(user) {
    findMyMember(user).then(function (member) {
      if (!member) return kickOut('CoreFlowの名簿にこのアカウントがありません。管理者に追加してもらってください。');
      if (member.active === false) return kickOut('このアカウントは在籍なしになっています。');
      if (!canUse(member)) return kickOut('PitFlow の利用がオンになっていません。CoreFlowのメンバー管理で「PitFlow＝使える」をオンにしてもらってください。');

      window.fb.currentUser = user;
      window.fb.currentMember = member;
      window.fb.currentCompanyId = COMPANY_ID;

      /* ルール判定の橋渡し（CarFlow と同じ。失敗しても止めない） */
      window.fb.company().collection('userPrefs').doc(user.uid)
        .set({ memberId: member.id, memberEmail: (member.email || user.email || '') }, { merge: true })
        .catch(function (e) { console.warn('[auth-pit] userPrefs 記録に失敗（継続）', e); });

      /* 「自分」＝ログイン本人に紐づける（個人フォーカスBOX・付箋の自分） */
      try { localStorage.setItem('pitflow_bn_me', member.id); } catch (e) {}

      setBusy(false);
      loginError('');
      showApp();
      console.log('[auth-pit] ログイン', member.name, '／管理=' + isAdminRole(member));

      /* 名簿の読み込み → 保存の接続。順番が大事なので members-pit.js に任せる。 */
      if (typeof window.pitOnLogin === 'function') {
        try { window.pitOnLogin(member, user); } catch (e) { console.error('[auth-pit] pitOnLogin でエラー', e); }
      }
    });
  }

  function onSignedOut() {
    window.fb.currentUser = null;
    window.fb.currentMember = null;
    /* 🔴 v1.68.1 お知らせの既読は人ごと。ログアウトしたら忘れる。
       ⚠ 忘れないと、同じ端末で次に入った人が前の人の既読を引き継ぎ、
          その人には新着が一度も出なくなる。 */
    if (window.pitNewsForget) { try { window.pitNewsForget(); } catch (e) {} }
    setBusy(false);
    showLogin();
    authReady();
    if (typeof window.pitOnLogout === 'function') {
      try { window.pitOnLogout(); } catch (e) {}
    }
  }

  function initCloudMode() {
    if (!window.fb || !window.fb.auth) { console.error('[auth-pit] Firebase 未初期化'); showLogin(); return; }

    var box = el('pit-login');
    if (box) box.classList.add('pl-cloud');   /* 本番用の文言に切り替え（CSSで出し分け） */

    if (isInAppBrowser()) {
      var w = el('pl-inapp'); if (w) w.style.display = 'block';
      var b = el('pl-google'); if (b) b.style.display = 'none';
      authReady();   /* ボタンは出さないが「確認中…」は消す（説明文だけ見せる） */
    }

    if (window.fb.auth.getRedirectResult) {
      window.fb.auth.getRedirectResult().catch(function (err) {
        console.error('[auth-pit] リダイレクト戻りでエラー', err);
        loginError('ログインに失敗しました（' + ((err && err.code) || '不明') + '）');
        authReady();
      });
    }

    /* 🛟 保険：8秒たっても認証の返事が来なければ、とにかくボタンを出す。
       通信が不安定な時に「認証状態を確認中…」で固まったまま何もできない、を防ぐ。
       ログイン済みなら showApp() でログイン画面ごと消えているので、この保険は効かない。 */
    var _t = setTimeout(function () {
      if (!(window.fb.auth && window.fb.auth.currentUser)) {
        console.warn('[auth-pit] 認証の返事が8秒来ないのでログインボタンを出します');
        authReady();
      }
    }, 8000);

    window.fb.auth.onAuthStateChanged(function (user) {
      clearTimeout(_t);
      if (user) onSignedIn(user); else onSignedOut();
    });
  }

  function boot() {
    if (window.PIT_CLOUD) initCloudMode();
    else initSampleMode();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
