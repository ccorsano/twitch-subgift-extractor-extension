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

console.warn("Background script loading");

var pendingRequests = {}

function extractSubgiftEvent(parsedBody)
{
  console.log("extractSubgiftEvent")
  console.warn(parsedBody)
  return parsedBody.map(gdlItem => {
    edges = gdlItem.data?.currentUser?.notifications?.edges

    if (!edges) return [];

    filteredEdges = edges.filter(e => e.node.type == "sub_gift_received")

    subgifts = filteredEdges.map(notification => {
      subgiftDate = notification.node.updatedAt
      channelId = notification.node.extra.id
      url = notification.node.actions[0].url
      const urlSegments = url.split("/")
      channelName = urlSegments[urlSegments.length-1]

      return {
        timeStamp: subgiftDate,
        channelId: channelId,
        channelUrl: url,
        channelName: channelName
      }
    })

    return subgifts
  }).flat()
}

function getHeaderValue(headers, name)
{
  var headerEntry = headers.find(h => h.name == name)
  console.log(headerEntry)
  if (!headerEntry || headerEntry.length == 0) return undefined;
  return headerEntry.value
}

async function fetchPastBroadcasts(clientId, authorization, channelName)
{
  request = [
    {
      "operationName": "FilterableVideoTower_Videos",
      "variables": {
        "includePreviewBlur": false,
        "limit": 30,
        "channelOwnerLogin": channelName,
        "broadcastType": "ARCHIVE",
        "videoSort": "TIME"
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash": "67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f"
        }
      }
    }
  ]

  const response = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": authorization,
      "Client-Id": clientId
    },
    body: JSON.stringify(request)
  })

  const responseJson = await response.json()
  
  return responseJson
}

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
      responseFilter = browser.webRequest.filterResponseData(details.requestId);

      pendingRequests[details.requestId] = {
        headers: undefined
      }

      responseFilter.onstop = (_) => {
        responseFilter.close()
      }
      responseFilter.ondata = (ondataEvent) => {
        console.log("ondata")
        console.log(ondataEvent)
        try {
          let decoder = new TextDecoder("utf-8");
          const rawString = decoder.decode(ondataEvent.data);
          console.log("decoded")

          requestHeaders = pendingRequests[details.requestId].headers;

          console.debug(rawString)
          parsedBody = JSON.parse(rawString);
          console.log("parsed")

          console.debug(requestHeaders)

          clientId = getHeaderValue(requestHeaders, "Client-Id");

          console.debug(requestHeaders)

          authorization = getHeaderValue(requestHeaders, "Authorization");

          var subgifts = extractSubgiftEvent(parsedBody);
          console.log(subgifts)

          subgifts.forEach(async subgift => {
            console.log("Fetch past broadcast " + subgift.channelName)
            console.log(requestHeaders)
            const pastBroadcasts = await fetchPastBroadcasts(clientId, authorization, subgift.channelName)
            console.log(pastBroadcasts)
          })

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
        } catch(ex) {
          console.error(ex)
        } finally {
          responseFilter.write(ondataEvent.data);
        }
      };
    }
  },
  filter,
  ["blocking","requestBody"]  // we want the body and headers
);

browser.webRequest.onSendHeaders.addListener(async (details) =>
  {
    if (pendingRequests[details.requestId])
    {
      console.log("Retrieved headers for " + details.requestId)
      pendingRequests[details.requestId].headers = details.requestHeaders
    }
  },
  filter,
  ["requestHeaders"]  // we want the body and headers
);
