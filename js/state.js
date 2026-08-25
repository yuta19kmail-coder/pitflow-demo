/* ========================================
   state.js
   モック段階の状態（後でFirestoreに置き換え）
   ======================================== */

window.state = {
  currentView: 'today',

  // 📌 ダッシュボードの「全体タスク（付箋ボード）」（CarFlow式・v0.63.0）
  //   付箋＝5色・タイトル/本文/期限/担当メンバー/画像・実行/回覧・済スタンプ・DnD並べ替え。
  boardNotes: [],
  // 色ごとのラベル（緊急/今日中…）。設定で変えられる器（既定値）。
  boardLabels: { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' },

  reserveRange: 'day',
  reserveDate: new Date(),

  returnRange: 'tbd',   // 返車ビューの既定タブ＝未定（完TEL待ち/返車未定）
  returnDate: new Date(),

  currentBoardId: 'default',
  boards: [
    {
      id: 'default',
      name: '国産車',
      cols: [
        { id: 'check',    name: '点検待ち',   icon: '🔍' },
        { id: 'estim',    name: '見積り中',   icon: '🧮' },
        { id: 'contact',  name: '連絡中',     icon: '📞' },
        { id: 'parts',    name: 'パーツ待ち', icon: '📦' },
        { id: 'work',     name: '作業待ち',   icon: '🔧' },
        { id: 'workDone', name: '作業完了済', icon: '✅', terminal: true },
        { id: 'scrap',    name: '廃車・乗替', icon: '🚫', terminal: true, side: true },
        { id: 'outsource',name: '外注',       icon: '🤝', terminal: true, side: true },
      ],
    },
    {
      id: 'import',
      name: '輸入車',
      cols: [
        { id: 'check',    name: '点検待ち',   icon: '🔍' },
        { id: 'estim',    name: '見積り中',   icon: '🧮' },
        { id: 'contact',  name: '連絡中',     icon: '📞' },
        { id: 'parts',    name: 'パーツ待ち', icon: '📦' },
        { id: 'work',     name: '作業待ち',   icon: '🔧' },
        { id: 'workDone', name: '作業完了済', icon: '✅', terminal: true },
        { id: 'scrap',    name: '廃車・乗替', icon: '🚫', terminal: true, side: true },
        { id: 'outsource',name: '外注',       icon: '🤝', terminal: true, side: true },
      ],
    },
  ],

  // PIT配置図の枠。マス基準（gx,gy）＝図面エディタの座標。division '' (共通)/'div1'(1課)/'div2'(2課)。
  // ★初期値＝小林モータースの自社レイアウト（自社PIT配置図.json と同じ）。
  //   端末ごとにブラウザ保存（localStorage）なので、未編集の端末はこの自社配置で表示される。
  bays: [
    { id: 'baymq99q0w9862', name: '3PIT', icon: '', kind: 'lift', division: 'div2', gx: 1.5,  gy: 6,  gw: 3, gh: 5, dir: 'v', ncol: 1, rows: 5 },
    { id: 'baymq99qi0p112', name: '2番',  icon: '', kind: 'lift', division: 'div1', gx: 6,    gy: 6,  gw: 3, gh: 5, dir: 'v', ncol: 1, rows: 5 },
    { id: 'baymq99qve324', name: '1PIT', icon: '', kind: 'lift', division: 'div1', gx: 10.5, gy: 6,  gw: 3, gh: 5, dir: 'v', ncol: 1, rows: 5 },
    { id: 'baymq9gfkf8184', name: 'PIT 4', icon: '', kind: 'flat', division: '',    gx: 1.5,  gy: 13, dir: 'h', ncol: 2, rows: 2 },
    { id: 'baymq9gftkt76',  name: '4PIT', icon: '', kind: 'lift', division: 'div2', gx: 8.5,  gy: 13, dir: 'h', ncol: 2, rows: 2 },
    { id: 'baymq9gitve44',  name: '3前（青空1番）', icon: '', kind: 'flat', division: '', gx: 1,   gy: 2, dir: 'h', ncol: 2, rows: 2 },
    { id: 'baymq9gj24g50',  name: '1前', icon: '', kind: 'flat', division: '',    gx: 7.5,  gy: 2,  dir: 'h', ncol: 2, rows: 2 },
  ],

  // 配置図の建物・壁・ドア・シャッター（図面エディタで編集）。★初期値＝自社レイアウト。
  floorPlan: {
    cols: 30, rows: 18, shapes: [
      { id: 'shmq9gg71m912', type: 'building', gx: 0.5, gy: 5, gw: 15, gh: 12, locked: true },
      { id: 'shmq9ghc5t866', type: 'door', t: 0.5833333333333334, hostKind: 'bld', hostId: 'shmq9gg71m912', edge: 1, doorDir: 'out', doorSide: 'r' },
      { id: 'shmq9ghr8j107', type: 'shutter', t: 0.21818181818181825, hostKind: 'bld', hostId: 'shmq9gg71m912', edge: 3, len: 3.1999999999999997 },
      { id: 'shmq9gi2h482', type: 'shutter', t: 0.21515151515151515, hostKind: 'bld', hostId: 'shmq9gg71m912', edge: 0, len: 5.6000000000000005 },
      { id: 'shmq9gibiy991', type: 'shutter', t: 0.7024242424242425, hostKind: 'bld', hostId: 'shmq9gg71m912', edge: 0, len: 5.6000000000000005 }
    ]
  },

  resultMonth: new Date(),
  /* 🔢 v2.6.0 実績ビューの段（'count'＝売上に数える実績／'nocount'＝社内車両・売上なし）。保存しない */
  resultMode: 'count',

  loaners: [
    { id: 'L01', name: '代車1',  model: 'タント',     plate: '○○ 0001', shakenDate: '2026-09-14', tenkenDate: '2026-07-10' },
    { id: 'L02', name: '代車2',  model: 'N-BOX',      plate: '○○ 0002', shakenDate: '2027-01-22', tenkenDate: '2026-08-05' },
    { id: 'L03', name: '代車3',  model: 'ワゴンR',    plate: '○○ 0003', shakenDate: '2026-11-30', tenkenDate: '2026-06-18' },
    { id: 'L04', name: '代車4',  model: 'ムーヴ',     plate: '○○ 0004', shakenDate: '2027-03-08', tenkenDate: '2026-10-02' },
    { id: 'L05', name: '代車5',  model: 'デイズ',     plate: '○○ 0005', shakenDate: '2026-08-25', tenkenDate: '2027-02-12' },
    { id: 'L06', name: '代車6',  model: 'スペーシア', plate: '○○ 0006', shakenDate: '2026-12-19', tenkenDate: '2026-07-28' },
    { id: 'L07', name: '代車7',  model: 'ハスラー',   plate: '○○ 0007', shakenDate: '2027-04-06', tenkenDate: '2026-09-21' },
    { id: 'L08', name: '代車8',  model: 'アルト',     plate: '○○ 0008', shakenDate: '2026-10-17', tenkenDate: '2027-01-30' },
    { id: 'L09', name: '代車9',  model: 'ミラ',       plate: '○○ 0009', shakenDate: '2027-02-14', tenkenDate: '2026-08-22' },
    { id: 'L10', name: '代車10', model: 'N-WGN',      plate: '○○ 0010', shakenDate: '2026-07-31', tenkenDate: '2026-11-26' },
    { id: 'L11', name: '代車11', model: 'ekワゴン',   plate: '○○ 0011', shakenDate: '2026-09-03', tenkenDate: '2027-03-19' },
    { id: 'L12', name: '代車12', model: 'キャスト',   plate: '○○ 0012', shakenDate: '2027-05-11', tenkenDate: '2026-10-29' },
    { id: 'L13', name: '代車13', model: 'タフト',     plate: '○○ 0013', shakenDate: '2026-11-08', tenkenDate: '2026-06-25' },
    { id: 'L14', name: '代車14', model: 'ウェイク',   plate: '○○ 0014', shakenDate: '2027-01-05', tenkenDate: '2026-09-17' },
    { id: 'L15', name: '代車15', model: 'パッソ',     plate: '○○ 0015', shakenDate: '2026-08-12', tenkenDate: '2026-12-03' },
    { id: 'L16', name: '代車16', model: 'フィット',   plate: '○○ 0016', shakenDate: '2026-12-27', tenkenDate: '2027-04-15' },
    { id: 'L17', name: '代車17', model: 'ヴィッツ',   plate: '○○ 0017', shakenDate: '2027-03-23', tenkenDate: '2026-07-16' },
    { id: 'L18', name: '代車18', model: 'ノート',     plate: '○○ 0018', shakenDate: '2026-10-04', tenkenDate: '2027-02-26' },
    { id: 'L19', name: '代車19', model: 'スイフト',   plate: '○○ 0019', shakenDate: '2027-04-29', tenkenDate: '2026-11-13' },
    { id: 'L20', name: '代車20', model: 'アクア',     plate: '○○ 0020', shakenDate: '2026-09-26', tenkenDate: '2027-01-08' },
  ],

  // 社用車（積載車・営業車など）＝代車・自社車両管理ページで管理
  companyCars: [
    { id: 'C01', name: '積載車',   model: 'キャンター', plate: '○○ 1001', shakenDate: '2026-08-20', tenkenDate: '2026-12-15' },
    { id: 'C02', name: '社用バン', model: 'ハイエース', plate: '○○ 1002', shakenDate: '2026-10-11', tenkenDate: '2027-02-01' },
    { id: 'C03', name: '軽トラ',   model: 'キャリイ',   plate: '○○ 1003', shakenDate: '2027-02-27', tenkenDate: '2026-09-09' },
    { id: 'C04', name: '営業車',   model: 'アクア',     plate: '○○ 1004', shakenDate: '2026-07-19', tenkenDate: '2027-01-13' },
  ],

  cards: [],
  loanerAssigns: [],
  fleetEvents: [],   // 車両イベント（車検入庫・リースアップ/切替・その他）＝車両管理で登録・代車ビューに重ねて表示
  customers: [],   // 顧客控え（車両ごと・入力補助／整備ソフトが正式台帳）

  todayDuty: {
    safe:    '林',
    sns:     '椎名',
    cleaning:'蓮沼',
  },

  // スタッフ一覧（select用）。division＝課（div1/div2、受付など全社は空）。
  //   front＝フロント業務あり（フロント担当に出る）／reception＝受付（予約担当に出る）。
  //   ※メカニックのみ（front:false, reception:false）は担当セレクトに出ない。将来は設定/CoreFlowで編集。
  staff: [
    // 1課（国産）
    { id: 'shacho', name: '社長', divisions:['div1'], division:'div1', front: true,  reception: false, mech: false },
    { id: 'senmu',  name: '専務', divisions:['div1'], division:'div1', front: true,  reception: false, mech: false },
    { id: 'shiina', name: '椎名', divisions:['div1'], division:'div1', front: true,  reception: false, mech: true  },
    { id: 'yamada', name: '山田', divisions:['div1'], division:'div1', front: false, reception: false, mech: true  }, // ※メカだけ
    // 2課（輸入）
    { id: 'chief',   name: 'チーフ', divisions:['div2'], division:'div2', front: true,  reception: false, mech: true  },
    { id: 'hasunuma',name: '蓮沼',   divisions:['div2','recept'], division:'div2', front: true,  reception: true,  mech: false }, // 2課＋受付
    { id: 'hakozaki',name: '箱崎',   divisions:['div2'], division:'div2', front: true,  reception: false, mech: true  },
    { id: 'sugaya',  name: '菅谷',   divisions:['div2'], division:'div2', front: true,  reception: false, mech: true  },
    { id: 'yamane',  name: '山根',   divisions:['div2'], division:'div2', front: false, reception: false, mech: true  }, // ※メカだけ
    // 受付（課なし・全社）
    { id: 'hayashi', name: '林',   divisions:['recept'], division:'recept', front: false, reception: true, mech: false },
    { id: 'onishi',  name: '大西', divisions:['recept'], division:'recept', front: false, reception: true, mech: false },
  ],

  divisions: [
    { id: 'div1', label: '1課', color: '#1db97a' },   // 国産＝緑
    { id: 'div2', label: '2課', color: '#ec4899' },   // 輸入＝ピンク
  ],

  paymentMethods: [
    { id: 'cash',     label: '現金' },
    { id: 'card',     label: 'カード' },
    { id: 'transfer', label: '振込' },
    { id: 'collect',  label: '集金' },
    { id: 'finance',  label: 'ローン' },
    { id: 'later',    label: '後払い' },
  ],

  loanerConditions: [
    { id: 'etc',    label: 'ETC' },
    { id: 'navi',   label: 'ナビ' },
    { id: 'iso',    label: 'ISO' },
    { id: 'camera', label: 'Bカメ' },
    { id: 'height', label: '高さ' },
    { id: 'width',  label: '幅' },
    { id: 'length', label: '長さ' },
  ],

  settings: {
    /* 🔴 v1.50.0 営業日・営業時間の本当の持ち主は **MHSの定休日カレンダー**（js/cal-pit.js の PitCal）。
       下の3つは **PitCal が最後に届いた値を写しているだけの予備値** で、設定画面からは直せない。
       🔴 新しいコードはここを見ないこと。営業日は必ず PitCal.isClosed(日付) を通す。
          （ここを見ると「毎週の定休」しか分からず、臨時休業・お盆・特別営業が抜ける） */
    closedDow:   [3],  // 予備値：毎週の定休曜日（MHS未着の時だけ効く。既定＝水曜・日曜は営業）
    spotClosed:  [],
    spotHoliday: [],
    cutoffTime:  '17:00',   // 予備値：営業終了（MHS bizEnd を写す）
    openTime:    '09:00',   // 予備値：営業開始（MHS bizStart を写す）
    // 置き場の内訳（ピット内・自社敷地・駐車場・緊急+α＝最悪使える分）※数字は仮割り・実数はゆうたが設定画面で入れる
    lotCap: { pit: 4, yard: 12, parking: 8, extra: 4 },
    lotCapacity: 28,      // 同時に預かれる台数＝lotCapの合計（自動計算・各画面はこれを読む）
    // 🅿️ 駐車場オーバーの色分け（v0.25.2 ゆうた指定）＝ちょい超過は緊急+α・コインパで吸収できる「普通」
    //    空き0以上＝緑／超過1〜warn台＝オレンジ／warn超〜danger未満＝濃いオレンジ／danger台以上＝赤
    lotOver: { warn: 5, danger: 10 },
    /* 🔴🔴 v1.173.0（ゆうた指定）データチェックの**起点日**。
       「この日より前に入庫した車は、日付の前後（返車予定・実績が入庫より前）を言わない」。
       ＝ 本番を始めた時に**8月頭からのぶんを中旬にまとめて入れた**ので、そのぶんは打ち間違いではない。
       ⚠ 効くのは日付の前後を見る規則だけ（金額の抜けなどは、これより前でも直す）。
       ⚠ 空にすると「ぜんぶ見る」。データチェックの画面から管理者が変えられる。 */
    inspectFrom: '2026-08-16',
    holdDaysDefault: 3,   // 最短入庫の計算で使う「預かり想定日数」
    longHoldDays: 7,      // 整備ダッシュボードの「預かりが長い」アラートしきい値（入庫からの日数）
    reserveCap: { default: 5, import: 3 },   // 1日の予約上限（default＝国産 / import＝輸入・人が別なのでチーム別）
    // 概算預かり日数の既定（作業タイプ別・入庫予約時の初期値。_default＝表にないタイプ用）
    // 概算預かり日数の既定（team別＝default:国産 / import:輸入。作業タイプ別・_default＝表にないタイプ用）
    estHold: { default:{ shaken:5, general:6, bp:12, oil:0, '12pt':0, coat1y:3, coat3m:2, _default:5 },
               import:{ shaken:5, general:6, bp:12, oil:0, '12pt':0, coat1y:3, coat3m:2, _default:5 } },
    // 💴 概算金額の既定（作業タイプ別・円・税抜）。カードの「概算金額」の初期値＝台単価
    // 初期値＝令和8年1〜6月の実売上6か月(全999伝票)から算出した「税抜・法定費用除く・中央値」。国産/輸入別。
    //   板金は保険案件で幅が大きく参考値（輸入はGクラス550万の異常値を除外して算出・サンプル少）。設定画面で調整可。
    //   詳細＝D:\アプリ開発\PitFlow\台単価分析_国産輸入_2026上期.xlsx（2026-07-05）
    // 概算金額の既定（team別＝default:国産 / import:輸入・円）
    estAmount: { default:{ shaken:70100, '12pt':21200, general:26800, oil:8900, bp:400000, coat1y:35000, coat3m:20000, _default:40000 },
                 import:{ shaken:140800, '12pt':43200, general:62000, oil:19200, bp:760800, coat1y:45000, coat3m:26000, _default:80000 } },
    // 🔍 点検料（作業タイプ別・円・税抜）＝メカニック実績の配分で「点検者ぶん」として先に抜く額。
    //   車検1.5万／12点・一般1万／オイル・板金・コーティングは純作業で0。確定売上が点検料未満なら点検/作業50:50。
    //   詳細＝mech-summary.js の配分エンジン。設定画面から調整できる（未設定はここの初期値）。
    inspectFee: { shaken:15000, '12pt':10000, general:10000, oil:0, bp:0, coat1y:0, coat3m:0, _default:0 },
    // 売上目標（円/月）＝最低目標〜最高目標(天井)。クォーター換算は÷4（売上表Excel 4年分の実績から）
    target: { monthMin: 15000000, monthMax: 20000000 },
    // 平均単価の初期値（円・チーム別）。実績が貯まれば pitUnitPrice() が直近3ヶ月平均に自動切替
    unitPrice: { default: 83000, import: 130000 },
    // 🧩 ルール（ノーコード積み上げ式・rules.js）。rules=ルール配列／ruleDict=言葉→％の辞書
    rules: [],
    ruleDict: { increase: 20, decrease: -20, careful: -15, minimize: -50, allow: 15 },
    // 🏖 長期休み（お盆・年末年始・GW等）。期間中は入庫受付を自動0（預かり継続は可）。
    // 🔴 v1.50.0 ここは **もう使っていない**。長期休みは MHS の定休日カレンダーで「期間」で入れたものを
    //    PitCal.breaks() が読む。古いデータが残っていても見ないので消していない（消すと過去の設定が飛ぶ）。
    longBreaks: [],   // [{ label:'お盆', from:'2026-08-11', to:'2026-08-16' }, ...]（未使用）
    // 🚙 代車リミットの色閾値（残り日数）。緑=greenMin日以上／黄=amberMin日以上／赤=それ未満／黒=超過
    loanerColors: { greenMin: 4, amberMin: 2 },
    // 🏭 外注の提携先リスト（設定画面で増減）。カードを外注フェーズに移すとここから選ぶ
    outsourcePartners: ['畑中板金', '藤島板金', 'カーメイク', 'ブレス', 'タイヤマン', 'カーフラッシュ', '野村自動車', '各ディーラー', 'その他'],
    // 🗣 肌感ルール（言葉のまま積む・AI判定の判断基準になる層／v0.23.0）
    // 計算式にできない現場の知恵を文章で登録。本番化後はClaude APIがこれを読んで日別の○△×を判定する
    fuzzyRules: [],   // [{ on:true, text:'高額な作業が3台以上重なる週はメカがしんどいので控えめに' }, ...]
  },

  // 🤖 AI判定の結果置き場（v0.23.0＝器のみ。本番化後にClaude APIが1日1回ここを更新する）
  // { '2026-06-05': { default:{mark:'△',reason:'...'}, import:{...}, by:'ai', at:171… }, ... }
  // 空のうちは計算式の仮判定（pitVerdict）がそのまま使われる
  aiVerdicts: {},

  // 🩺 データチェックの札（v1.168.0／v1.172.0 で作り直し）
  //   inspectMarks … { '規則ID:対象ID': { v:'seen'|'fixed', at:'YYYY-MM-DD', by:'名前' } }
  //     ⚠ もう出なくなった所見の札は、チェックのたびに自動で捨てる（たまり続けないように）
  //     🔴 v1.172.0 **札を貼っても一覧からは消えない**（数をごまかさないため）。
  //        古い 'spec'（これでOK）は、走らせた時に自動で外れる（inspect-rules.js の sweepEscapes）
  //   inspectMutes … 🔴 v1.172.0 **廃止**（規則まるごと黙らせる道）。
  //        入れ物だけ残してあるのは、古い端末から来た印をここで受けて**外す**ため。必ず空になる
  //   🔴 どちらも**全員で共有する**もの（設定と同じ場所に保存＝db-pit.js の _SETTINGS_KEYS）。
  //      片づけたかどうかが端末ごとに違うと、同じ車を2人が別々に追いかけることになる。
  inspectMarks: {},
  inspectMutes: {},

  /* 🔧🔧 作業タイプ＝**ここが唯一の正**（2026-08-24・ゆうた指定）
     -----------------------------------------------------------------
     🔴 **設定画面からは足せない・消せない・名前も色も変えられない。**
        （2026-06-05 の7種を、設定から増減できるようにしていたのをやめた）
     ◎なぜやめたか（ゆうた「細かい挙動とかを入れたいから、設定から入れるのはもう無くしてほしい」）
        作業タイプの id は、アプリのあちこちで**名指し**されている。
        　例）shaken ＝ 諸費用が必須・車検予定に載る・MHS で車検を押せる
        　　　coat1y / coat3m ＝ 洗車の段取り・コーティングの扱い
        　　　12pt / general / oil / bp ＝ データチェックの見張り・売上の数え方
        設定から足せる型は**名前と色しか持てない**ので、この挙動が1つも付いてこない。
        ＝「データチェックにも車検予定にも乗らない、見た目だけの型」が現場で使われてしまう。
        だから **足すときはここに書く**（＝そのとき挙動も一緒に書く）。
     ⚠ id は一度決めたら**変えない**。過去のカードは id の文字で持っている。
     ⚠ 名前・色・併用可を変えるのも**ここだけ**。次に開いた端末から順に揃う。
     ⚠ クラウドに古い型（ここに無い id）が残っていても消さない。
        db-pit.js の _applyWorkTypes() が末尾に legacy:true を付けて残す
        （その型で入っている過去カードのバッジを消さないため）。
     ⚠ MHS は pitSettings/main の作業タイプ（名前・色・概算金額）を読んでいる。
        ここを直したものが settings.workTypes として保存され続ける（_applyWorkTypes()）。 */
  workTypes: [
    { id: 'shaken',  label: '車検',           color: '#ef4444' },
    { id: '12pt',    label: '12点',           color: '#f97316' },
    { id: 'general', label: '一般',           color: '#84cc16' },
    { id: 'oil',     label: 'オイル',         color: '#eab308' },
    { id: 'bp',      label: 'B.P',            color: '#3b82f6', combinable: true },
    { id: 'coat1y',  label: '1Y', color: '#8b5cf6', combinable: true },
    { id: 'coat3m',  label: '3M', color: '#a855f7', combinable: true },
    /* 🚗 v2.6.0（ゆうた指定）＝納車前のルームクリーニング等。1Y/3M と同じ**併用可**。
       ◎これが付いた車は 車販作業ビューの「コーティング・その他依頼／予定」に拾い上げられる
         （car-sales.js の `_csHasCoat`）。**実際に何をやるかは「依頼事項」に直接書く**
         （例：ルームクリーニング）＝作業タイプを細かく増やさないため、ここは拾う合図だけ。
       🔴 v2.7.1（ゆうた指摘）名前を「車販」→「**車販依頼**」に変えた。
          「車販」だけだと**部門名**に読めて、社内区分の「中古（自社の販売車両）」と
          取りちがえられる。この印の意味は「**車販部門に、コーティング以外の作業を依頼する**」。
          ⚠ **id（carsale）は変えない。** 変えると過去のカードと車販作業ビューの拾い上げが切れる。 */
    { id: 'carsale', label: '車販依頼', color: '#06b6d4', combinable: true },
  ],

  dropTypes: [
    { id: 'wait',    label: '待', desc: 'お客様待ち' },
    { id: 'sameDay', label: '当', desc: '当日返車' },
    { id: 'drop',    label: '預', desc: '預かり' },
  ],

  repeatTypes: [
    { id: 'first',   label: '初回' },
    { id: 'repeater',label: 'リピーター' },
  ],
};

/* 🔧 作業タイプのマスター（上の state.workTypes の写し・v2.5.0）
   ・db-pit.js が「クラウドの保存」より**こちらを優先**して並べ直すための元。
   ・state.workTypes は画面から触られる可能性があるので、**触られない写し**をここに持つ。
   ・足す・変えるのは上の state.workTypes 側。ここは自動で写るだけ（手で書き足さない）。 */
window.PIT_WORK_TYPES = window.state.workTypes.map(function (w) {
  var o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; }); return o;
});

/* 🔴🔴🔴 この一覧の「版」。**上の作業タイプを1文字でも変えたら、必ずここも上げること。**
   -----------------------------------------------------------------------------
   ◎なぜ要るか（2026-08-25・本番が止まった）
     `db-pit.js` は「作業タイプはコードが正」としてクラウドへ書き戻す。
     ところが**版のちがう端末が2台開くと、お互いに書き戻し合って永久に止まらない**。
     （v2.7.1 で「車販→車販依頼」に変えた直後、2.7.0 の端末と 8秒で95往復した）
   ◎これが効かせること
     クラウドの `settings.workTypesVer` にこの版を残す。
     **自分の版が印より古かったら、書き戻さない**＝新しい端末の言うことを聞く。
   ⚠ アプリの版（index.html の meta）ではダメ。**index.html だけ古いまま残る端末**が実在する
     （本番で meta=2.8.0・js=2.8.1 を見た）。一覧そのものに版を持たせること。
   ⚠ 上げ忘れると、名前を変えたのにクラウドへ行き渡らない（＝MHS の当日ビューが古い名前のまま）。
     見張り＝`test_worktype_pingpong.mjs`。 */
window.PIT_WORK_TYPES_VER = '2.8.2';

/* 作業タイプ「特殊」＝保証／保険（v0.116.0）。
   ・単体では選べず、作業タイプ（基本 or 併用可）が1つ以上ある時だけ付けられる。
   ・保持は c.workSpecials[]（基本/併用可の c.workTypes とは別枠＝予約カード自体には出さない）。
   ・表示は予約詳細・ホバー詳細・印刷表紙のみ。画面はグレー、印刷は黒字・黒枠（アウトライン）。 */
window.PIT_WORK_SPECIALS = [
  { id: 'warranty',  label: '保証' },
  { id: 'insurance', label: '保険' },
  /* 👤 v2.6.0（ゆうた指定）社員＝社員販売・社員整備。値引きや原価で社割が効くので、
     金額の「肌感」チェック（M04/M06/M07）から外すためだけの印。
     🔴 売上・実績・完TEL は**通常どおり**。売上なしにはしない。 */
  { id: 'employee', label: '社員' },
];
window.pitSpecialLabel = function (id) {
  var m = (window.PIT_WORK_SPECIALS || []).find(function (x) { return x.id === id; });
  return m ? m.label : '';
};

/* 概算預かり日数の既定（入庫予約時の初期値・後で手で調整できる）
   ※ 表は state.settings.estHold ＝ 設定画面から変更できる（v0.14.0〜） */
function pitEstHold(workType, dropType, team){
  if (dropType === 'wait' || dropType === 'sameDay') return 0;   // 待ち・当日仕上げ＝置き場を使わない
  const map = _estTeamMap(state.settings && state.settings.estHold, team);
  if (map[workType] != null) return map[workType];
  return (map._default != null) ? map._default : 5;
}
window.pitEstHold = pitEstHold;

/* ===================================================================
   🧾 消費税（v1.65.1・ゆうた指定）＝**入力欄の下に出す「税込」の確認表示だけ**に使う
   -------------------------------------------------------------------
   🔴 **PitFlow が持つ金額はすべて税抜**（2026-07-05 ゆうた決定・恒久ルール）。
      保存する値も、集計する値も、いっさい変えない。ここで作るのは**目で確かめるための表示**だけ。
   ◎なぜ要るか（ゆうた指定）
      「自分が入れるべきが税抜だと分かり、また金額があっているか確認できるように」
      ＝整備ソフトの伝票は税込で出るので、税抜で打ったつもりが税込を打っていた、を防ぐ。
   ⚠ 税率が変わるときは**ここだけ**直す。各ポップアップに 1.1 を書き写さないこと。
   =================================================================== */
window.PIT_TAX_RATE = 0.10;

/* 税抜 → 税込（円未満切り捨て）。数字にならないものは null を返す（＝表示しない） */
function pitTaxIn(v){
  var n = (typeof v === 'string') ? Number(String(v).replace(/[^\d]/g, '')) : Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return Math.floor(n * (1 + (window.PIT_TAX_RATE || 0)));
}
window.pitTaxIn = pitTaxIn;

/* 入力欄の下に出す一行。空や0のときは案内だけ出す（「税抜で入れる」と分かるように）。
   🔴 文言もここ1本。ポップアップごとに書き分けない。 */
function pitTaxHint(v){
  var t = pitTaxIn(v);
  if (t == null) return '<span class="pt-tax-l">税抜で入力</span>';
  return '<span class="pt-tax-l">税抜で入力</span><span class="pt-tax-v">税込 ¥' + t.toLocaleString() + '</span>';
}
window.pitTaxHint = pitTaxHint;

/* 入力欄と表示欄をつなぐ。打つたびに書き替わる（ライブ）。
   el＝input／hint＝表示する入れ物。どちらか無ければ何もしない。 */
function pitTaxHintSync(el, hint){
  if (!el || !hint) return;
  hint.innerHTML = pitTaxHint(el.value);
}
window.pitTaxHintSync = pitTaxHintSync;

/* ===================================================================
   📐 評価用の基準値（`PIT_BASE_AMOUNT`）＝「受注の質」で比べる相手  v1.64.0
   -------------------------------------------------------------------
   🔴 **概算金額（`estAmount`）とは仕事が違う。同じ数字を兼用しない。**

   | | 何のための数字か | どっちを使うか |
   |---|---|---|
   | `estAmount`（設定・中央値） | **新規予約の概算**。控えめに見積もるのが仕事 | 予約カードの概算金額 |
   | `PIT_BASE_AMOUNT`（ここ・平均値） | **評価の物差し**。真ん中を当てるのが仕事 | 売上▸フロント「受注の質」 |

   ◎なぜ分けたか（2026-08-07 ゆうたと確認）
     `estAmount` は **中央値**（平均は高額修理で上振れするため・2026-07-05 決定）。
     中央値を評価の物差しにすると、分布が右に裾を引いているぶん **全員がプラスに出て**
     「誰が上か」が読めない。評価には **平均** が要る
     （平均を基準にすると、会社全体の差の合計がぴったりゼロ＝純粋な配分になる）。

   ◎中身＝令和8年1〜6月の実売上999伝票（実車整備943台）の**税抜・法定費用除外・平均・100円丸め**。
     出どころ＝`D:\Claude\アプリ開発\PitFlow\台単価分析_国産輸入_2026上期.xlsx`（②のシート「税抜 平均」列）。
     ⚠ 板金の輸入はGクラス554万・X3 290万などの保険大型を除外した後の値（元データの注記どおり）。
     ⚠ コーティング（1Y/3M）は当時データが無い。ここに書かず、`estAmount` に落ちる（下の `pitBaseAmount`）。

   ◎⏭ **これは暫定。半年ほど本番で回したら、実績から自動計算に切り替える**（ゆうた指定 2026-08-07）。
     設計の下書き（まだ決めていない・半年後に詰める）：
       ・集計の窓＝直近6ヶ月。貯まっていないうちは、あるぶん全部を見る（切替日を人が管理しないで済む）
       ・作業タイプ × 国産/輸入 のマスごとに **平均と中央値の両方**を出す
         → 平均＝評価の物差し（ここの代わり）／中央値＝新規予約の概算（`estAmount` の代わり）
       ・立ち上がりは台数が足りず平均が跳ねる（200万が1台入ると20台のマスで平均が2倍）。
         対策の候補＝①いまの設定値を「◯台ぶんの票」として混ぜて **にじり寄らせる**（ガクッと変わる日が来ない）
                     ②外れ値の扱い＝**消さずに内訳で切り出して見せる**（実態は削らない）
       ・材料は「返車まで終わって確定額が入った台」。金額は完TELで人が打っているので自己参照は起きない
   =================================================================== */
window.PIT_BASE_AMOUNT = {
  /* 国産（1課）＝ 車検94,546 / 一般85,005 / 12点26,723 / オイル9,804 / 板金442,338 の100円丸め */
  default: { shaken: 94500, general: 85000, '12pt': 26700, oil: 9800, bp: 442300 },
  /* 輸入（2課）＝ 車検170,411 / 一般94,846 / 12点113,251 / オイル16,752 / 板金1,150,181 の100円丸め */
  import:  { shaken: 170400, general: 94800, '12pt': 113300, oil: 16800, bp: 1150200 }
};

/* 評価用の基準値を引く。ここに無い作業タイプ（コーティング等）は概算金額に落ちる。
   🔴 「受注の質」はこの1本だけを呼ぶ。ここ以外で基準値を組み立てないこと。 */
function pitBaseAmount(workType, team){
  var t = (team === 'import') ? 'import' : 'default';
  var m = (window.PIT_BASE_AMOUNT && window.PIT_BASE_AMOUNT[t]) || {};
  if (m[workType] != null) return m[workType];
  return pitEstAmount(workType, team);           // 材料が無いものは概算（中央値）で代用
}
window.pitBaseAmount = pitBaseAmount;

/* 概算金額の初期値（作業タイプ別・円）＝カードの「概算金額」に自動で入る。後で手で直せる */
function pitEstAmount(workType, team){
  const map = _estTeamMap(state.settings && state.settings.estAmount, team);
  if (map[workType] != null) return map[workType];
  return (map._default != null) ? map._default : 100000;
}
window.pitEstAmount = pitEstAmount;

/* team別ネスト（default:国産 / import:輸入）を読む。旧フラット（数値直下）にも互換。 */
function _estTeamMap(root, team){
  if (!root || typeof root !== 'object') return {};
  const t = (team === 'import') ? 'import' : 'default';
  if (root.default && typeof root.default === 'object') return root[t] || root.default || {};
  return root;   // 旧フラット＝両teamで同じ
}
/* カード→team（国産=default / 輸入=import） */
function pitTeamKey(c){ return (c && c.boardId === 'import') ? 'import' : 'default'; }
window.pitTeamKey = pitTeamKey;

/* estHold/estAmount を team別ネストに正規化（旧フラット保存の移行・import欠けの補完） */
function pitNormalizeEst(){
  const s = state.settings; if (!s) return;
  ['estHold','estAmount'].forEach(function(key){
    let root = s[key];
    if (!root || typeof root !== 'object'){ s[key] = { default:{}, import:{} }; return; }
    if (root.default && typeof root.default === 'object'){
      if (!root.import || typeof root.import !== 'object') root.import = Object.assign({}, root.default);
      return;
    }
    s[key] = { default: Object.assign({}, root), import: Object.assign({}, root) };   // 旧フラット→両teamへ
  });
}
window.pitNormalizeEst = pitNormalizeEst;

/* ===== 🔧 作業チェック（整備の実施項目）＝**全画面でこの1本** =====
   PitFlow v1.100.0（2026-08-15・ゆうた指定で中身を丸ごと入れ替え）

   🗣 ゆうた「タスクボード上の予約詳細から整備の部分で作業チェックの欄、
              これを既存のものから入れ替えて（下の7つ）」

   ◎前まで（やめた形）
     ・カード詳細の整備タブ＝**作業タイプで中身が変わる**（車検は6項目・それ以外は4項目）
       ＝受付・問診／24ヶ月点検／下回り点検／整備・調整／検査ライン／完成検査・洗車 …「工程」の言い換えだった
     ・予約を編集の画面＝**別の項目・別の保存の形**（`c.maint[番号]`）で、同じ車なのに2つの表が出ていた
     🔴 **同じ `c.maint` を、2つの画面が違う意味で読み書きしていた。** どちらかを直すともう片方が嘘になる。

   ◎これから
     🔴 **項目はこの表1本。作業タイプで変えない。** 追加・並べ替えはここだけ直せば全画面に効く。
     🔴 **保存は「番号」ではなく「合言葉（key）」**＝`c.maint.checks['oil']`。
        番号だと、項目を1つ足しただけで**過去のカードのチェックが全部ずれる**（別の作業をやったことになる）。
     ⚠ **昔の番号のチェックは読まない**（前の項目とは中身が別物なので、引き継ぐと嘘になる）。
        データは消していないので、必要なら後から見られる。 */
var PIT_MAINT_CHECKS = [
  { key: 'oil',      label: 'オイル入れ' },
  { key: 'rotation', label: 'タイヤローテーション' },
  { key: 'air',      label: 'タイヤエア調整' },
  { key: 'llc',      label: 'LLC・ウォッシャー補充' },
  { key: 'retorque', label: 'タイヤ増締め' },
  { key: 'light',    label: 'ライト回りチェック' },
  { key: 'sideslip', label: 'サイドスリップ調整' }
];
window.PIT_MAINT_CHECKS = PIT_MAINT_CHECKS;

/* その項目が済んでいるか（読み） */
function pitMaintChecked(c, key){
  return !!(c && c.maint && c.maint.checks && c.maint.checks[key]);
}
/* 済み／未済を入れ替える（書き）。**ここ以外で c.maint.checks を書かないこと。** */
function pitMaintToggle(c, key){
  if (!c) return false;
  if (!c.maint) c.maint = {};
  if (!c.maint.checks) c.maint.checks = {};
  c.maint.checks[key] = !c.maint.checks[key];
  return !!c.maint.checks[key];
}
/* 済んだ数（「◯ / 7 完了」の左側） */
function pitMaintDoneCount(c){
  var n = 0;
  PIT_MAINT_CHECKS.forEach(function(it){ if (pitMaintChecked(c, it.key)) n++; });
  return n;
}
window.pitMaintChecked   = pitMaintChecked;
window.pitMaintToggle    = pitMaintToggle;
window.pitMaintDoneCount = pitMaintDoneCount;

/* チーム別の平均単価（円）＝直近3ヶ月（92日）の返車完了カードに確定金額(amountFinal)が
   10台以上あれば実績平均を自動計算。足りないうちは設定の初期単価を使う */
function pitUnitPrice(team){
  const s = state.settings || {};
  const init = (s.unitPrice && s.unitPrice[team] != null) ? s.unitPrice[team] : 100000;
  try {
    const d = new Date(); d.setDate(d.getDate() - 92);
    const since = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const done = (state.cards || []).filter(function(c){
      /* 🔴 v1.99.0 売上なしでアーカイブした車は平均単価の材料にしない（金額が残っていても実績ではない） */
      if (window.pitCardNoSale && pitCardNoSale(c)) return false;
      return c.boardId === team && c.status === 'returned' && c.returnDate && c.returnDate >= since && c.amountFinal > 0;
    });
    if (done.length >= 10){
      const sum = done.reduce(function(a, c){ return a + c.amountFinal; }, 0);
      return Math.round(sum / done.length);
    }
  } catch (e) {}
  return init;
}
window.pitUnitPrice = pitUnitPrice;

/* 🔢 予約番号（ローマ字1＋5桁数字・例 K48201）＝人が見て口に出す通し番号（v0.64.0）。
   ・中の id（背番号・絶対ダブらない鍵）とは別物。resNo は「現場で呼ぶ・控えに載せる・検索する」用。
   ・乱数で作るが、保存前に必ず重複チェック＝ダブらない。文字22×数字10万＝約220万通り。
   ・並び順（時系列）は id（作成時刻）で持つので、見た目がランダムでも順番は失われない。 */
function _pitResNoExists(no){
  return (state.cards || []).some(function(c){ return c.resNo === no; });
}
function pitGenResNo(){
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';   // 紛らわしい I/O/Q は除外（読み間違い防止）
  for (let i = 0; i < 9999; i++){
    const no = L[Math.floor(Math.random() * L.length)] + String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    if (!_pitResNoExists(no)) return no;
  }
  return 'Z' + Date.now().toString().slice(-6);   // 万一埋まり切った時の保険
}
window.pitGenResNo = pitGenResNo;


/* 🔴 v1.31.0（ゆうた指定）**紙に印刷する担当の名前**（表紙印刷のフロント担当・予約担当）。
   基本は**苗字だけ**。CoreMembers に入っているものがあればそちらを優先する。
     ① 呼び名＝優先表示名（CoreMembers の dispName。例「チーフ」「山田（太）」）
     ② 姓（CoreMembers の lastName）
     ③ どちらも無ければ、カードに入っている名前の**先頭のかたまり**（＝苗字。法人はフル）
   ⚠ 名簿に居ない人（退職者・整備ソフト由来）でも ③ で必ず何か出す＝空欄にしない。
   ⚠ 自社「小林モータース」は姓を持たないので ③ を通り、法人としてそのまま出る。
   ⚠ 画面側の表示は今までどおり（ここは印刷専用）。 */
function pitStaffPrintName(name){
  /* 🔴 v1.127.0 中身は pit-share.js の `pitStaffCall`（通称＆苗字）1本にした。
     ⚠ 紙と画面で名前が食い違わないように、**ここに条件を書き戻さないこと**。
     ⚠ 自社「小林モータース」だけは、紙では**フルのまま**にしたいので pitStaffCall を通さない
        （画面の狭い枠は「コバモ」でよいが、紙はフル＝2026-08-16 の決めごと）。 */
  var n = String(name == null ? '' : name).trim();
  if (!n) return '';
  /* 🔴 v1.163.0 自社と分かったら**書き方を1つに寄せる**（pit-share.js の PIT_SELF_NAME）。
     ⚠ 直す前は `pitSurname(n)` を通していたので、「小林モータース株式会社」で入っている行だけ
        **「小林モータース㈱」**と刷られ、同じ会社なのに紙の上で食い違っていた。 */
  if (window.pitIsSelfName && pitIsSelfName(n)) return (window.PIT_SELF_NAME || pitSurname(n));
  return window.pitStaffCall ? pitStaffCall(n) : pitSurname(n);
}
window.pitStaffPrintName = pitStaffPrintName;

/* 🔴 v1.34.0 **「何時の枠に入れるか」を決める共通の物差し。**
   時間帯で区切って並べる画面（予約・返車の日ビュー／週ビュー）は必ずこれを通すこと。
   ・戻り値＝'09' のような2桁の「時」。**枠に入れられない時は null**（＝「時刻未定」の枠へ）。
   🔴 v1.70.0（ゆうた確定）**枠も並びと同じ「いちばん遅くなり得る時刻」で決める。**
      ＝朝一→09／**AM→12**／お昼→13／夕方→18（19時は端に寄る）／**PM→18**。
      ⚠ v1.69.0 までは「いちばん若い時刻」だったので **AM は9時の枠**に出ていた。
        枠と並びの物差しが違うと、枠の中では正しいのに枠をまたぐと逆転する。
   ・範囲（09:00-10:00）は**後ろの時**（＝10時の枠）。
   ・lo / hi（枠の最初と最後の時）を渡すと、**その外の時刻は端の枠へ寄せる**。
     🔴 これが無いと 08:00 や 19:00 の予約が**どの枠にも入らず画面から消えていた**（v1.33.0 以前からの穴）。
   ⚠ 決まり次第・レッカー・鍵ポスト・未定・空 は null＝「時刻未定」の枠にまとめる。**消さない。** */
function pitTimeHour(v, lo, hi){
  var m = pitTimeMin(v);
  if (!(m >= 0) || m >= 1440) return null;          // 時刻不明・空・読めない
  var h = Math.floor(m / 60);
  if (lo != null && h < lo) h = lo;
  if (hi != null && h > hi) h = hi;
  return String(h).padStart(2, '0');
}
window.pitTimeHour = pitTimeHour;

/* v0.85.0 受付タイプの表示ラベル。2つ選んだ時は「待or預」のように連結（作業次第でどちらにもなる用）。
   主＝c.dropType、副＝c.dropType2。色や占有判定など既存ロジックは従来どおり主(dropType)を見る。 */
function pitDropLabel(c){
  if (!c) return '';
  var lab = function (id){ var o = (state.dropTypes || []).find(function (d){ return d.id === id; }); return o ? o.label : ''; };
  var a = lab(c.dropType), b = lab(c.dropType2);
  return (a && b) ? (a + 'or' + b) : (a || b || '');
}
window.pitDropLabel = pitDropLabel;

/* v0.86.0 受付タイプを2つ選んだ時の「実効タイプ」＝重い方を採用（預かり > 当返 > 待ち）。
   駐車場の占有判定で使う：預かりが入れば預かり予定／当返が入れば当日は駐車場を使う。 */
function pitDropEffective(c){
  var ids = [c && c.dropType, c && c.dropType2].filter(Boolean);
  if (ids.indexOf('drop') >= 0) return 'drop';        // 預かり＝最重（複数日の占有）
  if (ids.indexOf('sameDay') >= 0) return 'sameDay';  // 当返＝その日だけ駐車場を使う
  return ids[0] || null;                               // 待ち＝最軽
}
window.pitDropEffective = pitDropEffective;

/* v0.87.0 受付タイプのバッジ群HTML。2つ選んだ時は「[待]or[当]」のように、各タイプを“その場所の既存バッジ”で2個並べる。
   makeBadge(dropTypeObj) ＝ 各表示箇所が自分のバッジHTMLを返す関数（色やクラスは呼び出し側の従来どおり）。 */
function pitDropBadges(c, makeBadge){
  if (!c) return '';
  var find = function (id){ return (state.dropTypes || []).find(function (d){ return d.id === id; }); };
  var a = find(c.dropType), b = c.dropType2 ? find(c.dropType2) : null;
  // v0.87.2 2つ選択時は「待預」のように小さいバッジ2個を隙間少なく並べる（.dbpairで詰める＝固定枠でも崩れない・「or」は出さない）
  if (a && b) return '<span class="dbpair">' + makeBadge(a) + makeBadge(b) + '</span>';
  return a ? makeBadge(a) : (b ? makeBadge(b) : '');
}
window.pitDropBadges = pitDropBadges;

/* 起動時：予約番号が無い既存カードに後から採番（入庫日→id順で安定）。1回で全カードに付く。 */
function pitBackfillResNo(){
  const cards = state.cards || [];
  const need = cards.filter(function(c){ return !c.resNo; });
  if (!need.length) return false;
  need.sort(function(a, b){
    const ka = (a.reserveDate || '') + '|' + (a.id || '');
    const kb = (b.reserveDate || '') + '|' + (b.id || '');
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });
  need.forEach(function(c){ c.resNo = pitGenResNo(); });
  return true;
}
window.pitBackfillResNo = pitBackfillResNo;

/* 設定の初期値スナップショット（設定画面の「初期値に戻す」用） */
window.PIT_DEFAULT_SETTINGS = JSON.parse(JSON.stringify(state.settings));
