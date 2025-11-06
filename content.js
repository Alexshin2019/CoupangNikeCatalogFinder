// content.js
(() => {
  let panelHost = null;
  let shadowRoot = null;

  function ensurePanel() {
    if (panelHost) return;
    panelHost = document.createElement("div");
    panelHost.id = "ccf-panel-host";
    panelHost.style.all = "initial";
    panelHost.style.position = "fixed";
    panelHost.style.top = "0";
    panelHost.style.right = "0";
    panelHost.style.width = "380px";
    panelHost.style.height = "100vh";
    panelHost.style.zIndex = "2147483646";
    panelHost.style.pointerEvents = "none"; // 내부 iframe/컨테이너에만 이벤트
    document.documentElement.appendChild(panelHost);

    shadowRoot = panelHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.style.pointerEvents = "auto";
    container.innerHTML = `
      <link rel="stylesheet" href="${chrome.runtime.getURL('panel.css')}">
      <iframe id="ccf-frame" style="width:100%;height:100%;border:0;"></iframe>
    `;
    shadowRoot.appendChild(container);

    const frame = shadowRoot.getElementById("ccf-frame");
    frame.src = chrome.runtime.getURL("panel.html");
  }

  function guessModelFromPage() {
    // 1) 쿠팡 상품 상세 (여러 셀렉터 시도)
    const selectors = [
      "h2.prod-buy-header__title",         // 상품 상세 상단 제목
      ".prod-detail__title",               // 다른 테마
      "meta[property='og:title']",
      "title"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (sel === "meta[property='og:title']") {
        const c = el.content?.trim();
        if (c) return sanitizeModel(c);
      }
      const t = (el.textContent || "").trim();
      if (t) return sanitizeModel(t);
    }
    // 2) 셀러센터 등록폼의 입력값 유추 (있는 경우)
    const formTitle = document.querySelector("input[name*='productName'], input[name*='title']");
    if (formTitle?.value) return sanitizeModel(formTitle.value);

    return "";
  }

  function sanitizeModel(s) {
    // 너무 긴 부가문구/특수문자 제거 & 나이키 키워드 우선
    let x = s.replace(/\s{2,}/g, " ").replace(/\|.+$/,"").trim();
    // 괄호 및 프로모션 꼬리말 제거
    x = x.replace(/(\[.*?\]|\(.*?\)|\{.*?\})/g, " ").replace(/\s{2,}/g, " ").trim();
    return x;
  }

  function openPanelWithQuery(query) {
    ensurePanel();
    // iframe 로드 후 메시지 전달
    const iframe = shadowRoot.getElementById("ccf-frame");
    const tick = setInterval(() => {
      if (!iframe.contentWindow) return;
      clearInterval(tick);
      iframe.contentWindow.postMessage({ type: "INIT_QUERY", query }, "*");
    }, 100);
  }

  // 단축키: Alt+M 로 패널 토글
  function setupHotkey() {
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const guess = guessModelFromPage();
        openPanelWithQuery(guess);
      }
    });
  }

  // 첫 진입 시 자동으로 한 번만 패널을 띄우고 싶으면 아래 주석 해제:
  // window.addEventListener("load", () => openPanelWithQuery(guessModelFromPage()));

  setupHotkey();

  // 다른 창에서 오는 메시지 (panel -> content)
  window.addEventListener("message", async (ev) => {
    const { data } = ev;
    if (!data || typeof data !== "object") return;

    if (data.type === "SEARCH_COUPANG") {
      chrome.runtime.sendMessage(
        { type: "SEARCH_COUPANG", query: data.query || "" },
        (resp) => {
          const iframe = shadowRoot?.getElementById("ccf-frame");
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: "SEARCH_RESULT", payload: resp }, "*");
          }
        }
      );
    }

    if (data.type === "APPLY_TO_FORM") {
      // 셀러센터 등록폼 자동 채움 (가능한 필드만)
      try {
        const { productTitle, modelName } = data;
        const inputTitle = document.querySelector("input[name*='productName'], input[name*='title']");
        if (inputTitle && productTitle) inputTitle.value = productTitle;

        // 필요한 경우 더 매핑: 브랜드/모델/옵션 등
        // 예: document.querySelector("input[name*='brand']")?.value = "NIKE";

        ev.source.postMessage({ type: "APPLY_DONE", ok: true }, "*");
      } catch (err) {
        ev.source.postMessage({ type: "APPLY_DONE", ok: false, error: String(err) }, "*");
      }
    }
  });
})();
