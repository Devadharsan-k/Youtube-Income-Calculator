const contentCategories = {
    "Gaming"                    : 23,
    "Technology"                : 25,
    "Beauty Fashion"            : 22,
    "Comedy"                    : 17,
    "Vlogging people blogs"     : 25,
    "Education"                 : 25,
    "Food & Cooking"            : 25,
    "Health Fitness"            : 27,
    "Travel"                    : 22,
    "Entertainment"             : 25,
    "Music"                     : 21,
};

let category

document.addEventListener("DOMContentLoaded", () => {
    const urlPattern = /(https:\/\/www\.youtube\.com\/@[^\/]+)(\/[^\/]+)?$/;
    const loader = createLoader();
    const imgElement = createImageElement();
    const totalAmountEarnedH5 = createTotalEarnedElement();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentUrl = tabs[0].url;
        const channelName = tabs[0].title.replace(/-\s*[^-]*$/, "").trim();

        chrome.storage.local.get("uiState", (storage) => {

            const storedChannelName = storage.uiState?.channelName;

            if (storedChannelName === channelName) {
                restoreUIState(totalAmountEarnedH5, imgElement);
            } else {
                chrome.storage.local.remove("uiState");
            }
        });

        if (urlPattern.test(currentUrl)) {
            chrome.runtime.sendMessage({ action: "checkForMonetization" }, async (response) => {
                if (response.status === "notMonetize") {
                    showNotMonetizedMessage();
                } else {
                    await setupMonetizedUI(totalAmountEarnedH5, imgElement, loader);
                }
            });

            chrome.runtime.onMessage.addListener((message) => 
                handleMessage(message, channelName, totalAmountEarnedH5, loader, imgElement)
            );
        }
    });
});

function createLoader() {
    const loader = document.createElement("div");
    loader.classList.add("loader");
    loader.style.display = "none";
    document.body.appendChild(loader);
    return loader;
}

function createToolUsageMessage(){
    const h5 = document.createElement("h4");
    h5.id = "ToolUsageMessage"
    h5.innerHTML = "Select a timeframe to filter by upload date (e.g., 1 Day = last 24 hours)<br>Only Videos are calculated for income";
    h5.style.textAlign = "center"
    h5.style.lineHeight = "20px"
    h5.style.whiteSpace = "nowrap"
    return h5;
}

function createImageElement() {
    const imgElement = document.createElement("img");
    imgElement.style.height = "45px";
    imgElement.style.width = "45px";
    imgElement.style.borderRadius = "50%";
    imgElement.style.display = "none";
    return imgElement;
}

function createTotalEarnedElement() {
    const h5 = document.createElement("h5");
    return h5;
}

function showNotMonetizedMessage() {
    const visitYtMessageImg = document.querySelector(".visit-yt-message-img");
    visitYtMessageImg.remove();
    
    const videoElement = document.createElement("video");
    videoElement.style.height = "350px";
    videoElement.style.width = "450px";
    videoElement.style.objectFit = "inherit";
    videoElement.src = "/assets/not-Monetize.mp4"
    videoElement.autoplay = true; 
    videoElement.loop = true;    
    videoElement.muted = true;   

    const container = document.querySelector(".container");
    if (container) {
        container.appendChild(videoElement);
    }
}

async function setupMonetizedUI(totalAmountEarnedH5, imgElement, loader) {
    const visitYtMessageImg = document.querySelector(".visit-yt-message-img");
    visitYtMessageImg.remove();

    const container = document.querySelector(".container");
    const { selectContainer, unitSelect, valueSelect, buttonElement } = createUIElements();

    if (container) {
        setupContainer(container, selectContainer, valueSelect, unitSelect, buttonElement, imgElement, totalAmountEarnedH5);

        chrome.storage.local.get("uiState", (storage) => {
            const storedUnitSelectValue = storage.uiState?.unitSelectValue;
            const storedValueSelectValue = storage.uiState?.valueSelectValue;

            if (storedUnitSelectValue) {
                unitSelect.value = storedUnitSelectValue;
            }

            if (storedValueSelectValue) {
                valueSelect.value = storedValueSelectValue;
            }
        });

        buttonElement.addEventListener("click", async () => await handleCalculateClick(container, imgElement, loader, totalAmountEarnedH5));
        unitSelect.addEventListener("change", () => updateValueSelect(unitSelect, valueSelect));
        updateValueSelect(unitSelect, valueSelect);
    }
}

function createUIElements() {
    const selectContainer = document.createElement("div");
    selectContainer.className = "select-container";

    const unitSelect = createSelectElement("unitSelect", [
        { value: "days", text: "Day" },
        { value: "months", text: "Month" },
        { value: "years", text: "Year" },
    ]);

    const valueSelect = document.createElement("select");
    valueSelect.id = "valueSelect";

    for (let i = 1; i <= 10; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = `Option ${i}`;
        valueSelect.appendChild(option);
    }

    document.body.appendChild(valueSelect);

    const buttonElement = document.createElement("button");
    buttonElement.classList.add("calculate-cta");
    buttonElement.innerHTML = 'Calculate &nbsp; <img height="75%" width="75%" src="/assets/coin.png">';

    return { selectContainer, unitSelect, valueSelect, buttonElement };
}

function createSelectElement(id, options) {
    const select = document.createElement("select");
    select.id = id;

    options.forEach(({ value, text }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    });
    return select;
}

function setupContainer(container, selectContainer, valueSelect, unitSelect, buttonElement, imgElement, totalAmountEarnedH5) {
    checkStorageAndAppendMessage(container).then(() => {
        selectContainer.appendChild(valueSelect);
        selectContainer.appendChild(unitSelect);
        container.appendChild(selectContainer);
    
        const parentDiv = document.createElement("div");
        parentDiv.style.display = "flex";
        parentDiv.style.flexDirection = "column";
        parentDiv.style.alignItems = "center";
        parentDiv.style.gap = "15px";
        parentDiv.appendChild(imgElement);
        parentDiv.appendChild(totalAmountEarnedH5);
        container.appendChild(parentDiv);
        container.appendChild(buttonElement);
    })

    function checkStorageAndAppendMessage(container) {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                if (Object.keys(items).length === 0) {
                    container.appendChild(createToolUsageMessage());
                }
                resolve();
            });
        });
    }
}

async function fetchChannelInfo(imgElement) {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, async(tabs) => {
            await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    let currentUrl = window.location.href;
                    let regex = /(https:\/\/www\.youtube\.com\/@[^\/]+)/;
                    let match = currentUrl.match(regex);
    
                    if (match) {
                        let baseUrl = match[1];  
                        let modifiedUrl = baseUrl + '/videos';                      
                        window.history.pushState({}, '', modifiedUrl);
                        window.location.reload();
                    }
                },
            });
            await new Promise((resolve) => {
                chrome.webNavigation.onCompleted.addListener(function listener(details) {
                    if (details.tabId === tabs[0].id) {
                        chrome.webNavigation.onCompleted.removeListener(listener);
                        resolve();
                    }
                });
            });
            const tabId = tabs[0].id;

            chrome.runtime.sendMessage({ action: "fetchCategory", tabId }, async (response) => {                    
                imgElement.src = response.channelImage;
                category = response.category
                resolve();
            });
        });
    });
}

async function handleCalculateClick(container, imgElement, loader, totalAmountEarnedH5) {
    container.style.display = "none";
    totalAmountEarnedH5.style.display = "none";
    loader.style.display = "block";
    const toolMessage = document.getElementById("ToolUsageMessage");
    if (toolMessage) {
        toolMessage.remove();
    }

    const unitSelectValue = document.getElementById("unitSelect").value;
    const valueSelectValue = document.getElementById("valueSelect").value;

    await fetchChannelInfo(imgElement);
    chrome.runtime.sendMessage({ action: "calculateIncome", unit: unitSelectValue, value: valueSelectValue });
}

function handleMessage(message, channelName, totalAmountEarnedH5, loader, imgElement) {    
    if (message.action === "VideosFetched") {
        handleVideosFetched(message, channelName, totalAmountEarnedH5, loader, imgElement);
    }
}

function handleVideosFetched(message, channelName, totalAmountEarnedH5, loader, imgElement) {
    
    const container = document.querySelector(".container")
    const SelectContainer = document.querySelector(".select-container");
    const button = document.querySelector(".calculate-cta");

    loader.style.display = "none";

    if (!message.video.length) {
        totalAmountEarnedH5.innerHTML = `<mark style="background-color: #ff686b; padding: 2px 10px; border-radius: 5px; font-weight: bold;">No videos found in this time period ☹️</mark>`;
        totalAmountEarnedH5.style.display = "block";
        totalAmountEarnedH5.style.margin = "3px";
    } else {
        const totalViewCount = message.video.reduce((total, video) => total + parseInt(video.views), 0);
        const earningPerK = totalViewCount / 1000; 
        const findCategory = (category) => {
            const decodedCategory = decodeURIComponent(category).toLowerCase();
            const categoryWords = decodedCategory.split(/\s+/); 
            for (const key in contentCategories) {
                const keyWords = key.toLowerCase().split(/\s+/);
                if (categoryWords.some(word => keyWords.includes(word))) {
                    return key;
                }
            }
            return "Entertainment";
        };   
        const categoryRate = contentCategories[findCategory(category)] || 20;
        const amountEarned = (categoryRate * earningPerK).toFixed(2);

        totalAmountEarnedH5.innerHTML = `<mark style="background-color: #FFD700; padding: 2px 10px; border-radius: 5px; font-weight: bold;">${channelName}</mark> earned <mark style="background-color: #FFD700; padding: 2px 10px; border-radius: 5px; font-weight: bold;"><img height="11px" width="13px" src="/assets/ruppe.png"/>${amountEarned}</mark> from ${message.video.length} ${message.video.length === 1 ? "video" : "videos"}.`;
        totalAmountEarnedH5.style.display = "block";
        imgElement.style.display = "block";

        const unitSelectValue   = document.getElementById("unitSelect").value;
        const valueSelectValue  = document.getElementById("valueSelect").value;


        if (message.video.length > 0) {  
            chrome.storage.local.set({
                uiState: {
                    totalAmountEarnedText: totalAmountEarnedH5.innerHTML,
                    videoLength: message.video.length,
                    amountEarned,
                    channelName,
                    imgSrc: imgElement.src,
                    unitSelectValue,
                    valueSelectValue
                },
            });
        }
    }

    container.style.display = "flex";
    SelectContainer.style.display = "flex";
    button.style.display = "flex";

    totalAmountEarnedH5.style.whiteSpace = "break-spaces";
    totalAmountEarnedH5.style.lineHeight = "25px";
}

function updateValueSelect(unitSelect, valueSelect) {
    const ranges = { days: 7, months: 11, years: new Date().getFullYear() - 2005 };
    const selectedUnit = unitSelect.value;
    const max = ranges[selectedUnit] || 1;

    const currentValue = valueSelect.value;

    valueSelect.innerHTML = "";

    for (let i = 1; i <= max; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        valueSelect.appendChild(option);
    }

    function updateUnitSelect(unitSelect, valueSelect) {
    const unit = unitSelect.value;
    const value = valueSelect.value;
    
    const unitText = value === "1" ? unit.slice(0, -1) : unit; 
    Array.from(unitSelect.options).forEach((option) => {
        option.textContent = option.value === unit ? capitalizeFirstLetter(unitText) : capitalizeFirstLetter(option.value);
    });
}

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    document.getElementById("unitSelect").addEventListener("change", () => {
        updateValueSelect(unitSelect, valueSelect);
        updateUnitSelect(unitSelect, valueSelect);
    });

    document.getElementById("valueSelect").addEventListener("change", () => {
        updateUnitSelect(unitSelect, valueSelect); 
    });


    if (currentValue && currentValue <= max) {
        valueSelect.value = currentValue;
    }
}

function restoreUIState(totalAmountEarnedH5, imgElement) {
    chrome.storage.local.get("uiState", (result) => {
        
        if (result.uiState) {
            const { totalAmountEarnedText, imgSrc } = result.uiState;

            totalAmountEarnedH5.innerHTML = totalAmountEarnedText;
            totalAmountEarnedH5.style.display = "block";
            totalAmountEarnedH5.style.whiteSpace = "break-spaces";
            totalAmountEarnedH5.style.lineHeight = "25px";

            imgElement.src = imgSrc;
            imgElement.style.display = "block";

            const container = document.querySelector(".container");
            if (container) {
                container.style.display = "flex";
            }

            const selectContainer = document.querySelector(".select-container");
            if (selectContainer) {
                selectContainer.style.display = "flex";
            }

            const button = document.querySelector(".calculate-cta");
            if (button) {
                button.style.display = "flex";
            }
        }
    });
}
