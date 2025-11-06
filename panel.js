// panel.js
const $q = (sel, el = document) => el.querySelector(sel);

const state = {
  results: [],
  selectedIndex: -1
};

window.addEventListener("message", (ev) => {
  const { data } = ev;
  if (!data || typeof data !== "object") return;

  if (data.type === "INIT_QUERY") {
    const guess = (data.query || "").trim();
    if (guess) {
      $q("#q").value = guess;
      doSearch(guess);
    }
  }

  if (data.type === "SEARCH_RESULT") {
    const { payload } = data;
    if (!payload?.ok) {
      renderResults([]);
      alert("검색 중 오류가 발생했습니다: " + (payload?.error || "Unknown"));
      return;
    }
    const items = parseCoupangSearchHTML(payload.html || "");
    renderResults(items);
  }

  if (data.type === "APPLY_DONE") {
    if (data.ok) {
      alert("등록폼에 일부 필드를 채웠습니다.");
    } else {
      alert("자동 채우기 실패: " + (data.error || "Unknown"));
    }
  }
});

$q("#searchBtn").addEventListener("click", () => {
  const query = $q("#q").value.trim();
  if (query) doSearch(query);
});

$q("#applyBtn").addEventListener("click", () => {
  if (state.selectedIndex < 0) return;
  const item = state.results[state.selectedIndex];
  if (!item) return;
  // 등록폼에 기본 타이틀/모델명 정도만 넣는 예시
  window.parent.postMessage({
    type: "APPLY_TO_FORM",
    productTitle: item.title,
    modelName: extractLikelyModel(item.title)
  }, "*");
});

function doSearch(query) {
  renderResults([], true);
  window.parent.postMessage({ type: "SEARCH_COUPANG", query }, "*");
}

function parseCoupangSearchHTML(html) {
  // content.js에서 파싱해도 되지만, iframe 내 DOMParser 사용이 편함
  const dom = new DOMParser().parseFromString(html, "text/html");

  // 쿠팡 검색 결과 카드 셀렉터 (변동 가능 → 다중 시도)
  const cards = dom.querySelectorAll(".search-product, li.search-product");
  const items = [];
  cards.forEach((c) => {
    const link = c.querySelector("a.search-product-link");
    const titleEl = c.querySelector(".name,.search-product .name");
    const priceEl = c.querySelector(".price-value, .price-num, .price > strong");

    const href = link ? link.getAttribute("href") : "";
    const title = titleEl ? titleEl.textContent.trim() : "";
    let price = priceEl ? priceEl.textContent.replace(/[^\d]/g, "") : "";
    if (price) price = Number(price);

    // 제품 ID 추출 (/vp/products/123456)
    let productId = "";
    if (href) {
      const m = href.match(/\/vp\/products\/(\d+)/);
      if (m) productId = m[1];
    }

    if (href && title) {
      items.push({
        title,
        price,
        href: "https://www.coupang.com" + href,
        productId
      });
    }
  });

  // 유사도 점수(간단 가중치): 입력 질의 기준으로
  const query = $q("#q").value.trim();
  items.forEach(it => {
    it.score = similarity(query, it.title);
  });

  // 점수, 가격순 보조 정렬
  items.sort((a, b) => (b.score - a.score) || ((a.price||0) - (b.price||0)));
  return items.slice(0, 30);
}

function renderResults(items, loading = false) {
  state.results = items;
  state.selectedIndex = -1;
  $q("#applyBtn").disabled = true;

  const $list = $q("#results");
  $list.innerHTML = loading ? `<div class="card">검색 중…</div>` : "";

  items.forEach((it, idx) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="title">${escapeHtml(it.title)}</div>
      <div class="meta">
        ${it.productId ? `ProductID: ${it.productId} · ` : ""}
        ${it.price ? `₩${Number(it.price).toLocaleString()}` : "가격정보 없음"}
      </div>
      <div class="row">
        <a href="${it.href}" target="_blank" rel="noreferrer">상세열기</a>
      </div>
      <div class="select-row">
        <input type="radio" name="pick" id="pick-${idx}">
        <label for="pick-${idx}">이 항목 선택</label>
        <span style="margin-left:auto;font-size:12px;color:#9aa7c0;">유사도: ${(it.score*100|0)}%</span>
      </div>
    `;
    $list.appendChild(div);

    const radio = div.querySelector(`#pick-${idx}`);
    radio.addEventListener("change", () => {
      state.selectedIndex = idx;
      $q("#applyBtn").disabled = false;
    });
  });

  if (!loading && items.length === 0) {
    $list.innerHTML = `<div class="card">검색 결과가 없습니다. 모델명을 더 구체적으로 입력해보세요.</div>`;
  }
}

// 매우 단순한 토큰 기반 유사도 (MVP 용)
function similarity(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.sqrt(A.size * B.size);
}

function tokenize(s) {
  return (s||"")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s\-']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractLikelyModel(title) {
  // 예: "Nike Air Force 1 '07 Low" 식에서 핵심 모델 프레이즈 추출(간단)
  // MVP에선 그대로 반환
  return title;
}

function escapeHtml(s) {
  return (s||"").replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
