// CommentBot — 主世界（MAIN world）注入腳本，僅用於 X / Twitter。
//
// 為什麼需要它：content.js 跑在「隔離世界」，拿不到頁面的 React / DraftJS 實例。X 的回覆框是
// DraftJS 的「受控 contenteditable」，內容由內部 EditorState 管理，從隔離世界填字都不乾淨：
//   • execCommand('insertText')：受信任事件會更新 DraftJS 模型，但原生動作「同時」插入一份裸
//     文字節點 → 內容「重複兩次」。
//   • 合成 paste 事件（未受信任）：DraftJS 的 onPaste 常直接忽略 → 內容變「空」。
// 正解：在「主世界」透過 React fiber 取得 DraftEditor 的 editorState 與 onChange，直接以
// ContentState.createFromText + EditorState.push 產生新狀態並 onChange。這完全不碰 DOM，
// 故不重複；模型更新後 X 的送出鈕也會啟用。
//
// 與 content.js 的溝通（僅透過共享 DOM，不跨世界傳物件）：
//   content.js 在回覆框 box 上設 data-cb-fill-text=<文字>，派發 'cb-twitter-fill' 事件；
//   本腳本處理後把結果寫回 data-cb-fill-result：ok / nofiber / err。
(function () {
  'use strict';

  // 由 DOM 節點沿 React fiber 往上找「DraftEditor 元件」的 props（同時含 editorState 與 onChange）。
  function findEditorProps(node) {
    let key = null;
    for (const k in node) {
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) {
        key = k;
        break;
      }
    }
    let fiber = key ? node[key] : null;
    for (let i = 0; fiber && i < 200; i++) {
      const p = fiber.memoizedProps;
      if (p && p.editorState && typeof p.onChange === 'function') return p;
      fiber = fiber.return;
    }
    return null;
  }

  document.addEventListener(
    'cb-twitter-fill',
    function (e) {
      const box = e.target;
      if (!box || typeof box.getAttribute !== 'function') return;
      const setResult = (v) => {
        try {
          box.setAttribute('data-cb-fill-result', v);
        } catch (_) {}
      };
      try {
        const text = box.getAttribute('data-cb-fill-text');
        if (text == null) return;
        const props = findEditorProps(box);
        if (!props) return setResult('nofiber');
        const es = props.editorState;
        const ContentState = es.getCurrentContent().constructor; // 取得 ContentState 類別（含靜態方法）
        const EditorState = es.constructor; // 取得 EditorState 類別（含靜態方法）
        // 用純文字建立新內容並套用（取代整個內容——回覆框無需保留舊內容）。
        let ns = EditorState.push(es, ContentState.createFromText(text), 'insert-characters');
        if (typeof EditorState.moveFocusToEnd === 'function') ns = EditorState.moveFocusToEnd(ns);
        props.onChange(ns); // 走 DraftJS 受控 API → 更新模型、啟用送出鈕，且不碰 DOM（不重複）
        setResult('ok');
      } catch (err) {
        setResult('err');
      }
    },
    true // 捕獲階段：content.js 於 box 上派發（bubbles:false）也收得到
  );
})();
