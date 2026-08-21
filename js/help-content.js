/* ========================================
   help-content.js  -  PitFlow ヘルプ本文（HELP_CONTENTS）＋目次（HELP_NAV）
   help.js が読み込んでサイドバー＋本文を組み立てる。
   ======================================== */
(function () {
  // 目次（カテゴリ→項目）
  window.HELP_NAV = [
    { cat: 'はじめに', items: [
      { id: 'overview', label: 'PitFlowとは' },
      { id: 'screen', label: '画面の見かた' },
      { id: 'save', label: '保存とログイン（今の段階）' }
    ]},
    { cat: 'ダッシュボード', items: [
      { id: 'dashboard', label: 'ダッシュボード（自分で組む）' },
      { id: 'search', label: '検索' },
      { id: 'notes', label: '付箋（全体タスク）' }
    ]},
    { cat: '予約', items: [
      { id: 'newreserve', label: '新規予約の作り方' },
      { id: 'today', label: '当日ビュー' },
      { id: 'avail', label: '空きカレンダー・最短入庫' },
      { id: 'reserve', label: '予約ビュー' },
      { id: 'tentative', label: '仮予約・未定' }
    ]},
    { cat: '返車・完了', items: [
      { id: 'return', label: '返車・完TEL・売掛' },
      { id: 'print', label: '表紙印刷' }
    ]},
    { cat: '整備・タスク', items: [
      { id: 'course', label: '課タスクボード（1課/2課）' },
      { id: 'work', label: 'Pitリスト' },
      { id: 'shaken', label: '車検予定' },
      { id: 'shakenlog', label: '車検履歴' },
      { id: 'carsales', label: '車販作業' },
      { id: 'outsource', label: '外注' }
    ]},
    { cat: '車両・代車', items: [
      { id: 'loaner', label: '代車カレンダー' },
      { id: 'parking', label: '駐車場' },
      { id: 'fleet', label: '車両管理' }
    ]},
    { cat: 'データ', items: [
      { id: 'result', label: '実績' },
      { id: 'sales', label: '売上' },
      { id: 'customers', label: '顧客' },
      { id: 'inspect', label: '点検（健康診断）' }
    ]},
    { cat: '設定・その他', items: [
      { id: 'settings', label: '設定・入庫ルール' },
      { id: 'theme', label: 'テーマ・文字サイズ' }
    ]},
    { cat: 'こまったとき', items: [
      { id: 'faq', label: 'よくある質問' },
      { id: 'terms', label: '用語集' }
    ]}
  ];

  window.HELP_CONTENTS = {

    overview: `
      <h2><i data-ic=wrench data-ics=16></i> PitFlowとは</h2>
      <p class="lead">PitFlowは小林モータースの<strong>整備入庫の管理アプリ</strong>です。予約を受けてから、入庫・作業・返車・実績までの流れを1つの画面で回せます。</p>
      <h3>ざっくりの流れ</h3>
      <div class="help-step"><ol>
        <li><strong>予約を取る</strong>（新規予約）→ 当日ビューに並ぶ</li>
        <li><strong>入庫</strong>したら課のタスクボードで作業を進める（点検→見積→連絡→部品→作業）</li>
        <li>作業が終わったら<strong>完TEL</strong>→ お客様が取りに来て<strong>返車</strong></li>
        <li>返車すると<strong>実績・売上</strong>に自動で積み上がる</li>
      </ol></div>
      <h3>PitFlowが得意なこと</h3>
      <ul>
        <li><strong>置き場（駐車場）中心の管理</strong>：預かり台数から混雑度・最短入庫日を自動計算</li>
        <li><strong>代車</strong>の空き・貸出をカレンダーで管理</li>
        <li><strong>車検</strong>の「行ける日候補→決定→完了/再検」を見える化</li>
        <li>各画面をBOX化した<strong>自分専用ダッシュボード</strong></li>
      </ul>
      <div class="help-tip">このヘルプは各画面の使い方を機能ごとにまとめています。左の目次から知りたい項目を選んでください。上の検索でも絞り込めます。</div>
    `,

    screen: `
      <h2><i data-ic=monitor data-ics=16></i> 画面の見かた</h2>
      <h3>上のバー（トップバー）</h3>
      <p>左から順に、<strong><i data-ic=menu data-ics=15></i>メニューの開閉</strong>・ロゴ・バージョン、続いて<strong>文字サイズ（A A A）</strong>・<strong>テーマ切替</strong>・<strong>＋新規予約</strong>・自分のアバターと名前・<strong>同期</strong>・<strong>？ヘルプ</strong>・<strong>ログアウト</strong>が並びます。</p>
      <ul>
        <li><strong><i data-ic=menu data-ics=15></i></strong>：左のメニュー（サイドバー）を畳む／開く。畳んだ状態は端末に記憶されます。</li>
        <li><strong>A A A</strong>：文字サイズを 標準／大／特大 に。画面全体が拡大します。</li>
        <li><strong><i data-ic=moon data-ics=16></i>/<i data-ic=sun data-ics=16></i>/<i data-ic=sparkle data-ics=16></i>/<i data-ic=gem data-ics=16></i></strong>：テーマ切替（後述）。</li>
        <li><strong>同期</strong>：今はサンプル表示です（本番のクラウド接続後に有効化）。</li>
      </ul>
      <h3>左のメニュー（サイドバー）</h3>
      <p>「予約／車両／整備／データ／管理」のグループでビューが並びます。クリックでそのビューへ切り替わります。スマホでは上部に横並びになります。</p>
      <h3>真ん中（メイン）</h3>
      <p>選んだビューの中身が出ます。多くのビューは右上に「<i data-ic=refresh data-ics=16></i>更新」やレンジ切替（当日/週/月…）があります。</p>
    `,

    save: `
      <h2><i data-ic=save data-ics=16></i> 保存とログイン（今の段階）</h2>
      <div class="help-warn"><strong>今は「開発中サンプル」段階です。</strong>データは<strong>この端末のブラウザ内</strong>に保存されます。リロードしても残りますが、<strong>別の端末やブラウザとは共有されません</strong>。</div>
      <p>編集した予約・カード・付箋・ダッシュボードの配置などは自動で保存されます。特に「保存ボタン」を押さなくても、開いた瞬間や画面を離れた時などに保存されます。</p>
      <h3>これから（本番接続後）</h3>
      <ul>
        <li><strong>Googleログイン</strong>：ログインした本人＝「自分」に自動で紐づきます（担当や個人BOXが本当の意味で効きます）。</li>
        <li><strong>クラウド保存</strong>：会社の全員が同じデータを共有。どの端末で開いても同じ状態になります。</li>
      </ul>
      <div class="help-tip">設定 →「<i data-ic=refresh data-ics=16></i> サンプルデータに戻す」で、いつでも初期状態にリセットできます（今の編集内容は消えます）。</div>
      <h3>🟠 練習用サイト（デモ版）</h3>
      <p>本番とは別に、<strong>いくら触っても大丈夫な練習用のサイト</strong>があります（v1.77.0）。
      新しく入った人の練習、操作の説明、新しい機能を試す時に使ってください。</p>
      <p><a class="nw-btn is-demo" href="https://yuta19kmail-coder.github.io/pitflow-demo/" target="_blank" rel="noopener">🟠 練習用サイト（デモ版）を開く</a><br>
      <span class="nw-url">https://yuta19kmail-coder.github.io/pitflow-demo/</span></p>
      <ul>
        <li><strong>本番のデータには一切つながっていません。</strong>何をしても実際の予約やお客様の情報は変わりません。</li>
        <li>お客様・車・電話番号は<strong>すべて架空</strong>のものです。</li>
        <li>保存されるのは<strong>開いた端末の中だけ</strong>です。</li>
        <li>散らかったら 設定 ▸ <strong>開発用サンプル ▸ 予約サンプルを作り直す</strong>、
          0件から始めたければ 設定 ▸ <strong>ぜんぶ消して、まっさらにする</strong>。</li>
      </ul>
      <div class="help-warn">🔴 <strong>見分け方＝版の横のオレンジの「デモ版」の印。</strong>
      左上のロゴの右にある版（v1.79.0 など）の横に印が付いていれば練習用、
      <strong>付いていなければ本番</strong>です。タブのタイトルにも「デモ版」と出ます。</div>
    `,

    dashboard: `
      <h2><i data-ic=home data-ics=16></i> ダッシュボード（自分で組む）</h2>
      <p class="lead">ダッシュボードは<strong>役割ごとに固定</strong>ではなく、<strong>自分で好きなBOXを好きな並びで組む</strong>ビルダーです。TOPページとして最初に開きます。</p>
      <h3>BOXの操作</h3>
      <ul>
        <li>BOXは <strong>小 / 中 / 大 / 特大</strong> の4サイズ。サイズごとに出る情報量が変わります（小＝件数、大＝一覧、特大＝本物の表やカレンダーを埋め込み）。</li>
        <li>BOXをクリックすると<strong>下に展開</strong>して深掘り表示。もう一度クリック、または枠の外で畳みます。</li>
        <li>BOX内の行・カード・カレンダーのコマは<strong>クリックでその予約を開く</strong>／その日のポップアップが出ます。フッターの「○○を開く」でそのビューへ飛べます。</li>
      </ul>
      <h3>カスタマイズ</h3>
      <div class="help-step"><ol>
        <li>右下の<strong>「＋ボックス」</strong>で追加（各アプリ機能の状況・数値、個人フォーカス、ショートカット）。</li>
        <li><strong>「カスタマイズ」</strong>で編集モードに。<i data-ic=grip data-ics=16></i>ドラッグや ↑↓ で並べ替え、サイズチップでサイズ変更、<i data-ic=close data-ics=16></i>で削除。</li>
        <li>編集を抜けると自動で保存されます。</li>
      </ol></div>
      <h3>個人フォーカスBOX</h3>
      <p>「予約一覧・タスク・返車予定・予約担当直近10件・売上」は<strong>担当者ごと</strong>に作れます。追加時に「誰のBOXか（自分／指定スタッフ）」を選びます。例：<em>自分の売上</em>、<em>◯◯さんのタスク</em>。複数人（自分＋部下）も選べます。</p>
      <h3>プリセット</h3>
      <p>タイトル横のチップで<strong>用途別レイアウト</strong>を切り替え。右下「プリセット」で追加・名前変更・削除。全体用／車販／整備／事務・受付／管理 の雛形から作って細部だけ直すのもOKです。</p>
      <div class="help-tip">初めてなら「＋ボックス」→末尾の<strong>「全部のせ」</strong>で一旦すべて出して、要らないBOXを消していくのが早いです。検索バーと付箋は常時表示です。</div>
    `,

    search: `
      <h2><i data-ic=search data-ics=16></i> 検索</h2>
      <p>ダッシュボード上部の検索から、<strong>手元の小さな手がかり</strong>で全カードを横断検索できます。</p>
      <ul>
        <li>お客様名・カナ・車種・メーカー・<strong>ナンバー</strong>・<strong>予約番号</strong>・電話・担当・メモに当たります。</li>
        <li><strong>代車</strong>（「代車3」「L03」やナンバー）でも、その代車を使っているカードに当たります。</li>
        <li><strong>日付</strong>は <code>2026-06-13</code> / <code>6/13</code> / <code>0613</code> などの表記でヒット。</li>
        <li>スペース区切りで<strong>複数語すべて含む（AND）</strong>。例：「6/13 アクア」</li>
      </ul>
      <p>結果は「カード（予約・作業中・直近の返車済み）」「顧客」「過去入庫（1か月より前の返車済み）」に分かれます。クリックでカードや顧客を開けます。</p>
    `,

    notes: `
      <h2><i data-ic=pin data-ics=16></i> 付箋（全体タスク）</h2>
      <p>ダッシュボード上部の付箋ボードは、<strong>全体で共有する連絡・タスク</strong>を貼る場所です。</p>
      <ul>
        <li><strong>5色</strong>で優先度（緊急／今日中／今週中／連絡／余裕）を表現。色ラベルは変えられます。</li>
        <li>タイトル・本文・期限・<strong>担当メンバー</strong>・画像を付けられます。</li>
        <li><strong>実行</strong>（誰か1人がやればOK）と<strong>回覧</strong>（担当全員が各自で確認）の2種類。</li>
        <li>「⋮」から 編集／済にする／返信／消去。「済」は大きくスタンプされます。</li>
        <li>🔴 <strong>返信（v1.141.0）</strong>＝付箋の下の<strong>「返信を書く…」</strong>を押すと、その場で書けます。
          <ul>
            <li><strong>通常の付箋も、回覧の付箋も、どちらも返信できます。</strong>（v1.140 までは回覧には書けませんでした）</li>
            <li><strong>誰でも・何回でも</strong>書けます。担当でなくても、回覧を確認していなくてもかまいません。</li>
            <li>🔴 <strong>回覧の「✓ 自分が確認」とは別ものです。</strong>返信を書いても確認したことにはならないので、確認は今までどおりボタンを押してください。</li>
            <li>返信には<strong>書いた人と時刻</strong>が残ります。<strong>消せるのは自分の返信だけ</strong>です。</li>
            <li>この返信は <strong>CarFlow・MHS の付箋と同じ作り</strong>です（3つとも同じ見た目・同じ操作）。</li>
          </ul>
        </li>
        <li>🔴 <strong>まとめて表示（v1.142.0）</strong>＝「＋ 付箋を追加」の左のボタンを押すと、
          <strong>CarFlow・MHS の付箋も一緒に</strong>並びます。
          <ul>
            <li>よそのアプリの付箋には、左上に <strong>「CarFlow」「MHS」の札</strong>が付きます。自分の課の付箋は今までどおりです。</li>
            <li>この状態でも <strong>返信</strong>と<strong>チェック（済にする・回覧の「✓ 自分が確認」）</strong>はできます。押した内容は<strong>そのアプリに反映されます</strong>。</li>
            <li>🔴 よその付箋は<strong>編集・消去・並べ替えはできません</strong>（順番も中身も、そのアプリのものだからです）。直したい時はそのアプリで開いてください。</li>
            <li><strong>もう一度押すか、別の画面へ移ると元に戻ります。</strong>開き直しても戻ります。</li>
            <li>MHS のダッシュボードは<strong>もともと3つまとめて出る</strong>作りなので、MHSにこのボタンはありません。</li>
          </ul>
        </li>
        <li>ドラッグで並べ替えできます。</li>
      </ul>
      <div class="help-tip">「＋付箋を追加」から作成。回覧は担当全員が各自「済」を入れたら完了になります。</div>
    `,

    newreserve: `
      <h2><i data-ic=plus data-ics=15></i> 新規予約の作り方</h2>
      <p>トップバーまたは各ビューの<strong>「＋新規予約」</strong>から、入庫カード（全画面）を開いて作ります。</p>
      <h3>入力の流れ</h3>
      <div class="help-step"><ol>
        <li><strong>国産／輸入</strong>を選ぶ（選ぶと課が自動で入り、片方のカレンダーに絞られます）。</li>
        <li>お客様・車種・ナンバー・電話などの基本情報。</li>
        <li><strong>作業タイプ</strong>（車検／12点／一般／オイル／B.P／1Y／3M）を選ぶと、概算の預かり日数・概算金額が自動で入ります（後で手直し可）。</li>
        <li>入庫日・時間、受付タイプ（待ち／当日返し／預かり）、代車の要否など。</li>
        <li><strong>入庫時間のショートカット（v1.33.0）</strong>＝<strong>AM／PM／朝一／お昼／夕方／決まり次第／レッカー／鍵ポスト／未定</strong>。
          時刻を直接打つ（<em>900・9時半・9:00-10:00</em>）のも今までどおりです。
          <ul>
            <li>ショートカットは<strong>そのままの文字</strong>が予約カードにも表紙印刷にも出ます。</li>
            <li>🔴 <strong>並び順は「いちばん遅くなり得る時刻」で決まります（v1.70.0）</strong>。
              <strong>朝一＝9:30／AM＝11時台のいちばん最後／お昼＝13:00／夕方・PM＝夕方の終わり</strong>（同じ終わりなら<strong>幅の広い PM が後ろ</strong>）。
              <em>9:00-10:00</em> のような範囲も<strong>後ろの 10:00</strong> で並びます。この時間は画面には出ません。</li>
            <li>🔴 <strong>枠（◯時台）も同じ物差しです（v1.70.0）</strong>。だから <strong>「AM」の車は 11:00 の枠</strong>に出ます（<strong>v1.105.0 で 12:00 の枠から移しました</strong>＝AM を 12時台に被せないため）。朝一＝9時／お昼＝13時／夕方・PM＝18時の枠です。</li>
            <li><strong>決まり次第・レッカー・鍵ポスト・未定</strong>は「時間がまだ分からない」扱いで、その日の<strong>いちばん後ろ</strong>に並びます。空欄・読めない文字（「9時以降」など）も同じ組で、<strong>「未定」よりさらに後ろ</strong>です。</li>
            <li>返車カレンダーの<strong>「終日」（待ち・当日返しで返車時間がまだ）は PM のさらに後ろ・「時刻未定」より前</strong>です（v1.70.0）。</li>
          </ul>
        </li>
        <li><strong>特殊</strong>（保証／保険）は作業と併用の時だけ付けられます（予約詳細と印刷にだけ出ます）。</li>
      </ol></div>
      <h3><i data-ic=van data-ics=15></i> 代車カレンダー（v1.35.0）</h3>
      <ul>
        <li><strong>入庫日が入っている状態で「代車必要」</strong>を押すと、<strong>貸出から に入庫日が自動で入ります</strong>（すでに入っている時は上書きしません）。</li>
        <li><strong>上の車種をクリック</strong>＝その代車を使う。<strong>列が青い点線で囲まれ</strong>、使用代車の欄にも入ります。もう一度押すと解除。</li>
        <li>逆に<strong>使用代車を欄で選んでも</strong>、同じ列が囲まれます。</li>
        <li><strong>左の日付をクリック</strong>＝その日の行が青い点線で囲まれます（見やすくするだけで、データは変わりません）。もう一度押すと解除。</li>
        <li>貸出から／まで を<strong>打っている最中から</strong>、緑のマスがその場で追従します。</li>
        <li><strong>代車条件</strong>（ETC・ナビ・ISO・Bカメ）を押すと、<strong>条件に合う代車が先頭に並び替わります</strong>（合わない代車も消えずに下に残ります）。高さ・幅・長さを選んだ時は小さい順に並びます。</li>
      </ul>
      <h3>🔴 赤枠と🟡黄枠（v1.76.0）</h3>
      <p>入力チェックが<strong>2段</strong>になりました。</p>
      <ul>
        <li><strong>🔴 赤＝入れないと保存できません</strong>：<strong>カナ／初回・リピーター／入庫日／受付タイプ／作業タイプ</strong>。
          代車を「必要」にした時の<strong>使用代車・貸出から・貸出まで</strong>、車検の<strong>諸費用</strong>も赤です。</li>
        <li><strong>🟡 黄＝空でも保存できます</strong>：<strong>お客様名（漢字）／<span style="color:#eab308">TEL</span>／国産車・輸入車／メーカー／車種／入庫時刻／作業内容</strong>。
          <strong>1回だけ</strong>「このまま保存しますか？」と聞かれ、<strong>「このまま保存する」で通ります</strong>（あとから入れられます）。</li>
      </ul>
      <p>赤が空のまま保存を押すと <strong>「保存できません。足りない項目があります」</strong> と出て、<strong>足りない項目の名前が並びます</strong>。
      「入力に戻る」でその場所まで画面が動きます。</p>
      <p>⚠ <strong>止まるのは保存すべて</strong>（印刷して保存／仮予約で保存／承認に回して保存／入庫中に保存）です。
      🔴 <strong>「印刷して保存」は、赤が埋まって保存できた時だけ刷ります</strong>（v1.78.0）。＝<strong>紙が出た＝保存された</strong>、が必ず成り立ちます。<br>
      空の表紙を刷りたいだけの時は <strong>その他保存 ▸ 表紙印刷のみ</strong>（そちらは今までどおり刷れます・予約は作りません）。</p>
      <p>お名前は<strong>カナが必須</strong>です。漢字が分からない新規のお客様は<strong>カナだけ</strong>で進めてください（表示はカナになります）。</p>
      <h3>右上のボタン（v1.19.0で整理）</h3>
      <p>右から順に <strong>印刷して保存</strong>／<strong>その他保存</strong>／<strong>入力チェック</strong> の3つです。</p>
      <ul>
        <li><strong>入力チェック</strong>：抜けがないか確認だけ（保存はしない）。<strong>赤と黄を数えて教えます</strong>（v1.76.0）。
          <strong>作業タイプが車検のときは「諸費用」も対象</strong>です（v1.40.0）。車検以外は今までどおり任意。</li>
        <li><strong>印刷して保存</strong>：表紙を印刷しつつ保存（ふだんはこれ）。</li>
        <li><strong>その他保存</strong>：下に開くメニュー。中身は次の6つです。
          <ul>
            <li><strong>承認に回して保存</strong>：承認待ちとして登録（枠は埋まります・v1.74.0）。</li>
            <li><strong>仮予約で保存</strong>：まだ確定でない予約として登録。</li>
            <li><strong>入庫中に印刷して保存</strong>／<strong>入庫中に保存のみ</strong>：<em>急に入庫してしまった・登録を忘れていた</em>時に、あとから振り返って登録するためのもの。予約ではなく<strong>そのまま1課／2課のタスクボードへ入ります</strong>。入庫日は<strong>過去の日付でもそのまま通ります</strong>（受付○△×のガードを飛ばします）。件数は<strong>入力した入庫日</strong>で数えます。</li>
            <li><strong>予約保存のみ</strong>：印刷せずに保存。</li>
            <li><strong>表紙印刷のみ</strong>：保存せずに表紙だけ出す。</li>
          </ul>
        </li>
      </ul>
      <h3><i data-ic=car data-ics=15></i> メーカー・車種の候補（v1.23.0）</h3>
      <p><strong>メーカー</strong>と<strong>車種（グレード）</strong>は、<strong>▼</strong>を押すと一覧が出ます。打ち始めれば絞り込まれます。<strong>もちろん今までどおり手で打つこともできます。</strong></p>
      <ul>
        <li><strong>候補の元</strong>＝取り込んだ<strong>顧客データ（車検証の記載どおり）</strong>。過去の予約カードからは拾いません（打ち間違いを候補に混ぜないため）。</li>
        <li><strong>国産／輸入で絞られます</strong>。選んでいなければ全部出ます。</li>
        <li><strong>車種はメーカーで絞られます</strong>。トヨタを入れてから「あ」と打つと<strong>アクア・アルファード</strong>だけ出ます。</li>
        <li><strong>ひらがなでも引けます</strong>（「ぷ」→プジョー）。大文字小文字・空白は気にしなくて大丈夫です。</li>
        <li>右の数字は<strong>その書き方で入っている台数</strong>。迷ったら多いほうを選べば、書き方がそろいます。</li>
        <li><strong>国産／輸入がまだなら、メーカーを選んだ時に自動で入ります</strong>（BMWなら輸入＝2課）。すでに選んである場合は上書きしません。</li>
        <li>候補に無い車も<strong>そのまま打てば保存されます</strong>。その場合は国産／輸入を手で選んでください。</li>
      </ul>
      <div class="help-tip"><b>ミニは「BMW」と「MINI」の両方があります。</b>年式によって車検証の記載が違うためで、どちらも正しい入力です。まとめていないのは、車検証と突き合わせられなくなるからです。</div>

      <h3><i data-ic=calendar data-ics=15></i> 担当の予定（MHS連携・v1.29.0）</h3>
      <p>右パネルに、<strong>フロント担当に選んだ人の入庫日の予定</strong>が出ます。MHSに入っている予定をそのまま持ってきています。</p>
      <ul>
        <li>出るもの＝<strong>社内予定・外出/不在・ルーティン業務</strong>。来客（入庫）とは別の予定です。<strong>当番は出しません</strong>（v1.29.0）。</li>
        <li><strong>その日の休み</strong>は枠の下に<strong>顔（アバター）で並びます</strong>。<strong>選んだ担当その人が休みの日は「担当者休み」と大きく出ます</strong>（v1.29.0）。</li>
        <li>「その日その人がつかまるか」を、<strong>時間を決める前に</strong>見るためのものです。</li>
        <li>枠の右下に<strong>「MHS更新 ◯/◯ ◯◯:◯◯」</strong>が出ます。これは<em>予定がいつ時点のものか</em>。配っているのは<strong>MHSを開いている人</strong>なので、誰も開かない日が続くと古くなります。2日以上前だと色が変わります。</li>
        <li>「まだ届いていません」と出る時は、誰かがMHSを一度開けば配られます。</li>
        <li><i data-ic=lock data-ics=14></i> MHSで<strong>非公開</strong>にした予定はここには出ません。</li>
      </ul>
      <div class="help-tip">予約番号（例 K48201）は自動で採番され、現場で呼ぶ・控えに載せる・検索する用に使えます。</div>
    `,

    today: `
      <h2><i data-ic=sunrise data-ics=16></i> 当日ビュー</h2>
      <p>その日の<strong>入庫予定</strong>と<strong>返車予定</strong>を時刻順で並べた、現場の朝いちで見る画面です。</p>
      <ul>
        <li>カードをタップすると、詳細を見る／<strong>入庫済みにする</strong>／<strong>返車済みにする</strong>／日時変更／キャンセルのメニューが出ます。</li>
        <li>入庫済みにすると当日ビューから消えて、課のタスクボードへ移ります。</li>
        <li>ナンバー横の枠のないエリアをクリックすると<strong>クイックメモ</strong>を直接入力できます（目立つ色で表示）。</li>
        <li>洗車が要るものには「済」マークが付きます。</li>
      </ul>
    `,

    avail: `
      <h2><i data-ic=calendar data-ics=16></i> 空きカレンダー・最短入庫</h2>
      <p>国産・輸入それぞれの<strong>予約の空き</strong>と<strong>最短入庫日</strong>、<strong>代車</strong>の空きを一目で見る画面です。</p>
      <h3>最短入庫日</h3>
      <p>「代車なし／代車あり／当日作業」×「国産／輸入」で、いつから入庫できるかを自動計算します。</p>
      <ul>
        <li><strong>代車なし</strong>＝予約枠が空く最初の営業日</li>
        <li><strong>代車あり</strong>＝上に加えて、代車が預かり想定日数ぶん連続で空く最初の日</li>
        <li><strong>当日作業</strong>＝営業日ならOK（オイル等・置き場をほぼ使わない）</li>
      </ul>
      <div class="help-tip">「予約の埋まり」は横スクロールで先の空き状況（可＝空きあり／終了＝満枠／超過＝人の判断で枠超え／休＝定休・連休）を確認できます。</div>
    `,

    reserve: `
      <h2><i data-ic=calendar data-ics=16></i> 予約ビュー</h2>
      <p>予約を<strong>当日／週／月／2ヶ月／未定</strong>のレンジで一覧・カレンダー表示します。右上のタブでレンジを切り替え、<i data-ic=chevLeft data-ics=16></i><i data-ic=chevRight data-ics=16></i>で日付を移動、「今日」で当日へ戻ります。</p>
      <ul>
        <li>カードをクリックで予約詳細を開けます。</li>
        <li>月ビューは1日あたりの表示数を絞り、枠クリックでその日の全件をポップアップ表示します。</li>
        <li><strong>未定</strong>タブには仮予約・パーツ待ちで日程未確定のものが集まります。</li>
      </ul>
      <h3>表紙の「金額」「返車日」をあとから直す（v1.73.0）</h3>
      <p>カード詳細の<strong>表紙</strong>にある「金額の並び」と「返車日の並び」の<strong>右端の <i data-ic=pencil data-ics=16></i>編集</strong>から、あとから直せます。押した並びのすぐ下に入力欄が開きます。</p>
      <ul>
        <li><strong>金額</strong>＝概算／見積もり／受注／確定のうち、<strong>いまの工程までに通った欄</strong>が出ます。入れるのは<strong>税抜</strong>、打ち替えたら<strong>OK</strong>で確定。</li>
        <li><strong>返車日</strong>＝<strong>概算 預かり日数</strong>と<strong>予定 返車日</strong>。概算 返車日は「入庫日＋概算 預かり日数」なので、日数を直すと一緒に動きます。</li>
        <li>🔴 <strong>確定 返車日・返車時間は「作業完了」に入ってから</strong>出ます（完TELで決まる日のため）。実績カードの<strong>確定金額・確定 返車日</strong>は今までどおり下の鍵付きの欄から直します。</li>
        <li>直した内容は<strong>フローに記録が残ります</strong>。預かり日数と予定 返車日は<strong>売上をどの月に数えるか</strong>にも効きます。</li>
      </ul>
      <h3>フロー（進捗ログ）＝ 足すのは詳細／直すのは編集（v1.43.0）</h3>
      <ul>
        <li><strong>用件を足すのは「カード詳細」のフロー欄</strong>です。よくあるアクション（電話・来店・見積り連絡…）は<strong>チップをタップ</strong>、それ以外は<strong>自由入力</strong>。
          担当と時刻は触らなければ<strong>「前回の担当＋今」</strong>で入ります。昨日の留守などは時刻を変えてから押してください。</li>
        <li><strong>「予約を編集」→ フロー</strong>は、<strong>すでに入っている記録を直す</strong>ところです。
          記録ごとに<strong>日時</strong>と<strong>担当</strong>を書き換えられ、いらない記録は<strong>消せます</strong>。手で足した記録は<strong>言葉</strong>も直せます。
          <ul>
            <li>🔴 直せるのは<strong>設定権限（PitFlow の役割＝管理）のある人だけ</strong>です。ほかの人には今までどおり見えるだけです。</li>
            <li>工程の記録（ドラッグや「次へ」で自動で付いたもの）は、<strong>日時・担当は直せますが言葉は直せません</strong>。</li>
          </ul>
        </li>
      </ul>
    `,

    tentative: `
      <h2><i data-ic=clock data-ics=16></i> 仮予約・未定</h2>
      <p>日程がまだ固まらない予約の扱いです。</p>
      <ul>
        <li><strong>仮予約</strong>：新規予約で「仮予約で登録」、または詳細で切替。確定でない予約として区別されます。</li>
        <li><strong>承認待ち（v1.74.0）</strong>：新規予約の「その他保存 ▸ <strong>承認に回して保存</strong>」で登録します。
          🔴 <strong>仮予約とは別物</strong>で、<strong>入庫カレンダー・代車の枠はふつうの予約と同じに埋まります</strong>。カードには青い丸の「承」が付きます。
          <ul>
            <li>予約 ▸ 未定タブの<strong>承認待ちBOX</strong>に並びます。「開いて承認する」またはカードを開くと、上に<strong>承認バー</strong>が出ます。</li>
            <li><strong>承認して印刷して保存</strong>＝表紙を印刷して承認（本線）／<strong>承認のみ</strong>＝刷らずに承認。どちらも印が取れてBOXから消えます。</li>
            <li><strong>承認は誰でも押せます</strong>（アプリ側では止めません）。誰が承認したかは<strong>フローに残ります</strong>。</li>
            <li>承認待ちのまま入庫させるときは<strong>1回だけ確認</strong>が出ます。進めれば入庫できます（印は残り、BOXにも残ります）。</li>
          </ul>
        </li>
        <li><strong>入庫日未定</strong>：パーツ待ちなどで入庫日が決まらないもの。</li>
        <li>これらは予約ビューの<strong>「未定」タブ</strong>にまとまります。日程が決まったら通常の予約に切り替えます。</li>
      </ul>
    `,

    return: `
      <h2><i data-ic=upload data-ics=16></i> 返車・完TEL・売掛</h2>
      <p>作業が終わってから返車・入金までを扱う画面です。返車ビューはレンジ（未定／当日／週／月／2ヶ月）で切り替えます。</p>
      <h3>ステージ</h3>
      <ul>
        <li><strong>完TEL待ち</strong>：作業完了後、お客様への完了連絡がまだ。</li>
        <li><strong>返車待ち</strong>：完TEL済みで、あとはお客様が取りに来るのを待つ状態。</li>
        <li><strong>返車済み</strong>にすると実績・売上へ積み上がります。</li>
      </ul>
      <h3>売掛（入金が返車と別のとき）</h3>
      <p>予約詳細の金額欄で<strong>「入金日を分ける」</strong>にチェックすると、返車ビューに<strong>「<i data-ic=money data-ics=16></i>入金待ち」</strong>として残り、入金済みにすると入金日が確定表示されます。</p>
      <div class="help-tip">返車済みになると「確定売上金額」「確定返車日」が鍵付きで確定表示され、<i data-ic=pencil data-ics=16></i>で修正できます（実績ボードにも反映）。</div>
    `,

    print: `
      <h2><i data-ic=printer data-ics=16></i> 表紙印刷</h2>
      <p>入庫カードの表紙（お客様情報シート）を印刷できます。新規予約の「印刷して保存」や、カードの印刷から出せます。</p>
      <ul>
        <li>お客様名・車種・ナンバー・入庫/受付日・代車・持ち物・担当・返車予定などが差し込まれます。</li>
        <li><strong>代車ありのときは「代車管理費」の四角にチェックが入って印刷</strong>されます（v1.40.0）。金額は様式に入っているとおりです。</li>
        <li>作業タイプの<strong>バッジ</strong>（車検・オイル 等）は数に応じて自動でサイズ調整・折り返し。</li>
        <li>早割の対象には<strong>早期割スタンプ</strong>が重なります。</li>
        <li>罫線メモ欄にカルテNo・連絡先・LINE・予約内容などが自動記載されます。</li>
      </ul>
    `,

    course: `
      <h2><i data-ic=clipboard data-ics=16></i> 課タスクボード（1課/2課）</h2>
      <p>入庫したカードを、作業の段階ごとにカンバンで進める画面です。1課＝国産、2課＝輸入。</p>
      <h3>列（段階）</h3>
      <p>点検待ち → 見積り中 → 連絡中 → パーツ待ち → 作業待ち → 作業完了済（＋外注／廃車・乗替）。カードをドラッグして次の段階へ動かします。</p>
      <ul>
        <li>右上の<strong>「完TEL済」「完TEL依頼」</strong>のエリアにドラッグすると、完了連絡の状態を切り替えられます。</li>
        <li><strong>担当車両（v1.41.0 → v1.48.0）</strong>＝右上の「担当車両」を押すと、<strong>自分が担当（フロント）のカードだけ</strong>が残り、ほかは一時的に隠れます。
          <ul>
            <li>🔴 <strong>1課・2課をまたいで集めます（v1.48.0）</strong>。1課の盤で押しても2課の盤で押しても、<strong>自分の車が1枚の盤に全部そろいます</strong>。工程（点検待ち・見積り中…）は同じなので、<strong>もう一方の課のカードも同じ列</strong>に入ります。</li>
            <li>よその課から来たカードには右上に<strong>「国産」「輸入」の印</strong>が付きます（カード左の色帯も 国産＝緑／輸入＝桃 のままです）。</li>
            <li>🔴 <strong>よその課の車は列のいちばん下にまとまります（v1.69.0）</strong>。あいだに<strong>「2課分」（2課で見ているなら「1課分」）</strong>というグレーの線が1本入り、その下に並びます。この線は<strong>見た目だけ</strong>で、動かせません・消えません。</li>
            <li>🔴 <strong>区切りラインは動きません（v1.69.0）</strong>。押しても線は<strong>同じ場所に残り</strong>、隠れたカードが線の上と下から消えるだけです。</li>
            <li>集めているだけで<strong>課は変わりません</strong>。別の課のカードを動かしても<strong>変わるのは工程だけ</strong>で、そのカードはずっとその課のものです。</li>
            <li>もう一度押すと全部戻ります。<strong>別のビューへ移った時点でも解除</strong>されます（持ち越しません）。</li>
            <li><strong>メンバー画面で「フロント」にチェックが入っている人にだけ</strong>ボタンが出ます。</li>
            <li>隠しているだけで<strong>データは何も変わりません</strong>。ほかの人の画面にも影響しません。</li>
          </ul>
        </li>
        <li>🔴 <strong>カードの並び（v1.140.0）</strong>＝列の中の並びは<strong>人が動かした順（マスター並び）</strong>です。カードを掴んで上下に落とすと、その順が<strong>そのまま保存されます</strong>。
          <ul>
            <li>🔴 <strong>勝手には並び替わりません。</strong>画面を開き直しても、ほかの人が直しても、自動更新が走っても<strong>同じ順</strong>です。<strong>全員が同じ順</strong>を見ています。</li>
            <li>🔴 <strong>並びが変わるのは、人がカードを掴んで落とした時だけ</strong>です。</li>
            <li>🔴 <strong>ドラッグしたカードは、落とした場所に入ります（v1.140.1）</strong>。カードの上に落とせばその手前、下の余白に落とせばいちばん下です。</li>
            <li>予約から新しく入ってきたカード（点検待ち）は、その列の<strong>いちばん下</strong>に付きます（黙って割り込みません）。</li>
            <li><small>※ v1.139.0 までは並び順がどこにも保存されておらず、開き直すたびにバラバラの順に戻っていました。</small></li>
          </ul>
        </li>
        <li><strong>並び替え（v1.140.0）</strong>＝右上の「並び替え」から、<strong>一時的に</strong>並べ替えて見られます。<strong>入庫日が早い順</strong>／<strong>代車リミットが近い順</strong>／<strong>金額が大きい順（暫定含め）</strong>。
          <ul>
            <li>🔴 <strong>見るためだけの機能です。</strong>マスター並びは変わりません。データも1つも変わりません。</li>
            <li>盤面ぜんぶの列に<strong>一括で</strong>掛かります。上に<strong>青い帯</strong>が出て、カードの右上に<strong>その物差しの数字</strong>（入庫日・残り日数・金額）が出ます。</li>
            <li><strong>時間は出しません（v1.140.1）</strong>。入庫日は「8/12」だけです（同じ日の中の順番は時刻で決めていますが、画面には出しません）。</li>
            <li><strong>その車に値が無いときは、札そのものを付けません（v1.140.1）</strong>。代車を使っていない車に「代車なし」とは書きません。</li>
            <li>札と重なって読めなくなるので、並び替えて見ている間だけ<strong>車両注意のタブ（左／M／T／車高／土禁）と「国産・輸入」の印を隠します（v1.140.1）</strong>。マスター並びに戻せばすぐ出ます。</li>
            <li>金額は<strong>確定 → 受注 → 見積 → 概算</strong>の順に、いま出せるいちばん確かなものを使います。バッジの「確／受／見／概」が<strong>どの段の金額か</strong>を表します。</li>
            <li>代車リミットは<strong>超過している車がいちばん上</strong>、代車なしの車はいちばん下です。</li>
            <li>🔴 <strong>並び替えて見ている間は、カードも区切りラインも動かせません</strong>（仮の並びのまま動かすとマスター並びが壊れるためです）。帯の<strong>「キャンセル」</strong>を押すと元に戻ります。</li>
            <li>並び替えの帯（青）も、絞り込みの帯（緑）も、外すボタンは<strong>どちらも「キャンセル」</strong>です（v1.140.2）。</li>
            <li><strong>別のビューへ移ると解除</strong>されます（持ち越しません）。</li>
          </ul>
        </li>
        <li><strong>メンバー（v1.140.0）</strong>＝右上の「メンバー」から<strong>1人</strong>を選ぶと、<strong>その人が担当（フロント）のカードだけ</strong>が残ります。「担当車両」の<strong>他人版</strong>です。
          <ul>
            <li>1課・2課をまたいで集めるのは「担当車両」と同じです。上に<strong>緑の帯</strong>が出ます。</li>
            <li>名前の右の<strong>台数</strong>は、その人を選んだ時に<strong>実際に盤面へ残る枚数</strong>です（v1.140.1 で数え方を直しました）。</li>
            <li>🔴 <strong>「担当車両」とは同時に効きません。</strong>片方を選ぶともう片方は外れます。</li>
            <li>絞り込みと並び替えは<strong>同時に効きます</strong>（帯が緑と青の2本出ます）。</li>
            <li>隠しているだけで<strong>データは何も変わりません</strong>。ほかの人の画面にも影響しません。</li>
          </ul>
        </li>
        <li><strong>区切りライン（v1.37.0）</strong>＝完TEL済の<strong>左</strong>にある「区切りライン」を、カードとカードのあいだへ<strong>ドラッグ</strong>すると線が入ります。
          「<em>今日はここまで</em>」のように、<strong>課の共通の目印</strong>として使えます。
          <ul>
            <li>動かしている最中は<strong>ゴーストが先に出ます</strong>。どこに入るか見てから離せます。</li>
            <li>入った線は<strong>そのままドラッグで移動</strong>できます。<strong>別の工程へも移せます</strong>。</li>
            <li><strong>枠の外へ出すと消えます</strong>（消し方はこれだけです）。</li>
            <li><strong>名前は最初は付いていません</strong>（ただの線）。<strong>ダブルクリック</strong>で入れると文字が出ます。空にすると線だけに戻ります。</li>
            <li>🆕 <strong>ダブルクリックの窓では色も選べます</strong>（オレンジ・赤・緑・青・紫・ピンク・グレーの7色）。<strong>線ごと</strong>に変わるので「今日はここまで」と「納車便まで」を色で分けられます。</li>
            <li>カードの<strong>右クリック →「この下にラインを入れる」</strong>でも入ります。</li>
            <li>線は<strong>全員で共有</strong>されます（設定と同じ場所に保存）。</li>
            <li>🔴 <strong>「担当車両」で隠れたカードがあっても、線は動きません（v1.69.0）</strong>。線は<strong>自分の課の中の区切り</strong>なので、「◯課分」より下には置けません。</li>
          </ul>
        </li>
        <li>「<i data-ic=factory data-ics=16></i> PITボード」で配置図と併用できます。</li>
      </ul>
    `,

    work: `
      <h2><i data-ic=factory data-ics=16></i> Pitリスト</h2>
      <p>自社のPIT配置図に、実際の入庫カードをはめて<strong>今どの車がどのリフト・置き場にいるか</strong>を見る画面です。</p>
      <ul>
        <li>配置図は自社レイアウト（3PIT・1PIT・青空 等）が初期表示。</li>
        <li>未割り当てのカードは下に並び、ドラッグで枠にはめられます。</li>
      </ul>
    `,

    shaken: `
      <h2><i data-ic=search data-ics=16></i> 車検予定</h2>
      <p>車検の段取りを「行ける日候補 → 決定 → 完了／再検」で見える化する画面です。</p>
      <ul>
        <li><strong>行ける日候補</strong>：その車を車検に出せる日（午前/午後）のマスを<strong>押すと入ります</strong>。もう一度押すと外れます（v1.118.0）。</li>
        <li><strong>決定</strong>：候補の帯を上の<strong>「決定」へドラッグ</strong>すると、その日に決まります。
            🔴 <strong>押しただけでは決まりません</strong>（押し間違いで陸運局の日が変わらないように）。別日への変更もドラッグ、予定エリアに戻すと候補に戻ります。</li>
        <li><strong>回送の担当・陸運局・R</strong>（v1.119.0）：決めた直後に窓が開くので、その場で入れられます。あとから決定チップを押しても直せます。
            <br>・<strong>担当</strong>＝実際に車検へ行く（回送する）人。ここに入れると<strong>MHSの当日ビューと前日LINEの画像にも前もって名前が出ます</strong>。
            <br>・<strong>陸運局</strong>＝CoreMembers の場所マスターで「陸運局」のバッジが付いた場所から選びます（PitFlowでは足せません）。
            <br>・<strong>R</strong>＝ラウンド1〜4。<br>空のままでも決定できますが、決定チップに「未定」の印が出ます。
            <br>🔴 <strong>車検済にすると、担当（回送）・陸運局・ラウンドが予約詳細の「車検」欄にも残ります</strong>（v1.120.0）。予約詳細の「車検済にする」からも同じ3つを入れられます。</li>
        <li><strong>完了／再検</strong>：終わったら完了、再検があれば記録。</li>
      </ul>
      <p>ヘッダーに「決定X／完了X／再検X／候補X／未設定X」の件数が出ます。</p>
      <p>表の下に<strong>入庫待ちの予約</strong>を「今週／来週／再来週」の3つに分けて出します（入庫日順・曜日つき・左／MT などのバッジ付き）。</p>
    `,

    shakenlog: `
      <h2><i data-ic=card data-ics=16></i> 車検履歴</h2>
      <p>車検の<strong>実績アーカイブ</strong>。誰が・いつ行ったかを月カレンダーで残します。</p>
      <ul>
        <li>カードは2行（客名＋車種）。上部の<strong>検索バー</strong>で日付・車種・客名・担当を絞り込めます（スペース区切りAND）。</li>
        <li>「済」と「再検」を色分けで表示。担当別の件数も分かります。</li>
      </ul>
    `,

    carsales: `
      <h2><i data-ic=drop data-ics=16></i> 車販作業</h2>
      <p>納車前の車販まわりの作業（洗車・ヘッドライト磨き・コーティング・その他依頼）を段階で管理します。</p>
      <ul>
        <li>洗車は「<i data-ic=sun data-ics=16></i>今日／<i data-ic=moon data-ics=16></i>明日」「今週」に分けて表示。完了で「済」。</li>
        <li>ヘッドライト磨き・コーティング依頼・その他依頼も、それぞれ完了チェックできます。</li>
        <li>🔴 <strong>洗車は受注のとき（連絡中 → パーツ待ち）に先に決められます</strong>（v1.122.0）。早く決まっているほど車販の段取りが組みやすくなります。<br>
            この洗車は<strong>カード詳細・完TELの窓と同じ1つのスイッチ</strong>なので、どこから触っても同じです。まだ決まっていなければ押さずに進めばよく、勝手に「不要」にはなりません。</li>
      </ul>
    `,

    outsource: `
      <h2><i data-ic=external data-ics=16></i> 外注</h2>
      <p>外注に出したカードを、<strong>外注先ごとに俯瞰</strong>する読み取り用の画面です。</p>
      <ul>
        <li>提携先（板金・タイヤ・ガラス 等）は設定で増減できます。</li>
        <li>カードをクリックで詳細を確認できます。</li>
      </ul>
    `,

    loaner: `
      <h2><i data-ic=van data-ics=16></i> 代車カレンダー</h2>
      <p>縦＝日付（下に無限）、横＝代車のカレンダーで、<strong>どの代車がいつ貸出中か</strong>を管理します。</p>
      <ul>
        <li>絞込（ETC・ナビ・ISO・軽/普通/輸入）や並べ替え（高さ・幅・長さ・定員）ができます。</li>
        <li><strong>予約以外で貸出</strong>（車販の乗り換え等）、<strong>緊急車両追加</strong>（クレーム対応で社用車を一時的に）にも対応。</li>
        <li>車両の車検・点検・リースアップ等のイベントもカレンダーに重なって表示されます。</li>
      </ul>
    `,

    parking: `
      <h2><i data-ic=parking data-ics=16></i> 駐車場</h2>
      <p>置き場（ピット内・自社敷地・駐車場・緊急+α）のキャパに対して、<strong>その日の預かり台数と空き／超過</strong>を管理します。</p>
      <ul>
        <li>「次の営業日までに空けておく台数」など、段取りに使う目安が出ます。</li>
        <li>空き0以上＝緑／少し超過＝オレンジ／大きく超過＝赤 と色で分かります（しきい値は設定で変更可）。</li>
      </ul>
    `,

    fleet: `
      <h2><i data-ic=van data-ics=16></i> 車両管理（代車・自社車両）</h2>
      <p>代車と社用車（積載車・営業車など）を登録・管理する台帳です。</p>
      <ul>
        <li>車種・色・ナンバー・区分（軽/普通/輸入）・寸法・定員・装備（ETC/ナビ/ISO）を登録。</li>
        <li><strong>車検満了日・12ヶ月点検</strong>を入れると自動で予定に載ります。</li>
        <li>車両の入替（番号の付替え）予定も登録できます。</li>
      </ul>
    `,

    result: `
      <h2><i data-ic=check data-ics=16></i> 実績</h2>
      <p>作業完了日ベースの<strong>実績カレンダー</strong>。その日に「作業完了 or 返車済み」になったカードが並びます。</p>
      <ul>
        <li>1日3件まで表示＋「+N件」。枠クリックでその日の全実績をポップアップ。</li>
        <li>国産＝緑、輸入＝ピンクの帯で区別。カードクリックで詳細へ。</li>
      </ul>
    `,

    inspect: `
      <h2><i data-ic=search data-ics=16></i> 点検（健康診断）</h2>
      <p>PitFlow の中のデータを全部読んで、<strong>おかしい所・入っていない所・止まっている車</strong>を並べる画面です。
         🔴 <strong>1文字も書き換えません。</strong>読んで、数えて、並べるだけです。</p>
      <ul>
        <li><strong>重さは3つ。</strong>
            <strong>要対応</strong>＝放っておくとお金か信用が減るもの／
            <strong>確認</strong>＝たぶん入れ忘れ。見て決めるもの／
            <strong>気づき</strong>＝仕様かもしれないもの。<br>
            上のタイルを押すと、その重さだけに絞れます。</li>
        <li><strong>分類</strong>は お金／日付・進行／予約／代車／車検／データの抜け／状態の矛盾 の7つ。タブで切り替えます。</li>
        <li>1件ごとに <strong>「なぜ出したか」「どうする」</strong> が書いてあります。<strong>開く</strong>でその車のカードへ飛べます。</li>
        <li><strong>札を貼れます。</strong>
            <strong>見た</strong>＝目は通した（次も出ます）／
            <strong>これは仕様</strong>＝うちではこれで正しい（次から出ません）／
            <strong>直した</strong>＝直した。<br>
            🔴 札は<strong>みんなで共有</strong>します（同じ車を2人で追いかけないため）。直したものは次の点検で自然に消えます。</li>
        <li>その規則そのものが うちのやり方に合わない時は <strong>「この規則は出さない」</strong>で黙らせられます（あとで戻せます）。</li>
        <li><strong>書き出し</strong>＝結果を JSON で落とします。売上チェックリスト（整備ソフト）との突合や、AI にまとめて見てもらう時に使います。</li>
      </ul>
      <p>🔴 <strong>いつ見るか＝クォーターごと（およそ週1）</strong>を想定しています。毎日見るものではありません。
         クォーターは 1〜7日／8〜15日／16〜23日／24日〜月末 の4つです。</p>
      <p>⚠ 点検が「おかしい」と言うかどうかの物差しは、<strong>売上の区分・返車の日・代車の空き・車検の行ける日</strong>など
         <strong>ふだん画面が使っているものと同じ1本</strong>です。点検だけが別の答えを出すことはありません。</p>
    `,

    sales: `
      <h2><i data-ic=money data-ics=16></i> 売上</h2>
      <p>月／年／クォーターや、フロント別・作業グループ別で売上を集計する画面です。</p>
      <ul>
        <li><strong>確度の段階</strong>（実績・実績待・確定・予定・見込・予測の6つ）で着地見込みを出します（v1.167.0 で「実績待」＝作業は終わって返すだけ、を切り出しました）。</li>
        <li>月の<strong>目標達成率</strong>（最低目標に対する％）や本日ペースが分かります。</li>
        <li>作業グループ（車検＞12点＞一般 等）別の台数・売上・平均単価も見られます。</li>
        <li>🔴 <strong>日次のグラフを「当日の前後◯日」で見る（v1.72.0）</strong>＝当月の「日次の進捗」グラフの右上の <strong>全体／±10日／±5日</strong>（右へ行くほど狭く・大きく見えます）。
          当日を真ん中にして、その前後だけを描き直します。<strong>横の日付だけでなく縦の金額の目盛りも引き直す</strong>ので、月まるごとでは平べったく見える動きがはっきり出ます。
          <br>⚠ そのぶん<strong>0円から始まりません</strong>。⚠ 当日が無い月（先月・来月）では押せません。</li>
      </ul>
      <h3><i data-ic=clock data-ics=16></i> フロント欄の日数（v1.72.0）</h3>
      <ul>
        <li><strong>概算とのズレ 平均／いちばん外した</strong>＝予約のときに出た<strong>概算返車日</strong>（入庫日＋概算 預かり日数）と、<strong>実際に返した日</strong>の差。
          <strong>＋（赤）＝読みより遅れた／−（緑）＝早く返せた</strong>。
          <br>⚠ 早いほうが良いとは限りません（読みが甘いだけのこともある）。<strong>±0に近いほど読みが当たっている</strong>と見てください。</li>
        <li><strong>作業待ち→完了</strong>＝ピットで実際にかかった日数／<strong>完了→確定返車</strong>＝終わってから引き取られるまでの日数。
          <br>🔴 どちらも<strong>預かりの車だけ</strong>です（待ち・当日返しは「その日のうち」なので混ぜると平均が潰れます）。</li>
        <li>この2つは<strong>フローの記録から数えています</strong>。フローの日時を直すと、この数字も改まります。</li>
      </ul>
    `,

    customers: `
      <h2><i data-ic=user data-ics=16></i> 顧客</h2>
      <p>入力補助用の<strong>顧客控え</strong>（車両ごと）。新規入庫の際に呼び出して入力を早められます。</p>
      <div class="help-tip">正式な台帳は整備ソフト側です。ここは「よく来るお客様をすぐ引ける控え」として使います。サンプル500件の投入や全削除もできます。</div>
      <h3><i data-ic=box data-ics=16></i> アーカイブ（消すのではなく片付ける）＝v1.49.0</h3>
      <p>🔴 <strong>「削除」はやめました。</strong>もう来ないお客様・降りた車は<strong>アーカイブ（片付ける）</strong>します。<strong>データは消えません。</strong></p>
      <ul>
        <li><strong>顧客をアーカイブすると</strong>、ダッシュボードの検索・新規予約の顧客呼び出しから出なくなります。<strong>その人の入庫カードも検索に出ません</strong>（その人の車も全部まとめて）。
          <br>⚠ <strong>実績・売上などの数字はそのまま</strong>です（過去の売上が減ったりしません）。</li>
        <li><strong>探す時</strong>は顧客画面の「<strong>アーカイブ済みを見る</strong>」を押すと、一覧と検索がアーカイブ済みだけに切り替わります。もう一度押すと戻ります。</li>
        <li><strong>戻す（復元）は管理者だけ</strong>です。片付けるのは誰でもできます。間違えても消えていないので大丈夫です。</li>
        <li><strong>車も1台ずつアーカイブできます</strong>（顧客詳細の車のカードから）。乗り換えで降りた車を片付けるのに使います。<strong>入庫の履歴は顧客詳細に残ります</strong>。</li>
        <li>顧客を戻すと、その人の車も元どおりに出ます。ただし<strong>1台ずつ片付けた車は片付いたまま</strong>です（そこは別々に覚えています）。</li>
      </ul>
      <h3><i data-ic=swap data-ics=16></i> 乗り換え／増車（新規予約の「＋ この顧客で新規車両」）</h3>
      <ul>
        <li><strong>乗り換え（前の車は降りる）</strong>＝いまの車をアーカイブして、新しい車を入れます。前の車の履歴は残ります。</li>
        <li><strong>増車（前の車も乗り続ける）</strong>＝いまの車はそのまま、2台目として入れます。</li>
        <li>どちらでも<strong>車の欄（ナンバー・メーカー・車種・カルテNo.・車両注意）は全部空</strong>になります。お客様の名前・TEL・LINE は残ります。</li>
      </ul>
    `,

    settings: `
      <h2><i data-ic=settings data-ics=16></i> 設定・入庫ルール</h2>
      <p>入庫アルゴリズムの基準値や各種しきい値を設定します。</p>
      <ul>
        <li>置ける台数（内訳）・1日の予約上限（国産/輸入）・概算預かり日数・概算金額（作業タイプ別）。</li>
        <li>売上目標・平均単価・長期預かりのしきい値・駐車場オーバーの色分け。</li>
      </ul>
      <h3><i data-ic=ban data-ics=16></i> 営業日・営業時間は MHS が基準（v1.50.0）</h3>
      <p><strong>定休曜日・営業時間・長期休み（お盆/年末年始/GW）・臨時休業・特別営業・午前休み/午後休み/早締め</strong>は、<strong>MHS（マスターハブ・スケジュール）の定休日カレンダー</strong>が唯一の基準になりました。PitFlow 側では<strong>直せません</strong>（設定ページは「いま何が届いているか」を見るだけ）。</p>
      <ul>
        <li>直す場所＝<strong>MHS ▸ 管理 ▸ 定休日カレンダー</strong>（日付ごとの休み・特別営業・半休・早締め）と <strong>MHS ▸ 管理 ▸ 設定</strong>（毎週の定休・祝日の扱い・営業時間）。</li>
        <li>保存すると<strong>数秒でPitFlowに届きます</strong>。予約カレンダー・返車・車検予定・代車・駐車場・入庫ルールの「休」が一斉に変わります。</li>
        <li>臨時休業やお盆は、カレンダーのマスに<strong>その名前のまま</strong>（例：「お盆休み」）出ます。</li>
      </ul>
      <div class="help-warn">誰も MHS を開かない日が続くとカレンダーが古くなります。その時は日付を選ぶ画面の上に<strong>オレンジの注意帯</strong>が出て、「前に届いた内容で表示中」と知らせます。注意帯が出ている時は、臨時休業が反映されていない可能性があります。</div>
      <h3><i data-ic=puzzle data-ics=16></i> 入庫ルール</h3>
      <p>受付可否のアルゴリズムは<strong>ノーコードの積み上げ式</strong>で、設定の「入庫ルール」から言葉で足していけます（本番化後はAIがこれを読んで日別の○△×を判定します）。</p>
      <div class="help-warn">開発用ツールの「<i data-ic=refresh data-ics=16></i> サンプルデータに戻す」を押すと、今の編集内容は消えて初期状態に戻ります。</div>
    `,

    theme: `
      <h2><i data-ic=palette data-ics=16></i> テーマ・文字サイズ</h2>
      <h3>テーマ（4パターン）</h3>
      <p>トップバーのテーマボタンで循環します：<strong><i data-ic=moon data-ics=16></i>ダーク → <i data-ic=sun data-ics=16></i>ライト → <i data-ic=sparkle data-ics=16></i>ダーク・リキッド → <i data-ic=gem data-ics=16></i>ライト・リキッド</strong>。リキッドはガラス調（背景グラデ＋すりガラス）の見た目です。選んだテーマは端末に記憶されます。</p>
      <h3>文字サイズ（3段）</h3>
      <p>トップバーの<strong>「A A A」</strong>で 標準／大／特大。画面全体が拡大され、遠目でも見やすくなります。こちらも記憶されます。</p>
      <div class="help-tip">現場のモニタが遠い・字が小さいと感じたら「特大」がおすすめです。</div>
    `,

    faq: `
      <h2><i data-ic=help data-ics=16></i> よくある質問</h2>
      <div class="help-faq"><div class="help-faq-q">編集した内容が別のPCに出てきません</div><div class="help-faq-a">今はサンプル段階で、データはこの端末のブラウザ内に保存されるためです。本番のクラウド接続後は全端末で共有されます。</div></div>
      <div class="help-faq"><div class="help-faq-q">「自分」を切り替えたいです</div><div class="help-faq-a">今は自動で既定の担当になります。特定の人のBOXが欲しい時は、ダッシュボードでBOXを追加する時に対象者を選んでください。本番ログイン後は「自分」＝ログイン本人に自動で紐づきます。</div></div>
      <div class="help-faq"><div class="help-faq-q">最短入庫日が思ったより先です</div><div class="help-faq-a">予約枠の上限・定休・連休・代車の空きから自動計算しています。設定の予約上限や概算預かり日数、入庫ルールを見直すと変わります。</div></div>
      <div class="help-faq"><div class="help-faq-q">ダッシュボードを元に戻したい</div><div class="help-faq-a">プリセットの雛形（全体用など）から作り直せます。プリセットを追加して雛形を選べば、その配置になります。</div></div>
      <div class="help-faq"><div class="help-faq-q">画面が更新されない気がする</div><div class="help-faq-a">各ビュー右上の「<i data-ic=refresh data-ics=16></i>更新」を押してください。アプリ自体の更新は自動チェックが入っています。</div></div>
    `,

    terms: `
      <h2><i data-ic=book data-ics=16></i> 用語集</h2>
      <div class="help-term"><div class="help-term-name">受付タイプ（待ち／当日返し／預かり）</div><div class="help-term-desc">お客様の車の扱い。待ち＝店で待つ、当日返し＝その日に返す、預かり＝数日置く。置き場の占有計算に使います。</div></div>
      <div class="help-term"><div class="help-term-name">概算預かり日数</div><div class="help-term-desc">作業タイプごとの「だいたい何日預かるか」の初期値。最短入庫日や駐車場の予想に使います（後で手直し可）。</div></div>
      <div class="help-term"><div class="help-term-name">完TEL</div><div class="help-term-desc">作業完了のお客様への電話連絡。完TEL待ち→完TEL済で返車待ちに進みます。</div></div>
      <div class="help-term"><div class="help-term-name">売掛（入金待ち）</div><div class="help-term-desc">返車と入金のタイミングが別のケース。返車後も入金待ちとして残し、入金済みで確定します。</div></div>
      <div class="help-term"><div class="help-term-name">予約番号</div><div class="help-term-desc">ローマ字1＋5桁（例 K48201）。現場で口に出す・控えに載せる・検索する通し番号。内部IDとは別物です。</div></div>
      <div class="help-term"><div class="help-term-name">課（1課／2課）</div><div class="help-term-desc">1課＝国産、2課＝輸入。国産/輸入を選ぶと自動で入ります。</div></div>
      <div class="help-term"><div class="help-term-name">特殊（保証／保険）</div><div class="help-term-desc">作業タイプと併用の時だけ付く区分。予約詳細・ホバー・印刷にだけ出ます。</div></div>
    `
  };
})();
