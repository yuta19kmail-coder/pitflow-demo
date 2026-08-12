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

  // 作業タイプ（2026-06-05 ゆうた確定の7種。設定画面で増減可能＝settings.workTypes に保存され、ここを上書きする）
  workTypes: [
    { id: 'shaken',  label: '車検',           color: '#ef4444' },
    { id: '12pt',    label: '12点',           color: '#f97316' },
    { id: 'general', label: '一般',           color: '#84cc16' },
    { id: 'oil',     label: 'オイル',         color: '#eab308' },
    { id: 'bp',      label: 'B.P',            color: '#3b82f6', combinable: true },
    { id: 'coat1y',  label: '1Y', color: '#8b5cf6', combinable: true },
    { id: 'coat3m',  label: '3M', color: '#a855f7', combinable: true },
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

/* 作業タイプ「特殊」＝保証／保険（v0.116.0）。
   ・単体では選べず、作業タイプ（基本 or 併用可）が1つ以上ある時だけ付けられる。
   ・保持は c.workSpecials[]（基本/併用可の c.workTypes とは別枠＝予約カード自体には出さない）。
   ・表示は予約詳細・ホバー詳細・印刷表紙のみ。画面はグレー、印刷は黒字・黒枠（アウトライン）。 */
window.PIT_WORK_SPECIALS = [
  { id: 'warranty',  label: '保証' },
  { id: 'insurance', label: '保険' },
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

/* チーム別の平均単価（円）＝直近3ヶ月（92日）の返車完了カードに確定金額(amountFinal)が
   10台以上あれば実績平均を自動計算。足りないうちは設定の初期単価を使う */
function pitUnitPrice(team){
  const s = state.settings || {};
  const init = (s.unitPrice && s.unitPrice[team] != null) ? s.unitPrice[team] : 100000;
  try {
    const d = new Date(); d.setDate(d.getDate() - 92);
    const since = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const done = (state.cards || []).filter(function(c){
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

/* カード用の短い表示名（省スペース用）。
   ・個人 … フルネーム「姓 名」の先頭トークン＝姓だけ。
   ・法人 … 苗字分割せず会社名をそのまま。ただし長い会社表記をカード用に略記
            （株式会社→㈱／有限会社→㈲／合同会社→(同)。各表記ゆれも寄せる）。例：小林モータース株式会社→小林モータース㈱
   ※略記は「表示の時だけ」＝保存・検索は正式名(c.customer)のまま。予約詳細・ホバー情報はフル表示。 */
function pitSurname(name){
  var s = String(name == null ? '' : name).trim();
  if (!s) return '';
  var t = s
    .replace(/株式会社|（株）|\(株\)/g, '㈱')
    .replace(/有限会社|（有）|\(有\)/g, '㈲')
    .replace(/合同会社|（同）|\(同\)/g, '(同)');
  // 法人マーカー（略記後の㈱/㈲/(同) や 会社/組合/法人）があれば、会社名フル（略記済み）を返す
  if (/[㈱㈲]|\(同\)|会社|組合|法人/.test(t)) return t.replace(/\s+/g, ' ').trim();
  // 個人＝苗字だけ
  return t.split(/\s+/)[0] || t;
}
window.pitSurname = pitSurname;
window.pitCardName = pitSurname;   // 別名（カード表示名の意味で使う用）

/* 🔴 v1.25.0 カードの「お客様名（表示用）」＝画面に出す名前はここを通す。
   ・新規のお客様は**電話だけで漢字が分からない**ことがあるので、その時はカナだけ入れる運用。
   ・漢字（c.customer）が空なら、**カナ（c.kana）をそのままお客様名として表示する**。
   ・保存しているデータは触らない＝あとで漢字が分かったら普通に入れれば、そちらが出るようになる。
   ⚠ 検索・突き合わせ・保存は今までどおり c.customer / c.kana をそのまま見ること（ここは表示専用）。 */
function pitCustName(c){
  if (!c) return '';
  var k = String(c.customer == null ? '' : c.customer).trim();
  if (k) return k;
  return String(c.kana == null ? '' : c.kana).trim();
}
window.pitCustName = pitCustName;

/* 上の「表示用の名前」を、カード用の短い表示（姓だけ／法人は略記）にしたもの。
   これまで各画面が書いていた pitSurname(c.customer) の置き換え。 */
function pitCustSurname(c){ return pitSurname(pitCustName(c)); }
window.pitCustSurname = pitCustSurname;

/* 🔴 v1.31.0（ゆうた指定）**紙に印刷する担当の名前**（表紙印刷のフロント担当・予約担当）。
   基本は**苗字だけ**。CoreMembers に入っているものがあればそちらを優先する。
     ① 呼び名＝優先表示名（CoreMembers の dispName。例「チーフ」「山田（太）」）
     ② 姓（CoreMembers の lastName）
     ③ どちらも無ければ、カードに入っている名前の**先頭のかたまり**（＝苗字。法人はフル）
   ⚠ 名簿に居ない人（退職者・整備ソフト由来）でも ③ で必ず何か出す＝空欄にしない。
   ⚠ 自社「小林モータース」は姓を持たないので ③ を通り、法人としてそのまま出る。
   ⚠ 画面側の表示は今までどおり（ここは印刷専用）。 */
function pitStaffPrintName(name){
  var n = String(name == null ? '' : name).trim();
  if (!n) return '';
  var m = null;
  try { if (window.pitStaffAny) m = pitStaffAny(n); } catch (e) {}
  if (m){
    var dn = String(m.dispName || '').trim();
    if (dn) return dn;
    var ln = String(m.lastName || '').trim();
    if (ln) return ln;
    return pitSurname(m.name || n);
  }
  return pitSurname(n);
}
window.pitStaffPrintName = pitStaffPrintName;

/* ===== 🕐 v1.33.0（ゆうた指定）入庫時間のショートカット =====
   🔴 **並び順はこの配列のとおり**（画面のボタンの並び）。
   🔴 **（）内の時間は画面に出さない。並び順の計算にだけ使う。**
      予約・当日・返車などの「時間順」は、その**いちばん若い時刻（from）**で決める。
   🔴 **決まり次第・レッカー・鍵ポスト・未定は「時刻が本当に分からない」**扱い＝**その日の最後尾**に付く。
      その中の並びもこの配列の順。
   ⚠ 保存の形は今までどおり **文字列ひとつ**（c.reserveTime にラベルがそのまま入る）。
      だから表紙印刷やカードの表示は、何もしなくても「朝一」「決まり次第」と**文字がそのまま出る**。
   ⚠ 時刻を直接打つ（9:00 / 900 / 9時半）のも今までどおり。ここは“よく使うもの”の近道。 */
/* 🔴 v1.60.0 **時間の言葉の表は、この1本（PIT_TIME_ALL）だけ。**
     入庫（予約）用と返車用で「画面に出すボタンの並び」は違うが、
     **中身（何時ぶんか・時刻不明か・並び順）は同じ表を見る**。表を2つ作ると必ずズレる。
     ・intakeOnly … 入庫のときだけ出す（鍵ポスト）
     ・returnOnly … 返車のときだけ出す（勝手に取る）
     ・tbd        … 「未定」だけ。**返車では、これが入っているうちは「返車時間未定」に残る**。
       （決まり次第・レッカー・勝手に取る は、時刻不明のまま**返車カレンダーの「時刻未定」に置く**＝ゆうた指定） */
/* 🔴 v1.70.0（ゆうた確定）**並びは「いちばん遅くなり得る時刻」＝ to で決める。**
     ⚠ AM の to は 12:00 ではなく **12:59**。「午前」は現場の感覚で**12時台まで**なので、
        AM の車は 12:30 の車より**後ろ**に来る（ゆうた指定「AMなら12時台のさいごから並ぶ」）。 */
var PIT_TIME_ALL = [
  { label: 'AM',         from: '09:00', to: '12:59' },
  { label: 'PM',         from: '13:00', to: '19:00' },
  { label: '朝一',       from: '09:00', to: '09:30' },
  { label: 'お昼',       from: '12:00', to: '13:00' },
  { label: '夕方',       from: '16:30', to: '19:00' },
  { label: '決まり次第', unknown: true },
  { label: 'レッカー',   unknown: true },
  { label: '鍵ポスト',   unknown: true, intakeOnly: true },
  { label: '勝手に取る', unknown: true, returnOnly: true },
  { label: '未定',       unknown: true, tbd: true }
];
window.PIT_TIME_ALL = PIT_TIME_ALL;

var _pitTimeByLabel = {};
PIT_TIME_ALL.forEach(function (t, i) { t.ord = i; _pitTimeByLabel[t.label] = t; });

/* 入庫（予約）のボタンの並び＝今までどおり。返車だけの言葉は出さない。 */
var PIT_TIME_QUICK = PIT_TIME_ALL.filter(function (t){ return !t.returnOnly; });
window.PIT_TIME_QUICK = PIT_TIME_QUICK;

/* 🕐 v1.60.0（ゆうた指定）返車時間のショートカットの並び。
   AM／PM／朝一／お昼／夕方／決まり次第／レッカー／勝手に取る／未定。
   時間の割りふりは予約とまったく同じ（夕方＝16:30〜19:00 がいちばん後ろの時間帯）。 */
var PIT_RETURN_TIME_QUICK = PIT_TIME_ALL.filter(function (t){ return !t.intakeOnly; });
window.PIT_RETURN_TIME_QUICK = PIT_RETURN_TIME_QUICK;

/* ラベル（朝一 など）ならその定義を返す。時刻や空なら null。 */
function pitTimeQuick(v){
  return _pitTimeByLabel[String(v == null ? '' : v).trim()] || null;
}
window.pitTimeQuick = pitTimeQuick;

/* 時刻が本当に分からないもの（決まり次第・レッカー・鍵ポスト・勝手に取る・未定）か */
function pitTimeUnknown(v){
  var q = pitTimeQuick(v);
  return !!(q && q.unknown);
}
window.pitTimeUnknown = pitTimeUnknown;

/* 🔴 v1.60.0 「まだ**時間そのものを決めていない**」＝空 か 「未定」だけ。
   決まり次第・レッカー・勝手に取る は“決めた上での時刻不明”なので**ここには入らない**。 */
function pitTimeTbd(v){
  var s = String(v == null ? '' : v).trim();
  if (!s) return true;
  var q = pitTimeQuick(s);
  return !!(q && q.tbd);
}
window.pitTimeTbd = pitTimeTbd;

/* 🔴 v1.70.0（ゆうた確定）**並び順の物差しは、この1本だけ。**
     考え方はひとつ＝ **「いちばん遅くなり得る時刻」で並べる。**

     | 入っているもの | 並ぶ場所 |
     |---|---|
     | `09:30`（ふつうの時刻） | そのまま 09:30 |
     | `09:00-10:00`（範囲） | **後ろの 10:00**（同じ 10:00 の車より後ろ） |
     | 朝一（09:00〜09:30） | **09:30** |
     | AM（09:00〜**12:59**） | **12時台のいちばん最後**（12:30 の車より後ろ） |
     | お昼（12:00〜13:00） | **13:00** |
     | 夕方（16:30〜19:00） | **19:00** |
     | PM（13:00〜19:00） | **19:00**（夕方と同じ終わり → **幅が広い方が後ろ**なので PM が後） |
     | 終日（待ち・当日返しで時間なし） | 80000＝**時間の枠の後ろ／時刻未定より前** |
     | 決まり次第・レッカー・鍵ポスト・勝手に取る・未定 | 90000 台＝**その日の後ろ**（中はボタン順） |
     | 空・読めない文字（「9時以降」「全角の９時」） | 99999＝**いちばん最後** |

   ⚠ 返す値は「分」。休憩バーの区切り（12:00＝720）などと直接くらべられるようにしてある。
   ⚠ 端数（幅×0.001）は「同じ終わりなら幅の広い方を後ろに」するためだけのもの。
      幅は最大でも 360分＝0.36 なので、**次の1分をまたぐことはない**。
   🔴 これを変えると **MHS の index.html にある写しと食い違う**（MHS のテストが現物と突き合わせて落ちる）。
      直すときは必ず MHS も一緒に直すこと。 */
var PIT_TIME_ALLDAY = 80000;   /* 終日（待ち・当日返し）の並びの値 */
window.PIT_TIME_ALLDAY = PIT_TIME_ALLDAY;

/* ⚠ 中で使う小さな関数は**この中に閉じてある**。
   MHS のテストは state.js から `PIT_TIME_ALL` / `_pitTimeByLabel` / `pitTimeQuick` / `pitTimeMin` の
   4つだけを切り出して動かすので、**外に助っ人を置くと MHS 側で動かなくなる**。 */
function pitTimeMin(v){
  var hm = function (x){
    var m = String(x == null ? '' : x).match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  /* 終わりの時刻 ＋ 幅ぶんの端数（同じ終わりなら**幅の広い方が後ろ**） */
  var span = function (from, to){
    var b = hm(to); if (b == null) return null;
    var a = hm(from); if (a == null || a > b) a = b;
    return b + (b - a) * 0.001;
  };
  var s = String(v == null ? '' : v).trim();
  if (!s) return 99999;
  var q = pitTimeQuick(s);
  if (q) {
    if (q.unknown) return 90000 + q.ord;
    var sp = span(q.from, q.to);
    if (sp != null) return sp;
  }
  /* 打ち込んだ時刻。範囲（09:00-10:00）なら**後ろの時刻**で並べる。 */
  var all = s.match(/\d{1,2}:\d{2}/g);
  if (!all || !all.length) return 99999;
  var r = span(all[0], all[all.length - 1]);
  return (r == null) ? 99999 : r;
}
window.pitTimeMin = pitTimeMin;

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
