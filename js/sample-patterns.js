/* ========================================
   sample-patterns.js  -  カード設計の比較サンプル（今だけ・たたき台）／PitFlow
   ----------------------------------------
   「入庫カードにどこまで情報を持たせるか」をチームで決めるための見比べ用。
   案A〜D を切り替えて、持つ情報・メリット・デメリット＋カードのモックアップを表示。
   ※実データには未接続。決まったらこのメニューは消す。
   ======================================== */
(function () {
  let cur = 'B';

  // 例：架空の1台
  const EX = {
    customer:'カワシマ', tel:'090-1234-5678', repeat:'リピーター',
    car:'BMW MINI（R56）', plate:'練馬 300 か 11-11',
    inAt:'6/3（火）10:30', retAt:'6/5（木）夕方', work:'車検', menu:'24ヶ月点検・車検整備',
    front:'椎名', staff:'壱谷'
  };

  function fld(label, val){ return '<div class="sp-fld"><div class="sp-fl">'+label+'</div><div class="sp-fv">'+(val||'—')+'</div></div>'; }
  function row(){ return '<div class="sp-row">'+Array.prototype.slice.call(arguments).join('')+'</div>'; }
  function sec(title, inner){ return '<div class="cf-section"><div class="cf-section-head">'+title+'</div><div class="cf-section-body">'+inner+'</div></div>'; }
  function chk(label, on, who){
    return '<div class="sp-chk'+(on?' on':'')+'" onclick="spToggle(this)"><span class="sp-box">'+(on?'✓':'')+'</span>'+
      '<span class="sp-cl">'+label+'</span>'+(who?'<span class="sp-who">'+who+'</span>':'<span class="sp-who sp-none">未</span>')+'</div>';
  }
  function meas(label, val, unit){ return '<div class="sp-meas"><span class="sp-ml">'+label+'</span><span class="sp-mv">'+val+'</span><span class="sp-mu">'+unit+'</span></div>'; }

  // 受付・フロント部分（全案共通の土台）
  function baseSections(){
    let h='';
    h+=sec('<i data-ic=user data-ics=16></i> 基本情報', row(fld('お客様',EX.customer+' 様'), fld('TEL',EX.tel)) + row(fld('ナンバー',EX.plate), fld('区分',EX.repeat)));
    h+=sec('<i data-ic=car data-ics=16></i> 車両・日程', row(fld('車名・型式',EX.car)) + row(fld('入庫',EX.inAt), fld('返車予定',EX.retAt)));
    h+=sec('<i data-ic=wrench data-ics=16></i> 作業内容', row(fld('作業タイプ',EX.work)) + row(fld('整備内容',EX.menu)));
    h+=sec('<i data-ic=users data-ics=16></i> 担当', row(fld('フロント',EX.front), fld('作業担当',EX.staff)));
    return h;
  }

  const PATTERNS = {
    A: {
      name:'案A：受付・フロントだけ（最小）',
      tag:'整備チェックは紙ハンコのまま。PitFlowは受付〜進捗だけ。',
      holds:['お客様・連絡先・車・ナンバー','入庫/返車の日程','作業タイプ・整備内容（自由記入）','担当・代車・メモ'],
      pros:['シンプルで受付が迷わない','整備ソフトと完全にすみ分け','作るのが一番早い'],
      cons:['整備の「やったか」がPitFlowに出ない＝進捗が受付で止まる','紙ハンコの抜け漏れは防げないまま'],
      mock:function(){
        return baseSections()
          + sec('<i data-ic=van data-ics=16></i> 代車・<i data-ic=pencil data-ics=16></i> メモ', row(fld('代車','不要')) + row(fld('メモ','—')))
          + '<div class="sp-paper"><i data-ic=sticky data-ics=16></i> オイル・空気圧などの作業チェックは <b>紙のハンコ＋✓</b> のまま（この案では取り込まない）</div>';
      }
    },
    B: {
      name:'案B：受付＋かんたん作業チェック（ハンコ電子化）',
      tag:'紙ハンコをそのまま電子化。作業タイプ別の定番項目を✓＋作業者。',
      holds:['案Aの全部','作業チェック：タイプ別の定番項目を ✓＋作業者＋時刻','例）オイル・エレメント・空気圧・灯火・洗車'],
      pros:['紙ハンコを置き換え＝抜け漏れ防止','誰がどこまでやったかが進捗に出る','軽い・現場が迷わない','整備ソフトの法定記録とは別物なので二重管理にならない'],
      cons:['作業タイプ別の項目テンプレを最初に設定する必要あり'],
      mock:function(){
        const checks = '<div class="sp-checks">'
          + chk('オイル交換', true, '壱谷 10:40')
          + chk('オイルエレメント', true, '壱谷 10:40')
          + chk('空気圧調整', false, '')
          + chk('灯火類', true, '壱谷 10:55')
          + chk('洗車', false, '')
          + '</div>';
        return baseSections()
          + sec('<i data-ic=check data-ics=16></i> 作業チェック（車検タイプの定番項目）', checks + '<div class="sp-hint">タップでチェック。項目は作業タイプごとに設定で編集できる想定。</div>')
          + sec('<i data-ic=van data-ics=16></i> 代車', row(fld('代車','不要')));
      }
    },
    C: {
      name:'案C：受付＋しっかり整備チェック（区分＋測定値）',
      tag:'チェックを「点検／交換／測定」に区分。一部は数値も入れる。',
      holds:['案Bの全部','チェックを点検/交換/測定に区分','測定値の入力（空気圧kPa・残量mm 等）','項目ごとのメモ'],
      pros:['現場の記録が濃い・引き継ぎが強い','点検結果が数値で残る'],
      cons:['入力の手間が増える','整備ソフトの点検記録と内容が近づき“重複感”が出やすい'],
      mock:function(){
        const tenken='<div class="sp-checks">'+chk('ブレーキパッド', true,'壱谷')+chk('タイヤ', true,'壱谷')+chk('バッテリー', true,'壱谷')+'</div>';
        const koukan='<div class="sp-checks">'+chk('オイル交換', true,'壱谷')+chk('エレメント', true,'壱谷')+'</div>';
        const sokutei='<div class="sp-meass">'+meas('ブレーキ残量(前)','7.5','mm')+meas('タイヤ溝(前)','5','mm')+meas('空気圧(前)','240','kPa')+meas('空気圧(後)','230','kPa')+'</div>';
        return baseSections()
          + sec('<i data-ic=search data-ics=16></i> 点検', tenken)
          + sec('<i data-ic=refresh data-ics=16></i> 交換', koukan)
          + sec('<i data-ic=ruler data-ics=16></i> 測定値', sokutei + '<div class="sp-hint">数値も残すので、次回との比較や引き継ぎに使える。</div>')
          + sec('<i data-ic=pencil data-ics=16></i> 整備メモ', row(fld('メモ','右フロント パッド次回交換目安')));
      }
    },
    D: {
      name:'案D：受付＋バックオフィス（返車後の後処理まで）',
      tag:'「返車したら終わり」じゃない。返車後の後処理（カルテ確認・原価チェック・請求/入金・締め）まで1枚で追う。CarFlowのバックオフィスと同じ考え方。',
      holds:['案Bの全部（受付＋かんたん作業チェック）','返車後の「バックオフィス」欄','・カルテ（点検結果）の最終確認','・原価チェック（部品・外注の仕入）','・請求発行／入金確認','・後処理 完了で締め'],
      pros:['「返車して終わり」の取りこぼし（後処理の抜け漏れ）を防ぐ','1台を最後（締め）まで誰が見ても分かる','受付→整備→返車→後処理→完了、の一連が1枚で追える','CarFlowのバックオフィスと統一感'],
      cons:['後処理は事務寄り＝現場スタッフには不要な欄もある（権限/表示の出し分けが要る）','原価・請求は整備ソフト/会計と重複しない範囲に絞る必要あり'],
      mock:function(){
        const checks='<div class="sp-checks">'+chk('オイル交換',true,'壱谷')+chk('空気圧調整',true,'壱谷')+chk('灯火類',true,'壱谷')+'</div>';
        const bo='<div class="sp-checks">'
          +chk('カルテ（点検結果）最終確認',true,'椎名')
          +chk('原価チェック（部品・外注）',false,'')
          +chk('請求発行',false,'')
          +chk('入金確認',false,'')
          +chk('後処理 完了（締め）',false,'')
          +'</div>';
        const genka='<div class="sp-meass">'+meas('部品原価','12,400','円')+meas('外注','0','円')+'</div>';
        return baseSections()
          + sec('<i data-ic=check data-ics=16></i> 作業チェック（かんたん）', checks)
          + sec('<i data-ic=folder data-ics=16></i> バックオフィス（返車後の後処理）', bo + genka + '<div class="sp-hint">受付 → 整備 → 返車 → <b>後処理（カルテ確認・原価・請求/入金・締め）</b> → 完了、までを1枚で。原価/請求は整備ソフト・会計と重複しない範囲に絞る前提。事務向けなので現場には隠す等の出し分けが要る。</div>');
      }
    }
  };

  window.spPick = function(p){ cur = p; renderSamplePatterns(); };
  window.spToggle = function(el){
    el.classList.toggle('on');
    el.querySelector('.sp-box').textContent = el.classList.contains('on') ? '✓' : '';
  };

  window.renderSamplePatterns = function(){
    const wrap = document.getElementById('view-samplepat-body'); if(!wrap) return;
    const p = PATTERNS[cur];
    const tabs = Object.keys(PATTERNS).map(k=>'<button class="sp-tab'+(k===cur?' on':'')+'" onclick="spPick(\''+k+'\')">'+k+'</button>').join('');
    let h='';
    h+='<div class="sp-banner"><i data-ic=flask data-ics=16></i> <b>カード設計のたたき台</b>：チームで「入庫カードにどこまで持たせるか」を決めるための見比べ用です。実データには繋がっていません。決まったらこのメニューは消します。</div>';
    h+='<div class="sp-tabs">'+tabs+'</div>';
    h+='<div class="sp-grid">';
    // 左：説明
    h+='<div class="sp-desc">';
    h+='<h3>'+p.name+'</h3><div class="sp-tagline">'+p.tag+'</div>';
    h+='<div class="sp-block"><div class="sp-bt">持つ情報</div><ul>'+p.holds.map(x=>'<li>'+x+'</li>').join('')+'</ul></div>';
    h+='<div class="sp-block sp-pros"><div class="sp-bt">◎ メリット</div><ul>'+p.pros.map(x=>'<li>'+x+'</li>').join('')+'</ul></div>';
    h+='<div class="sp-block sp-cons"><div class="sp-bt">△ デメリット</div><ul>'+p.cons.map(x=>'<li>'+x+'</li>').join('')+'</ul></div>';
    h+='</div>';
    // 右：モックアップ
    h+='<div class="sp-mock"><div class="sp-mock-head">入庫カード イメージ（'+cur+'案）</div><div class="sp-mock-body">'+p.mock()+'</div></div>';
    h+='</div>';
    wrap.innerHTML=h;
  };
})();
