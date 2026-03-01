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

    if (document.getElementById(subgift.id)) return;
    
    subgiftItem = document.createElement("li");
    subgiftItem.id = subgift.id
    listContainer.appendChild(subgiftItem);
    container = document.createElement("div");
    subgiftItem.appendChild(container);
    link = document.createElement("a")
    container.appendChild(link)
    link.setAttribute("href", subgift.url)
    link.appendChild(document.createTextNode(subgift.description))
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

