/* ========================================
   firebase-init.js  -  Firebase 初期化（PitFlow）
   ----------------------------------------
   ・全アプリ共通の Firebase プロジェクト carflow-9d500 に相乗りする。
     PitFlow のデータは pit* 専用コレクションに入れる＝CarFlow/StockFlow のデータには触れない。
   ・authDomain は「いま開いているドメイン自身」にする。
     ⚠ 別ドメインを指すと iPhone の Safari でログインが無限ループする（CarFlow v2.18.12 で実証済み）。
   ・本番（クラウド）として動くのは、下の CLOUD_HOSTS で開いた時だけ。
     それ以外（github.io・localhost・デモ版）は今までどおり
     「サンプルログイン＋この端末だけの保存」で動く＝いまの開発用サイトは壊れない。
   ======================================== */
(function () {
  /* 本番として動かすドメイン。ここに載っているドメインで開いた時だけ
     本物の Google ログイン＋クラウド保存になる。 */
  var CLOUD_HOSTS = [
    'pitflow.kobayashi-motors.com',
    'pitflow.web.app',
    'pitflow.firebaseapp.com'
  ];

  var host = (location.hostname || '').toLowerCase();
  var q = (location.search || '');
  var isCloud = CLOUD_HOSTS.indexOf(host) >= 0;
  if (/[?&]demo=1/.test(q))  isCloud = false;   // 動作確認用：強制でサンプルモード
  if (/[?&]cloud=1/.test(q)) isCloud = true;    // 動作確認用：強制でクラウドモード
  if (window.PIT_DEMO === true) isCloud = false; // デモ版（別リポジトリ）が立てるフラグ

  window.PIT_CLOUD = isCloud;

  var firebaseConfig = {
    apiKey: "AIzaSyBmhI5SzkmPvZUiuTn_ttCZ4tUikKv_iHI",
    /* いま開いているドメイン自身を使う（本番以外は既定のドメイン） */
    authDomain: isCloud ? host : "carflow-9d500.firebaseapp.com",
    projectId: "carflow-9d500",
    storageBucket: "carflow-9d500.firebasestorage.app",
    messagingSenderId: "235121541987",
    appId: "1:235121541987:web:8f96dfadc23fe1de7f4956"
  };

  if (typeof firebase === 'undefined') {
    console.warn('[firebase-init] Firebase SDK 未読込（この端末だけの保存で続けます）');
    window.fb = { ready: false, cloud: false, config: firebaseConfig };
    window.PIT_CLOUD = false;
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  window.fb = {
    ready: true,
    cloud: isCloud,
    app: firebase.app(),
    auth: firebase.auth(),
    db: firebase.firestore(),
    config: firebaseConfig,
    serverTimestamp: function () { return firebase.firestore.FieldValue.serverTimestamp(); },
    FieldValue: firebase.firestore.FieldValue,
    currentUser: null,
    currentMember: null,
    currentCompanyId: 'kobayashi_motors'
  };

  /* 会社のデータの入口（companies/kobayashi_motors）。PitFlow のデータは全部この下。 */
  window.fb.company = function () {
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId);
  };

  console.log('[firebase-init] OK', firebaseConfig.projectId,
    isCloud ? '／本番モード（authDomain=' + firebaseConfig.authDomain + '）'
            : '／サンプルモード（この端末だけの保存）');
})();
