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
    console.log("Body:", data.body);
  }
});
