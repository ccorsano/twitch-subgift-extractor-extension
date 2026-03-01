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

let pendingRequests = {}
let AllResolvedSubgifts = []

function formatDurationForVideoUrl(seconds)
{
  n = Number(seconds)
  var days  = Math.floor(n / (24*3600));
  var hours = Math.floor((n % (24*3600))/3600);
  var mins  = Math.floor((n % 3600)/60);
  var secs  = Math.floor(seconds % 60);

  var dStr = days > 0 ? days + "d" : "";
  var hStr = hours > 0 ? hours + "h" : "";
  var mStr = mins > 0 ? mins + "m" : "";
  var sStr = secs > 0 ? secs + "s" : "";

  return dStr + hStr + mStr + sStr;
}

function extractSubgiftEvent(parsedBody)
{
  return parsedBody.map(gdlItem => {
    edges = gdlItem.data?.currentUser?.notifications?.edges

    if (!edges) return [];

    filteredEdges = edges.filter(e => e.node.type == "sub_gift_received")

    subgifts = filteredEdges.map(notification => {
      subgiftDate = notification.node.updatedAt;
      channelId = notification.node.extra.id;
      url = notification.node.actions[0].url;
      description = notification.node.body;
      const urlSegments = url.split("/");
      channelName = urlSegments[urlSegments.length-1];

      return {
        id: notification.node.id,
        timeStamp: subgiftDate,
        channelId: channelId,
        channelUrl: url,
        channelName: channelName,
        body: description
      }
    })

    return subgifts
  }).flat()
}

function replaceUrlsInSubgiftEvents(eventsData, subgiftsUrls)
{
  eventsData.forEach(gqlItem => {
    edges = gqlItem.data?.currentUser?.notifications?.edges
    if (!edges) return;
    filteredEdges = edges.filter(e => e.node.type == "sub_gift_received")

    filteredEdges.forEach(notification => {
      subgiftUrl = subgiftsUrls.find(s => s.id == notification.id)

      if(!subgiftUrl) return;

      notification.node.actions[0].url = subgiftUrl.url
    })
  });
}

function getBroadcastForTimestamp(broadcastsResult, timestamp)
{
  const broadcasts = broadcastsResult[0].data.user.videos.edges.map(e => e.node)
  const giftDate = new Date(timestamp)

  timings = broadcasts.map(b => {
    const publishedAt = new Date(b.publishedAt)
    const streamEnd = new Date(publishedAt.getTime() + b.lengthSeconds * 1000)
    
    return {
      id: b.id,
      start: publishedAt,
      end: streamEnd,
      hasSubgift: publishedAt < giftDate && streamEnd >  giftDate,
      details: b
    }
  })

  const matchedBroadcast = timings.find(b => b.hasSubgift)
  if (matchedBroadcast)
  {
    return matchedBroadcast
  }
  return undefined
}

function getHeaderValue(headers, name)
{
  var headerEntry = headers.find(h => h.name == name)
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
      responseFilter.ondata = async (ondataEvent) => {
        didWriteData = false
        try {
          let decoder = new TextDecoder("utf-8");
          const rawString = decoder.decode(ondataEvent.data);

          requestHeaders = pendingRequests[details.requestId].headers;

          console.debug(rawString)
          parsedBody = JSON.parse(rawString);

          clientId = getHeaderValue(requestHeaders, "Client-Id");
          authorization = getHeaderValue(requestHeaders, "Authorization");

          var subgifts = extractSubgiftEvent(parsedBody);

          subgiftUrls = subgifts.map(async subgift => {
            console.log("Fetch past broadcast " + subgift.channelName)
            const pastBroadcasts = await fetchPastBroadcasts(clientId, authorization, subgift.channelName)
            
            console.log("Found " + pastBroadcasts[0].data.user.videos.edges.length + " broadcasts")
            const subgiftBroadcast = getBroadcastForTimestamp(pastBroadcasts, subgift.timeStamp)
            var subgiftUrl = subgift.channelUrl
            if (subgiftBroadcast)
            {
              const secondsInStream = (new Date(subgift.timeStamp) - subgiftBroadcast.start) / 1000;
              subgiftUrl = "https://www.twitch.tv/videos/" + subgiftBroadcast.id + "?t=" + formatDurationForVideoUrl(secondsInStream);
            }

            return {
              notificationId: subgift.id,
              channelId: subgift.channelId,
              channelName: subgift.channelName,
              subgiftTime: subgift.timeStamp,
              url: subgiftUrl,
              description: subgift.body
            }
          })

          if (subgifts.length === 0)
          {
            return;
          }

          // replaceUrlsInSubgiftEvents(parsedBody, subgiftUrls)
          // let encoder = new TextEncoder("utf-8");
          // const encodedStr = encoder.encode(JSON.stringify(parsedBody));
          // responseFilter.write(encodedStr);
          // didWriteData = true;
          Promise.all(subgiftUrls).then(resolvedSubgifts => {
            resolvedSubgifts.forEach(subgift => {
              if (AllResolvedSubgifts.find(s => s.notificationId == subgift.notificationId)) return;

              AllResolvedSubgifts.push(subgift)
            });

            // Build a lightweight payload that we’ll forward
            const payload = {
              tabId: details.tabId,
              url: details.url,
              method: details.method,
              headers: details.requestHeaders || [],
              body: resolvedSubgifts,
              requestId: details.requestId,
              timeStamp: details.timeStamp
            };

            // Send it to the content script that owns the tab
            browser.tabs.sendMessage(details.tabId, {type: "REQUEST_FULFILLED", payload})
              .catch(err => {
                // The tab might not have a content script yet, or it might have been closed.
                console.warn("Could not forward request to content script:", err);
              });
          })
        } catch(ex) {
          console.error(ex)
        } finally {
          if (!didWriteData)
          {
            responseFilter.write(ondataEvent.data);
          }
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
      pendingRequests[details.requestId].headers = details.requestHeaders
    }
  },
  filter,
  ["requestHeaders"]  // we want the body and headers
);

browser.runtime.onMessage.addListener(async (msg) => {
  if(msg == "getPopupContent")
  {
    return AllResolvedSubgifts
  }

  // Build a lightweight payload that we’ll forward
  const payload = {
    body: AllResolvedSubgifts
  };

  // Send it to the content script that owns the tab
  browser.tabs.sendMessage(tab.id, {type: "REQUEST_FULFILLED", payload})
    .catch(err => {
      // The tab might not have a content script yet, or it might have been closed.
      console.warn("Could not forward request to content script:", err);
    });
});