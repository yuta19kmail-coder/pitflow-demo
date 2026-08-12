/* ========================================
   sample-data.js  -  モック用のサンプル入庫カード（PitFlow v0.63.0で全面刷新）
   ----------------------------------------
   ◎ねらい：これまで作ってきた機能（人＋車両モデル・連絡先/カナ・相談/マルエフ・
     代車・概算金額/概算預かり日数・PIT配置・整備ダッシュの長期預かりアラート・
     顧客履歴・実績の確定売上・付箋ボード）に、ひと通り“見える”データを入れる。
   ◎現行カードスキーマに合わせた全フィールド版（旧フラット版から刷新）。
     ・customer(氏名)/kana/car/maker/plate/tel/contacts/office
     ・boardId(default=国産/import=輸入)・division(div1/div2)・frontStaff・staff
     ・workType(shaken/12pt/general/oil/bp/coat1y/coat3m)・menu・dropType(wait/sameDay/drop)
     ・reserve/return 日時・status・bayId(PIT配置)・needLoaner＋loaner(Id/From/To/Fixed)
     ・estAmount/estHoldDays(自動)・amountFinal(実績)・urgent/consult/codeRed/needWash・maint・log
   ◎あくまで開発・動作確認用のダミー。実在しない名前・番号です。
   ======================================== */
(function () {
  /* v1.2.1：本番（クラウド保存）ではサンプルを一切入れない。
     ⚠ 入れてしまうと、ログイン直後の一瞬に「サンプル＝新しいデータ」と判断されて
        クラウドへ書き込まれ、初期化しても復活してしまう。 */
  if (window.PIT_CLOUD) return;
  const today = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const T = (n) => ymd(addDays(today, n));

  // 自社PIT配置図の枠ID（state.bays と一致）
  const BAY = {
    pit3:  'baymq99q0w9862',  // 3PIT（2課）
    no2:   'baymq99qi0p112',  // 2番（1課）
    pit1:  'baymq99qve324',   // 1PIT（1課）
    pit4f: 'baymq9gfkf8184',  // PIT 4（平場）
    pit4:  'baymq9gftkt76',   // 4PIT（2課）
    front3:'baymq9gitve44',   // 3前（青空1番）
    front1:'baymq9gj24g50',   // 1前
  };

  const estAmt  = (wt) => (window.pitEstAmount ? pitEstAmount(wt) : 100000);
  const estHold = (wt, dt) => (window.pitEstHold ? pitEstHold(wt, dt) : 3);

  // カード1枚を全フィールド埋めて作る
  function card(o) {
    const boardId = o.boardId || 'default';
    const division = boardId === 'import' ? 'div2' : 'div1';
    const tel = o.tel || '';
    return {
      id: o.id,
      customerId: o.customerId || null,
      customer: o.customer || '',
      kana: o.kana || '',
      sei: o.sei || '',          // 姓（customer=姓+半角空白+名 に合成。既存データは開く時に分割）
      mei: o.mei || '',          // 名
      seiKana: o.seiKana || '',  // 姓カナ
      meiKana: o.meiKana || '',  // 名カナ
      car: o.car || '',
      maker: o.maker || '',
      plate: o.plate || '',
      drive: Array.isArray(o.drive) ? o.drive : [],   // 特殊運転属性 'leftHand'/'mt'/'lowCar'（左+mtで「左MT」自動成立）
      tel: tel,
      contacts: tel ? [{ tel: tel, label: o.telLabel || '個人携帯', primary: true }] : [],
      office: o.office || '',
      boardId: boardId,
      division: division,
      frontStaff: o.frontStaff || '',
      staff: o.staff || o.frontStaff || '',
      workType: o.workType || 'general',
      menu: o.menu || '',
      dropType: o.dropType || 'drop',
      reserveDate: o.reserveDate,
      reserveTime: o.reserveTime || '',
      returnDate: (o.returnDate === undefined) ? o.reserveDate : o.returnDate,
      returnTime: o.returnTime || '',
      status: o.status,
      bayId: o.bayId || null,
      needLoaner: !!o.loanerId || !!o.needLoaner,
      loanerId: o.loanerId || '',
      loanerFrom: o.loanerFrom || '',
      loanerTo: o.loanerTo || '',
      loanerFixed: !!o.loanerFixed,
      estAmount: (o.estAmount != null) ? o.estAmount : estAmt(o.workType || 'general'),
      estHoldDays: (o.estHoldDays != null) ? o.estHoldDays : estHold(o.workType || 'general', o.dropType || 'drop'),
      amountQuote: (o.amountQuote != null) ? o.amountQuote : null,   // 見積もり（見積り中→連絡中で入力）
      amountOrder: (o.amountOrder != null) ? o.amountOrder : null,   // 受注（連絡中→パーツ待ちで入力）
      amountFinal: (o.amountFinal != null) ? o.amountFinal : null,   // 確定（作業完了→請求の確定額）
      testDrive: !!o.testDrive,        // 試運転が必要/してほしい（同フェーズ内の下段＝試運転エリア）
      outsourceTo: o.outsourceTo || '', // 外注先名（status==='outsource' の時）
      outsourceNote: o.outsourceNote || '', // 外注先メモ（各ディーラー/その他で店名等を1行）
      outsourceDue: o.outsourceDue || '',   // 外注先との予定完了日（ISO・自社完了とは別）
      urgent: !!o.urgent,
      consult: !!o.consult,
      codeRed: !!o.codeRed,
      needWash: !!o.needWash,
      memo: o.memo || '',
      maint: o.maint || {},
      log: o.log || [],
      intakeTbd: false,
      returnTbd: (o.returnDate === '' ),
      completedAt: o.completedAt || null,
      returnDateFinal: (o.returnDateFinal !== undefined) ? o.returnDateFinal : null,
      inspSchedule: o.inspSchedule || { mode:'manual', slots:{}, cutBefore:'' },
      coverCall: o.coverCall || { done:false, at:'', staff:'' },
      payment: o.payment || '',
      handover: o.handover || 'store',
      handoffMemo: o.handoffMemo || '',
    };
  }

  state.cards = [
    // ───────── 当日 入庫予定（予約ビュー・当日ビュー）─────────
    card({ id:'c001', reserveDate:T(0), reserveTime:'09:00', returnDate:T(0), status:'reserved', boardId:'default',
      customer:'佐藤 大輔', kana:'サトウダイスケ', maker:'トヨタ', car:'アクア', plate:'野田 500 あ 1234', tel:'090-1234-5678',
      workType:'oil', menu:'オイル交換', dropType:'wait', frontStaff:'椎名', staff:'椎名' }),
    card({ id:'c002', reserveDate:T(0), reserveTime:'09:30', returnDate:T(0), status:'reserved', boardId:'default',
      customer:'高橋 健太', kana:'タカハシケンタ', maker:'ホンダ', car:'N-BOX', plate:'柏 580 か 2233', tel:'047-123-4567',
      workType:'shaken', menu:'車検（24ヶ月点検）', dropType:'wait', frontStaff:'専務', staff:'専務', consult:true }),
    card({ id:'c003', reserveDate:T(0), reserveTime:'10:00', returnDate:T(0), status:'reserved', boardId:'import',
      customer:'渡辺 涼介', kana:'ワタナベリョウスケ', maker:'BMW', car:'320i', plate:'習志野 330 ね 0078', tel:'080-2233-4455',
      workType:'12pt', menu:'12ヶ月点検', dropType:'sameDay', frontStaff:'チーフ', staff:'チーフ' }),
    card({ id:'c004', reserveDate:T(0), reserveTime:'10:30', returnDate:T(2), status:'reserved', boardId:'default',
      customer:'田中 直樹', kana:'タナカナオキ', maker:'マツダ', car:'CX-5', plate:'千葉 300 さ 4501', tel:'090-3344-5566',
      workType:'shaken', menu:'車検 ＋ 代車', dropType:'drop', frontStaff:'社長', staff:'社長',
      loanerId:'L03', loanerFrom:T(0), loanerTo:T(2), needLoaner:true }),
    card({ id:'c005', reserveDate:T(0), reserveTime:'11:00', returnDate:T(0), status:'reserved', boardId:'import',
      customer:'(株)亨子会', kana:'キョウコカイ', office:'(株)亨子会', maker:'メルセデス', car:'Cクラス', plate:'品川 580 く 3333', tel:'047-555-6600', telLabel:'会社',
      workType:'general', menu:'一般整備（警告灯点検）', dropType:'sameDay', frontStaff:'蓮沼', staff:'蓮沼', codeRed:true }),
    card({ id:'c006', reserveDate:T(0), reserveTime:'13:00', returnDate:T(3), status:'reserved', boardId:'default',
      customer:'伊藤 和也', kana:'イトウカズヤ', maker:'スズキ', car:'ハスラー', plate:'松戸 580 き 7788', tel:'080-6677-8899',
      workType:'bp', menu:'板金塗装（左フェンダー）＋ 代車', dropType:'drop', frontStaff:'箱崎', staff:'箱崎',
      loanerId:'L07', loanerFrom:T(0), loanerTo:T(3), needLoaner:true, urgent:true }),
    card({ id:'c007', reserveDate:T(0), reserveTime:'15:30', returnDate:T(0), status:'reserved', boardId:'default',
      customer:'山本 智也', kana:'ヤマモトトモヤ', maker:'ダイハツ', car:'タント', plate:'袖ヶ浦 580 こ 1209', tel:'090-7788-9900',
      workType:'coat3m', menu:'3ヶ月コート', dropType:'sameDay', frontStaff:'椎名', staff:'椎名' }),
    card({ id:'c008', reserveDate:T(0), reserveTime:'16:30', returnDate:T(1), status:'reserved', boardId:'import',
      customer:'中村 亮', kana:'ナカムラリョウ', maker:'VW', car:'ゴルフ', plate:'習志野 330 つ 6655', tel:'080-1212-3434',
      workType:'shaken', menu:'車検 ＋ 代車（レッカー入庫）', dropType:'drop', frontStaff:'菅谷', staff:'菅谷',
      loanerId:'L11', loanerFrom:T(0), loanerTo:T(1), needLoaner:true, memo:'' }),

    // ───────── 預かり中・作業進行（タスクボード／PIT配置）─────────
    card({ id:'c020', reserveDate:T(-1), reserveTime:'09:30', returnDate:T(1), status:'check', boardId:'default',
      customer:'小林 誠', kana:'コバヤシマコト', maker:'トヨタ', car:'ヴォクシー', plate:'野田 300 す 8080', tel:'090-2020-3030',
      workType:'shaken', menu:'車検', dropType:'drop', frontStaff:'社長', staff:'山田', bayId:BAY.pit1,
      loanerId:'L01', loanerFrom:T(-1), loanerTo:T(1), needLoaner:true }),
    card({ id:'c021', reserveDate:T(-1), reserveTime:'10:00', returnDate:T(1), status:'estim', boardId:'default',
      customer:'加藤 浩二', kana:'カトウコウジ', maker:'日産', car:'セレナ', plate:'柏 500 た 4646', tel:'080-4646-5757',
      workType:'general', menu:'一般整備（足回り異音）', dropType:'drop', frontStaff:'椎名', staff:'山田', bayId:BAY.no2 }),
    card({ id:'c022', reserveDate:T(-2), reserveTime:'11:00', returnDate:T(1), status:'contact', boardId:'import',
      customer:'吉田 博之', kana:'ヨシダヒロユキ', maker:'BMW', car:'X1', plate:'習志野 300 ふ 2727', tel:'090-2727-3838',
      workType:'bp', menu:'板金塗装（リアバンパー）', dropType:'drop', frontStaff:'チーフ', staff:'山根', bayId:BAY.pit3,
      loanerId:'L05', loanerFrom:T(-2), loanerTo:T(1), needLoaner:true, codeRed:true,
      log:[{ label:'保険会社に連絡・対応待ち', at: Date.now()-3600000*5, manual:true, staff:'チーフ' }] }),
    card({ id:'c023', reserveDate:T(-1), reserveTime:'14:00', returnDate:T(2), status:'parts', boardId:'import',
      customer:'松本 茂', kana:'マツモトシゲル', maker:'VW', car:'パサート', plate:'習志野 330 め 9191', tel:'080-9191-0202',
      workType:'general', menu:'一般整備（部品取り寄せ）', dropType:'drop', frontStaff:'蓮沼', staff:'山根', bayId:BAY.pit4,
      loanerId:'L12', loanerFrom:T(-1), loanerTo:T(2), needLoaner:true,
      log:[{ label:'部品発注済み（入荷待ち）', at: Date.now()-3600000*26, manual:true, staff:'蓮沼' }] }),
    card({ id:'c024', reserveDate:T(0), reserveTime:'09:00', returnDate:T(0), status:'work', boardId:'default',
      customer:'井上 拓也', kana:'イノウエタクヤ', maker:'スズキ', car:'スイフト', plate:'千葉 500 に 3636', tel:'090-3636-4747',
      workType:'12pt', menu:'12点点検', dropType:'wait', frontStaff:'専務', staff:'山田', bayId:BAY.front1 }),
    card({ id:'c025', reserveDate:T(0), reserveTime:'09:00', returnDate:T(0), status:'work', boardId:'import',
      customer:'木村 隆', kana:'キムラタカシ', maker:'メルセデス', car:'Aクラス', plate:'習志野 580 や 5252', tel:'080-5252-6363',
      workType:'oil', menu:'オイル＋エレメント', dropType:'wait', frontStaff:'箱崎', staff:'山根', bayId:BAY.front3 }),
    card({ id:'c026', reserveDate:T(-2), reserveTime:'13:30', returnDate:T(0), status:'work', boardId:'default',
      customer:'清水 学', kana:'シミズマナブ', maker:'ホンダ', car:'フリード', plate:'松戸 300 ら 1717', tel:'090-1717-2828',
      workType:'shaken', menu:'車検（整備中）', dropType:'drop', frontStaff:'社長', staff:'山田', bayId:BAY.pit4f,
      loanerId:'L02', loanerFrom:T(-2), loanerTo:T(0), needLoaner:true }),

    // ───────── 本日 返車予定（作業完了済・洗車待ちなど）─────────
    card({ id:'c040', reserveDate:T(-2), reserveTime:'10:00', returnDate:T(0), status:'workDone', boardId:'default',
      customer:'山崎 修', kana:'ヤマザキオサム', maker:'トヨタ', car:'ハリアー', plate:'野田 300 わ 8001', tel:'090-8001-9002',
      workType:'general', menu:'一般整備', dropType:'drop', frontStaff:'椎名', staff:'山田', needWash:true }),
    card({ id:'c041', reserveDate:T(-3), reserveTime:'09:30', returnDate:T(0), status:'workDone', boardId:'import',
      customer:'森 豊', kana:'モリユタカ', maker:'BMW', car:'118i', plate:'習志野 330 ほ 4400', tel:'080-4400-5511',
      workType:'shaken', menu:'車検', dropType:'drop', frontStaff:'チーフ', staff:'山根', needWash:true,
      loanerId:'L05', loanerFrom:T(-3), loanerTo:T(0), needLoaner:true }),
    card({ id:'c042', reserveDate:T(-1), reserveTime:'14:00', returnDate:T(0), status:'workDone', boardId:'default',
      customer:'池田 清', kana:'イケダキヨシ', maker:'ダイハツ', car:'ムーヴ', plate:'柏 580 み 6262', tel:'090-6262-7373',
      workType:'oil', menu:'オイル交換', dropType:'wait', frontStaff:'専務', staff:'山田' }),

    // ───────── 廃車・乗替（特殊終端）─────────
    card({ id:'c050', reserveDate:T(-12), reserveTime:'10:00', returnDate:T(-9), status:'scrap', boardId:'default',
      customer:'橋本 直子', kana:'ハシモトナオコ', maker:'日産', car:'マーチ', plate:'野田 500 ぬ 3003', tel:'090-3003-4004',
      workType:'general', menu:'廃車手続き', dropType:'drop', frontStaff:'椎名', staff:'椎名' }),
    card({ id:'c051', reserveDate:T(-10), reserveTime:'14:00', returnDate:T(-6), status:'scrap', boardId:'import',
      customer:'阿部 学', kana:'アベマナブ', maker:'メルセデス', car:'GLA', plate:'習志野 300 え 7007', tel:'080-7007-8008',
      workType:'general', menu:'乗替（下取り）', dropType:'drop', frontStaff:'蓮沼', staff:'蓮沼' }),

    // ───────── 長期預かり（整備ダッシュボードの「預かりが長い」アラート用）─────────
    card({ id:'c060', reserveDate:T(-11), reserveTime:'10:00', returnDate:'', status:'parts', boardId:'default',
      customer:'石川 隆', kana:'イシカワタカシ', maker:'トヨタ', car:'プリウス', plate:'千葉 300 す 1212', tel:'090-1212-1313',
      workType:'shaken', menu:'車検 ／ 部品入荷待ち', dropType:'drop', frontStaff:'椎名', staff:'山田', bayId:BAY.no2,
      loanerId:'L09', loanerFrom:T(-11), loanerTo:'', needLoaner:true, urgent:true,
      log:[{ label:'メーカー欠品・納期未定', at: Date.now()-3600000*72, manual:true, staff:'椎名' }] }),
    card({ id:'c061', reserveDate:T(-14), reserveTime:'14:00', returnDate:'', status:'estim', boardId:'import',
      customer:'前田 誠', kana:'マエダマコト', maker:'VW', car:'ティグアン', plate:'習志野 330 せ 3434', tel:'080-3434-3535',
      workType:'bp', menu:'板金塗装 ／ 保険確認中', dropType:'drop', frontStaff:'チーフ', staff:'山根', bayId:BAY.pit3,
      loanerId:'L13', loanerFrom:T(-14), loanerTo:'', needLoaner:true, codeRed:true,
      log:[{ label:'保険会社の認定待ち', at: Date.now()-3600000*100, manual:true, staff:'チーフ' }] }),

    // ───────── 実績（確定売上・当月／実績ビュー）─────────
    card({ id:'c100', reserveDate:T(-2), reserveTime:'10:00', returnDate:T(-2), status:'returned', boardId:'default',
      customer:'藤田 亮', kana:'フジタリョウ', maker:'ホンダ', car:'フィット', plate:'野田 500 て 2002', tel:'090-2002-3003',
      workType:'general', menu:'バッテリー交換', dropType:'wait', frontStaff:'蓮沼', staff:'山田',
      amountFinal:18500, completedAt:T(-2) }),
    card({ id:'c101', reserveDate:T(-3), reserveTime:'14:00', returnDate:T(-3), status:'returned', boardId:'default',
      customer:'後藤 博之', kana:'ゴトウヒロユキ', maker:'トヨタ', car:'カローラ', plate:'柏 300 く 4404', tel:'080-4404-5505',
      workType:'shaken', menu:'車検一式', dropType:'drop', frontStaff:'社長', staff:'山田',
      amountFinal:134200, completedAt:T(-3) }),
    card({ id:'c102', reserveDate:T(-5), reserveTime:'09:00', returnDate:T(-5), status:'returned', boardId:'import',
      customer:'小川 修', kana:'オガワオサム', maker:'BMW', car:'523d', plate:'習志野 330 ら 6606', tel:'090-6606-7707',
      workType:'general', menu:'一般整備（ブレーキパッド）', dropType:'drop', frontStaff:'チーフ', staff:'山根',
      amountFinal:88000, completedAt:T(-5) }),
    card({ id:'c103', reserveDate:T(-6), reserveTime:'10:30', returnDate:T(-6), status:'returned', boardId:'default',
      customer:'岡田 豊', kana:'オカダユタカ', maker:'スズキ', car:'ワゴンR', plate:'松戸 580 さ 8808', tel:'080-8808-9909',
      workType:'12pt', menu:'12点点検', dropType:'wait', frontStaff:'専務', staff:'山田',
      amountFinal:56000, completedAt:T(-6) }),
    card({ id:'c104', reserveDate:T(-8), reserveTime:'13:00', returnDate:T(-7), status:'returned', boardId:'import',
      customer:'長谷川 清', kana:'ハセガワキヨシ', maker:'メルセデス', car:'Eクラス', plate:'習志野 300 め 1101', tel:'090-1101-2202',
      workType:'bp', menu:'板金塗装（フロントドア）', dropType:'drop', frontStaff:'箱崎', staff:'山根',
      amountFinal:165000, completedAt:T(-7) }),

    // ───────── 顧客「履歴」が見える例（同じ人＝同じ顧客ID/ナンバーで複数回）─────────
    //   過去に車検で来店 → 今回オイルで再来店（顧客ビューの履歴・呼び出しに出る）
    card({ id:'c110', reserveDate:T(-95), reserveTime:'10:00', returnDate:T(-93), status:'returned', boardId:'default',
      customerId:'cu_repeat_endo', customer:'遠藤 翔太', kana:'エンドウショウタ', maker:'トヨタ', car:'ノア', plate:'野田 500 し 5005', tel:'090-5005-6006',
      workType:'shaken', menu:'車検一式', dropType:'drop', frontStaff:'椎名', staff:'山田',
      amountFinal:128000, completedAt:T(-93) }),
    card({ id:'c111', reserveDate:T(0), reserveTime:'14:00', returnDate:T(0), status:'reserved', boardId:'default',
      customerId:'cu_repeat_endo', customer:'遠藤 翔太', kana:'エンドウショウタ', maker:'トヨタ', car:'ノア', plate:'野田 500 し 5005', tel:'090-5005-6006',
      workType:'oil', menu:'オイル交換（リピーター）', dropType:'wait', frontStaff:'椎名', staff:'椎名' }),
  ];

  // ───────── 代車の割当（代車カレンダー・空き判定が使う）─────────
  //   カード側の loanerId/From/To と一致させる
  state.loanerAssigns = state.cards
    .filter(c => c.loanerId && c.loanerFrom)
    .map(c => ({ loanerId: c.loanerId, cardId: c.id, fromDate: c.loanerFrom, toDate: c.loanerTo || T(7) }));

  // ───────── 付箋ボード（全体タスク）のサンプル ─────────
  state.boardNotes = [
    { id:'bn_s1', title:'代車L7 返却後すぐ洗車', body:'伊藤様 ハスラー入庫前に間に合わせる', color:'red', noteType:'execute',
      deadline:T(0), memberUids:['shiina'], doneByUids:[], authorUid:'chief', status:'open', order:0, imageURL:'', replies:[] },
    { id:'bn_s2', title:'(株)亨子会 警告灯の件 折り返しTEL', body:'午前中に一報。担当：蓮沼', color:'orange', noteType:'execute',
      deadline:T(0), memberUids:['hasunuma'], doneByUids:[], authorUid:'hasunuma', status:'open', order:1, imageURL:'',
      replies:[{ id:'rep_s1', uid:'hasunuma', text:'10時に着信。折り返し待ち。', at: Date.now()-3600000*2 }] },
    { id:'bn_s3', title:'部品棚の整理（手すき時間で）', body:'2課の棚、月末までに片付け', color:'blue', noteType:'execute',
      deadline:null, memberUids:['hakozaki','sugaya'], doneByUids:[], authorUid:'chief', status:'open', order:2, imageURL:'', replies:[] },
    { id:'bn_s4', title:'【回覧】来週水曜は臨時休業', body:'設備点検のため。各自確認お願いします。', color:'green', noteType:'circulate',
      deadline:T(4), memberUids:['shacho','senmu','shiina','chief','hasunuma'], doneByUids:['shacho','shiina'],
      authorUid:'shacho', status:'open', order:3, imageURL:'', replies:[] },
    { id:'bn_s5', title:'代車置き場の清掃 完了', body:'', color:'yellow', noteType:'execute',
      deadline:null, memberUids:['hayashi'], doneByUids:[], authorUid:'onishi', status:'done', doneAt: Date.now()-3600000*20, doneByUid:'hayashi', order:4, imageURL:'', replies:[] },
  ];
  /* ===================================================================
     🟠 v1.79.0（ゆうた指定）**デモ版は「明らかに架空」の中身にする。**
     -------------------------------------------------------------------
     🗣「カード見て混同しないように 名前はデモ山とかデモ田とかにして
        車もテストA とかテストBとか 実写名を使わないように」
     🔴 上のカードは1枚ずつ手で書いてある（画面の見え方を作り込んだ見本）。
        **書き直すのではなく、できあがったカードの「名前・車・番号・電話」だけを後から塗り替える。**
        ＝見本の並び・工程・金額はそのまま＝デモでも画面がちゃんと埋まる。
     ⚠ 判定は `pitIsDemo()`（demo-pit.js）1本。demo-pit.js は index.html でこのファイルより前に読む。
     ⚠ 電話番号は 000-0000-XXXX ＝**練習中に本当にかけてしまう事故**を防ぐ。
     🔴 塗り替えるのは**見た目の文字だけ**。id・日付・工程・金額には触らない。
     =================================================================== */
  if (window.pitIsDemo && window.pitIsDemo()) {
    (function maskForDemo(){
      const SEI = ['デモ山','デモ田','デモ川','デモ本','サンプル','テス川','テス田','レンシュウ'];
      const MEI = [['一郎','イチロウ'],['二郎','ジロウ'],['三郎','サブロウ'],['四郎','シロウ'],
                   ['五郎','ゴロウ'],['花子','ハナコ'],['桃子','モモコ'],['太郎','タロウ']];
      const SEI_KANA = { 'デモ山':'デモヤマ','デモ田':'デモタ','デモ川':'デモカワ','デモ本':'デモモト',
                         'サンプル':'サンプル','テス川':'テスカワ','テス田':'テスタ','レンシュウ':'レンシュウ' };
      const KOKU_MK = ['デモ自動車','サンプル自動車','テスト自工'];
      const KOKU    = ['テストA','テストB','テストC','テストD','テストE','テストF','テストG','テストH'];
      const YUNYU   = [['デモ輸入','テストX'],['デモ輸入','テストY'],['サンプル輸入','テストZ']];
      const PLACES  = ['デモ','サンプル','テスト','レンシュウ'];
      const CLS = ['300','500','580','330'];
      const KANA = ['あ','い','う','か','き','く','さ','す','せ','た'];
      const pick = (a, i) => a[i % a.length];
      const d4 = i => String((i * 1379 + 1023) % 10000).padStart(4, '0');

      state.cards.forEach(function (c, i) {
        /* 法人（office あり）は法人らしさを残す＝画面の作りが変わらないように */
        if (c.office) {
          c.office = 'デモ商事(株)'; c.customer = c.office; c.kana = 'デモショウジ';
          c.sei = ''; c.mei = '';
        } else if (c.customer) {
          const sei = pick(SEI, i), mei = pick(MEI, i);
          c.customer = sei + ' ' + mei[0];
          c.kana = SEI_KANA[sei] + mei[1];
          if (c.sei !== undefined) c.sei = sei;
          if (c.mei !== undefined) c.mei = mei[0];
        }
        if (c.maker || c.car) {
          if (c.boardId === 'import') { const y = pick(YUNYU, i); c.maker = y[0]; c.car = y[1]; }
          else { c.maker = pick(KOKU_MK, i); c.car = pick(KOKU, i); }
        }
        if (c.plate) c.plate = pick(PLACES, i) + ' ' + pick(CLS, i) + ' ' + pick(KANA, i) + ' ' + d4(i);
        if (c.tel) c.tel = '000-0000-' + d4(i);
        if (Array.isArray(c.contacts)) c.contacts.forEach(function (t, k) { if (t && t.tel) t.tel = '000-0000-' + d4(i + k + 1); });
      });

      /* 付箋にも人の名前・車種が書いてある（本文は手書きの見本） */
      const NOTE = {
        '代車L7 返却後すぐ洗車'          : 'デモ山様 テストA 入庫前に間に合わせる',
        '(株)亨子会 警告灯の件 折り返しTEL': '午前中に一報。担当：蓮沼'
      };
      (state.boardNotes || []).forEach(function (n) {
        if (NOTE[n.title] !== undefined) n.body = NOTE[n.title];
        n.title = n.title.replace('(株)亨子会', 'デモ商事(株)');
      });
    })();
  }

  if (!state.boardLabels) state.boardLabels = { red:'緊急', orange:'今日中', yellow:'今週中', green:'連絡', blue:'余裕' };
})();
