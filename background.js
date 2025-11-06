// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEARCH_COUPANG") {
    const q = msg.query || "";
    // 쿠팡 검색 URL (정렬/옵션은 필요시 조정)
    const url = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(q)}&channel=user`;

    fetch(url, {
      method: "GET",
      // service worker에서 cross-origin fetch 가능 (host_permissions 필요)
    })
      .then(r => r.text())
      .then(html => sendResponse({ ok: true, html }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
