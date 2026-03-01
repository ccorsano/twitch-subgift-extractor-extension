console.log("Loaded script for popup")

async function refreshSubgifts()
{
    const subgifts = await browser.runtime.sendMessage("getPopupContent");

    if (!subgifts)
    {
        console.error("Empty subgifts")
        return;
    }

    listContainer = document.getElementById("subgifts");
    listContainer.innerHTML = ""
    subgifts.forEach(subgift => {
        createSubgiftElementIfNotExist(subgift)
    })
}

function createSubgiftElementIfNotExist(subgift)
{
    listContainer = document.getElementById("subgifts");

    if (document.getElementById(subgift.notificationId)) return;

    subgiftItem = document.createElement("li");
    subgiftItem.id = subgift.notificationId
    listContainer.appendChild(subgiftItem);
    container = document.createElement("div");
    subgiftItem.appendChild(container);
    link = document.createElement("a")
    link.setAttribute("href", subgift.url)
    let description = document.createTextNode(subgift.description)

    if (subgift.hasBroadcast)
    {
        link.appendChild(description)
        container.appendChild(link)
    }
    else
    {
        container.appendChild(description)
    }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("RECEIVED EVENT ON PAGE ACTION");
    if (message.type === "REQUEST_FULFILLED") {
        const data = message.payload;

        data.body.forEach(subgift => {
            createSubgiftElementIfNotExist(subgift)
        })
    }
});

window.addEventListener("load", async (_) =>{
    refreshSubgifts()
})

console.log("Registered listener")

