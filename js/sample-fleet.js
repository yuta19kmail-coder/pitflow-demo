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
  /* 🔴 v1.168.0 お名前は **[漢字, カナ] の組**にした。
     ◎なぜ（点検＝健康診断が教えてくれたこと）
       見本のカードには **カナが1つも入っていなかった**（411枚ぜんぶ）。
       カナは**保存の関門で必須**（card-miss.js の🔴赤）なので、
       **自分たちの見本データが、自分たちの関門を通れない**状態だった。
       ＝ カナだけのお客様の見え方（v1.161.0 で直したところ）も、見本では一度も試せていなかった。
     ⚠ ここを組にしたら、下の baseCard も必ず両方入れること。 */
  const SEI = [['佐藤','サトウ'],['鈴木','スズキ'],['高橋','タカハシ'],['田中','タナカ'],['伊藤','イトウ'],['渡辺','ワタナベ'],['山本','ヤマモト'],['中村','ナカムラ'],['小林','コバヤシ'],['加藤','カトウ'],['吉田','ヨシダ'],['山田','ヤマダ'],['佐々木','ササキ'],['山口','ヤマグチ'],['松本','マツモト'],['井上','イノウエ'],['木村','キムラ'],['林','ハヤシ'],['清水','シミズ'],['山崎','ヤマザキ'],['森','モリ'],['池田','イケダ'],['橋本','ハシモト'],['阿部','アベ'],['石川','イシカワ'],['前田','マエダ'],['藤田','フジタ'],['後藤','ゴトウ'],['小川','オガワ'],['岡田','オカダ'],['長谷川','ハセガワ'],['村上','ムラカミ'],['近藤','コンドウ'],['石井','イシイ'],['斎藤','サイトウ'],['坂本','サカモト'],['遠藤','エンドウ'],['青木','アオキ'],['西村','ニシムラ'],['福田','フクダ']];
  const KOKU_MK = ['トヨタ','ホンダ','日産','スズキ','ダイハツ','マツダ','スバル'];
  const KOKU = ['アクア','プリウス','タント','ノート','セレナ','フィット','N-BOX','ハスラー','ワゴンR','ヴォクシー','ハリアー','ジムニー','ムーヴ','スイフト','デイズ','フリード','ルーミー','スペーシア'];
  // 輸入車は [メーカー, 車種] のペア（v0.27.0 メーカー/車種の2ボックス化）
  const YUNYU = [['MINI','クーパー(R56)'],['BMW','320i'],['ベンツ','C200'],['アウディ','A4'],['VW','ゴルフ'],['プジョー','208'],['ボルボ','V40'],['フィアット','500'],['ジープ','レネゲード'],['ポルシェ','マカン'],['MINI','クロスオーバー'],['BMW','X1'],['ベンツ','A180'],['VW','ポロ']];
  const PLACES = ['品川','練馬','横浜','足立','世田谷','習志野','袖ヶ浦','千葉','野田','大宮','春日部','所沢'];
  const CLS = ['300','500','580','330','530'];
  const KANA = ['あ','い','う','か','き','く','さ','す','せ','た','つ','て','な','に','は','ひ','ふ','ほ','ま','み','む','や','ゆ','ら','り','る'];
  /* 🔴 v1.168.0 フロント担当は**課ごと**に分けた（前は9人からランダム＝2課の車に1課の人が付いていた）。
     ⚠ 課は「予約画面で押したボタン」で決まる（v1.92.0）。見本でも食い違わせない。 */
  const FRONT = { div1: ['社長','専務','椎名'], div2: ['チーフ','蓮沼','箱崎','菅谷'] };
  /* 作業内容の文（🟡推奨）。⚠ 作業タイプの id は settings の表に合わせる */
  const MENU = { shaken:'車検整備一式', general:'一般整備', oil:'オイル交換', '12pt':'12ヶ月点検',
                 bp:'板金塗装', coat1y:'コーティング（1年）', coat3m:'コーティング（3ヶ月）' };
  const REPEAT = ['repeat','repeat','repeat','first'];   /* 初回／リピーター（🔴赤）＝リピーター多め */
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
    SEI    : [['デモ山','デモヤマ'],['デモ田','デモタ'],['デモ川','デモカワ'],['デモ本','デモモト'],
              ['サンプル','サンプル'],['テス川','テスカワ'],['テス田','テスタ'],['レンシュウ','レンシュウ']],
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
    const div = imp ? 'div2' : 'div1';   // 国→1課・輸→2課
    const nm  = rnd(t.SEI);              // [漢字, カナ]
    return {
      id: 'f' + id,
      boardId: imp ? 'import' : 'default',
      division: div,
      customer: nm[0],
      kana: nm[1],                     /* 🔴 v1.168.0 保存の関門で必須。見本にも必ず入れる */
      repeat: rnd(REPEAT),             /* 🔴 v1.168.0 同上 */
      menu: MENU[workType] || '整備',   /* 🟡 v1.168.0 作業内容 */
      /* 🔴 v1.168.0 車検は諸費用も必須（v1.40.0 の決めごと）。重量税・自賠責・印紙のざっくり合計 */
      feeAmount: (workType === 'shaken') ? (ri(35, 75) * 1000) : null,
      tel: isDemo() ? '000-0000-' + d4() : '0' + rnd(['90','80','70']) + '-' + d4() + '-' + d4(),
      maker: imp ? yn[0] : rnd(t.KOKU_MK),
      car:   imp ? yn[1] : rnd(t.KOKU),
      plate: plate(),
      workType: workType,
      workTypes: [workType],
      dropType: dropType,
      consult: Math.random() < 0.08,   // たまに「相談」つき
      staff: rnd(MP),                  /* 🔴 v1.168.0 課の中の人（前は全員からランダム） */
      frontStaff: rnd(FRONT[div]),     // フロント担当（当日ビューの縦バッジ）＝同じ課の人
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
      /* 🔴 v1.168.0 **返車済みの車は、必ず完TELを通っている。**（v1.97.0 の関門）
         本物の道（return-popup.js）は `returnStage` を付けてから実績にしている。
         見本だけ status を直に書いていたので、**150台ぜんぶが「関門をすり抜けた車」**に見えていた。 */
      c.returnStage = 'returnWait';
      c.completeCallAt = ymdL(add(out, -1));
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
      /* 🔴 v1.168.0 **「代車が必要」の印だけ立てて、代車を決めないカードは作らない。**
         ◎点検（健康診断）が見つけたこと
           見本では 54枚が「代車：必要」なのに **使用代車・貸出から・貸出まで が空**だった。
           この3つは代車を必要にした瞬間に🔴必須になる（card-miss.js）ので、
           **人が同じカードを作ろうとしても保存できない**＝ありえない形の見本だった。
         ⚠ ここで代車を割り当てられないのは、下の genLoaners が
            **20台ぜんぶを今日から4週間ぶん埋めている**から（「代車あり＝お盆明け」の混み具合の再現）。
            ＝ 空きが1台も無いのが正しい。だから**必要の印も立てない。**
         🔴 代車つきのカードが要る時は sample-reservations.js が作る（あちらは貸出も一緒に作っている）。 */
      c.needLoaner = false;
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
          /* ⚠ 上と同じ理由で、代車を決められないので「必要」の印も立てない（v1.168.0）。
             預かりの返車日が未確定なのは今までどおり（概算 預かり日数で見込む）。 */
          c.needLoaner = false;
        }
        cards.push(c);
      }
    }
    return cards;
  }

  /* 代車予約：先行して埋まっていて、空きはしばらく先――という見本を作る。
     🔴🔴 2026-08-21 修正（見張り `test_loaner_name` が「貸出のバッジが0」で落ちていた正体）
       直す前は **「今年の 8/17（お盆明け）まで」** という**カレンダーの決め打ち**だった。
       ＝ **8/18 を過ぎた日から翌年の春まで、1件も作られない。**
       デモ版の代車カレンダーが**まるごと空っぽ**になり、しかも
       「今日は8月18日以降だから」なので**エラーは1つも出ない**（毎年 半年ちかく空のまま）。
     🔴 **見本データに「◯月◯日まで」と書かない。必ず今日からの日数で書く。**
       ここは **今日の3日前 〜 今日の28日後**を埋める（どの日に開いても同じ見え方になる）。 */
  var SAMPLE_LOANER_BACK_DAYS = 3;      /* 何日前から埋めるか（過去の帯＝返却済みの見本） */
  var SAMPLE_LOANER_AHEAD_DAYS = 28;    /* 何日先まで埋めるか */
  function genLoaners(){
    const today = new Date(); today.setHours(0,0,0,0);
    const until = add(today, SAMPLE_LOANER_AHEAD_DAYS);
    const assigns = [];
    let aid = 0;
    const loaners = (state.loaners || [{id:'L01'},{id:'L02'},{id:'L03'},{id:'L04'}]);
    loaners.forEach(function(l){
      let cur = add(today, -ri(0, SAMPLE_LOANER_BACK_DAYS));
      while (cur < until){
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
