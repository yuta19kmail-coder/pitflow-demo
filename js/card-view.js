/* ========================================
   card-view.js  -  予約確定後カード詳細（読み取り主体・2カラム・タブ）
   ----------------------------------------
   設計＝モック「構成案11」。openCard(modal) から renderCardView() を呼ぶ。
   既存フォーム（renderCardForm）は新規予約(page)＋「<i data-ic=pencil data-ics=16></i> 予約を編集」で温存。
   クラス名は衝突回避のため全て cv- 接頭辞。state/db は既存の保存に乗る
   （新フィールドは sample-data.js の card() 既定＋ここで || フォールバック）。
   公開：window.renderCardView / openCardEditForm / cv*（各操作）
   ======================================== */
(function () {
  'use strict';

  let _c = null;            // 現在開いているカード
  let _mechEditOpen = {};   // <i data-ic=user data-ics=16></i> 返車後カードで担当を「編集」表示にしているか（id→true）v0.129.0
  /* 🔴 v1.67.1 「返車日未定」のチェックを外している最中か（この画面だけの印・保存しない）。
     ⚠ v1.66.0 では「日付が空ならチェックON」と、データから逆算していた。
        だから外しても、描き直した瞬間にまた付いてしまい**永久に外せなかった**（ゆうた報告）。
        日付欄も使えないままなので、日付を入れて外すことすらできない＝袋小路。
     ✅ 「これから日付を入れるつもり」は**データに書けない気持ち**なので、画面だけで覚える。
        保存する項目は増やしていない（v1.66.0 の決めごとはそのまま）。 */
  let _retTbdOff = false;
  let _retTbdFor = '';      // どのカードに対しての印か（別のカードを開いたら忘れる）
  /* 🆕 v1.73.0（ゆうた指定）表紙の「金額の並び」「返車日の並び」を**あとから直す**ための開閉。
     ◎困っていたこと＝工程が進むと、前の段階で入れた金額や日付が画面から消えて直せなかった。
       ・概算 金額／概算 預かり日数 … 入庫したら「予約を編集」からしか触れない
       ・見積もり金額・受注金額 … その工程を過ぎると入力欄が消える
       ・予定 返車日（B） … 受注完了のポップアップでしか入れられず、あとから直す入口が無かった
     ◎決めごと（ゆうた）
       🔴 直せるのは**通った段階だけ**。まだ来ていない先の段階は今までどおり出さない
          （確定 返車日・返車時間は「作業完了」に入ってから＝v1.66.0 の決めごとを崩さない）。
       🔴 概算も直せる。概算 返車日（A）は「入庫日＋概算 預かり日数」の自動計算なので**日数のほうを直す**。
     ⚠ 開いている／閉じているは**画面だけの状態**（保存しない）。別のカードを開いたら閉じる。 */
  let _chainEditMoney = false, _chainEditDate = false, _chainEditFor = '';
  const DOW = ['日','月','火','水','木','金','土'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function save(){ try { if (window.PitDB) PitDB.save(); } catch(e){} }
  // 返車日/時間・金額などを直したら、背後で開いている実績ボード等も描き直して反映する（モーダルは別レイヤーなので閉じない）v0.118.1
  function cvRefreshBg(){ try { if (window.showView && window.state && state.currentView) showView(state.currentView); } catch(e){} }
  function yen(n){ return (n==null||n==='') ? '' : '¥' + Number(n).toLocaleString(); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function isoToday(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parseISO(s){ if(!s) return null; const p=String(s).split('-'); if(p.length<3) return null; return new Date(+p[0],+p[1]-1,+p[2]); }
  function fmtMD(s){ const d=parseISO(s); if(!d) return s||''; return (d.getMonth()+1)+'/'+d.getDate()+'('+DOW[d.getDay()]+')'; }
  function daysBetween(aISO,bISO){ const a=parseISO(aISO),b=parseISO(bISO); if(!a||!b) return null; return Math.round((b-a)/86400000); }

  // ---- 各種マスタ参照 ----
  function workType(c){ return (state.workTypes||[]).find(w=>w.id===c.workType) || null; }
  function dropType(c){ return (state.dropTypes||[]).find(d=>d.id===c.dropType) || null; }
  function teamColor(c){ return c.boardId==='import' ? '#ec4899' : '#1db97a'; }
  /* 代車リミット。
     🔴 v1.82.0 中身は loaner-free.js（`pitLoanerRemainOf` / `pitLoanerLevelOf`）に移した。
        ここは**昔の名前で呼んでいる所のための入口**。新しく書く所は pitLoanerRemainOf を直接使う。
     ⚠ 以前はここが `loanerTo` を引き算するだけで、**代車が返ってきたかを見ていなかった**。
        そのため実績（返車済み）のカードでも「超過◯日」と赤く出ていた。 */
  window.loanerLevel = function(rem){
    return { key: (window.pitLoanerLevelOf ? pitLoanerLevelOf(rem) : (rem==null?'none':(rem<0?'dead':'green'))) };
  };
  window.loanerRem = function(c){
    var r = window.pitLoanerRemainOf ? pitLoanerRemainOf(c) : null;
    if (r) return r.rem;
    var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
    if(!due) return null;
    return daysBetween(isoToday(), due);
  };
  function payMethods(){ return state.paymentMethods || state.paymentTypes || [
    {id:'cash',label:'現金'},{id:'card',label:'カード'},{id:'transfer',label:'振込'},
    {id:'collect',label:'集金'},{id:'finance',label:'ローン'},{id:'later',label:'後払い'}]; }

  // 新フィールド フォールバック（旧 localStorage データ対策）
  function ensure(c){
    if(!c.inspSchedule || typeof c.inspSchedule!=='object') c.inspSchedule = { mode:'manual', slots:{}, cutBefore:'' };
    if(!c.inspSchedule.slots) c.inspSchedule.slots = {};
    if(!c.coverCall || typeof c.coverCall!=='object') c.coverCall = { done:false, at:'', staff:'' };
    if(c.payment == null) c.payment = '';
    if(c.handover == null) c.handover = 'store';
    if(c.handoffMemo == null) c.handoffMemo = '';
    if(c.returnDateFinal === undefined) c.returnDateFinal = null;
    if(c.washNote == null) c.washNote = '';
    if(c.noThanksLine == null) c.noThanksLine = false;
    if(c.returnStage == null) c.returnStage = '';
    if(c.paymentSeparate == null) c.paymentSeparate = false;   // 入金日を分ける（売掛）v0.121.0
    if(c.paymentDate === undefined) c.paymentDate = null;       // 入金日（未入金は null）
    if(c.salesReq == null) c.salesReq = false;
    if(c.salesReqMemo == null) c.salesReqMemo = '';
    if(c.headlight == null) c.headlight = false;
    if(c.coatingOK == null) c.coatingOK = false;
    if(c.tentative == null) c.tentative = false;   // 仮予約フラグ（旧データ対策）v0.100.0
    if(c.approvalPending == null) c.approvalPending = false;   // 🔵 v1.74.0 承認待ちフラグ（旧データ対策）
    return c;
  }

  // ===== 進捗バー =====
  const PH = [['reserved','予約'],['check','点検'],['estim','見積'],['work','作業'],['workDone','完了'],['returned','返車']];
  const PIDX = { reserved:0, check:1, estim:2, contact:2, parts:3, work:3, workDone:4, returned:5, scrap:5 };
  function pbarHtml(c){
    const cur = PIDX[c.status] != null ? PIDX[c.status] : 0;
    let h = '<div class="cv-pbar">';
    PH.forEach(function(p,i){
      const cls = i<cur ? 'done' : (i===cur ? 'now' : '');
      h += '<div class="cv-pstep '+cls+'"><span class="cv-dot">'+(i<cur?'✓':(i===cur?'●':''))+'</span><span class="cv-pl">'+p[1]+'</span>'+(i<PH.length-1?'<span class="cv-seg"></span>':'')+'</div>';
    });
    return h + '</div>';
  }

  // ===== ヘッダー（左カラム） =====
  function leftHtml(c){
    const wt = workType(c);
    const wtColor = wt ? wt.color : '#84cc16';
    const wtLabel = wt ? wt.label : (c.workType||'作業');
    const dt = dropType(c);
    let h = '';

    // 1行目：名前＋新規/リピーター＋予約を編集／2行目にフリガナ（v1.56.0）
    h += '<div class="cv-id1"><span class="cv-nm">'+esc((window.pitCustName?pitCustName(c):c.customer)||'（未入力）')+' <small>様</small></span>'
       + repeatBadge(c)
       + '<span class="cv-editmini cv-idedit" onclick="openCardEditForm(\''+c.id+'\')"><i data-ic=pencil data-ics=16></i> 予約を編集</span></div>';
    h += kanaHtml(c);
    // 2行目：車種＋ナンバー＋カルテNo
    h += '<div class="cv-id2"><span class="cv-car">'+esc(c.car||'（車種未入力）')+'</span>'
       + (c.plate?'<span class="cv-plate">'+esc(c.plate)+'</span>':'')
       + ((c.karteNo||'').trim()?'<span class="cv-karte">'+esc(c.karteNo.trim())+'</span>':'')+'</div>';
    // 3行目：国産/課/担当＋電話(ホバー全件)
    const teamPill = (c.boardId==='import')
      ? '<span class="cv-pill cv-yunyu">輸入車</span>' : '<span class="cv-pill cv-kokusan">国産車</span>';
    const divPill = (c.division==='div2')
      ? '<span class="cv-pill cv-div2">2課</span>' : '<span class="cv-pill cv-div1">1課</span>';
    /* 🔴 v1.56.3（ゆうた報告）ここは**フロント担当**。名前だけ裸で置いていたので、
       下のメモ欄の「予約担当」と見分けが付かなかった。**何の担当か分かる形にする。** */
    const staffPill = (c.frontStaff||c.staff)
      ? '<span class="cv-pill cv-staff" title="フロント担当"><i>フロント</i>'+esc(c.frontStaff||c.staff)+'</span>' : '';
    h += '<div class="cv-id3">'+teamPill+divPill+staffPill+telHtml(c)+lineHtml(c)+'</div>';

    // 車検枠（作業内容コンテナ）
    let badges = '';
    if (dt) badges += (window.pitDropBadges ? pitDropBadges(c, function(o){ return '<span class="cv-bdg cv-drop">'+esc(o.label.length<=1?(o.desc||o.label):o.label)+'</span>'; }) : '<span class="cv-bdg cv-drop">'+esc(dt.label)+'</span>');
    if (c.consult) badges += '<span class="cv-bdg cv-consult"><i data-ic=comment data-ics=16></i> 相談</span>';
    // 特殊（保証/保険）＝作業タイプとセットの時だけ付く。グレーのアウトライン表示 v0.116.0
    if (Array.isArray(c.workSpecials) && c.workSpecials.length){
      c.workSpecials.forEach(function(id){ var lb = window.pitSpecialLabel ? pitSpecialLabel(id) : ''; if (lb) badges += '<span class="cv-bdg cv-special">'+esc(lb)+'</span>'; });
    }
    if (c.earlyDiscount) badges += '<span class="cv-bdg cv-early"><i data-ic=tag data-ics=16></i> 早期割</span>';
    if (!c.needLoaner) badges += '<span class="cv-bdg cv-none">代車なし</span>';
    h += '<div class="cv-wframe" style="border-left-color:'+wtColor+'">'
       + '<div class="cv-wftop"><span class="cv-wftype" style="color:'+wtColor+'"><i data-ic=wrench data-ics=16></i> '+esc(wtLabel)+'</span>'
       + '<span class="cv-wfbadges">'+badges+'</span></div></div>';

    // 代車メーター
    if (c.needLoaner) h += loanerHtml(c);

    // メモ（予約担当＋予約時内容＋引継ぎ）
    h += memoHtml(c);
    // 車両注意（特殊運転）＝該当がある時だけメモの下に表示
    h += driveNoteHtml(c);
    return h;
  }

  /* 🔤 v1.56.0（ゆうた指定）お客様名の下に**フリガナを小さく**出す。
     ⚠ 漢字が空のお客様は、名前の欄そのものがカナ（pitCustName の決まり・v1.25.0）。
        そのまま出すと**同じ文字が2行並ぶ**ので、その時は出さない。
     ⚠ カナは `kana`（合成）が正。まだ持っていない古いカードのために セイ／メイ からも組める。 */
  function kanaOf(c){
    var k = String((c && c.kana) || '').trim();
    if (!k) k = [String((c && c.seiKana) || '').trim(), String((c && c.meiKana) || '').trim()].filter(Boolean).join(' ');
    return k;
  }
  function kanaHtml(c){
    var k = kanaOf(c);
    if (!k) return '';
    var nm = String((window.pitCustName ? pitCustName(c) : (c.customer || '')) || '').trim();
    if (nm === k) return '';                       /* 名前の欄がカナそのもの＝2度出さない */
    return '<div class="cv-kana">'+esc(k)+'</div>';
  }

  /* 🏷 v1.56.0（ゆうた指定）**新規／リピーター**の印。
     🔴 中身は**予約編集で選んだ値そのまま**（`c.repeat` ／ 物差しは `state.repeatTypes`）。
        ここで来店履歴から推測しない＝画面に出す情報と、保存している情報を食い違わせないため
        （v1.53.0 の教訓）。**選んでいなければ何も出さない。** */
  function repeatBadge(c){
    var id = String((c && c.repeat) || '');
    if (!id) return '';
    var it = ((window.state && state.repeatTypes) || []).find(function(r){ return r.id === id; });
    if (!it) return '';
    return '<span class="cv-rep cv-rep-'+esc(id)+'">'+esc(it.label)+'</span>';
  }

  // 車両注意：左ハンドル/M/T/車高低い（card.drive 配列）。1つも無ければ枠ごと非表示
  const DRIVE_LABELS = { leftHand:'左ハンドル', mt:'M/T', lowCar:'車高低い', noShoes:'土足禁止' };
  function driveNoteHtml(c){
    const arr = Array.isArray(c.drive) ? c.drive : [];
    const tags = ['leftHand','mt','lowCar','noShoes'].filter(function(k){ return arr.indexOf(k)>=0; });
    if (!tags.length) return '';
    return '<div class="cv-drvbox"><div class="cv-drvh"><i data-ic=warn data-ics=16></i> 車両注意</div><div class="cv-drvrow">'
      + tags.map(function(k){ return '<span class="cv-drv">'+DRIVE_LABELS[k]+'</span>'; }).join('')
      + '</div></div>';
  }

  // LINE：NG＝地味なピル／登録済＝Lステップボタン（番号あり時）。未案内は出さない。
  function lineHtml(c){
    const st = c.lineStatus || '';
    if (st === 'ng') return '<span class="cv-pill cv-line-ng">LINE NG</span>';
    if (st === 'ok'){
      const id = (c.lstepId || '').trim();
      const url = (id && window.pitLstepUrl) ? pitLstepUrl(id) : '';
      if (url) return '<a class="cv-licon" href="'+esc(url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く">L</a>';
      return '<span class="cv-pill cv-line-ok">LINE登録済</span>';
    }
    return '';
  }
  function telHtml(c){
    const list = (c.contacts && c.contacts.length) ? c.contacts : (c.tel?[{tel:c.tel,label:'電話',primary:true}]:[]);
    if (!list.length) return '';
    const primary = (list.find(x=>x.primary) || list[0]);
    const extra = list.length>1 ? ' <small>+'+(list.length-1)+'</small>' : '';
    let pop = '<span class="cv-telpop"><b>連絡先</b>';
    list.forEach(function(t){ pop += '<span class="cv-tl"><i>'+esc(t.label||'')+(t.primary?'・代表':'')+'</i>'+esc(t.tel||'')+'</span>'; });
    pop += '</span>';
    return '<span class="cv-telwrap"><span class="cv-tel"><i data-ic=phone data-ics=16></i> '+esc(primary.tel||'')+extra+'</span>'+(list.length?pop:'')+'</span>';
  }

  function loanerHtml(c){
    const loaner = (state.loaners||[]).find(l=>l.id===c.loanerId);
    /* 🔴 v1.82.0 返ってきたかは loaner-free.js に聞く（画面で日付を引き算しない） */
    const R = window.pitLoanerRemainOf ? pitLoanerRemainOf(c) : null;
    /* 🚗 v1.56.0（ゆうた指定）ここは**車種名で出す**（「代車5」ではなく「タント」）。
       🔴 呼び名の作り方は loaner.js の `pitLoanerModel()` に一本化＝**ここで組み立てない**。
          （代車カレンダーの「タント（5）」も同じファイルの `_loName` が持っている） */
    const which = (window.pitLoanerModel ? pitLoanerModel(c.loanerId) : '')
               || (loaner ? (loaner.name||'代車') : (c.loanerId||'代車'));
    const back   = !!(R && R.back);
    const dueISO = (R && R.due) || c.loanerTo || c.returnDateFinal || c.returnDate || '';
    const rem    = R ? R.rem : (dueISO ? daysBetween(isoToday(), dueISO) : null);
    /* 🔴 v1.93.0（ゆうた指摘 2026-08-13）**まだ入庫していない予約は、日数を数えない。**
       🗣「予約詳細で代車が**貸し出し開始したカウント**になってる。**入庫済みになってからカウント**して」
       ⚠ 直す前は、車がまだ来ていない予約でも今日と返却予定日を引き算していたので、
          **カレンダー上で貸出期間に入った時点から「あと◯日」が減り始め、過ぎれば赤く「超過」**になった。
          ＝お客様はまだ来ていないのに、返してもらっていないように見える。
       🔴 数えはじめは **入庫済み（status が reserved でなくなった時）**。それまでは「入庫待ち」。
       ⚠ 返却済み（back）だけは、予約のままでも「返却済」と言い切る（先に代車だけ戻った時） */
    const waiting = !back && (c.status === 'reserved');
    const lvKey  = waiting ? 'none'
                 : (R ? R.level : (window.loanerLevel ? loanerLevel(rem).key : 'amber'));
    /* 返ってきていれば日数のカウントはやめて「返却済」と言い切る */
    const remTxt = back ? '返却済'
                 : waiting ? '入庫待ち'
                 : (rem==null) ? '—'
                 : (rem<0 ? '超過'+(-rem)+'日' : 'あと'+rem+'日');
    const pct = back ? 100 : waiting ? 0 : (rem==null) ? 50 : Math.max(8, Math.min(95, 100 - rem*8));
    let extras = '';
    if (c.loanerFixed) extras += '<span class="cv-loxchip cv-fix">車種固定</span>';
    const lmemo = (c.loanerMemo||'');
    if (lmemo) extras += '<span class="cv-loxmemo">'+esc(lmemo)+'</span>';
    /* ⚠ **車は返したのに代車が戻っていない**時は、ちゃんと赤く「超過」と出す＝知らせるべき事故。 */
    const lead = back ? '代車' : waiting ? '代車 貸出予定' : '代車 返却まで';
    /* 🔴 v1.83.0（ゆうた指定）**終わった貸出は「〇/〇〜〇/〇」で出す。**
       ＝「あと何日」ではなく「いつからいつまで借りていたか」が知りたい情報になる。 */
    const per = window.pitLoanerPeriodOf ? pitLoanerPeriodOf(c) : null;
    /* 入庫前は「いつからいつまで貸す予定か」を出す（残り日数の代わり） */
    const dueTxt = back ? ((per && per.text) ? per.text : (dueISO ? (fmtMD(dueISO)+' に返却') : '返却済'))
                 : waiting ? ((per && per.text) ? (per.text + ' の予定')
                            : (dueISO ? ('〜 '+fmtMD(dueISO)+' の予定') : '期間未定'))
                 : (dueISO ? ('〜 '+fmtMD(dueISO)) : '期限未設定');
    return '<div class="cv-lo cv-lev-'+lvKey+'">'
      + '<div class="cv-lomain"><div class="cv-loleft"><div class="cv-lorem">'+lead+'</div><div class="cv-lodays">'+remTxt+'</div></div>'
      + '<div class="cv-loright"><div class="cv-lodue">'+dueTxt+'</div><div class="cv-lowhich">'+esc(which)+'</div>'
      + '<div class="cv-lometer"><i style="width:'+pct+'%"></i></div></div></div>'
      + (extras ? '<div class="cv-loextras">'+extras+'</div>' : '')
      + '</div>';
  }

  function memoLines(text){
    return String(text||'').split('\n').map(function(l){return l.trim();}).filter(Boolean)
      .map(function(l){return '<div class="cv-wl">'+esc(l)+'</div>';}).join('') || '<div class="cv-wl cv-muted">（なし）</div>';
  }
  /* 🔴 v1.56.3（ゆうた報告）**「予約担当」と書いてあるのに、フロント担当の名前が出ていた。**
     予約詳細カードは `c.reserveStaff`（予約を受けた人）を**一度も使っていなかった**。
     ⚠ カードは2人を別々に持っている＝**フロント担当（`frontStaff`）／予約担当（`reserveStaff`）**。
        予約編集の画面にも2つ別々の欄がある。**見出しと中身を必ず一致させること。**
     ⚠ 昔のカードは `c.staff` しか持っていないことがあるので、そこだけ拾う。 */
  function staffPillHtml(label, name){
    if (!name) return '';
    return '<span class="cv-wtt">' + esc(label)
         + ' <span class="cv-pill cv-staff">' + esc(name) + '</span></span>';
  }
  function memoHtml(c){
    const front = c.frontStaff || c.staff || '';
    const resv  = c.reserveStaff || '';
    let top = staffPillHtml('フロント担当', front) + staffPillHtml('予約担当', resv);
    if (!top) top = '<span class="cv-wtt">担当 <span class="cv-pill cv-staff">—</span></span>';
    let h = '<div class="cv-work"><div class="cv-wtop">' + top + '</div>';
    h += '<div class="cv-wsec"><div class="cv-gt">予約時内容</div>'+memoLines(c.menu||c.memo)+'</div>';
    // 引継ぎメモはこの画面から直接入力＝自動保存（予約時内容は新規予約で入れるので編集ボタンのまま）
    h += '<div class="cv-wsec"><div class="cv-gt">引継ぎ・伝達 <small>（入庫後・ここに直接入力できます）</small></div>'
       + '<textarea class="cv-hoinput" placeholder="引継ぎ・伝達を入力（自動で保存されます）" oninput="cvHandoff(this.value)" onchange="cvHandoffSave(this.value)">'+esc(c.handoffMemo||'')+'</textarea></div>';
    return h + '</div>';
  }

  /* 🔴 v1.56.0（ゆうた指定）**まだ入庫していない＝予約の段階**か。
     この間は 表紙／フロー／整備／バックオフィス を出さず、「予約詳細」1枚だけにする。
     ⚠ 物差しは工程（status）ひとつ＝**仮予約も、入庫日が未定のものも「予約」に含む**。
        点検待ち（check）に入った瞬間から、今までどおりの4タブに戻る。
     ⚠ 昔のカードは status を持っていないことがあるので、その時も「予約」とみなす。 */
  function isReserveStage(c){ return String((c && c.status) || 'reserved') === 'reserved'; }
  window.pitIsReserveStage = isReserveStage;

  /* 📋 予約詳細＝上に「概算 預かり日数／概算 金額」を大きく、その下にフロー。
     🔴 フローは **flowTab() をそのまま引っ張ってくる**＝写しを作らない。
        （タイムライン・アクション記録の入口・消すボタンまで、フロータブと中身は同じ）
        ⚠ 写しにすると片方だけ直して食い違う（v1.54.0 の教訓）。 */
  function reserveTab(c){
    const d = c.estHoldDays, a = c.estAmount;
    const dTxt = (d == null || d === '') ? '—'
               : (Number(d) === 0 ? '当日仕上げ' : esc(String(d)) + '<small>日</small>');
    const aTxt = (a == null || a === '') ? '—' : '¥' + Number(a).toLocaleString();
    let h = '<div class="cv-sec cv-rsv">';
    h += '<div class="cv-rsvhead"><i data-ic=clipboard data-ics=16></i> 予約の概算</div>';
    h += '<div class="cv-rsvbig">'
       + '<div class="cv-rsvb"><div class="cv-rsvbl">概算 預かり日数</div><div class="cv-rsvbv">' + dTxt + '</div></div>'
       + '<div class="cv-rsvb"><div class="cv-rsvbl">概算 金額</div><div class="cv-rsvbv">' + aTxt + '</div></div>'
       + '</div>';
    h += '<div class="cv-rsvnote">診断・見積もりで変わります。直すのは「予約を編集」から。</div>';
    h += '</div>';
    h += flowTab(c);   /* 🔴 フローは共通のものを引っ張る（ここに書き写さない） */
    return h;
  }

  /* 📦 アーカイブ済みの帯（v1.136.0・ゆうた確定）
     🔴 **顧客・車両と同じで、いちばん上に帯**。開いた瞬間に「終わった車だ」と分かる。
     🔴 判定は `PitArchive.cardArchived` の1本（ここに条件を書かない）。
     ⚠ 帯には**状態だけ**を書く。「見るだけです」などの説明は入れない（ゆうた指定）。
        できる／できないは、押した時の窓で分かる。 */
  function archBarHtml(c){
    if (!(window.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c))) return '';
    return '<div class="cv-archbar"><i data-ic=box data-ics=16></i> '
         + esc(PitArchive.cardArchiveNote ? PitArchive.cardArchiveNote(c) : 'アーカイブ済み') + '</div>';
  }

  // ===== 右カラム＝タブ本体 =====
  function rightHtml(c){
    /* 🔵 v1.74.0 承認待ちなら、いちばん上に承認バー（承認する入口はここ1つだけ）。
       ⚠ 予約段階でも、入庫してしまったあとでも同じ場所に出る＝取り残さない。 */
    let h = (window.pitApprovalBarHtml ? pitApprovalBarHtml(c) : '') + archBarHtml(c) + pbarHtml(c);
    /* 🔴 v1.56.0 予約の段階は「予約詳細」だけ。表紙・整備・バックオフィスはまだ出す意味がない。 */
    if (isReserveStage(c)){
      h += '<div class="cv-tabs cv-tabs-one">'
        + '<button class="cv-tab on" data-p="resv" onclick="cvTab(this)"><i data-ic=clipboard data-ics=16></i> 予約詳細</button></div>';
      h += '<div class="cv-body"><div class="cv-panel on" id="cv-p-resv">'+reserveTab(c)+'</div></div>';
      return h;
    }
    h += '<div class="cv-tabs">'
      + '<button class="cv-tab on" data-p="cover" onclick="cvTab(this)"><i data-ic=pencil data-ics=16></i> 表紙</button>'
      + '<button class="cv-tab" data-p="flow" onclick="cvTab(this)"><i data-ic=clock data-ics=16></i> フロー</button>'
      + '<button class="cv-tab" data-p="maint" onclick="cvTab(this)"><i data-ic=wrench data-ics=16></i> 整備</button>'
      + '<button class="cv-tab" data-p="office" onclick="cvTab(this)"><i data-ic=folder data-ics=16></i> バックオフィス</button></div>';
    h += '<div class="cv-body">'
      + '<div class="cv-panel on" id="cv-p-cover">'+coverTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-flow">'+flowTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-maint">'+maintTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-office">'+officeTab(c)+'</div>'
      + '</div>';
    return h;
  }

  /* 🔴 v1.66.0 確定返車日（C）を出してよいか＝**作業完了に入ってから**（ゆうた指定）。
     ここ1か所で決める。画面のあちこちで status を並べない。 */
  function cvCanFixReturn(c){ return !!c && (c.status === 'workDone' || c.status === 'returned' || !!c.returnStage); }

  /* ===================================================================
     💰 金額の並び（概算 → 見積 → 受注 → 確定）＝物差しは この3つの表だけ。
     🔴 v1.73.0 で表を関数の外へ出した。理由＝「いまどの段階か」を
        並びの表示と、あとから直す編集ブロックの**両方**が見るため。
        中で組み立て直すと、片方だけ直して食い違う（＝写しの罠）。
     =================================================================== */
  const AMT_KINDS = [['est','概算','estAmount'],['quote','見積','amountQuote'],['order','受注','amountOrder'],['final','確定','amountFinal']];
  const AMT_CUR   = { check:'quote', estim:'quote', contact:'order', parts:'final', work:'final', workDone:'final' };
  const AMT_LABEL = { est:'概算 金額', quote:'見積もり金額', order:'受注金額', final:'確定金額（請求額）' };

  /* 🆕 v1.73.0 「いまの工程までに通った段階」＝あとから直してよい欄（ゆうた指定）。
     ・概算はいつでも直せる（予約のときの読みなので、あとで直したい場面がある）
     ・先の段階は返さない＝作業前に確定金額を入れられる、が起きない */
  function amtOpenKinds(c){
    const cur = AMT_CUR[c && c.status] || ((c && c.status === 'returned') ? 'final' : null);
    const out = ['est'];
    if (!cur) return out;                       /* 予約・キャンセル等＝概算だけ */
    for (let i = 1; i < AMT_KINDS.length; i++){
      out.push(AMT_KINDS[i][0]);
      if (AMT_KINDS[i][0] === cur) break;
    }
    return out;
  }

  /* 金額1つぶんの入力欄。🔴 いまの工程の欄も、あとから直す欄も**これ1本**で作る。
     （id は cv-amt-◯ で1画面に1つ＝編集ブロックを開いている間は下の直接入力を出さない） */
  function amtEditRow(c, kind, suffix){
    const f = AMT_FIELD[kind], v = c[f];
    const s = (v != null && v !== '') ? Number(v).toLocaleString() : '';
    return '<div class="cv-fixrow"><div class="cv-frt">' + AMT_LABEL[kind] + (suffix || '') + '</div><div class="cv-frb">'
      + '<span class="cv-yenmark">¥</span><input class="cv-fixinput cv-money" id="cv-amt-'+kind+'" type="text" inputmode="numeric" value="'+esc(s)+'" data-prev="'+esc(s)+'" oninput="cvAmtChange(\''+kind+'\')"></div>'
      + '<div class="pt-tax" id="cv-tax-'+kind+'">'+(window.pitTaxHint?pitTaxHint(s):'')+'</div>'
      + '<div class="cv-fixconfirm" id="cv-amtconfirm-'+kind+'">金額を <b id="cv-amtnew-'+kind+'"></b> に変更しますか？ <button class="cv-ok" onclick="cvAmtOK(\''+kind+'\')">OK</button><button class="cv-ng" onclick="cvAmtNG(\''+kind+'\')">取消</button></div></div>';
  }

  /* 並びの右端に置く ✏編集 */
  function chainEditBtn(which, on){
    return '<button type="button" class="cv-chedit'+(on?' on':'')+'" id="cv-chedit-'+which+'" onclick="cvChainEdit(\''+which+'\')" title="あとから直す">'
         + '<i data-ic=pencil data-ics=13></i> 編集</button>';
  }

  /* 💰 あとから直す＝金額 */
  function moneyEditBox(c){
    /* 実績カードの確定金額は、下の「確定売上金額」がロック＋✏編集を持っている。
       同じ欄を2つ出すと、片方が古い数字のまま残る＝写し。だからここでは出さない。 */
    const kinds = amtOpenKinds(c).filter(function(k){ return !(c.status === 'returned' && k === 'final'); });
    let h = '<div class="cv-editbox" id="cv-ebox-money"><div class="cv-ebhead"><span><i data-ic=pencil data-ics=14></i> 金額を直す</span>'
          + '<button type="button" class="cv-ebclose" onclick="cvChainEdit(\'money\')">閉じる</button></div>'
          + '<div class="cv-ebnote">いまの工程までに通った欄だけ出しています。入れるのは<b>税抜</b>です。</div>'
          + '<div class="cv-ebgrid">' + kinds.map(function(k){ return amtEditRow(c, k); }).join('') + '</div>';
    if (c.status === 'returned') h += '<div class="cv-ebnote">確定金額（請求額）は、この下の「確定売上金額」から直せます。</div>';
    return h + '</div>';
  }

  /* 📅 あとから直す＝返車日
     🔴 確定（C）と返車時間は**この下の専用欄が持っている**ので、ここには置かない（写しを作らない）。
        ここが持つのは「概算 預かり日数（＝A の材料）」と「予定 返車日（B）」の2つだけ。 */
  function dateEditBox(c){
    const A = window.pitReturnA ? pitReturnA(c) : '';
    const hold = (c.estHoldDays == null || c.estHoldDays === '') ? '' : String(c.estHoldDays);
    const B = window.pitReturnB ? pitReturnB(c) : (c.returnDatePlan || '');
    let h = '<div class="cv-editbox" id="cv-ebox-date"><div class="cv-ebhead"><span><i data-ic=pencil data-ics=14></i> 返車日を直す</span>'
          + '<button type="button" class="cv-ebclose" onclick="cvChainEdit(\'date\')">閉じる</button></div>'
          + '<div class="cv-ebgrid">'
          + '<div class="cv-fixrow"><div class="cv-frt">概算 預かり日数（概算 返車日はここから自動）</div><div class="cv-frb">'
          + '<input class="cv-fixinput" id="cv-esthold" type="text" inputmode="numeric" style="width:84px" value="'+esc(hold)+'" onchange="cvEstHold(this.value)">'
          + '<span class="cv-plan">日</span><span class="cv-arr">→</span>'
          + '<span class="cv-plan" id="cv-estretday">概算 返車日 '+(A?fmtMD(A):'—')+'</span></div></div>'
          + '<div class="cv-fixrow"><div class="cv-frt">予定 返車日（お客様に伝えた約束の日）</div><div class="cv-frb">'
          + '<input class="cv-fixinput" id="cv-retplan" type="date" value="'+esc(B)+'" onchange="cvSetPlanReturn(this.value)"></div></div>'
          + '</div>';
    h += '<div class="cv-ebnote">' + (cvCanFixReturn(c)
          ? '確定 返車日と返車時間は、この下の欄で直せます。'
          : '確定 返車日と返車時間は<b>作業完了</b>に入ってから出ます（完TELで決まる日なので、先に入れられないようにしています）。')
       + '</div>';
    return h + '</div>';
  }

  function coverTab(c){
    // 💰 金額＝概算→見積もり→受注→確定 を1行チェーン表示（表示のみ／直すのは右端の ✏編集 から）。
    const KINDS = AMT_KINDS;
    const curKind = AMT_CUR[c.status] || null;
    const KIND_LABEL = AMT_LABEL;
    const moneyStr = function(v){ return (v!=null&&v!=='') ? '¥'+Number(v).toLocaleString() : '—'; };
    let chain = KINDS.map(function(k, i){
      const arrow = i>0 ? '<span class="cv-amarr">→</span>' : '';
      return arrow + '<span class="cv-aseg'+(k[0]===curKind?' cur':'')+'"><span class="cv-alb">'+k[1]+'</span><span class="cv-aval" id="cv-chv-'+k[0]+'">'+moneyStr(c[k[2]])+'</span></span>';
    }).join('');
    /* 📅 v1.65.0（ゆうた指定）返車日＝概算→予定→確定 を1行チェーン表示（金額と同じ形・表示のみ）。
       ⚠ **印刷するカルテ表紙は触っていない**（予約が入った時点で刷るので、予定・確定の頃には刷り直さない）。
       物差しは return-slot.js の `pitReturnDates` 1本。ここで日付を組み立てないこと。 */
    const RD = window.pitReturnDates ? pitReturnDates(c) : { a:'', b:'', c:'' };
    const RKINDS = [
      ['a','概算', RD.a, '入庫日＋概算 預かり日数（自動）'],
      ['b','予定', RD.b, '受注のときにお客様へ伝えた返車予定日'],
      ['c','確定', RD.c, '完TELのときに決まった確定返車日（返車カレンダーはこれで動く）']
    ];
    const curD = RD.c ? 'c' : (RD.b ? 'b' : 'a');
    const dstr = function(v){ return v ? (window.fmtMD ? fmtMD(v) : v) : '—'; };
    let dchain = RKINDS.map(function(k, i){
      const arrow = i>0 ? '<span class="cv-amarr">→</span>' : '';
      return arrow + '<span class="cv-aseg'+(k[0]===curD?' cur':'')+'" title="'+esc(k[3])+'"><span class="cv-alb">'+k[1]+'</span><span class="cv-aval">'+dstr(k[2])+'</span></span>';
    }).join('');
    if (RD.c && c.returnTime) dchain += '<span class="cv-dtime"><i data-ic=clock data-ics=14></i> '+esc(c.returnTime)+'</span>';

    // 🤝 外注欄（status==='outsource' のとき自動追加：どこに出しているか／メモ／完了予定日＝戻りの日数）
    let osSec = '';
    if (c.status === 'outsource'){
      const partners = (state.settings && state.settings.outsourcePartners) || [];
      const needNote = (c.outsourceTo === '各ディーラー' || c.outsourceTo === 'その他');
      const opts = partners.map(function(p){ return '<option value="'+esc(p)+'"'+(p===c.outsourceTo?' selected':'')+'>'+esc(p)+'</option>'; }).join('');
      /* 🔴 v1.58.0 起点は**フローの記録**（pitPhaseStartMs）。写し（phaseAt）を直接見ない。 */
      const _inMs = window.pitPhaseStartMs ? pitPhaseStartMs(c) : (c.phaseAt || null);
      /* 🔴 v1.59.0 数え方は views.js の pitDayNoMs に一本化（**カレンダー基準・入った日が1日目**）。
         ⚠ v1.58.0 まではここだけ「経過24時間」で数えていたので、夕方入庫だと翌日もまだ1日目だった。 */
      const inN = window.pitDayNoMs ? pitDayNoMs(_inMs) : ((_inMs != null) ? (Math.floor((Date.now()-_inMs)/86400000)+1) : null);
      let dueInfo = '—';
      if (c.outsourceDue){
        const n = window.daysFromToday ? daysFromToday(c.outsourceDue) : null;
        dueInfo = '完了予定 '+fmtMD(c.outsourceDue)+(n!=null ? '（'+(n>0?'あと'+n+'日':(n===0?'本日':Math.abs(n)+'日超過'))+'）' : '');
      }
      osSec = '<div class="cv-sec"><div class="cv-sect"><i data-ic=external data-ics=16></i> 外注</div>';
      osSec += '<div class="cv-fixrow"><div class="cv-frt">外注先（どこに出しているか）</div><div class="cv-frb">'
        + '<select class="cv-fixinput" onchange="cvOutPartner(this.value)">'+opts+'</select>'
        + (inN!=null ? '<span class="cv-plan">外注 '+inN+'日目</span>' : '') + '</div></div>';
      osSec += '<div class="cv-fixrow" id="cv-outnote-row" style="'+(needNote?'':'display:none')+'"><div class="cv-frt">メモ（例：トヨタ〇〇店）</div><div class="cv-frb">'
        + '<input class="cv-fixinput" type="text" value="'+esc(c.outsourceNote||'')+'" placeholder="店名など" onchange="cvOutNote(this.value)" style="width:220px"></div></div>';
      osSec += '<div class="cv-fixrow"><div class="cv-frt">完了予定日（戻りの日数）／カレンダーで選択</div><div class="cv-frb">'
        + '<span class="cv-plan" id="cv-outdue-info">'+dueInfo+'</span><span class="cv-arr">→</span>'
        + '<input class="cv-fixinput" type="date" value="'+esc(c.outsourceDue||'')+'" onchange="cvOutDue(this.value)"></div></div>';
      osSec += '</div>';
    }
    /* 🆕 v1.73.0 並びの右端に ✏編集 を1つずつ（ゆうた指定・案1＝押すとすぐ下に入力欄が開く）。 */
    let h = osSec + '<div class="cv-sec">'
          + '<div class="cv-chainline"><div class="cv-amchain">'+chain+'</div>'+chainEditBtn('money', _chainEditMoney)+'</div>'
          + (_chainEditMoney ? moneyEditBox(c) : '')
          + '<div class="cv-chainline"><div class="cv-amchain cv-dchain">'+dchain+'</div>'+chainEditBtn('date', _chainEditDate)+'</div>'
          + (_chainEditDate ? dateEditBox(c) : '');
    /* 今のフェーズの金額だけ、返車予定と同じサイズの入力欄を出す（概算は自動なので入力なし）。
       ⚠ 編集ブロックを開いている間は出さない＝**同じ欄が画面に2つ**にならないようにする。 */
    if (curKind && curKind !== 'est' && !_chainEditMoney){
      h += amtEditRow(c, curKind, '／直接入力');
    }
    // 💳 入金日を分ける（売掛）＝金額欄の下に。ON で入金日欄が出る。実績前はここで、実績後は完了アーカイブで操作 v0.121.0
    if (c.status !== 'returned') h += paymentControlHtml(c);
    // 実績（返車完了）に移行したら、上のフロー（チェーン）はそのままに、確定売上金額を返車日と同じロックスタイルで表示。✏️編集でその場で直せる v0.118.0
    if (c.status === 'returned'){
      const fa = c.amountFinal;
      const faStr = (fa!=null&&fa!=='') ? Number(fa).toLocaleString() : '';
      /* 🔴 v1.99.0 売上なしでアーカイブした車＝金額の欄より先に、数えていないことを言い切る */
      /* ⚠ v1.136.0 「売上なしでアーカイブ済み（日付・人）」はいちばん上の帯（`archBarHtml`）へ移した。
         同じことを2か所に書かない。ここは**金額の読み方**だけを言う。 */
      if (window.pitCardNoSale && pitCardNoSale(c)){
        h += '<div class="cv-nosalenote">来店履歴には残りますが、<b>実績・売上・台数には数えていません</b>。'
          + '下の金額は途中まで入れていた額で、どこにも数えていません。</div>';
      }
      h += '<div class="cv-fixrow cv-fixlocked"><div class="cv-frt">確定売上金額（請求額） <span class="cv-locktag"><i data-ic=lock data-ics=16></i> 確定</span> <button type="button" class="cv-unlockbtn" onclick="cvUnlockFinal()"><i data-ic=pencil data-ics=16></i> 編集</button></div><div class="cv-frb">'
        + '<span class="cv-fixval" id="cv-finlock">'+(faStr?('¥'+faStr):'—')+'</span>'
        + '<span class="cv-unlockwrap" id="cv-finedit" style="display:none">'
          + '<span class="cv-yenmark">¥</span><input class="cv-fixinput cv-money" id="cv-amt-final" type="text" inputmode="numeric" value="'+esc(faStr)+'" data-prev="'+esc(faStr)+'" oninput="cvAmtChange(\'final\')">'
          + '<div class="pt-tax" id="cv-tax-final">'+(window.pitTaxHint?pitTaxHint(faStr):'')+'</div>'
          + '<div class="cv-fixconfirm" id="cv-amtconfirm-final">金額を <b id="cv-amtnew-final"></b> に変更しますか？ <button class="cv-ok" onclick="cvAmtOK(\'final\')">OK</button><button class="cv-ng" onclick="cvAmtNG(\'final\')">取消</button></div>'
        + '</span></div></div>';
    }
    const finRet = c.returnDateFinal || '';
    if (c.status === 'returned'){
      // 実績移行後の返車日も確定情報としてロック（表示のみ）。✏️編集でその場で直せる v0.117.0/0.118.0
      const shownRet = c.returnDateFinal || c.returnDate || '';
      const retStr = (shownRet?fmtMD(shownRet):'—')+(c.returnTime?('　'+esc(c.returnTime)):'');
      /* 🔴 v1.57.0 実績になったカードの**返車日を直すと、実績カウント日も一緒に動く**（元からの作り）。
         つまりここを誰でも触れると「実績日は管理だけ」の鍵が意味を失う。**同じ鍵をかける。**
         ⚠ 実績になる前（返車待ちなど）の返車日は、今までどおり誰でも直せる（下の else の側）。 */
      h += '<div class="cv-fixrow cv-fixlocked"><div class="cv-frt">確定 返車日 <span class="cv-locktag"><i data-ic=lock data-ics=16></i> 確定</span> '
        + (canEditResultDate()
            ? '<button type="button" class="cv-unlockbtn" onclick="cvUnlockReturn()"><i data-ic=pencil data-ics=16></i> 編集</button>'
            : '<span class="cv-adminonly"><i data-ic=lock data-ics=14></i> 管理のみ</span>')
        + '</div><div class="cv-frb">'
        + '<span class="cv-fixval" id="cv-retlock">'+retStr+'</span>'
        + '<span class="cv-unlockwrap" id="cv-retedit" style="display:none">'
          + '<span class="cv-plan">予定 '+(c.returnDate?fmtMD(c.returnDate):'—')+'</span><span class="cv-arr">→</span>'
          + '<input class="cv-fixinput" type="date" value="'+esc(finRet)+'" onchange="cvSetReturn(this.value)">'
          + '<input class="cv-fixinput" type="text" value="'+esc(c.returnTime||'')+'" placeholder="時間 未定" onchange="cvReturnTime(this)" style="width:150px;margin-left:8px">'
        + '</span></div></div>';
      h += resultDateRow(c);
      h += '</div>';
    } else if (cvCanFixReturn(c)){
      /* 🔴 v1.66.0（ゆうた指定）**確定返車日（C）と返車時間は「作業完了」に入ってからしか出さない。**
         C は完TELのときに決まる値なので、作業前に入力欄が見えていると先に入れられてしまう。
         ⚠ 作業前の「お客様への約束」は B（返車予定日）＝受注完了のポップアップで入れる。上のチェーンに出ている。 */
      /* 🔴 v1.67.1 チェックが付くのは「日付が空」かつ「いま外しにいっていない」ときだけ。
         外した直後は日付欄が使えるようになり、日付を入れるまで外れたまま。 */
      const _tbd = (!c.returnDate && !finRet) && !_retTbdOff;
      h += '<div class="cv-fixrow"><div class="cv-frt">確定 返車予定日／カレンダーで選択</div><div class="cv-frb">'
        + '<span class="cv-plan">予定 '+(window.pitReturnB && pitReturnB(c) ? fmtMD(pitReturnB(c)) : '—')+'</span><span class="cv-arr">→</span>'
        + '<input class="cv-fixinput" id="cv-retdate" type="date" value="'+esc(finRet || c.returnDate || '')+'"'+(_tbd?' disabled':'')+' onchange="cvSetReturn(this.value)">'
        /* 🔴 v1.66.0 返車日未定のチェック（完TELポップアップと同じ考え方＝**日付が空、それだけ**。新しい保存項目は増やさない） */
        + '<label class="cv-tbdchk"><input type="checkbox" id="cv-rettbd"'+(_tbd?' checked':'')+' onchange="cvReturnDateTbd(this.checked)"> 返車日未定</label>'
        + '</div></div>';
      /* 返車時間＝**新規予約・完TELとまったく同じ入力ガイド**（打ち込み／ピッカー／ショートカット）。
         🔴 中身は return-slot.js の共通部品。ここでHTMLを書き写さない（v1.60.0 の決めごと）。 */
      h += '<div class="cv-fixrow cv-fixrow-time"><div class="cv-frt">返車時間</div><div class="cv-frb">'
        + '<span class="cv-timeslot" id="cv-time-slot">'
        + (window.pitTimeGuideHtml
            ? pitTimeGuideHtml(c.returnTime || '', { list: window.PIT_RETURN_TIME_QUICK, cls: 'cv-timeguide' })
            : '<input class="cv-fixinput" type="text" value="'+esc(c.returnTime||'')+'" placeholder="未定" onchange="cvReturnTime(this)" style="width:210px">')
        + '</span></div></div></div>';
    } else {
      h += '</div>';
    }
    // 💳 入金（売掛）＝実績カードは確定売上金額・返車日と同じロック行テイストで表示（入金済＝🔒確定・入金待ち＝オレンジ）v0.122.0
    if (c.status === 'returned') h += paymentLockRow(c);

    // 🛒 車販部門への依頼（車販依頼/ヘッドライト磨き/コーティング受注OK）＝車販作業ビューのトリガー
    const _csIds = (Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:(c.workType?[c.workType]:[]);
    const _csShaken = (c.workType==='shaken' || _csIds.indexOf('shaken')>=0);
    const _csCoat = (_csIds.indexOf('coat1y')>=0 || _csIds.indexOf('coat3m')>=0);
    if (c.status === 'returned'){
      // 実績＝完TEL・支払い・洗車・お礼LINE・車販依頼などをまとめて読み取り専用のアーカイブ表示 v0.120.0
      h += archiveHtml(c, _csShaken, _csCoat);
    } else {
      h += '<div class="cv-sec"><div class="cv-sect"><i data-ic=cart data-ics=16></i> 車販部門への依頼</div>';
      if (_csShaken) h += pickRow('車検ライト磨き', [['1','する'],['0','しない']], c.headlight?'1':'0', 'headlight');
      if (_csCoat)   h += pickRow('コーティング受注', [['1','OK'],['0','—']], c.coatingOK?'1':'0', 'coatingok');
      h += pickRow('車販依頼', [['1','あり'],['0','なし']], c.salesReq?'1':'0', 'salesreq');
      h += '<div class="cv-pickrow"><span class="cv-pk">依頼メモ</span><div class="cv-chips" style="flex:1">'
         + '<input class="cv-fixinput" type="text" value="'+esc(c.salesReqMemo||'')+'" placeholder="車販への依頼（1行・任意）" onchange="cvSalesMemo(this.value)" style="flex:1;min-width:180px"></div></div>';
      h += '</div>';
    }

    // 車検スケジュール / 実施記録（車検タイプのみ表示）
    if (_csShaken){
      const _si = c.inspSchedule || {};
      const _rcH = (Array.isArray(_si.history)?_si.history:[]).filter(function(x){return x&&x.result==='recheck';});
      const _slT = function(sl){ return sl==='pm'?'PM':'AM'; };
      /* 🔴 v1.120.0（ゆうた指定）**済にした時点で、陸運局とラウンドも予約詳細に残す。**
         ⚠ 担当は前から出ていた。足すのは「どこへ行ったか」と「何Rだったか」。
         ⚠ 読み方は pit-share.js の物差し（`pitShakenOffice` / `pitShakenRound`）。
            陸運局の名前は **CoreMembers が正**・控えの写しは後ろ盾だけ。ここで組み立て直さない。
         ⚠ 再検の記録にも、その回の陸運局とRが入っている（v1.119.0〜）。古い記録には入っていないので、
            **入っているものだけ**出す（無いものを「未定」と書かない＝2026-08-13 の決めごと）。 */
      const _ofOf = function(o){ return o ? ((window.pitLocName?pitLocName(o.office||''):'') || o.officeName || '') : ''; };
      const _rdOf = function(o){ var n = o ? Number(o.round) : 0; return (n>=1&&n<=4) ? n+'R' : ''; };
      const _rcTxt = _rcH.map(function(r){
        /* 🔴 v1.127.0 カード詳細は**フルネーム**（ゆうた指定）。狭い枠だけ通称＆苗字。 */
      var ex = [ (r.staff ? (window.pitStaffFull?pitStaffFull(r.staff):r.staff) : ''), _ofOf(r), _rdOf(r) ].filter(Boolean).join('・');
        return (window.fmtMD?fmtMD(r.date):r.date)+' '+_slT(r.slot)+(ex?'・'+esc(ex):'');
      }).join('　');
      if (_si.result==='done'){
        // 済＝「いつ行く？」は非表示。実施サマリのみ。
        const _of = window.pitShakenOffice ? pitShakenOffice(c) : _ofOf(_si);
        const _rd = window.pitShakenRound  ? pitShakenRound(c)  : 0;
        h += '<div class="cv-sec"><div class="cv-sect"><i data-ic=search data-ics=16></i> 車検</div>'
          + '<div class="cv-shdone"><div class="cv-shdone-main"><i data-ic=check data-ics=16></i> 車検済　'+ (_si.resultDate&&window.fmtMD?fmtMD(_si.resultDate):(_si.resultDate||'')) +'　'+ _slT(_si.resultSlot) +'　<span class="cv-shstaff">担当（回送）：'+ esc((window.pitShakenStaffFull?pitShakenStaffFull(c):(_si.resultStaff||''))||'—') +'</span></div>'
          + '<div class="cv-shwhere"><span class="cv-shw"><i data-ic=location data-ics=15></i> 陸運局：'+ esc(_of||'—') +'</span>'
          + '<span class="cv-shw"><i data-ic=clock data-ics=15></i> ラウンド：'+ (_rd? _rd+'R' : '—') +'</span></div>'
          + (_rcH.length? '<div class="cv-shrc">再検 '+_rcH.length+'回：'+_rcTxt+'</div>':'')
          + '<button class="cv-shbtn ghost" onclick="cvShakenReopen()">↩ 済を取り消す</button></div></div>';
      } else {
        h += '<div class="cv-sec"><div class="cv-sect"><i data-ic=calendar data-ics=16></i> 車検スケジュール（AI配車の材料・MHSへ）</div>'
          + '<div class="cv-csched"><div class="cv-cspick"><label>いつ行く？</label>'
          + '<select id="cv-csmode" onchange="cvCsMode(this.value)">'
          + opt('manual','日程を指定（手動）',c) + opt('asap','理由があって最短で行きたい',c)
          + opt('thisweek','今週中ならどこでも',c) + opt('nextweek','来週中ならどこでも',c)
          + opt('ask','可能かどうか聞いてください',c) + opt('undecided','未定',c)
          + '</select></div>'
          + '<div class="cv-csbanner" id="cv-csbanner"></div>'
          + '<div class="cv-cstrack" id="cv-cstrack"></div>'
          + '<div class="cv-cslegend"><i><span class="cv-sw" style="background:#6db0ec"></span>土＝陸運局休</i><i><span class="cv-sw" style="background:#ff8c8c"></span>日祝＝陸運局休</i><i><span class="cv-sw" style="background:var(--bg4)"></span>自社定休</i><i><span class="cv-sw" style="background:var(--brand)"></span>選択中</i></div>'
          + '<div class="cv-cshelp">AM/PM を押して行ける枠を選択。土日祝・自社定休は選べません。プルダウンで一括指定も可。</div>'
          + (_rcH.length? '<div class="cv-shrc">↺ 再検履歴 '+_rcH.length+'回：'+_rcTxt+'</div>':'')
          + '<div class="cv-shact"><button class="cv-shbtn ok" onclick="cvShakenGo(\'done\')"><i data-ic=check data-ics=16></i> 車検済にする</button>'
          + '<button class="cv-shbtn re" onclick="cvShakenGo(\'recheck\')">↺ 再検を記録</button></div>'
          + '</div></div>';
      }
    }

    // 表紙チェック（編集式）＝実績（returned）では上の「完了アーカイブ」に集約済みなので出さない v0.120.0
    if (c.status !== 'returned'){
      const pm = payMethods();
      h += '<div class="cv-sec"><div class="cv-sect"><i data-ic=phone data-ics=16></i> 表紙チェック（手書き表紙のデジタル版）</div>';
      h += pickRow('完TEL', [['done','済'],['ng','未']], c.coverCall.done?'done':'ng', 'call')
         + (c.coverCall.done && c.coverCall.at ? '<div class="cv-callat">'+esc(c.coverCall.at)+(c.coverCall.staff?'・'+esc(c.coverCall.staff):'')+'</div>' : '');
      h += pickRow('支払い', pm.map(function(p){return [p.id,p.label];}), c.payment, 'pay');
      h += pickRow('洗車', [['1','要'],['0','不要']], c.needWash?'1':'0', 'wash');
      h += '<div class="cv-pickrow"><span class="cv-pk">洗車備考</span><div class="cv-chips" style="flex:1">'
         + '<input class="cv-fixinput" type="text" value="'+esc(c.washNote||'')+'" placeholder="洗車の備考（1行・任意）" onchange="cvWashNote(this.value)" style="flex:1;min-width:180px"></div></div>';
      h += pickRow('お礼LINE', [['1','要'],['0','不要']], c.noThanksLine?'0':'1', 'line');
      h += '<div class="cv-hint">※ パターン（型）で選ぶ方式。選択肢は将来 <i data-ic=settings data-ics=16></i>設定で増減できる想定。</div></div>';
    }
    return h;
  }
  /* 実績（返車済み）カード用：完TEL・支払い・洗車・お礼LINE・車販依頼などを読み取り専用でまとめて表示 v0.120.0 */
  /* ===================================================================
     📆 v1.57.0（ゆうた指定）**実績カウント日**＝売上をどの日に数えるか（`completedAt`）。
     -------------------------------------------------------------------
     ・実績（返車済み）になったカードだけに出る。
     ・🔴 **直せるのは設定権限（管理）を持っている人だけ。** ほかの人には**日付が見えるだけ**。
     ・🔴 ゆうた指定＝**実績日を変えたら、返車日も一緒に動かす**（returnDate / returnDateFinal も揃える）。
       ⚠ 逆（確定返車日を直す）も元から実績日を動かす作りなので、**どちらから触っても2つはズレない**。
     ⚠ 売上の数字が動く操作なので、**フローと操作ログに必ず「どこから どこへ」を残す**。
     ⚠ 物差しは `pitIsAdmin()`。サンプルモードでは今までどおり全部さわれる。
     =================================================================== */
  function canEditResultDate(){
    if (!window.PIT_CLOUD) return true;                 /* 練習用サイトは全部さわれる */
    return !!(window.pitIsAdmin && pitIsAdmin());
  }
  function resultDateRow(c){
    const cur = c.completedAt || '';
    const shown = cur ? fmtMD(cur) : '—';
    let h = '<div class="cv-fixrow cv-fixlocked cv-resdate"><div class="cv-frt">実績カウント日 <small>（売上をこの日に数えます）</small>'
          + ' <span class="cv-locktag"><i data-ic=lock data-ics=16></i> 確定</span>';
    if (canEditResultDate()){
      h += ' <button type="button" class="cv-unlockbtn" onclick="cvUnlockResult()"><i data-ic=pencil data-ics=16></i> 編集</button>';
    } else {
      h += ' <span class="cv-adminonly"><i data-ic=lock data-ics=14></i> 管理のみ</span>';
    }
    h += '</div><div class="cv-frb">'
       + '<span class="cv-fixval" id="cv-reslock">' + shown + '</span>';
    if (canEditResultDate()){
      h += '<span class="cv-unlockwrap" id="cv-resedit" style="display:none">'
         + '<input class="cv-fixinput" type="date" id="cv-resinput" value="' + esc(cur) + '" onchange="cvSetResultDate(this.value)">'
         + '<span class="cv-resnote">返車日も同じ日に揃います</span>'
         + '</span>';
    }
    return h + '</div></div>';
  }
  window.cvUnlockResult = function(){
    var v = document.getElementById('cv-reslock'), e = document.getElementById('cv-resedit');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
  };
  window.cvSetResultDate = function(v){
    if (!_c) return;
    if (!canEditResultDate()){
      if (window.UI && UI.alert) UI.alert('実績カウント日を直せるのは、設定権限（管理）のある人だけです。', { title: '変更できません' });
      return;
    }
    v = String(v || '').trim();
    if (!v) return;                                  /* 空にはしない＝実績から消えてしまう */
    const before = _c.completedAt || '（なし）';
    if (v === _c.completedAt) return;
    _c.completedAt = v;
    /* 🔴 ゆうた指定：返車日も一緒に動かす */
    _c.returnDate = v;
    _c.returnDateFinal = v;
    try { if (window.logFlow) logFlow(_c, '実績カウント日を ' + before + ' → ' + v + ' に変更（返車日も同じ日に）'); } catch(e){}
    try {
      if (window.pitLog) pitLog('実績カウント日を変更', { cardId: _c.id, kind: 'result',
        label: ((window.pitCustName?pitCustName(_c):_c.customer) || '') + ' 様' + (_c.car ? ' / ' + _c.car : '') + '　' + before + ' → ' + v });
    } catch(e){}
    save(); cvRefreshBg();
    if (window.pitToast) pitToast('実績カウント日を ' + v + ' にしました（返車日も揃えました）');
    if (window.renderCardView) renderCardView(_c, 'md-body-modal');
  };

  function archiveHtml(c, csShaken, csCoat){
    function row(label, valueHtml){ return '<div class="cv-arow"><span class="cv-ak">'+esc(label)+'</span><span class="cv-av">'+valueHtml+'</span></div>'; }
    function done(on){ return on ? '<span class="cv-adone">済</span>' : ''; }
    var pm = payMethods();
    var pobj = pm.find(function(x){ return x.id === c.payment; });
    var rows = '';
    var cc = c.coverCall || {};
    rows += row('完TEL', cc.done
      ? '<b class="cv-aok">済</b>'+(cc.at?' <span class="cv-asub">'+esc(cc.at)+(cc.staff?'・'+esc(cc.staff):'')+'</span>':'')
      : '<span class="cv-amuted">未</span>');
    if (pobj) rows += row('支払い', esc(pobj.label));
    rows += row('洗車', c.needWash
      ? '要 '+done(c.washSalesDone)+(c.washNote?' <span class="cv-asub">'+esc(c.washNote)+'</span>':'')
      : '<span class="cv-amuted">不要</span>');
    rows += row('お礼LINE', c.noThanksLine ? '<span class="cv-amuted">不要</span>' : '要');
    var sales = [];
    if (csShaken && c.headlight) sales.push('ヘッドライト磨き'+(c.headlightDone?'（済）':''));
    if (csCoat && c.coatingOK)  sales.push('コーティング受注'+(c.coatingDone?'（済）':''));
    if (c.salesReq)             sales.push('車販依頼'+(c.salesReqDone?'（済）':''));
    rows += row('車販への依頼', sales.length ? esc(sales.join(' ／ ')) : '<span class="cv-amuted">なし</span>');
    if ((c.salesReqMemo||'').trim()) rows += row('依頼メモ', esc(c.salesReqMemo));
    return '<div class="cv-sec"><div class="cv-sect"><i data-ic=box data-ics=16></i> 完了アーカイブ <span class="cv-asect-note">（返車済み・記録）</span></div><div class="cv-arch">'+rows+'</div></div>';
  }
  /* 💳 入金（売掛）のロック行＝確定売上金額・返車日と同じテイスト。入金済＝🔒確定＋日付／入金待ち＝オレンジ／分けない＝返車時。✏️で編集 v0.122.0 */
  function paymentLockRow(c){
    var tag='', val, btn;
    if (c.paymentSeparate && c.paymentDate){
      tag = '<span class="cv-locktag"><i data-ic=lock data-ics=16></i> 確定</span>';
      val = '<span class="cv-fixval" id="cv-paylock">'+fmtMD(c.paymentDate)+'</span>';
      btn = '<i data-ic=pencil data-ics=16></i> 編集';
    } else if (c.paymentSeparate){
      val = '<span class="cv-fixval" id="cv-paylock"><span class="cv-paywait"><i data-ic=hourglass data-ics=15></i> 入金待ち</span></span>';
      btn = '<i data-ic=pencil data-ics=16></i> 編集';
    } else {
      val = '<span class="cv-fixval" id="cv-paylock"><span class="cv-amuted">返車時に入金</span></span>';
      btn = '<i data-ic=pencil data-ics=16></i> 売掛にする';
    }
    var label = (c.paymentSeparate && c.paymentDate) ? '入金日' : '入金';
    return '<div class="cv-fixrow cv-fixlocked"><div class="cv-frt">'+label+' '+tag+' <button type="button" class="cv-unlockbtn" onclick="cvUnlockPay()">'+btn+'</button></div><div class="cv-frb">'
      + val
      + '<span class="cv-unlockwrap" id="cv-payedit" style="display:none">'+paymentControlHtml(c)+'</span></div></div>';
  }
  /* 💳 入金日を分ける（売掛）コントロール＝チェック＋（ON時）入金日ピッカー。金額欄と完了アーカイブで共用 v0.121.0 */
  function paymentControlHtml(c){
    var h = '<div class="cv-payctl"><label class="cv-paychk"><input type="checkbox" '+(c.paymentSeparate?'checked':'')+' onchange="cvTogglePaySeparate(this.checked)"> 入金日を分ける（売掛）</label>';
    if (c.paymentSeparate){
      h += '<span class="cv-payin">入金日 <input class="cv-fixinput" type="date" value="'+esc(c.paymentDate||'')+'" onchange="cvSetPaymentDate(this.value)">'
         + (c.paymentDate ? '' : ' <span class="cv-paywait">入金待ち</span>') + '</span>';
    }
    return h + '</div>';
  }
  function opt(v,label,c){ return '<option value="'+v+'"'+(c.inspSchedule.mode===v?' selected':'')+'>'+label+'</option>'; }
  function pickRow(label, opts, cur, group){
    let chips = opts.map(function(o){
      return '<span class="cv-chip'+(String(cur)===String(o[0])?' on':'')+'" onclick="cvPick(\''+group+'\',\''+o[0]+'\',this)">'+esc(o[1])+'</span>';
    }).join('');
    return '<div class="cv-pickrow"><span class="cv-pk">'+esc(label)+'</span><div class="cv-chips">'+chips+'</div></div>';
  }

  /* 🔴 v1.43.0 ゆうた指定＝**用件を足すのはこの「カード詳細」のフロー欄**。
     （「予約を編集」の方のフローは、すでに入っている記録の日時・担当を直す“本当の編集”に回した） */
  function flowTab(c){
    const log = c.log || [];
    let h = '<div class="cv-sec"><div class="cv-sect"><i data-ic=clock data-ics=16></i> フロー（進捗ログ）</div><div class="cv-flow">';
    if (!log.length){ h += '<div class="cv-wl cv-muted">記録はまだありません。</div>'; }
    else log.map(function(e,i){ return {e:e,i:i}; }).reverse().forEach(function(r){
      var e = r.e, _i = r.i;
      var pad=function(n){return(n<10?'0':'')+n;};
      // 時刻：数値タイムスタンプは M/D HH:MM に整形（旧ログ対策）
      // ⚠ v1.43.0 読み方は PitFlowLog.atText に一本化（記録の形が3通りあるため）
      var when = window.PitFlowLog ? PitFlowLog.atText(e) : (e.atTxt || e.at || '');
      if (typeof when === 'number'){ var dd=new Date(when); when=(dd.getMonth()+1)+'/'+dd.getDate()+' '+pad(dd.getHours())+':'+pad(dd.getMinutes()); }
      var title, amtTxt='';
      if (e.type === 'phase'){
        var fl = window.statusLabel ? statusLabel(e.from) : e.from;
        var tl = window.statusLabel ? statusLabel(e.to)   : e.to;
        title = e.from ? (esc(fl)+' <span class="cv-farrow">→</span> '+esc(tl)) : (esc(tl)+' へ');
        if (e.amount != null && e.amount !== '') amtTxt = '　'+(e.amountKind||'')+' ¥'+Number(e.amount).toLocaleString();
      } else {
        /* 🔴 v1.42.0 古い記録には <i data-ic=…> の文字がそのまま入っていることがある。
           **データは書き換えず**、描く時に線画アイコンへ読み替える（新規予約カード側と同じ）。 */
        title = (window.icoText ? icoText(e.text || e.label || '') : esc(e.text || e.label || ''));
      }
      var who = window.PitFlowLog ? PitFlowLog.byOf(e) : (e.by || '');
      /* 手で足した記録だけ ✕ を付ける＝打ち間違いをその場で消せる（自動の工程記録は残す） v1.43.0 */
      var del = (window.PitFlowLog && PitFlowLog.isManual(e))
        ? '<button type="button" class="cv-fdel" title="この記録を消す" onclick="pitFlowDel(\''+esc(c.id)+'\','+_i+')">'+(window.ico?ico('close',15):'×')+'</button>' : '';
      h += '<div class="cv-frow done"><span class="cv-fdot"></span><div class="cv-fmain"><div class="cv-ft">'+title+(amtTxt?'<span class="cv-famt">'+esc(amtTxt)+'</span>':'')+'</div><div class="cv-fd">'+esc(String(when)+(who?' ・ '+who:''))+'</div></div>'+del+'</div>';
    });
    h += '</div>';
    /* === 用件を足す（チップ／自由入力）＝ここが入口 v1.43.0 === */
    if (window.PitFlowLog) h += PitFlowLog.addHtml(c, 'cv');
    h += '<div class="cv-fhint">記録した日時や担当を直すのは「予約を編集」→フロー（設定権限のある人だけ）。</div>';
    return h + '</div>';
  }
  /* フローの面だけ描き直す＝タブも巻物の位置もそのまま（整備タブの _mechRerender と同じ考え方）
     🔴 v1.56.0 予約の段階はフローが「予約詳細」の中に居る。**両方を見る**こと
        （片方しか見ないと、アクションを記録しても画面が変わらない）。 */
  window.cvFlowRepaint = function(){
    if (!_c) return;
    const el = document.getElementById('cv-p-flow');
    if (el) el.innerHTML = flowTab(_c);
    const rv = document.getElementById('cv-p-resv');
    if (rv) rv.innerHTML = reserveTab(_c);
  };

  /* 🔧 作業チェック（v1.100.0・ゆうた指定で中身を入れ替えた）
     🔴 **項目は state.js の `PIT_MAINT_CHECKS` 1本。ここに書き写さないこと。**
        予約を編集の画面（card-tabs.js）も**同じ表**を見る＝2つの画面で食い違わない。
     🔴 **保存は合言葉（key）。番号で持たない**（項目を足すと過去のチェックがずれるため）。
     ⚠ 作業タイプでは中身を変えない（車検でも一般整備でも同じ7つ）。 */
  function maintTab(c){
    const items = window.PIT_MAINT_CHECKS || [];
    const n = window.pitMaintDoneCount ? pitMaintDoneCount(c) : 0;
    const h2 = items.map(function(it){
      const on = window.pitMaintChecked ? pitMaintChecked(c, it.key) : false;
      return '<div class="cv-chk'+(on?' on':'')+'" onclick="cvMaint(\''+it.key+'\',this)"><span class="cv-box">'+(on?'✓':'')+'</span>'+esc(it.label)+'</div>';
    }).join('');
    return mechSectionHtml(c)
      + '<div class="cv-sec"><div class="cv-sect"><i data-ic=wrench data-ics=16></i> 作業チェック</div>'
      + '<div class="cv-prog">'+n+' / '+items.length+' 完了</div><div class="cv-checks">'+h2+'</div></div>';
  }

  /* ===== 🧑‍🔧 作業担当（点検担当者／整備担当者） =====
     🔴 v1.67.0（ゆうた確定・動かせるモックで4案くらべて **案B** に決定）
        **名前のチップをタップするだけ**で入る。もう一度タップで **×2・×3…**＝その人の取り分が増える。✕ で外す。
        ⚠ 前はプルダウンを縦に足す形で、**「同じ人を2回選ぶ＝重み」がどこにも書いていなかった**ので、
           知らない人には「間違えて2回選んだ」ようにしか見えなかった。チップなら **×2 が数字で見える**。
        ◎ 現場のいちばん多い形（「今日は蓮沼と箱崎」）が **1タップずつで終わる**のがねらい。

     🔴 **配分（％）はライブ**。前は**返車済みになってから**しか出ていなかったが、
        タップするたびにその場で計算し直す。

     🔴 **金額は出さない**（ゆうた指定）。
        「最終確定はまだ出ていないし、金額を見るとやっぱり自分の方がちょっと多いかな？とか思っちゃうから％だけに」
        ＝ 配分の**割合**だけを見せる。金額の内訳が要るときは 作業サマリー（管理側の集計）で見る。

     ・保持＝`c.inspectors[]` / `c.mechanics[]`（名前の配列・重複OK）＋ `inspectorIds` / `mechanicIds`。
       **持ち方は今までと同じ**。入れ方の見た目だけ変えた（過去のカードもそのまま読める）。
     ・配分計算は mech-summary.js の `pitMechAlloc` 1本。ここで計算しない。 */
  /* 🔴 v1.97.0 担当者のチップは **js/mech-pick.js の1か所** に出した。
     作業完了に入れた時の注意ポップアップでも**まったく同じもの**を使うため。
     ⚠ ここに書き写さないこと（2か所にあると必ず片方だけ直って食い違う）。 */
  const MECH_MAX = (window.PitMechPick ? PitMechPick.MAX : 10);
  function mechOpts(){ return window.PitMechPick ? PitMechPick.options() : []; }
  function mechPicker(c, role, title, icon){
    return window.PitMechPick ? PitMechPick.blockHtml(c, role, title, icon, 'cv') : '';
  }
  function mechSectionHtml(c){
    let h = '<div class="cv-sec"><div class="cv-sect"><i data-ic=user data-ics=16></i> 作業担当（点検・整備）</div>';
    /* 🔴 チップ・説明・配分バー（ライブ）は部品1本（mech-pick.js）から。 */
    h += (window.PitMechPick ? PitMechPick.html(c, 'cv', { liveId: 'cv-mech-live' }) : '');
    h += '</div>';
    return h;
  }
  function _mechRerender(){ const el = document.getElementById('cv-p-maint'); if (el && _c) el.innerHTML = maintTab(_c); }
  /* 🔴 v1.97.0 チップを押された時、ここへ返ってくる（保存して整備タブを描き直す）。
     押した時の中身そのものは mech-pick.js が持っている。 */
  if (window.PitMechPick) PitMechPick.on('cv', function(){ save(); _mechRerender(); });
  /* v1.8.0：名前と同じ並びで「メンバーの番号」も持つ（inspectorIds / mechanicIds）。
     改名しても実績が別人に割れないようにするため。番号が取れない人は '' が入る。 */
  function _idKey(role){ return role === 'inspectors' ? 'inspectorIds' : 'mechanicIds'; }
  function _idOf(name){ const m = (name && window.pitStaffByName) ? pitStaffByName(name) : null; return m ? m.id : ''; }
  function _mechArrs(role){
    if (!Array.isArray(_c[role])) _c[role] = [];
    const ik = _idKey(role);
    if (!Array.isArray(_c[ik])) _c[ik] = _c[role].map(function(n){ return _idOf(n); });
    return { arr: _c[role], ids: _c[ik] };
  }
  /* 🔴 v1.67.0 チップをタップ＝1枠増やす（同じ人をもう一度なら ×2・×3…＝取り分が増える） */
  window.cvMechTap = function(role, name){
    if (!_c || !name) return;
    const A = _mechArrs(role);
    if (A.arr.length >= MECH_MAX) return;
    A.arr.push(name); A.ids.push(_idOf(name));
    save();
    _mechRerender();
  };
  /* ✕ ＝その人を全部外す（×2 でも1回で消える。押し直しの手間を作らない） */
  window.cvMechOff = function(role, name){
    if (!_c || !name) return;
    const A = _mechArrs(role);
    for (let i = A.arr.length - 1; i >= 0; i--){
      if (A.arr[i] === name){ A.arr.splice(i, 1); A.ids.splice(i, 1); }
    }
    save();
    _mechRerender();
  };
  /* 旧UI（プルダウン）から呼ばれていた口。過去の画面が残っていても落ちないように残す。 */
  window.cvMechPick = function(role, idx, val){
    if (!_c) return;
    const A = _mechArrs(role);
    if (idx >= A.arr.length){ if (val && A.arr.length < MECH_MAX){ A.arr.push(val); A.ids.push(_idOf(val)); } }
    else if (val === ''){ A.arr.splice(idx, 1); A.ids.splice(idx, 1); }
    else { A.arr[idx] = val; A.ids[idx] = _idOf(val); }
    save(); _mechRerender();
  };
  window.cvMechToggleEdit = function(id){ _mechEditOpen[id] = !_mechEditOpen[id]; _mechRerender(); };

  function officeTab(c){
    const items = ['入金処理','原価チェック','ファイルバラシ'];
    const done = (c.office && c.office.checks) || {};
    let n=0; const h2 = items.map(function(it,i){
      const on = !!done[i]; if(on) n++;
      return '<div class="cv-chk'+(on?' on':'')+'" onclick="cvOffice('+i+',this)"><span class="cv-box">'+(on?'✓':'')+'</span>'+esc(it)+'</div>';
    }).join('');
    return '<div class="cv-sec"><div class="cv-sect"><i data-ic=folder data-ics=16></i> バックオフィス（事務の締め）</div>'
      + '<div class="cv-prog">'+n+' / '+items.length+' 完了</div><div class="cv-checks">'+h2+'</div></div>';
  }

  /* ===== ⋮メニューの中身（v1.99.0・ゆうた指定で整理した） =====
     ◎前まで＝「仮予約にする」＋「フェーズ移動」4つ＋「削除する…」
     ◎これから
       ・**入庫済み以降**（＝タスクボードに乗っている車）＝
          **予約に戻す ／ 売上なしでアーカイブする ／ 消去する** の3つだけ
       ・**まだ入庫していない予約**＝今までどおり「仮予約にする／本予約に確定する」＋消去する
       ・**もう終わった車**（実績・売上なし・廃車）＝消去するだけ

     🔴🔴 v1.136.0（ゆうた確定・2026-08-18）**アーカイブ済みの車は分けて扱う。**
        判定は `PitArchive.cardArchived(c)` の1本（＝顧客・車両と同じ置き場所）。
        アーカイブ済み ＝ **アーカイブから戻す（管理者だけ）／消去する（誰でも・2枚聞く）**
        ⚠ いま `cardArchived` が拾うのは**売上なしアーカイブだけ**。
           実績・キャンセル・未入庫・廃車は、そのステージを決めた時に `archive-pit.js` へ足す。

     🔴 **フェーズ移動は廃止した。** 工程はドラッグか ◀▶ で動かす。
        ここから直接飛ばすと、**金額を聞く画面（v1.62.0）と担当者の注意（v1.97.0）を素通り**してしまい、
        「作業完了に入れたのに担当者が空のまま」「実績なのに金額が入っていない」が起きる。
        ＝**関門を回り込める抜け道を、わざわざ残しておく理由がない。**
     🔴 **入庫済みの車に「仮予約にする」は出さない**（ゆうた指定）。もう来ている車を仮に戻す意味がない。 */
  function optMenuHtml(c){
    const isResv = (c && c.status === 'reserved');
    /* アーカイブ済みか（物差しは archive-pit.js の1本）。ここで条件を書かない。 */
    const archived = !!(window.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c));
    const gone   = (c && (c.status === 'returned' || c.status === 'scrap' || c.status === 'cancelled')) && !archived;
    let h = '';
    if (isResv){
      /* 🔴 v1.101.0（ゆうた指定）→ v1.134.0 で整理 **まだ入庫していない車のメニュー**
         ・承認待ちでない … 仮予約にする（or ✓本予約に確定する）／承認予約にする／
                            入庫中にする／予約キャンセルにする／消去する
         ・承認待ち　　　 … ↩承認に回すのをやめる／入庫中にする／予約キャンセルにする／消去する
         ⚠ 仮予約と承認待ちは**同時に立てない**（v1.74.0 の決めごと）。
            v1.133.0 まではこれが**片側だけ**しか守られていなかった（下の 🔴 を読むこと）。
         ⚠ **承認する**入口は、いまも昔もカード詳細のいちばん上の承認バー1か所だけ。
            ここに出す「承認に回すのをやめる」は**承認ではない**（印を下ろすだけ）。 */
      /* 🔴🔴 v1.134.0（ゆうた確定・2026-08-18）**承認待ちの車には「仮予約にする」を出さない。**
         ◎なにが起きていた
           `cvToggleTentative` は `tentative` を裏返すだけで `approvalPending` を触っていない。
           逆向き（承認予約にする）は `tentative=false` にしてあるので、**片方だけ対策されていた**。
           ＝承認待ちの車で「仮予約にする」を押すと、**「承認待」と「仮予約」の札が2つ並ぶ**。
           v1.74.0 の決めごと「承認に回した予約は本予約扱い。仮とは同時に立てない」に反する。
         🔴 直し方＝**承認待ちの間は「仮予約にする／本予約に確定する」を出さない。**
            （「承認予約にする」を出していないのと同じ理屈でそろえる）
         🔴 代わりに **「↩ 承認に回すのをやめる」** を出す＝**入口に出口をそろえる**。
            押すと `approvalPending` だけ下りて**ふつうの本予約**に戻る。
            仮おさえに落としたいなら、戻ってから改めて「仮予約にする」＝**2手**にする。
         ⚠ 中身は `approval-pit.js` の `pitUnapproveCard` 1本。**ここに書き写さない。** */
      var _appr = !!(window.pitApprovalPending && pitApprovalPending(c));
      if (!_appr){
        h += (c.tentative
          ? '<button class="cv-opti cv-kariopt" onclick="cvToggleTentative()">✓ 本予約に確定する</button>'
          : '<button class="cv-opti cv-kariopt" onclick="cvToggleTentative()"><i data-ic=pencil data-ics=16></i> 仮予約にする</button>');
        h += '<button class="cv-opti cv-apopt" onclick="cvToApproval()"><i data-ic=shield data-ics=16></i> 承認予約にする</button>';
      } else {
        h += '<button class="cv-opti cv-apopt" onclick="cvUnapproval()"><i data-ic=undo data-ics=16></i> 承認に回すのをやめる…</button>';
      }
      h += '<button class="cv-opti" onclick="cvCheckIn()"><i data-ic=download data-ics=16></i> 入庫中にする</button>'
        +  '<button class="cv-opti" onclick="cvAskCancelResv()"><i data-ic=ban data-ics=16></i> 予約キャンセルにする…</button>'
        +  '<div class="cv-optdiv"></div>';
    } else if (archived){
      /* 🔴🔴 v1.136.0（ゆうた確定）**アーカイブ済みの車。**
         🗣「アーカイブまで行った車は基本マスターとか管理者以外は触れない」
         🗣「アーカイブから戻すは管理者ならOK」／「消すは誰でもでいい」
         ◎出るもの
           ・**アーカイブから戻す…** … 管理者は押せる／それ以外は 🔒 管理のみ（押すと顧客と同じ断りの窓）
           ・**消去する…** … 誰でも押せる。ただし**2枚聞く**（`cvAskDelete`）
         ⚠ 「売上なしでアーカイブする」はもう出さない（すでにアーカイブ済み）。
         ⚠ ボタンを消すだけにしない＝`cvBackToReserve` の中でも同じ条件で止めている。 */
      const canR = !(window.PitArchive && PitArchive.canRestore) || PitArchive.canRestore();
      h += canR
        ? '<button class="cv-opti" onclick="cvAskBackToReserve()"><i data-ic=undo data-ics=16></i> アーカイブから戻す…</button>'
        : '<button class="cv-opti cv-optlocked" onclick="cvDenyRestore()"><i data-ic=undo data-ics=16></i> アーカイブから戻す…'
          + '<span class="cv-adminonly"><i data-ic=lock data-ics=14></i> 管理のみ</span></button>';
      h += '<div class="cv-optdiv"></div>';
    } else if (!gone){
      /* ⚠ v1.136.0 「予約に戻す」→「入庫を取り消して予約に戻す」。
         アーカイブ済みで出る「アーカイブから戻す」と**別物だと分かるように**言葉を離した。
         ・入庫を取り消して予約に戻す … まだ手元にある車（アーカイブ前）。誰でも
         ・アーカイブから戻す　　　　 … 終わった車を掘り起こす。管理者だけ

         🔴🔴 v1.137.0（ゆうた確定・2026-08-18）**完TELを通った車は3択にする。**
         🗣「予約に戻すはなしで。盤面もタスクボードの名称で。
            なのでタスクボードに戻す と売上なしアーカイブ、消去 の3択で」
         ◎なぜ
           完TELに**入る道はドラッグ1つ**なのに、出る道が「予約まで全部戻す」しかなかった。
           押すと工程・完TEL・返車の予定・**確定売上**・実績日・PIT枠がまとめて消える＝重すぎる。
         🔴 完TELを通った車（`returnStage` あり）＝**タスクボードに戻す／売上なしでアーカイブする／消去する**
            「入庫を取り消して予約に戻す」は**出さない**（ゆうた指定）。
         ⚠ まだタスクボードに乗っている車（`returnStage` なし）は今までどおり
            「入庫を取り消して予約に戻す」。 */
      h += (c.returnStage
        ? '<button class="cv-opti" onclick="cvAskBackToBoard()"><i data-ic=undo data-ics=16></i> タスクボードに戻す…</button>'
        : '<button class="cv-opti" onclick="cvAskBackToReserve()"><i data-ic=undo data-ics=16></i> 入庫を取り消して予約に戻す…</button>');
      h += '<button class="cv-opti" onclick="cvAskNoSale()"><i data-ic=box data-ics=16></i> 売上なしでアーカイブする…</button>'
        +  '<div class="cv-optdiv"></div>';
    }
    h += '<button class="cv-opti cv-danger" onclick="cvAskDelete()"><i data-ic=trash data-ics=16></i> 消去する…</button>';
    return h;
  }

  // ===== トップ（resNo/status/⋮/🗒️/✕） =====
  function topHtml(c){
    const dt = c.reserveDate ? ('入庫 '+fmtMD(c.reserveDate)+(c.reserveTime?' '+c.reserveTime:'')) : '';
    const sc = (window.statusColor ? statusColor(c.status) : '#f59e0b');
    const sl = (window.statusLabel ? statusLabel(c.status) : (c.status||''));
    let h = '<div class="cv-top">'
      + (c.resNo?'<span class="cv-resno">'+esc(c.resNo)+'</span>':'')
      + '<span class="cv-status" style="color:'+sc+';border-color:'+sc+'66;background:'+sc+'1f">'+esc(sl)+'</span>'
      /* 🔵 v1.74.0（ゆうた指定）**カード詳細だけは丸い印を出さず、文字だけ**にする。
         「承認待」と「仮予約」。⚠ 仮予約側のペンのアイコンもここで外した（並びをそろえるため）。 */
      + (c.approvalPending?'<span class="cv-apprbadge">承認待</span>':'')
      + (c.tentative?'<span class="cv-karibadge">仮予約</span>':'')
      /* 🔴 v1.99.0 売上なしでアーカイブした車＝ひと目で分かるように札を出す（金額は請求していない） */
      + ((window.pitCardNoSale && pitCardNoSale(c))?'<span class="cv-nosalebadge">売上なし</span>':'')
      /* 🔴 v1.101.0 キャンセル・未入庫はひと目で分かるように（どちらも盤面から外れている） */
      + (c.status==='cancelled' ? (c.cancelled
            ? '<span class="cv-cancelbadge">予約キャンセル</span>'
            : '<span class="cv-nosalebadge">未入庫</span>') : '')
      + (dt?'<span class="cv-intake">'+dt+'</span>':'')
      + '<div class="cv-acts">'
      + '<button class="cv-iconbtn" title="表紙を印刷" onclick="pitPrintCover(\''+c.id+'\')"><i data-ic=printer data-ics=16></i></button>'
      + '<button class="cv-iconbtn" title="この車両に付箋を発行" onclick="cvToggleFusen(event)"><i data-ic=sticky data-ics=16></i></button>'
      + '<div class="cv-optwrap"><button class="cv-iconbtn" title="オプション" onclick="cvToggleOpt(event)">⋮</button>'
      + '<div class="cv-optmenu" id="cv-optmenu">' + optMenuHtml(c) + '</div></div>'
      + '<button class="cv-iconbtn" title="閉じる" onclick="closeDetail()"><i data-ic=close data-ics=16></i></button>'
      + '</div></div>';
    return h;
  }

  function popsHtml(c){
    const link = (c.resNo?c.resNo+' ・ ':'') + ((window.pitCustName?pitCustName(c):c.customer)||'') + '様 ' + (c.car||'');
    return '<div class="cv-fusenpop" id="cv-fusenpop"><div class="cv-fph"><i data-ic=sticky data-ics=16></i> 付箋を発行（この車両にリンク）</div>'
      + '<div class="cv-fplink"><i data-ic=link data-ics=16></i> '+esc(link)+'</div>'
      + '<textarea class="cv-fpbody" id="cv-fpbody" placeholder="付箋の内容（例：部品が入荷したら連絡）"></textarea>'
      + '<div class="cv-fpcolors"><span class="cv-fpc on" data-col="yellow" style="background:#fde68a" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="red" style="background:#fca5a5" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="green" style="background:#a7f3d0" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="blue" style="background:#bfdbfe" onclick="cvFpColor(this)"></span></div>'
      + '<div class="cv-fpacts"><button class="cv-ng" onclick="cvCloseFusen()">取消</button><button class="cv-ok" onclick="cvFusenIssue()">付箋を発行</button></div></div>'
      + delPopHtml(c, link);
  }

  /* 🗑 消去の**2枚目**（v1.136.0）＝その車を名指しして見せる最終確認。
     ⚠ 1枚目（`cvAskDelete`）を通らないと出ない。
     🔴 言葉は「消去」でそろえる（「削除」は使わない）。
     ⚠ 実績カウント日か確定売上を持っている車は、**何が消えるかを名指しで言う**。 */
  function delPopHtml(c, link){
    const hasResult = !!(c && (c.completedAt || (c.amountFinal != null && c.amountFinal !== '')));
    const note = (hasResult
        ? '🔴 <b>実績・確定売上・お客様の来店履歴</b>からも、この1台ぶんが消えます。<br>'
        : '')
      + '<b>元に戻せません。</b>予約番号は欠番として残ります（再利用しません）。';
    return '<div class="cv-delpop' + (hasResult ? ' cv-delpop-hard' : '') + '" id="cv-delpop">'
      + '<div class="cv-dpt">本当に消去しますか？</div>'
      + '<div class="cv-dpsub">' + esc(link) + '</div>'
      + '<div class="cv-dpnote">' + note + '</div>'
      + '<div class="cv-fpacts"><button class="cv-ng" onclick="cvCloseDel()">やめる</button>'
      + '<button class="cv-dpdel" onclick="cvDeleteCard()">消去する</button></div></div>';
  }

  // ===== メイン描画 =====
  window.renderCardView = function(card, hostId){
    const host = document.getElementById(hostId || 'md-body-modal'); if(!host) return;
    /* 🔴 v1.67.1 「返車日未定を外している最中」の印は、そのカードを見ている間だけ持つ。
       ⚠ ここで毎回リセットすると、外した直後の描き直しで元に戻ってしまう（＝直したはずのバグが再発する）。
          だから**別のカードに変わった時だけ**忘れる。 */
    if (_retTbdFor !== (card && card.id)) { _retTbdOff = false; _retTbdFor = (card && card.id) || ''; }
    /* 🆕 v1.73.0 「編集」を開いた状態も、そのカードを見ている間だけ持つ（別のカードに変わったら閉じる）。 */
    if (_chainEditFor !== (card && card.id)) { _chainEditMoney = false; _chainEditDate = false; _chainEditFor = (card && card.id) || ''; }
    _c = ensure(card);
    const box = host.closest('.modal-box');
    if(box){
      box.classList.add('cardview');
      const _tc = card.codeRed ? '#ef4444' : teamColor(card);
      box.style.boxShadow = card.codeRed
        ? ('inset 4px 0 0 0 '+_tc+', 0 0 0 2px rgba(239,68,68,.55), 0 18px 50px rgba(0,0,0,.55)')
        : ('inset 4px 0 0 0 '+_tc+', 0 18px 50px rgba(0,0,0,.55)');
      box.style.borderColor = card.codeRed ? '#ef4444' : '';
    }
    host.innerHTML =
      '<div class="cv-root">'
      + topHtml(card)
      + (card.codeRed?'<div class="cv-claimbanner"><i data-ic=warn data-ics=16></i> Ⓕ案件・各部署慎重に対応 <i data-ic=warn data-ics=16></i></div>':'')
      + '<div class="cv-twocol"><div class="cv-left">'+leftHtml(card)+'</div><div class="cv-right">'+rightHtml(card)+'</div></div>'
      + popsHtml(card)
      + '</div>';
    cvBuildCal();
    cvBindTimeGuide();
  };

  /* 返車時間の入力ガイドを配線（打ち込み／ピッカー／ショートカット）。
     🔴 部品も配線も return-slot.js のものを借りる。ここで作らない。 */
  function cvBindTimeGuide(){
    const slot = document.getElementById('cv-time-slot'); if (!slot) return;
    const wrap = slot.querySelector('.cf-time'); if (!wrap || !window.pitTimeGuideBind) return;
    pitTimeGuideBind(wrap, { onCommit: function(v){ if (window.cvReturnTime) cvReturnTime(v); } });
  }

  /* ===================================================================
     ✏ 予約を編集（v1.56.0・ゆうた指定）
     -------------------------------------------------------------------
     🔴 これまで：編集に入ると**打った瞬間に保存**され、**エリア外クリックや ✕ で閉じられた**。
        ＝「やっぱりやめる」が存在せず、閉じた時点でもう直っていた。
     🔴 これから：
        ・**エリア外クリックでは閉じない**（✕ も出さない）。
        ・右上の **「保存する」／「キャンセル」** でしか出られない。
        ・**どちらを押しても予約詳細に戻る**（ポップアップは閉じない）。
        ・押すまで **保存は一切走らない**（PitDB.hold）。
     ⚠ 入力は打った瞬間 state のカードに入る作り（フォーム全体がそう出来ている）。
        なので「キャンセル」は**開いた時点の中身を控えておいて丸ごと戻す**。
     ⚠ 控えは JSON の deep copy＝関数・DOM は持たない前提（カードは素のデータのみ）。
     =================================================================== */
  let _editId = null, _editSnap = null;
  function _editActs(){ return document.getElementById('cv-edit-acts'); }
  function _editCloseBtn(){ return document.getElementById('card-modal-close'); }
  /* いま編集中か（index.html の背景クリックが見る） */
  window.pitCardEditing = function(){ return !!_editId; };
  /* 🔴 v1.56.1 いま編集している入庫カードの番号（db-pit.js が「差し替えてはいけない相手」を知るのに使う） */
  window.pitCardEditingId = function(){ return _editId; };

  function editBegin(card){
    _editId = card.id;
    try { _editSnap = JSON.parse(JSON.stringify(card)); } catch(e){ _editSnap = null; }
    /* ⛔ ボタンを押すまで保存しない。⚠ 置き去り防止のため、立てた時刻も渡しておく（db-pit.js が3分で解除する） */
    try { if (window.PitDB){ PitDB.hold = true; PitDB._holdAt = Date.now(); } } catch(e){}
    const a = _editActs(); if (a) a.hidden = false;
    const b = _editCloseBtn(); if (b) b.hidden = true;        /* ✕ は出さない＝出口はボタンだけ */
  }
  /* 見張りを外す。⚠ 何があってもここを通れば保存が復活する。
     🔴 v1.56.1 外したあと **必ず1回保存する**。
        どの道から編集を抜けても、打ったものが黙って消えないようにするため
        （キャンセルの時は先に元へ戻してから来るので、戻した姿が保存される＝正しい）。 */
  function editRelease(){
    const had = !!_editId;
    _editId = null; _editSnap = null;
    try { if (window.PitDB){ PitDB.hold = false; PitDB._holdAt = 0; } } catch(e){}
    const a = _editActs(); if (a) a.hidden = true;
    const b = _editCloseBtn(); if (b) b.hidden = false;
    if (had){ try { if (window.PitDB) PitDB.save(true); } catch(e){} }
  }
  window.pitCardEditRelease = editRelease;

  /* 予約詳細に戻る（ポップアップは開けたまま） */
  function backToView(card){
    if (!card){ if (window.closeDetail) closeDetail(); return; }
    _c = ensure(card);
    const box = document.querySelector('#modal-detail .modal-box');
    const title = document.getElementById('card-title-modal');
    if (title && window._cardTitleHtml) title.innerHTML = _cardTitleHtml(card);
    if (window.renderCardView) renderCardView(card, 'md-body-modal');
    else if (box) box.classList.add('cardview');
    try { if (window.showView && window.state && state.currentView) showView(state.currentView); } catch(e){}   /* 背後の一覧も揃える */
  }

  window.pitCardEditSave = function(){
    const card = (_editId ? (state.cards||[]).find(function(x){ return x.id === _editId; }) : null) || _c;
    editRelease();
    if (card){
      /* 顧客控え・代車カレンダーへの反映は「閉じる時」と同じ手順を踏む（v1.53.0 の決まり） */
      try { if (!card._sample && window.upsertCustomerFromCard) upsertCustomerFromCard(card); } catch(e){}
      try { if (window.pitSyncLoanerAssigns) pitSyncLoanerAssigns(); } catch(e){}
      try { if (window.PitDB) PitDB.save(true); } catch(e){}
      if (window.pitToast) pitToast('保存しました');
    }
    backToView(card);
  };

  window.pitCardEditCancel = function(){
    const card = (_editId ? (state.cards||[]).find(function(x){ return x.id === _editId; }) : null) || _c;
    const snap = _editSnap;
    if (card && snap){
      /* 🔴 開いた時点の姿に丸ごと戻す＝**編集中に増えたキーも消す**（消し忘れると設定が残る） */
      Object.keys(card).forEach(function(k){ if (!(k in snap)) delete card[k]; });
      Object.keys(snap).forEach(function(k){ card[k] = snap[k]; });
    }
    editRelease();
    if (window.pitToast) pitToast('編集をキャンセルしました', 'PF-1050');
    backToView(card);
  };

  // 編集（既存フォームへ）
  window.openCardEditForm = function(cardId){
    const card = state.cards.find(c=>c.id===cardId) || _c; if(!card) return;
    editBegin(card);
    const box = document.querySelector('#modal-detail .modal-box'); if(box){ box.classList.remove('cardview'); box.style.boxShadow=''; box.style.borderColor=''; }
    const title = document.getElementById('card-title-modal'); if(title && window._cardTitleHtml) title.innerHTML = _cardTitleHtml(card);
    window._cardMode = 'modal';
    if (window.renderCardForm) renderCardForm(card);
  };

  // ===== タブ =====
  window.cvTab = function(btn){
    document.querySelectorAll('.cv-tab').forEach(function(x){x.classList.remove('on');}); btn.classList.add('on');
    document.querySelectorAll('.cv-panel').forEach(function(p){p.classList.remove('on');});
    const el = document.getElementById('cv-p-'+btn.dataset.p); if(el) el.classList.add('on');
  };

  // ===== 金額（概算/見積もり/受注・kind = est|quote|order） =====
  var AMT_FIELD = { est:'estAmount', quote:'amountQuote', order:'amountOrder', final:'amountFinal' };
  window.cvAmtInput = function(){};
  window.cvAmtChange = function(kind){
    const el=document.getElementById('cv-amt-'+kind); if(!el) return;
    const v=el.value.replace(/[^0-9]/g,'').slice(0,9);
    el.value = v ? (+v).toLocaleString() : '';
    /* 🧾 v1.65.1 税込の確認表示をライブで（物差しは state.js の pitTaxHint 1本） */
    if (window.pitTaxHintSync) pitTaxHintSync(el, document.getElementById('cv-tax-'+kind));
    const cf=document.getElementById('cv-amtconfirm-'+kind);
    if(el.value===el.dataset.prev){ cf.classList.remove('show'); return; }
    document.getElementById('cv-amtnew-'+kind).textContent = '¥'+(el.value||'0');
    cf.classList.add('show');
  };
  window.cvAmtOK = function(kind){
    const el=document.getElementById('cv-amt-'+kind); const v=el.value.replace(/[^0-9]/g,'').slice(0,9);
    const _bef = _c[AMT_FIELD[kind]];
    _c[AMT_FIELD[kind]] = v ? +v : null; el.dataset.prev=el.value;
    document.getElementById('cv-amtconfirm-'+kind).classList.remove('show');
    const chv=document.getElementById('cv-chv-'+kind);   // 上のチェーンに即反映
    if(chv) chv.textContent = v ? '¥'+(+v).toLocaleString() : '—';
    /* 🆕 v1.73.0 「編集」から**あとで直した**ときは、誰がいつ直したか辿れるようにフローへ残す。
       ⚠ いまの工程の直接入力（ふだんの入力）は今までどおり残さない＝フローが金額の打ち直しで埋まらないように。 */
    const _n = v ? +v : null;
    if (_chainEditMoney && window.logFlow && String(_bef == null ? '' : _bef) !== String(_n == null ? '' : _n)){
      const _s = function(x){ return (x != null && x !== '') ? '¥' + Number(x).toLocaleString() : '未入力'; };
      try { logFlow(_c, AMT_LABEL[kind] + 'を ' + _s(_bef) + ' → ' + _s(_n) + ' に変更（表紙の編集）'); } catch(e){}
    }
    save();
  };
  window.cvAmtNG = function(kind){
    const el=document.getElementById('cv-amt-'+kind); el.value=el.dataset.prev;
    document.getElementById('cv-amtconfirm-'+kind).classList.remove('show');
  };

  /* ===================================================================
     🆕 v1.73.0（ゆうた指定）表紙の「金額の並び」「返車日の並び」を あとから直す
     -------------------------------------------------------------------
     ・開け閉めは画面だけ（保存しない）。押した並びだけが開く。
     ・🔴 直せるのは**通った段階だけ**（amtOpenKinds / cvCanFixReturn）。
     ・🔴 概算 返車日（A）は自動計算なので、直すのは**概算 預かり日数**のほう。
     ⚠ 概算 預かり日数と予定 返車日は、どちらも**売上をどの月に数えるか**を動かす
        （sales-count.js＝C→B→A の順に見る）。だから必ずフローに残す。
     =================================================================== */
  window.cvChainEdit = function(which){
    if (!_c) return;
    if (which === 'money') _chainEditMoney = !_chainEditMoney;
    else                   _chainEditDate  = !_chainEditDate;
    _chainEditFor = _c.id;
    if (window.renderCardView) renderCardView(_c, 'md-body-modal');
  };

  /* 概算 預かり日数（＝概算 返車日 A の材料）。空にしたら「決めていない」＝作業タイプの目安に戻る。 */
  window.cvEstHold = function(v){
    if (!_c) return;
    const s = String(v == null ? '' : v).replace(/[^0-9]/g,'').slice(0,3);
    const bef = (_c.estHoldDays == null || _c.estHoldDays === '') ? '' : String(_c.estHoldDays);
    if (s === bef) return;
    _c.estHoldDays = (s === '') ? null : +s;
    if (window.logFlow){
      try { logFlow(_c, '概算 預かり日数を ' + (bef === '' ? '未設定' : bef + '日') + ' → ' + (s === '' ? '未設定' : s + '日') + ' に変更（表紙の編集）'); } catch(e){}
    }
    save(); cvRefreshBg();
    if (window.renderCardView) renderCardView(_c, 'md-body-modal');
  };

  /* 予定 返車日（B）＝受注のときにお客様へ伝えた約束の日。
     🔴 保存するのは `returnDatePlan` だけ。確定（C＝returnDate）には手を出さない。
        ここで C を触ると「まだ確定していない車が返車カレンダーに出る」が復活する（v1.65.0 の穴）。 */
  window.cvSetPlanReturn = function(v){
    if (!_c) return;
    const bef = String((window.pitReturnB ? pitReturnB(_c) : _c.returnDatePlan) || '');
    const nv  = String(v || '');
    if (bef === nv) return;
    _c.returnDatePlan = nv;
    if (window.logFlow){
      try { logFlow(_c, '予定 返車日（お客様への約束）を ' + (bef || '未定') + ' → ' + (nv || '未定') + ' に変更（表紙の編集）'); } catch(e){}
    }
    save(); cvRefreshBg();
    if (window.renderCardView) renderCardView(_c, 'md-body-modal');
  };
  window.cvSetReturn = function(v){
    /* 🔴 v1.57.0 実績になったカードの返車日は**実績カウント日も動かす**ので、管理だけ。 */
    if (_c && _c.status === 'returned' && !canEditResultDate()){
      if (window.UI && UI.alert) UI.alert('実績になったカードの返車日を直せるのは、設定権限（管理）のある人だけです。', { title: '変更できません' });
      return;
    }
    const _before = _c ? (_c.completedAt || '（なし）') : '';
    /* 🔴 v1.66.0 書き込みは return-slot.js の唯一の入口を通す。
       ここは長いあいだ「returnDate が空のときだけ入れる」だったので、
       **確定返車日を直しても返車カレンダー上の位置が動かなかった**（v1.60.0 と同じ形の取り残し）。 */
    if (window.pitReturnSetDateTime){
      var _res = pitReturnSetDateTime(_c, v || '', undefined);
      _c.returnDateFinal = v || null;
      if (window.pitReturnCommit && _c.status !== 'returned') pitReturnCommit(_c, _res, { silent: true });
    } else {
      _c.returnDateFinal = v || null;
      if (v) _c.returnDate = v;
    }
    // 実績（返車完了）カードで返車日を直したら、確定返車日＝実績カレンダーの表示日(completedAt)も合わせて動かす v0.118.1
    if(v && _c.status === 'returned'){
      _c.returnDate = v; _c.completedAt = v;
      if (_before !== v){
        try { if (window.logFlow) logFlow(_c, '確定返車日を ' + v + ' に変更（実績カウント日も ' + _before + ' → ' + v + '）'); } catch(e){}
        try { if (window.pitLog) pitLog('実績カウント日を変更（返車日から）', { cardId: _c.id, kind: 'result',
          label: ((window.pitCustName?pitCustName(_c):_c.customer) || '') + ' 様' + (_c.car ? ' / ' + _c.car : '') + '　' + _before + ' → ' + v }); } catch(e){}
      }
    }
    save(); cvRefreshBg();
  };
  // 実績移行後のロック表示を、✏️編集で入力欄に切り替える（DOM切替のみ・保存は各入力のonchange/OKで）v0.118.0
  window.cvUnlockReturn = function(){ var v=document.getElementById('cv-retlock'), e=document.getElementById('cv-retedit'); if(v)v.style.display='none'; if(e)e.style.display=''; };
  window.cvUnlockFinal = function(){ var v=document.getElementById('cv-finlock'), e=document.getElementById('cv-finedit'); if(v)v.style.display='none'; if(e)e.style.display=''; };
  window.cvUnlockPay = function(){ var e=document.getElementById('cv-payedit'); if(e) e.style.display=(e.style.display==='none'?'':'none'); };
  // 💳 入金日を分ける（売掛）ON/OFF。OFFで入金日クリア。表示切替のため再描画 v0.121.0
  window.cvTogglePaySeparate = function(on){
    _c.paymentSeparate = !!on;
    if(!on) _c.paymentDate = null;
    save(); cvRefreshBg();
    if(window.renderCardView) renderCardView(_c,'md-body-modal');
  };
  // 入金日をセット（予約詳細側）。実績側の入金待ちにも即反映 v0.121.0
  window.cvSetPaymentDate = function(v){
    _c.paymentDate = v || null;
    if(v && !_c.paymentSeparate) _c.paymentSeparate = true;
    if(v && window.logFlow) logFlow(_c, '入金日を記録（'+v+'）');
    save(); cvRefreshBg();
    if(window.renderCardView) renderCardView(_c,'md-body-modal');
  };
  /* 🔴 v1.66.0 返車日未定のチェック＝**日付を空にする、それだけ**（完TELポップアップと同じ決めごと）。
     新しい保存項目は作らない。書き込みは return-slot.js の唯一の入口を通す。 */
  window.cvReturnDateTbd = function(on){
    if (!_c) return;
    if (_c.status === 'returned' && !canEditResultDate()){
      if (window.UI && UI.alert) UI.alert('実績になったカードの返車日を直せるのは、設定権限（管理）のある人だけです。', { title: '変更できません' });
      if (window.renderCardView) renderCardView(_c, 'md-body-modal');
      return;
    }
    if (on){
      /* 未定にする＝日付を空にする（唯一の入口を通す）。「外している最中」の印も下ろす。 */
      _retTbdOff = false; _retTbdFor = _c.id;
      if (window.pitReturnSetDateTime) pitReturnSetDateTime(_c, '', undefined);
      else { _c.returnDate = ''; }
      _c.returnDateFinal = null;
      if (window.logFlow) logFlow(_c, '返車日を未定に戻した');
      save(); cvRefreshBg();
      if (window.renderCardView) renderCardView(_c, 'md-body-modal');
      return;
    }
    /* 🔴 v1.67.1 チェックを外す＝「これから日付を入れる」。
       日付欄を使えるようにするだけで、保存する値は何も変えない（まだ日が決まっていないので）。
       ⚠ 前はここが空っぽで、描き直すとチェックが戻り、日付欄も使えないままだった＝外せなかった。 */
    _retTbdOff = true; _retTbdFor = _c.id;
    if (window.renderCardView) renderCardView(_c, 'md-body-modal');
    /* 使えるようになった日付欄へ運ぶ（カレンダーが開く端末では開く） */
    setTimeout(function(){
      var d = document.getElementById('cv-retdate');
      if (!d) return;
      try { d.focus(); } catch(e){}
      try { if (d.showPicker) d.showPicker(); } catch(e){}
    }, 30);
  };

  // 返車時間（スマート入力で正規化）／洗車備考／お礼LINE不要＝完TELポップアップと同じ項目（相互反映）
  window.cvReturnTime = function(input){
    var v = (input && typeof input === 'object') ? input.value : input;
    v = (window._normTime ? _normTime(v) : v) || '';
    if (input && typeof input === 'object') input.value = v;
    /* 🔴 v1.66.0 時間も唯一の入口を通す。「時刻未定 ⇄ 返車カレンダー」の行き来がここでも効くように。 */
    if (window.pitReturnSetDateTime){
      var res = pitReturnSetDateTime(_c, undefined, v);
      if (window.pitReturnCommit && _c.status !== 'returned') pitReturnCommit(_c, res, { silent: true });
    } else {
      _c.returnTime = v;
    }
    save(); cvRefreshBg();
  };
  window.cvWashNote = function(v){ _c.washNote = (v||'').trim(); save(); };
  window.cvNoThanks = function(on){ _c.noThanksLine = !!on; save(); };

  // 引継ぎメモ＝この画面で直接入力（入力中はデバウンス保存・フォーカスアウトで確定保存）
  let _hoTimer = null;
  window.cvHandoff = function(v){
    if (!_c) return;
    _c.handoffMemo = v;
    clearTimeout(_hoTimer);
    _hoTimer = setTimeout(save, 600);
  };
  window.cvHandoffSave = function(v){
    if (!_c) return;
    _c.handoffMemo = v;
    clearTimeout(_hoTimer);
    try { if (window.PitDB) PitDB.save(true); } catch(e){}
  };

  // ===== 外注（外注先・メモ・完了予定日＝戻りの日数を詳細モーダルで編集） =====
  window.cvOutPartner = function(v){
    _c.outsourceTo = v || '';
    var need = (v === '各ディーラー' || v === 'その他');
    var row = document.getElementById('cv-outnote-row');
    if (row) row.style.display = need ? '' : 'none';
    if (!need) _c.outsourceNote = '';
    save();
  };
  window.cvOutNote = function(v){ _c.outsourceNote = (v || '').trim(); save(); };
  window.cvOutDue = function(v){
    _c.outsourceDue = v || '';
    var info = document.getElementById('cv-outdue-info');
    if (info){
      if (v){ var n = window.daysFromToday ? daysFromToday(v) : null;
        info.textContent = '完了予定 ' + fmtMD(v) + (n!=null ? '（'+(n>0?'あと'+n+'日':(n===0?'本日':Math.abs(n)+'日超過'))+'）' : ''); }
      else info.textContent = '—';
    }
    save();
  };

  // ===== 表紙チェック =====
  window.cvPick = function(group, val, el){
    el.parentNode.querySelectorAll('.cv-chip').forEach(function(s){s.classList.remove('on');}); el.classList.add('on');
    if(group==='call'){ _c.coverCall.done = (val==='done'); if(_c.coverCall.done && !_c.coverCall.at){ const d=new Date(); _c.coverCall.at = (d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes()); _c.coverCall.staff = (window.pitFlowMe?pitFlowMe():''); } }   /* 🔴 v1.55.0 ここも同じ死んだ変数を見ていて、ずっと空だった */
    else if(group==='pay'){ _c.payment = val; }
    else if(group==='wash'){ _c.needWash = (val==='1'); }
    else if(group==='handover'){ _c.handover = val; }
    else if(group==='line'){ _c.noThanksLine = (val==='0'); }   // 要='1'→false／不要='0'→true
    else if(group==='headlight'){ _c.headlight = (val==='1'); }
    else if(group==='coatingok'){ _c.coatingOK = (val==='1'); }
    else if(group==='salesreq'){ _c.salesReq = (val==='1'); }
    save();
  };
  window.cvSalesMemo = function(v){ _c.salesReqMemo = (v||'').trim(); save(); };

  // ===== 整備/バックオフィス チェック =====
  function toggleCheck(holder, i, el){
    if(!_c[holder]) _c[holder]={}; if(!_c[holder].checks) _c[holder].checks={};
    _c[holder].checks[i] = !_c[holder].checks[i];
    el.classList.toggle('on'); el.querySelector('.cv-box').textContent = _c[holder].checks[i]?'✓':'';
    // 進捗数を更新
    const wrap = el.closest('.cv-sec'); const total = wrap.querySelectorAll('.cv-chk').length;
    const done = wrap.querySelectorAll('.cv-chk.on').length;
    const prog = wrap.querySelector('.cv-prog'); if(prog) prog.textContent = done+' / '+total+' 完了';
    save();
  }
  /* 🔴 v1.100.0 作業チェックは**合言葉（key）**で持つ。書き込みは state.js の pitMaintToggle 1本を通す。 */
  window.cvMaint = function(key, el){
    if(!_c) return;
    const on = window.pitMaintToggle ? pitMaintToggle(_c, key) : false;
    el.classList.toggle('on', on); el.querySelector('.cv-box').textContent = on ? '✓' : '';
    const wrap = el.closest('.cv-sec'); const total = wrap.querySelectorAll('.cv-chk').length;
    const done = wrap.querySelectorAll('.cv-chk.on').length;
    const prog = wrap.querySelector('.cv-prog'); if(prog) prog.textContent = done+' / '+total+' 完了';
    save();
  };
  window.cvOffice = function(i,el){ toggleCheck('office', i, el); };

  // ===== ⋮オプション・付箋・削除 =====
  function closeAllPop(){ ['cv-optmenu','cv-fusenpop','cv-delpop'].forEach(function(id){ const e=document.getElementById(id); if(e)e.classList.remove('show'); }); }
  window.cvToggleOpt = function(e){ e.stopPropagation(); const m=document.getElementById('cv-optmenu'); const sh=m.classList.contains('show'); closeAllPop(); if(!sh)m.classList.add('show'); };
  window.cvToggleFusen = function(e){ e.stopPropagation(); const f=document.getElementById('cv-fusenpop'); const sh=f.classList.contains('show'); closeAllPop(); if(!sh)f.classList.add('show'); };
  window.cvCloseFusen = function(){ const f=document.getElementById('cv-fusenpop'); if(f)f.classList.remove('show'); };
  window.cvFpColor = function(el){ el.parentNode.querySelectorAll('.cv-fpc').forEach(function(x){x.classList.remove('on');}); el.classList.add('on'); };
  /* 🗑🗑 v1.136.0（ゆうた確定・2026-08-18）**消去は2枚聞く。**
     🗣「消すは誰でもでいいが、ポップアップを2重で出す。戻らない旨、通常は何かしらのアーカイブに
        落ち着く旨を伝えて」

     ◎1枚目＝**考え直させる紙**（アプリ内ダイアログ）
        「戻せない」ことと、「ふつうはアーカイブで残す」ことを言う。
        ここで“やめる”を選びやすくするのが目的なので、既定は「やめる」。
     ◎2枚目＝**その車の名前を出した最終確認**（カードの上の窓・今までのもの）
        何の車を消すのかを名指しで見せてから消す。
     🔴 **誰でも押せる**（ゆうた指定）。管理者だけにはしない。
        代わりに**2枚にして、言葉で止める。**
     ⚠ 消す処理そのもの（`cvDeleteCard`）は1文字も変えていない。入口の聞き方だけ。 */
  window.cvAskDelete = function(){
    const m = document.getElementById('cv-optmenu'); if (m) m.classList.remove('show');
    const c = _c; if (!c) return;
    _cvAsk('消去する前に',
           'このカードを消去すると、データごと無くなります。\n元に戻せません。',
           ['・ふつうは消去ではなく、いずれかの<アーカイブ>に落ち着きます。',
            '　アーカイブなら記録も金額も残り、お客様の来店履歴にも出ます。',
            '・消去は「間違えて作ったカード」など、そもそも無かったことにしてよいものだけに使ってください。',
            '・フロー（進捗ログ）・作業内容・担当者も、まとめて無くなります。'].join('\n'),
           'それでも消去する')
      .then(function(yes){
        if (!yes) return;
        const d = document.getElementById('cv-delpop'); if (d) d.classList.add('show');
      });
  };
  window.cvCloseDel = function(){ const d=document.getElementById('cv-delpop'); if(d)d.classList.remove('show'); };

  window.cvFusenIssue = function(){
    const body = (document.getElementById('cv-fpbody').value||'').trim();
    const colEl = document.querySelector('#cv-fusenpop .cv-fpc.on'); const color = colEl ? colEl.dataset.col : 'yellow';
    if(!body){ cvCloseFusen(); return; }
    if(!Array.isArray(state.boardNotes)) state.boardNotes=[];
    const maxOrder = state.boardNotes.reduce(function(m,n){return Math.max(m, n.order||0);},0);
    state.boardNotes.push({
      id:'bn_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      title:'', body:body, color:color, noteType:'execute', deadline:null,
      memberUids:[], doneByUids:[], authorUid:(window.bnMe||null), status:'open',
      order:maxOrder+1, imageURL:'', replies:[],
      linkResNo:(_c.resNo||''), linkLabel:((_c.resNo?_c.resNo+' ・ ':'')+((window.pitCustName?pitCustName(_c):_c.customer)||'')+'様 '+(_c.car||''))
    });
    save(); if(window.renderBoardNotes) try{ renderBoardNotes(); }catch(e){}
    cvCloseFusen();
    if(window.toast) toast('付箋を発行しました');
  };

  /* 仮予約 ⇄ 本予約 の切替（⋮メニュー）v0.100.0 */
  window.cvToggleTentative = function(){
    if(!_c) return;
    _c.tentative = !_c.tentative;
    if(!Array.isArray(_c.log)) _c.log=[];
    const d=new Date();
    /* 🔴 v1.55.0 自動で入る記録にも操作した人の名前を（名前の作り方は flow-pit.js の pitFlowMe に一本化） */
    _c.log.push({ text:(_c.tentative?'仮予約にした':'本予約に確定した'), at:(d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes()), by:(window.pitFlowMe?pitFlowMe():'') });
    save(); closeAllPop();
    if(window.pitToast) pitToast(_c.tentative?'仮予約にしました':'✓ 本予約に確定しました');
    renderCardView(_c, 'md-body-modal');
  };

  /* ===================================================================
     🔴 v1.99.0（ゆうた指定・2026-08-15）⋮メニューの2つの新しい操作
     =================================================================== */

  function _cvLabel(c){
    return (c.resNo ? '[' + c.resNo + '] ' : '')
         + (((window.pitCustName ? pitCustName(c) : c.customer) || '') ? (((window.pitCustName ? pitCustName(c) : c.customer) || '') + ' 様') : '')
         + (c.car ? ' / ' + c.car : '');
  }
  /* ⚠ v1.136.0 気づいたこと＝**`title` は画面に出ていない。**
     `UI.confirm(title, opt)` は**第1引数が見出し**なので、ここで渡している `opt.title` は上書きされる。
     ＝ 窓の見出しに出るのは `msg` のほう。`title` は**呼ぶ側の覚え書きにしかなっていない**。
     ⚠ 直すと既存の窓（承認・売上なし・予約に戻す）の見出しが全部変わるので、
        **ここでは触らない**。見出しに出したい言葉は `msg` の1行目に書くこと。 */
  function _cvAsk(title, msg, det, okTxt){
    if (window.UI && UI.confirm) return UI.confirm(msg, { title: title, detail: det, ok: okTxt, cancel: 'やめる' });
    return Promise.resolve(false);   /* ⚠ ブラウザ純正の confirm は使わない（v1.75.0 の決めごと） */
  }

  /* ---- ⓪-1 承認予約にする（v1.101.0）------------------------------
     🔴 承認制度の中身は approval-pit.js（v1.74.0）。ここは**印を立てるだけ**。
     ⚠ 仮予約とは同時に立てない決まりなので、立てる時に仮予約は下ろす。 */
  window.cvToApproval = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    _cvAsk('承認予約にする', 'この予約を承認待ちにしますか？\n' + _cvLabel(c),
           ['・入庫カレンダーと代車の枠は、ふつうの予約と同じように埋まります',
            '・予約ビューの「未定 → 承認待ち」BOXに並びます',
            '・カードを開いて内容を確認し、承認すると印が取れます',
            '・仮予約にはなりません（仮予約とは別物です）'].join('\n'), '承認予約にする')
      .then(function(yes){
        if (!yes) return;
        c.approvalPending = true;
        c.tentative = false;              /* 🔴 仮と承は同時に立てない（v1.74.0） */
        if (window.logFlow) logFlow(c, '承認予約にした（承認待ちへ）');
        if (window.pitLog) pitLog('承認予約にした', { cardId: c.id, kind: 'approval', label: _cvLabel(c) });
        save(); cvRefreshBg();
        if (window.pitToast) pitToast('承認待ちにしました');
        renderCardView(c, 'md-body-modal');
      });
  };

  /* ---- ⓪-1b 承認に回すのをやめる（v1.134.0・ゆうた「承認取り消しも含めて」）----
     🔴 **入口（承認予約にする）に、出口をそろえた。**
     🔴 中身は `approval-pit.js` の `pitUnapproveCard` 1本。**ここは聞くだけ。**
        ＝「承認する」（`pitApproveCard`）と並べて置いてあるので、片方だけ直る事故が起きない。
     ⚠ 仮予約にはしない。ふつうの本予約に戻すだけ。 */
  window.cvUnapproval = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    _cvAsk('承認に回すのをやめる', 'この予約を承認待ちから外して、ふつうの本予約に戻しますか？\n' + _cvLabel(c),
           ['・予約ビューの「未定 → 承認待ち」BOXから消えます',
            '・入庫カレンダーと代車の枠は、埋まったまま変わりません',
            '・🔴 承認したことにはなりません（回すのをやめた、と記録に残ります）',
            '・仮予約にはなりません。仮おさえに戻すなら、このあと ⋮ →「仮予約にする」'].join('\n'), '承認待ちから外す')
      .then(function(yes){
        if (!yes) return;
        if (window.pitUnapproveCard) pitUnapproveCard(c.id);
      });
  };

  /* ---- ⓪-2 入庫中にする（v1.101.0）--------------------------------
     🔴 中身は today.js の `pitTodayCheckIn` 1本を呼ぶだけ。
        ＝承認待ちのときに1回聞く関門（v1.74.0）も、そのまま同じように通る。
        **ここに入庫の処理を書き写さないこと。** */
  window.cvCheckIn = function(){
    if (!_c) return; closeAllPop();
    const id = _c.id;
    if (window.pitTodayCheckIn) pitTodayCheckIn(id);
    if (window.closeDetail) closeDetail();
  };

  /* ---- ⓪-3 予約キャンセルにする（v1.101.0）------------------------
     🗣 ゆうた「予約キャンセル。これは**顧客情報の来店履歴にキャンセルの旨を記載し、
                アーカイブとして残す**」

     🔴 **自動で入る「未入庫」とは別物。**（ゆうた確定）
        ・未入庫（overdue-pit.js）＝来なかっただけ。1ヶ月で自動アーカイブ。来店履歴には出さない
        ・予約キャンセル（ここ）＝**人が決めたもの**。すぐアーカイブし、**来店履歴に「キャンセル」で残す**
     🔴 **実績・売上には一切乗らない**（そもそも `status='cancelled'` は売上の区分に入らない）。
     🔴 理由を1行だけ聞く（ゆうた確定）。**任意**＝空でも進める。来店履歴とフローに残る。 */
  window.cvAskCancelResv = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    const ask = (window.pitAskText)
      ? pitAskText('キャンセルの理由（任意・1行）', '', { ok: '予約をキャンセルする', title: '予約キャンセル', placeholder: '例）日程変更／よそでやることになった' })
      : Promise.resolve('');
    ask.then(function(reason){
      if (reason === null || reason === undefined) return;   /* ✕ で閉じた＝やめる */
      cvCancelResv(String(reason || '').trim());
    });
  };
  window.cvCancelResv = function(reason){
    const c = _c; if (!c) return;
    const today = isoToday();
    c.status       = 'cancelled';
    c.cancelled    = true;          /* 🔴 人が決めたキャンセル。自動の未入庫（noShow）とは別 */
    c.noShow       = false;
    c.cancelledAt  = today;
    c.cancelReason = String(reason || '');
    c.cancelledBy  = (window.pitFlowMe ? pitFlowMe() : '');
    c.archived     = true;          /* すぐアーカイブ＝未入庫BOXには並べない（もう待たない） */
    c.tentative = false; c.approvalPending = false;
    c.bayId = null; c.baySlot = null;
    if (window.logFlow) logFlow(c, '予約をキャンセルした' + (c.cancelReason ? '（' + c.cancelReason + '）' : ''));
    if (window.pitLog) pitLog('予約をキャンセルした', { cardId: c.id, kind: 'delete',
      label: _cvLabel(c) + (c.cancelReason ? ' / ' + c.cancelReason : '') });
    save(); cvRefreshBg();
    if (window.pitToast) pitToast('予約をキャンセルしました（来店履歴に残ります）');
    if (window.closeDetail) closeDetail();
  };

  /* ---- ①-0 タスクボードに戻す（完TELを取り消す）v1.137.0 -----------
     🗣 ゆうた「予約に戻すはなしで。盤面もタスクボードの名称で。
        なのでタスクボードに戻す と売上なしアーカイブ、消去 の3択で」

     ◎なにをするか＝**`returnStage` を消すだけ。**
       ・工程（`status`）は触らない … 完TELに入る時に「作業完了済」になっているので、そのまま戻る
       ・**返車の予定日・時間・確定金額は残す** … 入れ直しにさせない（間違えて落としただけなので）
       ・売上の見込みは**1円も動かない** … `pitSalesTier` は「完TEL中」も「作業完了済」も同じ『確定』
     🔴 **これが `returnStage` を消す2つ目の道。**（1つ目＝`cvBackToReserve`）
        ⚠ どちらも消し方は同じ1行。増やす時はここを見ること。
     ⚠ アーカイブ前なので**誰でも押せる**（ゆうた指定）。 */
  window.cvAskBackToBoard = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    if (!c.returnStage){ if (window.pitToast) pitToast('この車は完TELを通っていません'); return; }
    const det = ['・完TELの印だけを外します。工程は「作業完了済」のままタスクボードへ戻ります',
                 '・返車の予定日・時間・確定金額は、入れたまま残します（入れ直しになりません）',
                 '・売上の見込みは変わりません（どちらも「確定」の扱いです）',
                 '・返車の一覧（完TEL待ち・返車カレンダー）からは外れます'].join('\n');
    _cvAsk('タスクボードに戻す', '完TELを取り消して、タスクボードに戻しますか？\n' + _cvLabel(c),
           det, 'タスクボードに戻す')
      .then(function(yes){ if (yes) cvBackToBoard(); });
  };
  window.cvBackToBoard = function(){
    const c = _c; if (!c) return;
    if (!c.returnStage) return;
    const from = (c.returnStage === 'callWait') ? '完TEL待ち' : '完TEL済';
    c.returnStage = null;                    /* 🔴 消すのはこれだけ */
    if (window.logFlow) logFlow(c, '完TELを取り消してタスクボードに戻した（' + from + ' から）');
    if (window.pitLog) pitLog('完TELを取り消した（タスクボードへ）', { cardId: c.id, kind: 'phase', label: _cvLabel(c) });
    save(); cvRefreshBg();
    if (window.pitToast) pitToast('タスクボードに戻しました');
    if (window.closeDetail) closeDetail();
  };

  /* ---- ① 予約に戻す ----------------------------------------------
     🗣 ゆうた「予約に戻すはそのまま、**入庫実績自体をキャンセル**にし、**予約カレンダー状態に戻す**」

     🔴 取り消すのは**入庫してから付いたものだけ**
        ＝工程・完TEL・返車の予定／確定返車日・実績カウント日・確定売上・PIT枠・試運転。
     🔴 **残すもの**＝作業内容・フロー（進捗ログ）・担当者・お客様と車の情報。**本当にあったことだから消さない。**
     🔴 **代車の貸出はそのまま残す**（ゆうた指定）。先に代車だけ出しているケースがあるので勝手に取り消さない。
     ⚠ 実績になった車（返車済み）にはこのボタンを出していない＝**実績を後から予約へ戻す道は作らない。** */
  /* 🔒 v1.136.0 アーカイブから戻せない人が押した時。**顧客・車両と同じ断り方**（archive-pit.js の1本）。 */
  window.cvDenyRestore = function(){
    closeAllPop();
    if (window.PitArchive && PitArchive.denyRestore) PitArchive.denyRestore();
  };

  window.cvAskBackToReserve = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    /* 🔴 v1.136.0 アーカイブ済みかどうかで、窓の言い方を変える（メニューの言葉とそろえる）。 */
    const arch = !!(window.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c));
    if (arch && window.PitArchive && PitArchive.canRestore && !PitArchive.canRestore()){
      if (PitArchive.denyRestore) PitArchive.denyRestore();
      return;
    }
    const det = ['・入庫してから付いた記録を取り消します（工程・完TEL・返車の予定・確定売上）',
                 '・作業内容・フロー（進捗ログ）・担当者はそのまま残ります',
                 (c.needLoaner ? '・代車の貸出はそのまま残ります（取り消すなら代車カレンダーから）' : '')]
                .filter(Boolean).join('\n');
    const ttl = arch ? 'アーカイブから戻す' : '入庫を取り消して予約に戻す';
    const msg = (arch ? 'アーカイブから戻して、予約の状態にしますか？\n'
                      : 'この入庫を取り消して、予約に戻しますか？\n') + _cvLabel(c);
    _cvAsk(ttl, msg, det, arch ? 'アーカイブから戻す' : '予約に戻す')
      .then(function(yes){ if (yes) cvBackToReserve(); });
  };
  window.cvBackToReserve = function(){
    const c = _c; if (!c) return;
    /* 🔴 v1.136.0 **ボタンを消しただけにしない。** アーカイブ済みを戻せるのは管理者だけ。
       ⚠ 外から呼ばれても（古い画面・別タブ・コンソール）ここで止まる。 */
    if (window.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c)
        && PitArchive.canRestore && !PitArchive.canRestore()){
      if (PitArchive.denyRestore) PitArchive.denyRestore();
      return;
    }
    c.status = 'reserved';
    c.returnStage    = null;
    c.returnDate     = '';   c.returnTime = '';
    c.returnDateFinal = null; c.returnTbd = false;
    c.completedAt    = '';   c.completeCallAt = null;
    c.amountFinal    = null;                      /* 確定売上＝返した時に決まるもの。入庫を取り消したら無い */
    c.bayId = null; c.baySlot = null; c.testDrive = false;
    c.noSale = false; delete c.noSaleAt; delete c.noSaleBy;
    if (c.coverCall && typeof c.coverCall === 'object') c.coverCall.done = false;
    if (window.logFlow) logFlow(c, '入庫を取り消して予約に戻した');
    if (window.pitLog) pitLog('入庫を取り消して予約に戻した', { cardId: c.id, kind: 'phase', label: _cvLabel(c) });
    save(); cvRefreshBg();
    if (window.pitToast) pitToast('予約に戻しました');
    if (window.closeDetail) closeDetail();
  };

  /* ---- ② 売上なしでアーカイブする --------------------------------
     🗣 ゆうた「最終的に売り上げ0円で返車したとか、そういう車両が必ず存在する。
                クリックした時点でフローやその時の内容は通常通りアーカイブする。
                **来店履歴にも残すイメージ。でも実績には反映させずに、
                あくまで来店しただけの扱いで、次回以降に内容を把握できるようにしたい**」

     🔴 **実績カウント日（completedAt）は入れない。** 実績カレンダー・月次の実績・売上・
        メカの配分は全部この日付で拾っているので、**日付が無い＝どこにも数えられない**。
        さらに `noSale` の印で sales-count.js が塞いでいる＝**二重の守り**。
     🔴 **来店履歴には出す**（customers.js が `pitCardNoSale` を見ている）。日付は**来た日＝入庫日**。
     🔴 **金額は書き換えない。** 途中まで入っていた見積・受注の額は**本当に見積もった額**なので消さない。
        どこにも数えられないので残っていて害は無い。画面には「売上なし」の札で言い切る。
     ⚠ 車はもう手元に無いので `status='returned'`＝盤面・当日ビュー・返車の一覧から外れる。
        ただし **完TELを通ったことにはしない**（`returnStage` は触らない）＝通っていないのが事実。 */
  window.cvAskNoSale = function(){
    if (!_c) return; closeAllPop();
    const c = _c;
    const det = ['・フロー（進捗ログ）・作業内容・担当者は、いつもどおり残ります',
                 '・お客様の来店履歴には「売上なし」で残ります',
                 '🔴 実績カレンダー・売上・台数には一切入りません',
                 '・戻したい時は、この画面の ⋮ →「予約に戻す」で入庫の状態に戻せます'].join('\n');
    _cvAsk('売上なしでアーカイブする', '売上なしでアーカイブしますか？\n' + _cvLabel(c), det, '売上なしでアーカイブ')
      .then(function(yes){ if (yes) cvNoSaleArchive(); });
  };
  window.cvNoSaleArchive = function(){
    const c = _c; if (!c) return;
    const today = isoToday();
    c.noSale   = true;
    c.noSaleAt = today;
    c.noSaleBy = (window.pitFlowMe ? pitFlowMe() : '');
    c.status   = 'returned';        /* 車はもう手元にない＝盤面・当日・返車の一覧から外れる */
    c.completedAt = '';             /* 🔴 実績カウント日は入れない（＝実績・売上に乗る道が無い） */
    c.returnDateFinal = c.returnDateFinal || c.returnDate || today;
    if (!c.returnDate) c.returnDate = c.returnDateFinal;
    c.returnTbd = false;
    c.bayId = null; c.baySlot = null; c.testDrive = false;
    if (window.logFlow) logFlow(c, '売上なしでアーカイブした');
    if (window.pitLog) pitLog('売上なしでアーカイブした', { cardId: c.id, kind: 'out', label: _cvLabel(c) });
    save(); cvRefreshBg();
    if (window.pitToast) pitToast('売上なしでアーカイブしました（実績・売上には入りません）');
    if (window.closeDetail) closeDetail();
  };

  /* ⚠ v1.99.0 で ⋮メニューから「フェーズ移動」を外した（金額と担当者の関門を素通りできてしまうため）。
     この関数自体は、古い画面や外から呼ばれても落ちないように残してある。**新しく呼ばないこと。** */
  window.cvMovePhase = function(status){
    if(!_c) return; _c.status = status;
    if(!Array.isArray(_c.log)) _c.log=[];
    const d=new Date(); _c.log.push({ text:(window.statusLabel?statusLabel(status):status)+' に移動', at:(d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes()), by:(window.pitFlowMe?pitFlowMe():'') });
    save(); closeAllPop();
    renderCardView(_c, 'md-body-modal');
  };

  window.cvDeleteCard = function(){
    if(!_c) return; const idx = state.cards.findIndex(c=>c.id===_c.id);
    if(window.pitLog) pitLog('予約カードを消去', { kind:'delete', label: (_c.resNo? '['+_c.resNo+'] ':'') + ((window.pitCustName?pitCustName(_c):_c.customer)? (window.pitCustName?pitCustName(_c):_c.customer)+' 様':'') + (_c.car? ' / '+_c.car:'') });
    if(idx>=0) state.cards.splice(idx,1);
    cvCloseDel();
    if(window.closeDetail) closeDetail(); else save();
  };

  document.addEventListener('click', function(e){
    if(e.target && e.target.closest && e.target.closest('.cv-fusenpop,.cv-delpop,.cv-optmenu,.cv-optwrap')) return;
    closeAllPop();
  });

  // ===== 車検スケジュール =====
  /* 🚫 v1.50.0 自社の休みは MHS の定休日カレンダー（PitCal）が基準。長期休み・臨時休業も込み。 */
  function shopClosed(d){ return window.PitCal ? PitCal.isClosed(_isoOf(d)) : false; }
  function shopNote(iso){ return window.PitCal ? PitCal.label(iso) : ''; }
  function _isoOf(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function dayState(d){
    const iso = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const dow = d.getDay();
    const holi = (window.Holidays && Holidays.is) ? Holidays.is(iso) : false;
    const holiName = (window.Holidays && Holidays.name) ? Holidays.name(iso) : null;
    if(holi) return {iso:iso,cls:'off holi',off:true,tag:'祝・休',holiName:holiName};
    if(dow===0) return {iso:iso,cls:'off sun',off:true,tag:'陸運局休'};
    if(dow===6) return {iso:iso,cls:'off sat',off:true,tag:'陸運局休'};
    if(shopClosed(d)) return {iso:iso,cls:'off shop',off:true,tag:(shopNote(iso)||'自社定休')};
    return {iso:iso,cls:'valid',off:false,tag:''};
  }
  function cvBuildCal(){
    const track = document.getElementById('cv-cstrack'); if(!track || !_c) return;
    const sch = _c.inspSchedule; const base=new Date(); base.setHours(0,0,0,0);
    let html=''; const days=42;
    for(let i=0;i<days;i++){
      const d=new Date(base); d.setDate(base.getDate()+i);
      const st=dayState(d); const dow=d.getDay();
      const slots = sch.slots[st.iso]||[];
      const today=(i===0)?' cv-today':'';
      html+='<div class="cv-vday '+st.cls+today+'" data-iso="'+st.iso+'" onclick="cvDayClick(this)">';
      html+='<div class="cv-vsoon">最短</div><div class="cv-vcut">無理</div>';
      html+='<div class="cv-vhead"><div class="cv-vd">'+d.getDate()+'</div><div class="cv-vdow">'+((d.getDate()===1||i===0)?((d.getMonth()+1)+'月 '):'')+DOW[dow]+'</div>'+(st.holiName?'<div class="cv-vholi">'+esc(st.holiName)+'</div>':'')+'</div>';
      if(!st.off){
        html+='<div class="cv-vslots"><div class="cv-slot'+(slots.indexOf('am')>=0?' on':'')+'" onclick="cvToggleSlot(\''+st.iso+'\',\'am\',event)"><span class="cv-bx"></span>AM</div>'
            + '<div class="cv-slot'+(slots.indexOf('pm')>=0?' on':'')+'" onclick="cvToggleSlot(\''+st.iso+'\',\'pm\',event)"><span class="cv-bx"></span>PM</div></div>';
      } else { html+='<div class="cv-voff">'+st.tag+'</div>'; }
      html+='</div>';
    }
    track.innerHTML = html;
    if(sch.mode==='asap') track.classList.add('cv-locked'); else track.classList.remove('cv-locked');
    applyModeVisual();
  }
  function validEls(){ return Array.prototype.slice.call(document.querySelectorAll('#cv-cstrack .cv-vday.valid')); }
  function csBanner(type,txt){ const b=document.getElementById('cv-csbanner'); if(!b)return; b.className='cv-csbanner show '+type; b.innerHTML=txt; }
  function clearBanner(){ const b=document.getElementById('cv-csbanner'); if(b) b.className='cv-csbanner'; }
  function applyModeVisual(){
    const m=_c.inspSchedule.mode; const vds=validEls();
    vds.forEach(function(v){ v.classList.remove('cv-soon','cv-ask','cv-cut'); });
    if(m==='asap'){ if(vds[0]) vds[0].classList.add('cv-soon'); csBanner('amber','<i data-ic=bolt data-ics=15></i> 最短で行きたい：手動オフ。最短日を狙う（前日までに点検完了が条件）。AIが空きに合わせて確定。'); }
    else if(m==='ask'){ const cut=_c.inspSchedule.cutBefore||''; vds.forEach(function(v){ v.classList.add('cv-ask'); if(cut && v.dataset.iso<=cut) v.classList.add('cv-cut'); }); askBanner(); }
    else if(m==='thisweek'){ csBanner('blue','<i data-ic=calendar data-ics=16></i> 今週中ならどこでも：今週の行ける日に一括チェック。AIが最適な1枠を選ぶ。'); }
    else if(m==='nextweek'){ csBanner('blue','<i data-ic=calendar data-ics=16></i> 来週中ならどこでも：来週の行ける日に一括チェック。AIが最適な1枠を選ぶ。'); }
    else if(m==='undecided'){ csBanner('gray','<i data-ic=pin data-ics=16></i> 未定：いずれ行くが基本は考えない。でも忘れないように一覧には残す。'); }
    else clearBanner();
  }
  function askBanner(){
    const vds=validEls(); const cut=_c.inspSchedule.cutBefore||'';
    const kept=vds.filter(function(v){ return !cut || v.dataset.iso>cut; });
    const first=kept[0];
    let msg='<i data-ic=help data-ics=16></i> 可能か聞いて：青枠＝行く前提で全チェック。';
    if(cut) msg+=' 「'+fmtMD(cut)+'まで無理」で除外 →';
    msg+=' 残り <b>'+kept.length+'枠の日</b>'+(first?'（'+fmtMD(first.dataset.iso)+'〜）':'')+' をAIに渡し、後でメカ確認。';
    msg+=' <span class="cv-rst" onclick="cvCsMode(\'ask\')">↺ 戻す</span>';
    msg+='<br><span class="cv-muted2">「ここまで絶対無理」という日を押すと、その日と手前を予定から外します。</span>';
    csBanner('blue',msg);
  }
  function setAllValidSlots(rangeTest){
    _c.inspSchedule.slots = {};
    validEls().forEach(function(v){ const iso=v.dataset.iso; if(!rangeTest||rangeTest(iso)) _c.inspSchedule.slots[iso]=['am','pm']; });
  }
  function endOfWeek(base){ const e=new Date(base); e.setDate(base.getDate()+(6-base.getDay())); return e.getFullYear()+'-'+pad(e.getMonth()+1)+'-'+pad(e.getDate()); }
  function nextWeek(base){ const s=new Date(base); s.setDate(base.getDate()+(7-base.getDay())); const e=new Date(s); e.setDate(s.getDate()+6);
    return [s.getFullYear()+'-'+pad(s.getMonth()+1)+'-'+pad(s.getDate()), e.getFullYear()+'-'+pad(e.getMonth()+1)+'-'+pad(e.getDate())]; }

  window.cvCsMode = function(m){
    if(!_c) return; _c.inspSchedule.mode=m; _c.inspSchedule.cutBefore='';
    const base=new Date(); base.setHours(0,0,0,0); const todayISO=base.getFullYear()+'-'+pad(base.getMonth()+1)+'-'+pad(base.getDate());
    if(m==='manual'){ /* 触らない */ }
    else if(m==='asap'){ _c.inspSchedule.slots={}; }
    else if(m==='thisweek'){ const eo=endOfWeek(base); setAllValidSlots(function(iso){ return iso>=todayISO && iso<=eo; }); }
    else if(m==='nextweek'){ const r=nextWeek(base); setAllValidSlots(function(iso){ return iso>=r[0] && iso<=r[1]; }); }
    else if(m==='ask'){ setAllValidSlots(null); }
    else if(m==='undecided'){ _c.inspSchedule.slots={}; }
    save(); cvBuildCal();
  };
  window.cvToggleSlot = function(iso, ap, ev){
    if(ev) ev.stopPropagation();
    if(_c.inspSchedule.mode==='asap') return;
    const s=_c.inspSchedule.slots; if(!s[iso]) s[iso]=[];
    const k=s[iso].indexOf(ap); if(k>=0) s[iso].splice(k,1); else s[iso].push(ap);
    if(!s[iso].length) delete s[iso];
    save(); cvBuildCal();
  };
  window.cvDayClick = function(cell){
    if(_c.inspSchedule.mode!=='ask' || cell.classList.contains('off')) return;
    const iso=cell.dataset.iso; _c.inspSchedule.cutBefore = iso;
    const s={}; validEls().forEach(function(v){ if(v.dataset.iso>iso) s[v.dataset.iso]=['am','pm']; });
    _c.inspSchedule.slots=s; save(); cvBuildCal();
  };

  // ===== 車検 実施記録（済／再検・担当者入力・フローへ記録） =====
  function _isoToday(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function _mdOf(iso){ if(window.fmtMD) return fmtMD(iso); const p=String(iso).split('-'); return (+p[1])+'/'+(+p[2]); }
  window.cvShakenGo = function(kind){
    if(!_c) return; const s=_c.inspSchedule||{};
    window._cvShSlot = (s.decidedSlot==='pm')?'pm':'am';
    const defDate = s.decided || _isoToday();
    const cur = (s.resultStaff||(window.pitFlowMe?pitFlowMe():'')||'');   /* 🔴 v1.55.0 既定＝自分（同じ死んだ変数を見ていた） */
    const staffOpts = (state.staff||[]).map(function(m){ return '<option value="'+esc(m.name)+'"'+(cur===m.name?' selected':'')+'>'+esc(m.name)+'</option>'; }).join('');
    const isDone = (kind==='done');
    const title = isDone ? '<i data-ic=check data-ics=16></i> 車検済を記録' : '↺ 再検を記録';
    const body = '<div class="cv-shpb">'
      + '<label>行った日</label><input type="date" id="cv-shdate" value="'+defDate+'">'
      + '<label>時間帯</label><div class="cv-shslot" id="cv-shslot"><button type="button" data-s="am" class="'+(window._cvShSlot==='am'?'on':'')+'" onclick="cvShSlot(this)">AM</button><button type="button" data-s="pm" class="'+(window._cvShSlot==='pm'?'on':'')+'" onclick="cvShSlot(this)">PM</button></div>'
      + '<label>担当（回送＝実際に車検に行った人）</label><select id="cv-shstaff">'+staffOpts+'</select>'
      /* 🔴 v1.120.0 ここでも陸運局とラウンドを確定できるようにした（ゆうた指定）。
         ⚠ 選択肢は **CoreMembers の場所マスターで「陸運局」のバッジが付いた場所**だけ。
            窓口は members-pit.js の `pitRikuunList()` 1本。ここで条件を書き直さない。
         ⚠ 車検予定の画面で入れてあれば、そのまま選ばれた状態で開く（入れ直させない）。 */
      + '<label>陸運局</label><select id="cv-shoffice">'
        + '<option value="">（未定）</option>'
        + (window.pitRikuunList?pitRikuunList():[]).map(function(o){ return '<option value="'+esc(o.id)+'"'+(s.office===o.id?' selected':'')+'>'+esc(o.name)+'</option>'; }).join('')
        + '</select>'
      + '<label>R（ラウンド）</label><select id="cv-shround">'
        + '<option value="">（未定）</option>'
        + [1,2,3,4].map(function(n){ return '<option value="'+n+'"'+(Number(s.round)===n?' selected':'')+'>'+n+'R</option>'; }).join('')
        + '</select>'
      + '<div class="cv-shpb-act"><button class="cv-shbtn '+(isDone?'ok':'re')+'" onclick="cvShConfirm(\''+kind+'\')">記録する</button><button class="cv-shbtn ghost" onclick="cvShClose()">やめる</button></div>'
      + '</div>';
    let back=document.getElementById('cv-shpop');
    if(!back){ back=document.createElement('div'); back.id='cv-shpop'; back.className='modal-backdrop'; pitModalOutside(back, cvShClose); document.body.appendChild(back); }
    back.innerHTML='<div class="pdp-box cv-shbox"><div class="pdp-head"><span>'+title+'</span><button class="pdp-x" onclick="cvShClose()"><i data-ic=close data-ics=16></i></button></div>'+body+'</div>';
    back.classList.add('show');
  };
  window.cvShSlot = function(btn){ window._cvShSlot = btn.getAttribute('data-s'); const w=document.getElementById('cv-shslot'); if(w) w.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b===btn); }); };
  window.cvShClose = function(){ const b=document.getElementById('cv-shpop'); if(b) b.classList.remove('show'); };
  window.cvShConfirm = function(kind){
    if(!_c) return; const s=_c.inspSchedule||(_c.inspSchedule={mode:'manual',slots:{}});
    const dEl=document.getElementById('cv-shdate'); const stEl=document.getElementById('cv-shstaff');
    const iso=(dEl&&dEl.value)||_isoToday(); const slot=(window._cvShSlot==='pm')?'pm':'am'; const staff=(stEl&&stEl.value)||'';
    /* 🔴 v1.120.0 陸運局とラウンドも一緒に確定する（ゆうた指定「済みにした時点で予約詳細にも埋め込む」）。
       ⚠ 陸運局は **id で持ち、名前は控えの写し**（CoreMembers で場所が消えても記録が空にならないように）。 */
    const ofEl=document.getElementById('cv-shoffice'), rdEl=document.getElementById('cv-shround');
    if(ofEl){ s.office=ofEl.value||''; s.officeName = s.office ? ((window.pitLocName?pitLocName(s.office):'') || s.officeName || '') : ''; }
    if(rdEl){ const _r=Number(rdEl.value||0); s.round=(_r>=1&&_r<=4)?_r:0; }
    const _wh='（回送:'+(staff||'—')+'／'+(s.officeName||'陸運局未定')+'／'+(s.round?s.round+'R':'R未定')+'）';
    if(!Array.isArray(s.history)) s.history=[];
    if(kind==='done'){
      s.result='done'; s.resultDate=iso; s.resultSlot=slot; s.resultStaff=staff; s.decided=iso; s.decidedSlot=slot;
      if(window.logFlow) logFlow(_c, '車検 済 '+_mdOf(iso)+' '+(slot==='pm'?'PM':'AM')+_wh);
    } else {
      /* ⚠ 再検の記録にも、その回どこへ誰が行って何Rだったかを残す（あとから振り返れるように） */
      s.history.push({date:iso, slot:slot, result:'recheck', staff:staff, office:s.office||'', officeName:s.officeName||'', round:s.round||0});
      s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; s.resultStaff='';
      /* ⚠ 陸運局とRは残す＝次に決め直す時、たいてい同じ所へ行くので入れ直させない（車検予定の画面と同じ考え方） */
      if(window.logFlow) logFlow(_c, '車検 再検 '+_mdOf(iso)+' '+(slot==='pm'?'PM':'AM')+_wh);
    }
    save(); cvShClose(); renderCardView(_c,'md-body-modal');
    if(window.renderShaken && window.state && state.currentView==='shakencal') renderShaken();
  };
  window.cvShakenReopen = function(){
    if(!_c) return; const s=_c.inspSchedule||{};
    s.result=''; s.resultDate=''; s.resultSlot=''; s.resultStaff='';
    if(window.logFlow) logFlow(_c, '車検 済を取消');
    save(); renderCardView(_c,'md-body-modal');
    if(window.renderShaken && window.state && state.currentView==='shakencal') renderShaken();
  };

})();
