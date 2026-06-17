import { getProxyUrl } from './settings.js';

let abortController = null;

export function fetchDriveFile(id, callbacks) {
    const { onSuccess, onError } = callbacks;
    
    // Cancel previous request if exists
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const url = `https://drive.google.com/uc?export=download&id=${id}`;
    const proxyUrl = getProxyUrl(url);

    fetch(proxyUrl, {
            signal: abortController.signal
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .then(text => {
            if (text.trim().startsWith('<')) {
                throw new Error("Private File / HTML content");
            }
            if (onSuccess) onSuccess(text);
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            if (onError) onError(err);
        });
}

export function fetchProxyBlob(url) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    
    const proxyUrl = getProxyUrl(url);
    
    return fetch(proxyUrl, { signal: abortController.signal })
        .then(res => {
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        });
}

export function fetchProxyContent(url, onSuccess, onError) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    
    const proxyUrl = getProxyUrl(url);
    
    return fetch(proxyUrl, { signal: abortController.signal })
        .then(res => {
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        });
}

export function parseDriveLink(input) {
    if (!input) return null;
    const urlStrings = input.split(', ').map(url => url.trim());
    let targetUrl = input;

    if (urlStrings.length > 0) {
        const aiStudioUrl = urlStrings.find(u => u.includes('aistudio.google.com'));
        targetUrl = aiStudioUrl || urlStrings[0];
    }

    let id = null;
    if (/^[a-zA-Z0-9_-]+$/.test(targetUrl) && targetUrl.length > 20) {
        id = targetUrl;
    } else if (targetUrl.includes('state=')) {
        try {
            const url = new URL(targetUrl);
            const stateParam = url.searchParams.get('state');
            if (stateParam) {
                const stateObj = JSON.parse(stateParam);
                if (stateObj.ids && stateObj.ids.length > 0) id = stateObj.ids[0];
            }
        } catch (e) {
            console.error("Error parsing URL state:", e);
        }
    } else if (targetUrl.includes('/prompts/')) {
        const match = targetUrl.match(/\/prompts\/([a-zA-Z0-9_-]+)/);
        if (match) id = match[1];
    } else if (targetUrl.includes('/file/d/')) {
        const match = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) id = match[1];
    } else if (targetUrl.includes('id=')) {
        const match = targetUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) id = match[1];
    }
    
    return id;
}

export function cancelFetch() {
    if (abortController) abortController.abort();
}