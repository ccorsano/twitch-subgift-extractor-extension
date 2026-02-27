/**
 *  content_script.js
 *
 *  This script runs on every page that matches <all_urls>.
 *  It listens for messages from the background script that contain
 *  request details and does something with them.
 *
 *  In this example we just log them to the console, but you can
 *  hook into any DOM element, send them to a server, or whatever
 *  you need for your extension.
 */

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_FULFILLED") {
    const data = message.payload;
    console.groupCollapsed(`Request to ${data.url}`);
    console.log("Method:", data.method);
    console.log("Headers:", data.headers);
    console.log("Body:", data.body);
    console.log("Timestamp:", new Date(data.timeStamp).toLocaleString());
    console.groupEnd();

    data.body.forEach(gdlItem => {
      edges = gdlItem.data?.currentUser?.notifications?.edges

      if (!edges) return;

      edges.filter(e => e.node.type == "sub_gift_received").forEach(notification => {
        subgiftDate = notification.node.updatedAt
        channelId = notification.node.extra.id

        console.log(subgiftDate)
        console.log(channelId)
      })
    })
  }

  // If you need to reply back
  sendResponse({status: "received"});
});
