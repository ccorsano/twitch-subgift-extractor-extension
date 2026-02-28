/**
 *  background.js
 *
 *  1. Listens for all requests that match a filter.
 *  2. Captures the body (if present) – only for POST/PUT/DELETE etc.
 *  3. Sends a message to the content script that is active on the tab
 *     that initiated the request.
 *
 *  Note: Reading request bodies only works for methods that actually
 *  have a body, and only for a few content types (form, json, xml, etc.).
 *
 *  If you need the full request payload for other content types, you
 *  will have to monkey‑patch `fetch`/`XMLHttpRequest` in the page itself
 *  (see the optional section below).
 */

const filter = {
  urls: ["<all_urls>"],          // narrow this to the specific URL(s) you care about
  types: ["xmlhttprequest", "fetch"] // or just "xmlhttprequest" if you only care about XHR
};

var notificationRequests = []

console.warn("Background script loading");

let testPermissions = {
  origins: ["https://gql.twitch.tv/*"],
  permissions: ["webRequest","webRequestBlocking"],
};
const testResult = browser.permissions.contains(testPermissions).then(testResult => console.warn(testResult) )

browser.webRequest.onBeforeRequest.addListener(async (details) => {
    requestText = new TextDecoder().decode(details.requestBody.raw[0].bytes)
    requestJson = JSON.parse(requestText)

    if (requestJson.some(query => query.operationName == "OnsiteNotifications_ListNotifications"))
    {
      notificationRequests.push(details.requestId)
      console.warn(notificationRequests)
      responseFilter = browser.webRequest.filterResponseData(details.requestId);
      responseFilter.onstop = (event) => {
        responseFilter.close()
      }
      responseFilter.ondata = (event) => {
        let decoder = new TextDecoder("utf-8");
        const rawString = decoder.decode(event.data);
        try {
          parsedBody = JSON.parse(rawString);

          // Build a lightweight payload that we’ll forward
          const payload = {
            tabId: details.tabId,
            url: details.url,
            method: details.method,
            headers: details.requestHeaders || [],
            body: parsedBody,
            requestId: details.requestId,
            timeStamp: details.timeStamp
          };

          // Send it to the content script that owns the tab
          browser.tabs.sendMessage(details.tabId, {type: "REQUEST_FULFILLED", payload})
            .catch(err => {
              // The tab might not have a content script yet, or it might have been closed.
              console.warn("Could not forward request to content script:", err);
            });
        } finally {
          responseFilter.write(event.data);
        }
      };
    }
  },
  filter,
  ["blocking","requestBody"]  // we want the body and headers
);
