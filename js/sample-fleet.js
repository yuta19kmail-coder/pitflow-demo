/* ========================================
   sample-fleet.js  -  実規模サンプルデータ生成（開発用）／PitFlow v0.8.0
   ----------------------------------------
   ・小林モータースのリアルな規模感を再現したダミー入庫データを生成。
     - 過去実績 約150台（返車完了・過去半年に分布）
     - 現在の預かり 約20台（作業中ステータス）
     - これからの予約＝リアル再現：直近3週間は枠が満杯→10日は残り1枠→以降余裕（1日0〜数台）
     - 国産:輸入 ＝ おおむね 6:4（枠5:3で自然にそうなる）
   ・代車予約は先行して埋まっており、最短の空きは「8月お盆明け」あたり。
   ・→ 最短入庫日の実態（2026-06-05時点）：代車なし＝6月末・代車あり＝お盆明け を再現。
   ・sample-data.js の後・db-pit.js の前に読み込み、初期データとして state を差し替える。
     （db-pit が localStorage を持っていればそちらが優先＝編集は保持される）
   ・実在しないダミー。
   ======================================== */
(function () {
  /* v1.2.1：本番（クラウド保存）ではサンプルを一切入れない。
     ⚠ 入れてしまうと、ログイン直後の一瞬に「サンプル＝新しいデータ」と判断されて
        クラウドへ書き込まれ、初期化しても復活してしまう。 */
  if (window.PIT_CLOUD) return;
  const SEI = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎','森','池田','橋本','阿部','石川','前田','藤田','後藤','小川','岡田','長谷川','村上','近藤','石井','斎藤','坂本','遠藤','青木','西村','福田'];
  const KOKU_MK = ['トヨタ','ホンダ','日産','スズキ','ダイハツ','マツダ','スバル'];
  const KOKU = ['アクア','プリウス','タント','ノート','セレナ','フィット','N-BOX','ハスラー','ワゴンR','ヴォクシー','ハリアー','ジムニー','ムーヴ','スイフト','デイズ','フリード','ルーミー','スペーシア'];
  // 輸入車は [メーカー, 車種] のペア（v0.27.0 メーカー/車種の2ボックス化）
  const YUNYU = [['MINI','クーパー(R56)'],['BMW','320i'],['ベンツ','C200'],['アウディ','A4'],['VW','ゴルフ'],['プジョー','208'],['ボルボ','V40'],['フィアット','500'],['ジープ','レネゲード'],['ポルシェ','マカン'],['MINI','クロスオーバー'],['BMW','X1'],['ベンツ','A180'],['VW','ポロ']];
  const PLACES = ['品川','練馬','横浜','足立','世田谷','習志野','袖ヶ浦','千葉','野田','大宮','春日部','所沢'];
  const CLS = ['300','500','580','330','530'];
  const KANA = ['あ','い','う','か','き','く','さ','す','せ','た','つ','て','な','に','は','ひ','ふ','ほ','ま','み','む','や','ゆ','ら','り','る'];
  const STAFF = ['社長','専務','椎名','チーフ','蓮沼','箱崎','菅谷','林','大西'];
  const WORK = ['shaken','shaken','shaken','general','general','oil','12pt','bp','coat1y','coat3m'];  // 車検多め（v0.27.0 確定7種）
  const DROP = ['drop','drop','drop','wait','sameDay'];  // 基本は預かり
  const ACTIVE = ['check','estim','contact','parts','work'];

  /* ===================================================================
     🟠 v1.79.0（ゆうた指定）**デモ版は「明らかに架空」の中身にする。**
     🔴 表の中身を差し替えるだけ。作る手順（baseCard など）は本番と同じものを通す。
     ⚠ 判定は `pitIsDemo()`（demo-pit.js）1本。demo-pit.js は index.html でこのファイルより前に読む。
     ⚠ 電話番号は 000-0000-XXXX ＝**練習中に本当にかけてしまう事故**を防ぐ。
     =================================================================== */
  const DEMO = {
    SEI    : ['デモ山','デモ田','デモ川','デモ本','サンプル','テス川','テス田','レンシュウ'],
    KOKU_MK: ['デモ自動車','サンプル自動車','テスト自工'],
    KOKU   : ['テストA','テストB','テストC','テストD','テストE','テストF','テストG','テストH'],
    YUNYU  : [['デモ輸入','テストX'],['デモ輸入','テストY'],['サンプル輸入','テストZ']],
    PLACES : ['デモ','サンプル','テスト','レンシュウ']
  };
  function isDemo() { return !!(window.pitIsDemo && window.pitIsDemo()); }
  function T() {
    return isDemo() ? DEMO
                    : { SEI: SEI, KOKU_MK: KOKU_MK, KOKU: KOKU, YUNYU: YUNYU, PLACES: PLACES };
  }
  /* 🟠 デモ版は台数も控えめでよい（ゆうた指定「カード件数は多くなくていい」）。
     ⚠ 0にはしない＝実績・売上・駐車場の画面が空っぽだと練習にならない。 */
  const N_PAST   = () => isDemo() ?  30 : 150;   /* 過去実績 */
  const N_ACTIVE = () => isDemo() ?   8 :  20;   /* いま預かり中 */

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const ri  = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pad = n => String(n).padStart(2, '0');
  const ymdL = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const d4 = () => String(ri(0,9999)).padStart(4,'0');
  const plate = () => rnd(T().PLACES) + ' ' + rnd(CLS) + ' ' + rnd(KANA) + ' ' + d4();
  const timeSlot = () => pad(ri(9,17)) + ':' + rnd(['00','30']);

  function baseCard(id, imp){
    const workType = rnd(WORK);
    const dropType = rnd(DROP);
    const t = T();
    const yn = imp ? rnd(t.YUNYU) : null;
    const MP = imp ? ['山根','蓮沼','箱崎','菅谷'] : ['山田','椎名','専務'];   // メカニックプール（課別）v0.129.0
    return {
      id: 'f' + id,
      boardId: imp ? 'import' : 'default',
      division: imp ? 'div2' : 'div1',   // 国→1課・輸→2課
      customer: rnd(t.SEI),
      tel: isDemo() ? '000-0000-' + d4() : '0' + rnd(['90','80','70']) + '-' + d4() + '-' + d4(),
      maker: imp ? yn[0] : rnd(t.KOKU_MK),
      car:   imp ? yn[1] : rnd(t.KOKU),
      plate: plate(),
      workType: workType,
      dropType: dropType,
      consult: Math.random() < 0.08,   // たまに「相談」つき
      staff: rnd(STAFF),
      frontStaff: rnd(STAFF),          // フロント担当（当日ビューの縦バッジ）
      reserveTime: timeSlot(),
      returnTime: timeSlot(),
      estHoldDays: (window.pitEstHold ? pitEstHold(workType, dropType) : 5),  // 概算預かり日数
      estAmount: (window.pitEstAmount ? pitEstAmount(workType) : 100000),     // 概算金額（タイプ別平均）
      needLoaner: false, needWash: Math.random() < 0.4, urgent: Math.random() < 0.06, memo: '',
      // 🧑‍🔧 メカニック実績のサンプル割当（点検＝車検/12点/一般のみ1人／整備＝1〜3人・重複あり）v0.129.0
      inspectors: (['shaken','12pt','general'].indexOf(workType) >= 0) ? [ rnd(MP) ] : [],
      mechanics: (function(){ var n = (workType==='oil') ? (Math.random()<0.8?1:2) : (workType==='bp') ? ri(1,2) : ri(1,3); var a=[]; for (var i=0;i<n;i++) a.push(rnd(MP)); return a; })()
    };
  }

  function gen(){
    const cards = [];
    const today = new Date(); today.setHours(0,0,0,0);
    let id = 0;
    let _ic = 0;
    const isImp = () => { _ic++; return (_ic % 5) < 2; };   // 国産:輸入 = 3:2（確実に約6:4）

    // 1) 過去実績 約150台（返車完了）
    for (let i = 0; i < N_PAST(); i++){
      id++; const imp = isImp();
      const inD = add(today, -ri(2, 175));
      const out = add(inD, ri(0, 5));
      const c = baseCard(id, imp);
      c.status = 'returned';
      c.reserveDate = ymdL(inD); c.returnDate = ymdL(out); c.completedAt = ymdL(out);
      c.returnDateFinal = ymdL(out);
      // 💴 確定売上（実額感＝概算±で分散・税抜・100円丸め）＝メカニック実績/売上ビューの実績金額のもと v0.129.1
      c.amountFinal = Math.round(c.estAmount * (0.85 + Math.random() * 0.4) / 100) * 100;
      cards.push(c);
    }

    // 2) 現在の預かり 約20台（作業中）
    for (let i = 0; i < N_ACTIVE(); i++){
      id++; const imp = isImp();
      const inD = add(today, -ri(0, 6));
      const out = add(today, ri(0, 9));
      const c = baseCard(id, imp);
      c.status = rnd(ACTIVE);
      c.reserveDate = ymdL(inD); c.returnDate = ymdL(out);
      c.needLoaner = c.dropType === 'drop' && Math.random() < 0.6;
      cards.push(c);
    }

    // 3) これからの予約＝リアルの混み方を再現（2026-06-05 ゆうた指示）
    //    実態：今日時点で「代車なし＝6月末」「代車あり＝8月お盆明け」レベルの埋まり方。
    //    → 直近約3週間＝予約枠が満杯（受付終了状態）／その後10日＝残り1枠／さらに先＝余裕あり
    //    （代車は genLoaners がお盆明けまで満杯にするので「代車あり＝8月」が自動で成立する）
    //    ※未来は返車日を確定させず「概算預かり日数(estHoldDays)」だけ＝予想（不確定）として扱う
    const capD = 5, capI = 3;   // 1日の予約枠の仮値（settings.reserveCap と同じ）
    for (let day = 0; day <= 45; day++){   // day=0＝今日も満杯（「今日はもう取れない」が実態）
      const inD = add(today, day);
      if (inD.getDay() === 3) continue;   // 水曜定休＝予約は入らない
      let nD, nI;
      if (day <= 20)      { nD = capD;     nI = capI;     }   // 満杯＝受付終了の期間
      else if (day <= 30) { nD = capD - 1; nI = capI - 1; }   // 残り1枠（△）の期間
      else                { nD = ri(1, 3); nI = ri(0, 2); }   // 余裕の期間
      for (let k = 0; k < nD + nI; k++){
        id++; const imp = k >= nD;
        const c = baseCard(id, imp);
        c.status = 'reserved';
        c.reserveDate = ymdL(inD);
        if (c.estHoldDays === 0){
          c.returnDate = ymdL(inD);          // 当日仕上げは確定
        } else {
          c.needLoaner = Math.random() < 0.55; // 預かりは代車要かも・返車日は未確定
        }
        cards.push(c);
      }
    }
    return cards;
  }

  // 代車予約：先行して埋まっており、最短の空きは「8月お盆明け」あたり
  function genLoaners(){
    const today = new Date(); today.setHours(0,0,0,0);
    // 今年の8/17（お盆明け）まで、4台の代車を背中合わせで埋める
    const obon = new Date(today.getFullYear(), 7, 17);  // 8月17日
    const assigns = [];
    let aid = 0;
    const loaners = (state.loaners || [{id:'L01'},{id:'L02'},{id:'L03'},{id:'L04'}]);
    loaners.forEach(function(l){
      let cur = add(today, -ri(0, 3));
      while (cur < obon){
        const len = ri(3, 10);
        const to = add(cur, len - 1);
        aid++;
        assigns.push({ id: 'a' + aid, loanerId: l.id, cardId: null, customer: rnd(T().SEI), car: rnd(T().KOKU), fromDate: ymdL(cur), toDate: ymdL(to) });
        cur = add(to, 1);
      }
    });
    return assigns;
  }

  // 車両イベント（車検入庫・リースアップ等）のサンプル
  function genFleetEvents(){
    const today = new Date(); today.setHours(0,0,0,0);
    return [
      { id: 'ev1', vehicleId: 'L05', type: 'shakenIn', label: '代車5 車検入庫',        fromDate: ymdL(add(today, 18)), toDate: ymdL(add(today, 20)) },
      { id: 'ev2', vehicleId: 'L12', type: 'lease',    label: 'リースアップ→新車切替', fromDate: ymdL(add(today, 38)), toDate: ymdL(add(today, 38)) },
      { id: 'ev3', vehicleId: 'L17', type: 'shakenIn', label: '代車17 車検入庫',       fromDate: ymdL(add(today, 45)), toDate: ymdL(add(today, 47)) },
      { id: 'ev4', vehicleId: 'C01', type: 'other',    label: '積載車 タイヤ交換',     fromDate: ymdL(add(today, 10)), toDate: ymdL(add(today, 10)) }
    ];
  }

  // 初期データとして差し替え（db-pit が localStorage を持っていれば後で上書きされる）
  if (Array.isArray(state.cards)){
    state.cards = gen();
    state.loanerAssigns = genLoaners();
    state.fleetEvents = genFleetEvents();
  }
})();
