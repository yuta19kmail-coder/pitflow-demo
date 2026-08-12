/* ========================================
   sample-customers.js  -  顧客（人）＋車両 のサンプル生成（開発用）／PitFlow v0.38.0
   ----------------------------------------
   ・1人＝1レコード（複数台もち対応）。人に車両配列(vehicles)がぶら下がる。
   ・担当/課/区分は車両ごと。同じ人の2台目以降は基本「既存と同じ」、たまに違う。
   ・あくまで開発・動作確認用のダミー。実在しない名前・番号です。
   ======================================== */
(function () {
  // [漢字, カナ読み]
  const SEI = [['佐藤','サトウ'],['鈴木','スズキ'],['高橋','タカハシ'],['田中','タナカ'],['伊藤','イトウ'],['渡辺','ワタナベ'],['山本','ヤマモト'],['中村','ナカムラ'],['小林','コバヤシ'],['加藤','カトウ'],['吉田','ヨシダ'],['山田','ヤマダ'],['佐々木','ササキ'],['山口','ヤマグチ'],['松本','マツモト'],['井上','イノウエ'],['木村','キムラ'],['林','ハヤシ'],['清水','シミズ'],['山崎','ヤマザキ'],['森','モリ'],['池田','イケダ'],['橋本','ハシモト'],['阿部','アベ'],['石川','イシカワ'],['前田','マエダ'],['藤田','フジタ'],['後藤','ゴトウ'],['小川','オガワ'],['岡田','オカダ'],['長谷川','ハセガワ'],['村上','ムラカミ'],['近藤','コンドウ'],['石井','イシイ'],['斎藤','サイトウ'],['坂本','サカモト'],['遠藤','エンドウ'],['青木','アオキ'],['藤井','フジイ'],['西村','ニシムラ'],['福田','フクダ'],['太田','オオタ'],['三浦','ミウラ'],['藤原','フジワラ'],['岡本','オカモト'],['松田','マツダ'],['中川','ナカガワ'],['中野','ナカノ'],['原田','ハラダ'],['小野','オノ'],['竹内','タケウチ'],['金子','カネコ'],['和田','ワダ'],['中山','ナカヤマ'],['石田','イシダ'],['上田','ウエダ'],['森田','モリタ'],['原','ハラ'],['柴田','シバタ'],['酒井','サカイ']];
  const MEI = [['大輔','ダイスケ'],['翔太','ショウタ'],['健太','ケンタ'],['拓也','タクヤ'],['直樹','ナオキ'],['亮','リョウ'],['涼介','リョウスケ'],['和也','カズヤ'],['智也','トモヤ'],['雄太','ユウタ'],['健一','ケンイチ'],['誠','マコト'],['浩二','コウジ'],['博之','ヒロユキ'],['茂','シゲル'],['清','キヨシ'],['豊','ユタカ'],['隆','タカシ'],['学','マナブ'],['修','オサム'],['優子','ユウコ'],['美咲','ミサキ'],['陽子','ヨウコ'],['愛','アイ'],['真由美','マユミ'],['千夏','チナツ'],['葵','アオイ'],['結衣','ユイ'],['明美','アケミ'],['恵子','ケイコ'],['洋子','ヨウコ'],['由美','ユミ'],['久美子','クミコ'],['直子','ナオコ'],['彩','アヤ'],['麻衣','マイ'],['綾','アヤ'],['里奈','リナ'],['沙織','サオリ'],['京子','キョウコ']];
  const MAKERS = {
    'トヨタ':['アクア','プリウス','ヴィッツ','カローラ','ハリアー','ヴォクシー','ノア','アルファード','ランドクルーザー','パッソ','ルーミー','ヤリス'],
    'ホンダ':['フィット','N-BOX','フリード','ステップワゴン','ヴェゼル','オデッセイ','N-WGN','シャトル'],
    '日産':['ノート','セレナ','デイズ','エクストレイル','マーチ','ジューク','ルークス','キックス'],
    'マツダ':['デミオ','アクセラ','CX-5','アテンザ','ロードスター','CX-3','MAZDA2'],
    'スズキ':['ワゴンR','スペーシア','ハスラー','アルト','スイフト','ジムニー','ソリオ'],
    'ダイハツ':['タント','ムーヴ','ミラ','キャスト','ウェイク','ロッキー','タフト'],
    'スバル':['インプレッサ','フォレスター','レガシィ','レヴォーグ','XV'],
    'BMW':['320i','118i','X1','X3','523d'],
    'メルセデス':['Aクラス','Cクラス','GLA','Eクラス'],
    'VW':['ゴルフ','ポロ','ティグアン','パサート']
  };
  const KOKUSAN = ['トヨタ','ホンダ','日産','マツダ','スズキ','ダイハツ','スバル'];
  const PLACES = ['野田','柏','習志野','千葉','松戸','袖ヶ浦','品川','練馬','足立','横浜','大宮','春日部','所沢','川口'];
  const CLS = ['300','500','580','330','530','480'];
  const KANA = ['あ','い','う','え','か','き','く','け','こ','さ','す','せ','そ','た','つ','て','と','な','に','ぬ','の','は','ひ','ふ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','わ'];
  const FRONT = { div1: ['社長','専務','椎名'], div2: ['チーフ','蓮沼','箱崎','菅谷'] };

  /* ===================================================================
     🟠 v1.79.0（ゆうた指定）**デモ版（練習用サイト）は「明らかに架空」の中身にする。**
     -------------------------------------------------------------------
     🗣「カード見て混同しないように 名前はデモ山とかデモ田とかにして
        車もテストA とかテストBとか 実写名を使わないように」
     ◎なぜ
       本物っぽい名前・車種だと、**練習用のカードを本番のものと見間違える**。
       「デモ山 一郎／テストA」なら、ひと目で練習用と分かる。
     🔴 切り替えるのは **この表だけ**。作る手順（genVehicle / genPerson）は本番と同じものを通す。
        ＝サンプルの作り方を2本に分けない。
     ⚠ 判定は `pitIsDemo()`（demo-pit.js）1本。だから index.html で
        **demo-pit.js は sample-*.js より前**に読んでいる。
     =================================================================== */
  const DEMO = {
    SEI: [['デモ山','デモヤマ'],['デモ田','デモタ'],['デモ川','デモカワ'],['デモ本','デモモト'],
          ['サンプル','サンプル'],['テス川','テスカワ'],['テス田','テスタ'],['レンシュウ','レンシュウ']],
    MEI: [['一郎','イチロウ'],['二郎','ジロウ'],['三郎','サブロウ'],['四郎','シロウ'],
          ['五郎','ゴロウ'],['花子','ハナコ'],['桃子','モモコ'],['太郎','タロウ']],
    MAKERS: {
      'デモ自動車'   : ['テストA','テストB','テストC','テストD'],
      'サンプル自動車': ['テストE','テストF','テストG'],
      'テスト自工'   : ['テストH','テストI','テストJ'],
      'デモ輸入'     : ['テストX','テストY'],
      'サンプル輸入' : ['テストZ']
    },
    KOKUSAN: ['デモ自動車','サンプル自動車','テスト自工'],   /* これ以外＝輸入（2課）へ */
    PLACES : ['デモ','サンプル','テスト','レンシュウ']
  };
  function isDemo() { return !!(window.pitIsDemo && window.pitIsDemo()); }
  /* いま使う表（本番のサンプル＝今までどおり／デモ版＝架空） */
  function T() {
    return isDemo()
      ? DEMO
      : { SEI: SEI, MEI: MEI, MAKERS: MAKERS, KOKUSAN: KOKUSAN, PLACES: PLACES };
  }
  /* 🟠 デモ版は件数も少なくてよい（ゆうた指定「カード件数は多くなくていい」）。
     ⚠ 少なすぎると駐車場・代車・車検予定がスカスカで練習にならないので、この辺り。 */
  function custCount() { return isDemo() ? 60 : 400; }

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const d = n => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, '0');
  let _seq = 0;
  const uid = pre => pre + Date.now().toString(36) + (_seq++).toString(36);

  function genVehicle(usedPlate, inherit) {
    const t = T();
    let plate;
    do { plate = rnd(t.PLACES) + ' ' + rnd(CLS) + ' ' + rnd(KANA) + ' ' + d(4); } while (usedPlate[plate]);
    usedPlate[plate] = 1;
    const mk = rnd(Object.keys(t.MAKERS));
    const car = rnd(t.MAKERS[mk]);
    const kokusan = t.KOKUSAN.indexOf(mk) >= 0;
    // 既存(inherit)があり、8割は同じ担当/課/区分を継承。輸入/国産はメーカーで決まる
    let boardId, division, frontStaff;
    if (inherit && Math.random() < 0.8) {
      boardId = inherit.boardId; division = inherit.division; frontStaff = inherit.frontStaff;
    } else {
      boardId = kokusan ? 'default' : 'import';
      division = (boardId === 'import') ? 'div2' : 'div1';
      frontStaff = rnd(FRONT[division]);
    }
    // メーカーが国産/輸入と食い違わないよう、boardIdに合わせてメーカーを確定（継承時の整合）
    if (boardId === 'import' && kokusan) { /* 国産メーカーだが輸入扱い…サンプルなので許容 */ }
    const updatedAt = Date.now() - Math.floor(Math.random() * 540) * 86400000;   // 過去約1年半内のランダムな入庫日
    return { id: uid('v'), plate, maker: mk, car, boardId, division, frontStaff, updatedAt };
  }

  function genPerson(i, usedPlate) {
    const t = T();
    const sei = rnd(t.SEI), mei = rnd(t.MEI);
    /* 🟠 デモ版は電話番号も「かけられない・実在しない」形にする（000-0000-XXXX）。
       ⚠ 練習中に本当に発信してしまう事故を防ぐため。桁数は本物と同じにして、見た目の練習にはなるようにする。 */
    const tel1 = isDemo()
      ? '000-0000-' + d(4)
      : (Math.random() < 0.6)
        ? '0' + rnd(['90','80','70']) + '-' + d(4) + '-' + d(4)
        : '04' + rnd(['7','3','2']) + '-' + d(3) + '-' + d(4);
    const contacts = [{ tel: tel1, label: '個人携帯', primary: true }];
    if (Math.random() < 0.3) contacts.push({
      tel: isDemo() ? '000-0000-' + d(4) : '0' + rnd(['90','80']) + '-' + d(4) + '-' + d(4),
      label: '会社携帯', primary: false });
    // 台数：1台(70%)/2台(22%)/3台(8%)
    const r = Math.random();
    const n = r < 0.70 ? 1 : (r < 0.92 ? 2 : 3);
    const vehicles = [];
    for (let k = 0; k < n; k++) vehicles.push(genVehicle(usedPlate, vehicles[0]));
    const lastVisit = vehicles.reduce((m, v) => Math.max(m, v.updatedAt || 0), 0);
    return {
      id: 'cu_s' + Date.now().toString(36) + i,
      name: sei[0] + ' ' + mei[0], kana: sei[1] + mei[1],
      contacts, vehicles, updatedAt: lastVisit || (Date.now() - i * 60000)
    };
  }

  function gen(n) {
    const out = [], usedPlate = {};
    for (let i = 0; i < n; i++) out.push(genPerson(i, usedPlate));
    return out;
  }

  window.seedSampleCustomers = function (n, replace) {
    if (!Array.isArray(state.customers)) state.customers = [];
    if (replace) state.customers = [];
    state.customers = state.customers.concat(gen(n || custCount()));
    if (window.PitDB) PitDB.save();
    if (window.renderCustomers) renderCustomers();
    console.log('[sample-customers] 投入 ' + (n || custCount()) + ' 人 → 計 ' + state.customers.length);
  };
  window.clearCustomers = function () {
    pitAsk('顧客の控えを全部削除しますか？', { danger:true, ok:'削除する', detail:'整備ソフトの台帳には影響しません。' }).then(function (yes) {
      if (!yes) return;
      state.customers = [];
      if (window.PitDB) PitDB.save();
      if (window.renderCustomers) renderCustomers();
    });
  };

  // 起動時：空 or 旧フォーマット（vehicles配列が無い＝1台1レコードの旧型）かつ全部サンプルなら新モデルへ自動入替
  (function () {
    /* v1.2.1：本番（クラウド保存）では自動投入しない。
       ボタンからの seedSampleCustomers() は残す（練習用サイト・デモ版で使う）。 */
    if (window.PIT_CLOUD) return;
    const cs = Array.isArray(state.customers) ? state.customers : [];
    if (cs.length === 0) { window.seedSampleCustomers(custCount(), false); return; }
    // ★実データ保護：取り込み(cu_bl_)など「サンプル(cu_s)以外」の顧客が1件でもあれば、絶対に自動入替しない。
    //   （これまでは allSample 判定だけだったが、保険として明示ガードを追加＝予約生成後のリロード等で実顧客が消えるのを防ぐ）
    const hasNonSample = cs.some(r => !(typeof r.id === 'string' && r.id.indexOf('cu_s') === 0));
    if (hasNonSample) return;
    const noVehicles = !cs.some(r => Array.isArray(r.vehicles));                          // 旧型（1台1レコード）
    const noVehDate  = !cs.some(r => (r.vehicles || []).some(v => v.updatedAt));          // 車両に入庫日が無い
    if (noVehicles || noVehDate) { window.seedSampleCustomers(custCount(), true); }
  })();
})();
