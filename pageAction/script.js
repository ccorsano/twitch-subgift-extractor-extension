console.log("Loaded script for popup")

let isInMockMode = typeof browser === "undefined";
const delay = ms => new Promise(res => setTimeout(res, ms));

const mockSubgifts = [
    {
        notificationId: 1,
        description: "**Test** has given you a subscription to **Test**",
        url: "https://twitch.tv",
        hasBroadcast: true,
        thumbnailURL: "https://static-cdn.jtvnw.net/twitch-quests-assets/REWARD/f5cb5327-04fc-4537-ad6a-142b9bfa89fe.png"
    },
    {
        notificationId: 2,
        description: "**Test2** has given you a subscription to **Test1**",
        hasBroadcast: false,
        thumbnailURL: "https://static-cdn.jtvnw.net/dartapi-assets/11095-twitch-box-anim.gif"
    },
    {
        notificationId: 3,
        description: "**Test3** has given you a subscription to **Test2**",
        url: "https://twitch.tv",
        hasBroadcast: true,
        thumbnailURL: "https://static-cdn.jtvnw.net/twitch-quests-assets/REWARD/bdf2a93f-96e5-4544-9972-4b4d8eabddc9.png"
    }
]


async function refreshSubgifts()
{
    clearAndCreateRefreshing();

    if (isInMockMode)
    {
        await delay(500);

        clearRefreshing();
        mockSubgifts.forEach(subgift => {
            createSubgiftElementIfNotExist(subgift)
        })
        return;
    }
    
    const subgifts = await browser.runtime.sendMessage("getPopupContent");

    clearRefreshing();

    if (!subgifts || subgifts.length === 0)
    {
        clearAndCreatePlaceholder();
        return;
    }
    subgifts.forEach(subgift => {
        createSubgiftElementIfNotExist(subgift)
    })
}

function clearSubgifts()
{
    listContainer = document.getElementById("subgifts");
    while (listContainer.firstChild) {
        listContainer.removeChild(listContainer.firstChild);
    }
    return listContainer
}

function clearRefreshing()
{
    clearSubgifts();
}

function clearAndCreateRefreshing()
{
    listContainer = clearSubgifts()
    listItemTemplate = document.querySelector('#subgift-item-refreshing')
    let li = listItemTemplate.content.cloneNode(true).querySelector(".subgift-item");
    listContainer.appendChild(li);
}

function clearAndCreatePlaceholder()
{
    listContainer = clearSubgifts() 
    listItemTemplate = document.querySelector('#subgift-item-empty')
    let li = listItemTemplate.content.cloneNode(true).querySelector(".subgift-item");
    listContainer.appendChild(li);
}

function createSubgiftElementIfNotExist(subgift)
{
    listContainer = document.getElementById("subgifts");

    if (document.getElementById(subgift.notificationId)) return;

    let listItemTemplate = undefined;

    if (subgift.hasBroadcast)
    {
        listItemTemplate = document.querySelector('#subgift-item-withlink')
    }
    else
    {
        listItemTemplate = document.querySelector('#subgift-item-nolink')
    }

    let li = listItemTemplate.content.cloneNode(true).querySelector(".subgift-item");
    let description = li.querySelector(".description");
    description.innerText = subgift.description;
    let link = li.querySelector("a");
    if (link)
    {
        li.addEventListener("click", async (e) => {
            if (isInMockMode)
            {
                document.location = subgift.url;
                return;
            }

            const currentTab = await browser.tabs.getCurrent();
            currentTab.url = subgift.url
        });
        link.setAttribute("href", subgift.url);
    }
    let thumbnail = li.querySelector("img.thumbnail");
    thumbnail.src = subgift.thumbnailURL

    listContainer.appendChild(li);
}

if (! isInMockMode)
{
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("RECEIVED EVENT ON PAGE ACTION");
        if (message.type === "REQUEST_FULFILLED") {
            const data = message.payload;

            data.body.forEach(subgift => {
                createSubgiftElementIfNotExist(subgift)
            })
        }
    });
}

window.addEventListener("load", async (_) =>{
    refreshSubgifts()
});

console.log("Registered listener")

