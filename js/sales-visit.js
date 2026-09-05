/* ========================================
   sales-visit.js  -  来店属性（売上ビューの5つ目のタブ）/ PitFlow v2.59.0
   ----------------------------------------
   🗣 ゆうた（2026-09-04）「売上に新規ビューを追加。**7ページ目の資料をカウントしてビューとしてまとめて**」
     ＝ 手で作っていた Excel「2026 来店属性集計」を、PitFlow の実データから出す。
   （判定）「**お客様単位の過去来店**」／（区分）「**車検点検＋その他を一般に全部よせる**（総計数を伝票数と合わせるイメージ）」
   （数える日）「**実績の日（返車）**」／（クォーター）「作る」

   ◎ 元の表の中身
     入庫台数 … 車検・点検／一般 × リピーター／一見
     IR率     … リピーターと一見の割合
     KY率     … 国産と輸入の台数と割合
     クォーター結果 … 月を 1〜7日／8〜15日／16〜23日／24〜末日 の4つに割ったもの

   🔴🔴 **数える集合は実績カレンダーの「数える側」と同じ。**
      ＝ 実績カウント日（`completedAt`）がその月／作業完了 or 返車済み／売上なしは外す。
      ⚠ ここで条件を書き直さない（`pitCardNoSale` は物差し1本）。**総計＝伝票の数**になるのが狙い。

   🔴🔴 **リピーターかどうかは、予約の「初回／リピーター」の札（`c.repeat`）で決める。**
      🗣 ゆうた（2026-09-04・あとから変更）「**一見・リピーターは予約の初回リピーターバッジで判断して**」

   🔴🔴🔴 **札が空のものは、どちらにも入れない。「未チェック」として独立して数える。**（v2.61.0）
      🗣 ゆうた（大前提）「**伝票＝PitFlow＝実台数 が永遠にイコールになり続ける運用を目指したい**」
      🗣「各クォーターごと、月末ごとに…全部±0になるまで修正」「**漏れを許容するって考えは少なめで**」
      ＝ **抜けは「許す」のではなく「0にする対象として数を出す」。**
      ⚠ v2.60.0 では空を来店履歴で補っていた（総計は合うが**内訳が推測で埋まる**）。
         それだと**埋める動機が消える**ので、独立した行に立てた。
      ⚠ だから **リピーター％＋一見％は、未チェックがある間 100% にならない**。足りないぶんが抜けの量。
      ⚠ 来店履歴からの推測は**参考として1行だけ**出す（埋める時の手がかり。数字には混ぜない）。
      ⚠ v1.88.0 の決めごと「**まだ選んでいないものを初回だと決めつけない**」とも、この形の方が合っている。
   ======================================== */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function pct(n,d){ return d>0 ? Math.round(n/d*100)+'%' : '—'; }
  function pctN(n,d){ return d>0 ? (n/d*100) : 0; }
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function noSale(c){ return !!(window.pitCardNoSale && pitCardNoSale(c)); }
  function teamOf(c){ return (window.pitTeamKey?pitTeamKey(c):((c&&c.boardId==='import')?'import':'default')); }

  /* 車検・点検か。⚠ 併用（車検＋B.P など）は**車検が入っていれば車検・点検**。
     それ以外は**ぜんぶ一般**（ゆうた指定「その他を一般に全部よせる」＝総計が伝票の数と合う）。 */
  function isInsp(c){
    var ids = (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes : [c.workType];
    for (var i=0;i<ids.length;i++) if (ids[i]==='shaken' || ids[i]==='12pt') return true;
    return false;
  }

  /* お客様のまとまり。id があればそれ、無ければ漢字＋カナで寄せる。
     ⚠ どちらも空＝**その1枚だけの人**として扱う（ほかの空欄と混ぜない）。 */
  function custKey(c){
    if (c.customerId) return 'id:'+c.customerId;
    var nm=String(c.customer||'').trim(), kn=String(c.kana||'').trim();
    if (nm||kn) return 'nm:'+nm+'|'+kn;
    return 'card:'+c.id;
  }

  /* 🔴🔴 v2.59.1（ゆうた 2026-09-04）**スライド＝売上日は前の月なのに、返車（実績）が今月になったもの。**
     🗣「売上日が先月中　だが、返車日（実績）が今月の物　実際に1Qに生産したものじゃないというものがスライド」
     ＝ **今月の数字に乗っているが、今月作った仕事ではない**。元の Excel のクォーター表の先頭にある列。
     ⚠ 売上日は `pitSalesDate` 1本で読む（自分の売上日が無い車は完TEL日を借りて答える作り）。
        ここで `c.salesDate || c.completeCallAt` と書き写さないこと。
     ⚠ 売上日が分からない車は**スライドにしない**（分からないものを断定しない）。
     ⚠ 見るのは**月**であって日数ではない（同じ月の中で何日ズレていてもスライドではない）。 */
  function monthOf(iso){ return String(iso||'').slice(0,7); }
  function isSlide(c){
    var sd = window.pitSalesDate ? String(pitSalesDate(c)||'') : '';
    if(!sd) return false;
    var m1 = monthOf(sd), m2 = monthOf(c.completedAt);
    return !!(m1 && m2 && m1 < m2);
  }

  /* 実績になったカード全部（期間で切らない＝過去来店を見るために全部要る） */
  function allDone(){
    return (state.cards||[]).filter(function(c){
      if(!c) return false;
      if(c.status!=='workDone' && c.status!=='returned') return false;
      if(!c.completedAt) return false;
      return !noSale(c);
    });
  }

  /* お客様ごとの実績日の一覧（早い順）。リピーター判定はこれを見る。 */
  function custDates(all){
    var m={};
    all.forEach(function(c){ var k=custKey(c); (m[k]=m[k]||[]).push(String(c.completedAt)); });
    Object.keys(m).forEach(function(k){ m[k].sort(); });
    return m;
  }
  /* 来店履歴から見た「前に来ているか」。⚠ 札が空の時の補いと、食い違いを数える時だけ使う。 */
  function seenBefore(c, dates){
    var a=dates[custKey(c)]||[];
    var d=String(c.completedAt);
    for (var i=0;i<a.length;i++){ if(a[i] < d) return true; }   /* その日より前に来ていれば */
    return false;
  }
  /* 🔴 本番の判定。返すのは { kind:'rep'|'first'|'none', guess:true/false }
     ⚠ 'none' ＝ 札が空＝**まだ分からない**。数字を作らない（guess は参考の推測だけ）。 */
  function judge(c, dates){
    var tag=String(c.repeat||'').trim();
    if (tag==='repeater') return { kind:'rep',   guess:seenBefore(c, dates) };
    if (tag==='first')    return { kind:'first', guess:seenBefore(c, dates) };
    return { kind:'none',  guess:seenBefore(c, dates) };
  }

  /* 空の集計箱 */
  function box(){
    return { insp:{rep:0,first:0,none:0}, gen:{rep:0,first:0,none:0}, dom:0, imp:0, all:0,
             mismatch:0, none:0, guessRep:0, guessFirst:0, noSalesDate:0, slide:0 };
  }
  function put(b, c, j, dates){
    var k = isInsp(c) ? 'insp' : 'gen';
    b[k][j.kind]++;
    if (teamOf(c)==='import') b.imp++; else b.dom++;
    b.all++;
    if (j.kind==='none'){
      /* 🔴 未チェック＝**0にする対象**。参考に「来店履歴だとどちらか」も数えておく（数字には混ぜない） */
      b.none++;
      if (j.guess) b.guessRep++; else b.guessFirst++;
    } else if (j.guess !== (j.kind==='rep')){
      /* 🔴 札は入っているが来店履歴と食い違うもの＝**付け間違いの疑い**（数字は札のとおり） */
      b.mismatch++;
    }
    /* 🔴 v2.61.0 売上日が空＝**スライドかどうか判断できない**車。これも0にする対象 */
    if (!(window.pitSalesDate ? String(pitSalesDate(c)||'') : '')) b.noSalesDate++;
    /* 🔴 スライド＝今月の数字に乗っているが、今月作った仕事ではない */
    if (isSlide(c)) b.slide++;
  }
  function totalRep(b){ return b.insp.rep + b.gen.rep; }
  function totalFirst(b){ return b.insp.first + b.gen.first; }
  function totalNone(b){ return b.insp.none + b.gen.none; }

  /* 期間で集める */
  function collect(fromStr, toStr){
    var all=allDone(), dates=custDates(all), b=box();
    all.forEach(function(c){
      var d=String(c.completedAt);
      if(d<fromStr || d>toStr) return;
      put(b, c, judge(c, dates), dates);
    });
    return b;
  }
  /* 会計年度（12月〜翌11月）の12か月ぶん。⚠ 期間の決め方は売上ビューと同じ。 */
  function collectYear(Y){
    var all=allDone(), dates=custDates(all);
    var slots=[], i;
    slots.push({ y:Y-1, m:11, label:'昨12月' });
    for(i=0;i<11;i++) slots.push({ y:Y, m:i, label:(i+1)+'月' });
    slots.forEach(function(s){
      s.from=ymdL(new Date(s.y,s.m,1)); s.to=ymdL(new Date(s.y,s.m+1,0)); s.b=box();
    });
    var tot=box();
    all.forEach(function(c){
      var d=String(c.completedAt);
      for(var i2=0;i2<slots.length;i2++){
        if(d>=slots[i2].from && d<=slots[i2].to){
          var j=judge(c, dates);
          put(slots[i2].b, c, j, dates); put(tot, c, j, dates);
          break;
        }
      }
    });
    return { slots:slots, total:tot };
  }
  /* 月を4つに割る（1〜7／8〜15／16〜23／24〜末）＝元の表の「クォーター結果」。
     🔴 先頭は**スライド**（売上日が前の月＝今月作った仕事ではない）。
        ⚠ スライドは4つの枠に**入れない**＝ 1/4〜4/4 は「その月に作って、その週に返した数」になる。
        ＝ スライド＋1/4〜4/4 ＝ その月の合計。元の Excel と同じ足し算。 */
  function collectQuarters(y, m){
    var last=new Date(y,m+1,0).getDate();
    var cuts=[[1,7],[8,15],[16,23],[24,last]];
    var all=allDone(), dates=custDates(all);
    var qs=[{ label:'スライド', range:'先月売上', slide:true, b:box() }].concat(
      cuts.map(function(c,i){
        return { label:(i+1)+'/4', range:'〜'+c[1]+'日',
          from:ymdL(new Date(y,m,c[0])), to:ymdL(new Date(y,m,c[1])), b:box() };
      }));
    var moS=ymdL(new Date(y,m,1)), moE=ymdL(new Date(y,m+1,0));
    all.forEach(function(c){
      var d=String(c.completedAt);
      if(d<moS || d>moE) return;
      var j=judge(c, dates);
      if(isSlide(c)){ put(qs[0].b, c, j, dates); return; }  /* 🔴 スライドは週に入れない */
      for(var i=1;i<qs.length;i++){
        if(d>=qs[i].from && d<=qs[i].to){ put(qs[i].b, c, j, dates); break; }
      }
    });
    return qs;
  }

  /* ═══ 比率のバー（2つに割るだけ。表と同じ数字を絵にしているだけのもの） ═══
     ⚠ 色は css のクラスで持つ（js に色を直書きしない）。
     ⚠ 見分けと数字を必ず横に置く＝色だけで意味を運ばない。 */
  /* ⚠ 3つ目（未チェック）は**入っている時だけ**出す。0なら出さない＝0が正しい姿。 */
  function ratioBar(aN, bN, aLb, bLb, cls, cN, cLb){
    cN = cN || 0;
    var t=aN+bN+cN;
    if(!t) return '<div class="vst-bar-empty">この期間の実績はまだありません</div>';
    return '<div class="vst-bar '+(cls||'')+'">'
      + '<i class="vst-a" style="width:'+pctN(aN,t).toFixed(1)+'%"></i>'
      + '<i class="vst-b" style="width:'+pctN(bN,t).toFixed(1)+'%"></i>'
      + (cN?'<i class="vst-c" style="width:'+pctN(cN,t).toFixed(1)+'%"></i>':'')+'</div>'
      + '<div class="vst-lg"><span><i class="vst-sw vst-sw-a"></i>'+aLb+' <b>'+aN+'</b>台 '+pct(aN,t)+'</span>'
      + '<span><i class="vst-sw vst-sw-b"></i>'+bLb+' <b>'+bN+'</b>台 '+pct(bN,t)+'</span>'
      + (cN?'<span><i class="vst-sw vst-sw-c"></i>'+(cLb||'未チェック')+' <b>'+cN+'</b>台 '+pct(cN,t)+'</span>':'')+'</div>';
  }

  /* ═══ 表（元の Excel と同じ行の並び） ═══ */
  function matrix(cols, tot, headLb){
    /* ⚠ まだ来ていない月は **0 ではなく「–」**（元の Excel と同じ）。
       0 と書くと「その月は1台も入らなかった」に読めてしまう。 */
    function cell(b, f){ return (b.all===0) ? '<span class="vst-none">–</span>' : f(b); }
    function row(lb, cls, f){
      var h='<tr class="'+(cls||'')+'"><td class="sv-td-name">'+lb+'</td>';
      cols.forEach(function(c){ h+='<td class="sv-num">'+cell(c.b, f)+'</td>'; });
      h+='<td class="sv-num vst-tot">'+cell(tot, f)+'</td></tr>';
      return h;
    }
    var h='<table class="sv-table vst-tbl"><thead><tr><th>'+headLb+'</th>'
      + cols.map(function(c){ return '<th>'+esc(c.label)+(c.range?'<small>'+esc(c.range)+'</small>':'')+'</th>'; }).join('')
      + '<th>合計</th></tr></thead><tbody>';
    h+=row('車検・点検　リピーター','vst-rep',function(b){return b.insp.rep;});
    h+=row('車検・点検　一見','vst-first',function(b){return b.insp.first;});
    h+=row('一般　リピーター','vst-rep',function(b){return b.gen.rep;});
    h+=row('一般　一見','vst-first',function(b){return b.gen.first;});
    h+=row('合計　リピーター','vst-rep vst-sum',function(b){return totalRep(b);});
    h+=row('合計　一見','vst-first vst-sum',function(b){return totalFirst(b);});
    /* 🔴 v2.61.0 未チェック＝札を選んでいないもの。**0にする対象**なので必ず表に立てる */
    h+=row('未チェック（初回／リピーター 未選択）','vst-none-row',function(b){return totalNone(b);});
    h+=row('IR率　リピーター','vst-rep',function(b){return pct(totalRep(b), b.all);});
    h+=row('IR率　一見','vst-first',function(b){return pct(totalFirst(b), b.all);});
    h+=row('KY率　国産','vst-dom',function(b){return b.dom;});
    h+=row('KY率　輸入','vst-imp',function(b){return b.imp;});
    h+=row('KY率　国産率','vst-dom',function(b){return pct(b.dom, b.all);});
    h+=row('KY率　輸入率','vst-imp',function(b){return pct(b.imp, b.all);});
    h+=row('合計','vst-grand',function(b){return b.all;});
    /* 🔴 v2.59.1 うちスライド＝その合計のうち、今月作った仕事ではないぶん（ゆうた指定） */
    h+=row('うちスライド（先月売上・今月返車）','vst-slide',function(b){return b.slide;});
    h+='</tbody></table>';
    return h;
  }

  function heroHtml(b, lb){
    return '<div class="sv-hero"><div class="sv-hero-row">'
      + '<div class="sv-hero-main"><div class="sv-hero-lb">'+lb+'</div>'
      +   '<div class="sv-hero-num">'+b.all+'<span>台</span></div>'
      +   '<div class="sv-hero-sub">車検・点検 '+(b.insp.rep+b.insp.first)+'　／　一般 '+(b.gen.rep+b.gen.first)
      +     (b.slide?'　／　<b class="vst-slide-n">うちスライド '+b.slide+'</b>':'')+'</div></div>'
      + '<div class="sv-hero-main"><div class="sv-hero-lb">IR率（リピーター）</div>'
      +   '<div class="sv-hero-num vst-num-a">'+pct(totalRep(b), b.all)+'</div>'
      +   '<div class="sv-hero-sub">一見 '+pct(totalFirst(b), b.all)
      +     (totalNone(b)?'　／　<b class="vst-none-n">未チェック '+totalNone(b)+'</b>':'')+'</div></div>'
      + '<div class="sv-hero-main"><div class="sv-hero-lb">KY率（国産）</div>'
      +   '<div class="sv-hero-num vst-num-dom">'+pct(b.dom, b.all)+'</div>'
      +   '<div class="sv-hero-sub">輸入 '+pct(b.imp, b.all)+'</div></div>'
      + '</div></div>';
  }

  function barsCard(b, title){
    return '<div class="sv-card"><div class="sv-card-h"><span>'+title+'</span></div>'
      + '<div class="vst-bars">'
      +   '<div class="vst-bwrap"><div class="vst-btl">IR率　リピーター と 一見</div>'
      +     ratioBar(totalRep(b), totalFirst(b), 'リピーター', '一見', '', totalNone(b), '未チェック') + '</div>'
      +   '<div class="vst-bwrap"><div class="vst-btl">KY率　国産 と 輸入</div>'
      +     ratioBar(b.dom, b.imp, '国産', '輸入', 'ky') + '</div>'
      + '</div></div>';
  }

  function footHtml(b){
    return '<div class="sv-foot">数えているのは<b>実績になった車</b>（実績カウント日＝返車ベース／売上なし・社内車両は外している）＝<b>伝票の数</b>と同じ集合です。'
      + '<br><b>車検・点検</b>＝車検か12点が入っているもの。<b>一般</b>＝それ以外ぜんぶ（オイル・B.P・車販依頼・物販なども含む）。'
      + '<br><b>リピーター／一見</b>＝<b>予約の「初回／リピーター」の札</b>で数えています。'
      + '札が空のものだけ、来店履歴（その実績日より前に同じお客様の来店があるか）で補っています。'
      + '<br><b>スライド</b>＝<b>売上日が前の月</b>なのに、返車（実績）がこの月になったもの＝<b>この月に作った仕事ではない</b>ぶん。'
      + 'クォーター結果では4つの枠に入れず、先頭に分けています（スライド＋1/4〜4/4＝その月の合計）。'
      + '<br>⚠ 売上日が分からない車はスライドに数えていません。見るのは<b>月</b>で、同じ月の中の日のズレはスライドではありません。'
      + '<br><b>未チェック</b>＝予約の札を選んでいないもの。<b>どちらにも入れていません</b>（推測で埋めない）。'
      + 'そのぶんリピーター％＋一見％は 100% になりません。<b>足りないぶんが、まだ埋まっていない量</b>です。'
      + fixListHtml(b);
      + '</div>';
  }

  /* 🔴🔴 v2.61.0 **0にする対象の一覧**（ゆうたの大前提＝抜けは許容せず、0にする対象として数を出す）。
     ⚠ 0の項目は**出さない**（0が正しい姿なので、並べると「まだ何かある」に見える）。 */
  function fixListHtml(b){
    var rows=[];
    if(b.none) rows.push('<li><b>初回／リピーターの未選択</b>　<b class="vst-fix-n">'+b.none+'件</b>'
      + '<span>予約詳細で選ぶと消えます。参考：来店履歴だと リピーター '+b.guessRep+'／一見 '+b.guessFirst
      + '（データチェックの「終わった車で、必須の項目が空」にも出ています）</span></li>');
    if(b.noSalesDate) rows.push('<li><b>売上日が空</b>　<b class="vst-fix-n">'+b.noSalesDate+'件</b>'
      + '<span>売上日が無いと、その車が<b>スライドかどうか判断できません</b>。予約詳細の「売上日」で入れられます</span></li>');
    if(b.mismatch) rows.push('<li><b>札と来店履歴が食い違う</b>　<b class="vst-fix-n">'+b.mismatch+'件</b>'
      + '<span>数字は札のとおりに数えています。付け間違いの疑いだけ知らせています</span></li>');
    if(!rows.length) return '<div class="vst-fix vst-fix-ok">✅ この期間の抜けは <b>0件</b>です。</div>';
    return '<div class="vst-fix"><div class="vst-fix-h">0にする対象</div><ul>'+rows.join('')+'</ul></div>';
  }

  /* ═══ 当月 ═══ */
  function renderVisitMonth(wrap, head, y, m){
    var from=ymdL(new Date(y,m,1)), to=ymdL(new Date(y,m+1,0));
    var b=collect(from,to);
    var qs=collectQuarters(y,m);
    var h=head;
    h+=heroHtml(b, y+'年'+(m+1)+'月の入庫台数（実績）');
    h+=barsCard(b, '月間の比率');
    h+='<div class="sv-card sv-table-wide"><div class="sv-card-h"><span>クォーター結果（月を4つに割る）</span>'
      + '<span class="sv-legend">1/4＝1〜7日／2/4＝8〜15日／3/4＝16〜23日／4/4＝24日〜末日</span></div>'
      + matrix(qs, b, '内容') + '</div>';
    h+=footHtml(b);
    wrap.innerHTML=h;
  }

  /* ═══ 年度（12月〜翌11月）＝元の Excel と同じ形 ═══ */
  function renderVisitYear(wrap, head, Y){
    var d=collectYear(Y);
    var h=head;
    h+=heroHtml(d.total, (Y-1)+'年12月〜'+Y+'年11月の入庫台数（実績）');
    h+=barsCard(d.total, '年間累積の比率');
    h+='<div class="sv-card sv-table-wide"><div class="sv-card-h"><span>来店属性集計（月ごと）</span></div>'
      + matrix(d.slots, d.total, '入庫台数') + '</div>';
    h+=footHtml(d.total);
    wrap.innerHTML=h;
  }

  window.pitVisitMonth = renderVisitMonth;
  window.pitVisitYear  = renderVisitYear;
  /* 🔴 数え方の入口。画面も見張りもここを通る（数え直す場所を作らない）。 */
  window.pitVisitCollect = collect;
  window.pitVisitCollectYear = collectYear;
  window.pitVisitQuarters = collectQuarters;
})();
