chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
    switch (message.action) {
        case "checkForMonetization":
            handleCheckForMonetization(sendResponse);
            break;
        case "fetchCategory":
            handleFetchCategory(message.tabId, sendResponse);
            break;
        case "calculateIncome":
            handleCalculateIncome(message.unit, message.value);
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
});

async function handleCheckForMonetization(sendResponse) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: checkForMonetization,
        });
        sendResponse({ status: result[0]?.result });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

function checkForMonetization() {
    const divElement = document.querySelector('.page-header-view-model-wiz__page-header-content-metadata.yt-content-metadata-view-model-wiz.yt-content-metadata-view-model-wiz--inline');
    if (divElement) {
        const subscriberElement = Array.from(divElement.querySelectorAll('span')).find(span => span.innerText.includes('subscribers'));
        if (subscriberElement && !subscriberElement.innerText.includes("K") && !subscriberElement.innerText.includes("M")) {
            return "notMonetize";
        }
    }
    return "monetize";
}

async function handleFetchCategory(tabId, sendResponse) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: fetchCategory,
        });
        
        sendResponse(result[0].result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

function fetchCategory() {
    return new Promise((resolve) => {
        const waitForVideos = setInterval(() => {
            const firstVideo = document.querySelector('a#thumbnail[href^="/watch"]');
            if (firstVideo) {
                clearInterval(waitForVideos);
                const videoURL = new URL(firstVideo.href, window.location.origin).href;
                fetch(videoURL).then((response) => response.text()).then((pageSource) => {
                    
                    const categoryMatch = pageSource.match(/"category":\s*"([^"]*)"/);                    
                    const channelImage = document.querySelector(".yt-core-image.yt-spec-avatar-shape__image").src;

                    if (categoryMatch && channelImage) {
                        resolve({ success: true, category: categoryMatch[1], channelImage });
                    } else {
                        resolve({ success: false });
                    }
                }).catch((error) => resolve({ success: false, error: error.message }));
            }
        }, 500);
    });
}

async function handleCalculateIncome(unit, value) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: calculateIncome,
            args: [{ unit, value }],
        });

        chrome.runtime.sendMessage({ action: "VideosFetched", video: result[0].result });
    } catch (error) {
        console.error("Error in calculateIncome:", error);
    }
}

function calculateIncome({ unit, value }) {
    return new Promise((resolve, reject) => {
        try {
            const allVideos = [];
            let stopScrolling = false
            const timeLineLimit = unit; // Years, Months, Days
            const numbersByUser = value; // 1, 2, 3

            const isRecentVideo = (publicationText) => { 
                               
                const regex = /(\d+)\s(minute|minutes|hour|hours|day|days|weeks|months|month|year|years)?\sago/                
                const match = publicationText.match(regex);
                if (match) {
                    
                    const value = parseInt(match[1]);       // 1, 2, 3
                    const unit = match[2];                  // Years, Months, Days
                    
                    if(unit === "hour" || unit === "minute" || unit === "hours" || unit === "minutes") {
                        return true
                    } else if((timeLineLimit === "day" || timeLineLimit === "days") && (unit === "day" || unit === "days") && numbersByUser > value) {
                        return true
                    } else if((timeLineLimit === "month" || timeLineLimit === "months") && (unit === "month" || unit === "months") && numbersByUser > value) {                                                
                        return true
                    } else if((timeLineLimit === "month" || timeLineLimit === "months")) {
                        if(unit === "day" || unit === "days") return true
                        if(unit === "weeks") return true
                    } else if((timeLineLimit === "year" || timeLineLimit === "years") && (unit === "year" || unit === "years") && numbersByUser > value) {
                        return true
                    }else if(timeLineLimit === "year" || timeLineLimit === "years") {
                        if(unit === "day" || unit === "days") return true
                        if(unit === "weeks") return true
                        if(unit === "month" || unit === "months") return true
                    } 
                }
                return false;
            };

            const parseViews = (viewsText) => {
                const regex = /([\d.]+)([KM]?) views/;
                const match = viewsText.match(regex);
                if (match) {
                    const value = parseFloat(match[1]);
                    const unit = match[2];
                    if (unit === 'K') return Math.round(value * 1000);
                    if (unit === 'M') return Math.round(value * 1000000);
                    return Math.round(value);
                }
                return 0;
            };

            const observeContents = () => {
                const observer = new MutationObserver(() => {
                    const contentsDiv = document.querySelector('#contents');
                    if (contentsDiv) {
                        const videoItems = contentsDiv.querySelectorAll('ytd-rich-item-renderer');                        
                        if (videoItems.length > 0) {                            
                            const videoDetails = [];
                            videoItems.forEach((video) => {
                                const titleElement = video.querySelector('#video-title');
                                const viewsElement = video.querySelector('#metadata-line span');
                                const publishDate = video.querySelector('span.inline-metadata-item.style-scope.ytd-video-meta-block');
                                const daysAgoElement = publishDate ? publishDate.nextElementSibling : null;
                                const publication = daysAgoElement ? daysAgoElement.innerText : '';

                                if (titleElement && viewsElement && isRecentVideo(publication)) {
                                    const title = titleElement.textContent.trim();
                                    const views = parseViews(viewsElement.textContent.trim());
                                    videoDetails.push({ title, views, publication });
                                } else {
                                    stopScrolling = true
                                    observer.disconnect()
                                }
                            });

                            videoDetails.forEach((videoDetail) => {
                                const existingVideo = allVideos.find((video) => video.title === videoDetail.title);
                                if (!existingVideo) {
                                    allVideos.push(videoDetail);
                                }
                            });
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            };

            const scrollUntilNewData = () => {
                let lastScrollHeight = document.documentElement.scrollHeight;
                const checkScroll = () => {
                    window.scrollTo(0, lastScrollHeight);
                    setTimeout(() => {
                        const newScrollHeight = document.documentElement.scrollHeight;
                        if (newScrollHeight > lastScrollHeight && !stopScrolling) {
                            lastScrollHeight = newScrollHeight;
                            checkScroll(); 
                        } else {    
                            resolve(allVideos);
                        }
                    }, 1000); 
                };
                checkScroll();
            };
            observeContents();
            scrollUntilNewData();
        } catch (error) {
            reject(error);
        }
    });
}
