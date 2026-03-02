import { initPreferences, prefs, setTheme } from './settings.js';
import { initDB, saveFileToHistory, loadLastFileFromDB, clearRecentsInDB, togglePinInDB, fetchHistory, updateFileNameInDB, findFileByName, getFileById, getUniqueName, deleteFileFromDB, bulkDeleteFromDB, bulkPinInDB } from './db.js';
import { fetchDriveFile, parseDriveLink, cancelFetch, fetchProxyBlob } from './drive.js';
import { parseConversation, generateMetadataHTML, getCleanJSON, extractMedia } from './parser.js';
import * as UI from './ui.js';
import { updateUrl, showToast, truncate } from './utils.js';

// Application State
const state = {
    parsedData: null,
    currentPrompts: [],
    currentFileName: "Untitled",
    currentFileId: null,
    currentFileRecordId: null,
    rawContent: null,
    isScrollMode: false,
    focusIndex: 0,
    isDeepSearch: false,
    extractedMedia: [],
    pendingInputs: []
};


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initPreferences();
    initDB(() => {
        loadHistory();
        handleInitialLoad();
    });
    UI.initAllUI();
    setupEventListeners();
    setupThemeLogic();
    UI.setupRenamingUI(handleRename, attemptScrapeName);
    UI.setNavigationContext(state, {
        onPromptClick: renderChat,
        onRename: handleRename,
        onScrapeName: attemptScrapeName,
        onExportTurn: (index) => handleExportTurn(index)
    });
});

function handleInitialLoad() {
    const urlParams = new URLSearchParams(window.location.search);

    // Support all variants including new ones
    let fileId = urlParams.get('view') || urlParams.get('id') || urlParams.get('chat');
    fileId ??= urlParams.get('remote') || urlParams.get('remoteId');
    let localId = urlParams.get('local') || urlParams.get('localId') || urlParams.get('h');
    const turn = urlParams.get('turn');
    const scrollTo = urlParams.get('scrollTo');

    // Path routing check (expanded)
    const pathSegments = window.location.pathname.split('/').filter(seg => seg && seg !== 'index.html');
    if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        // If it's numeric, treat as localId, else as fileId
        if (/^\d+$/.test(lastSegment)) {
            if (!localId) localId = lastSegment;
        } else if (lastSegment.length > 20) {
            if (!fileId) fileId = lastSegment;
        }
    }

    // Hash routing check
    if (!fileId && !localId && window.location.hash) {
        let hashVal = window.location.hash.substring(1);
        if (hashVal.startsWith('/')) hashVal = hashVal.substring(1);
        if (/^\d+$/.test(hashVal)) {
            localId = hashVal;
        } else if (/^[a-zA-Z0-9_-]+$/.test(hashVal) && hashVal.length > 20) {
            fileId = hashVal;
        }
    }

    const targetIndex = (turn !== null) ? parseInt(turn) : (scrollTo !== null ? parseInt(scrollTo) : null);
    if (scrollTo !== null) prefs.isScrollMode = true;
    else if (turn !== null) prefs.isScrollMode = false;

    if (localId) {
        getFileById(Number(localId), (record) => {
            if (record) {
                loadFileFromRecord(record, targetIndex);
            }
        });
        return;
    }

    if (fileId) {
        // Double check if fileId is actually a local numeric ID
        if (/^\d+$/.test(fileId)) {
            getFileById(Number(fileId), (record) => {
                if (record) {
                    loadFileFromRecord(record, targetIndex);
                } else {
                    tryLoadFromDrive(fileId, targetIndex);
                }
            });
        } else {
            tryLoadFromDrive(fileId, targetIndex);
        }
    } else if (prefs.openLastFileOnStartup) {
        loadLastFileFromDB((fileRecord) => {
            if (fileRecord) {
                loadFileFromRecord(fileRecord, targetIndex);
            }
        });
    }
}

function tryLoadFromDrive(id, onLoaded) {
    if (prefs.autoRestoreContent) {
        loadFromDrive(id, onLoaded);
    } else {
        UI.showConfirmModal(
            `Do you want to load this file (${truncate(id, 15)})?`,
            () => loadFromDrive(id, onLoaded),
            () => updateUrl(null)
        );
    }
}

// --- Data Loading & Processing ---

function handleFile(file) {
    UI.showLoading();
    const reader = new FileReader();
    reader.onload = (e) => handleText(e.target.result, file.name, null);
    reader.readAsText(file);
}

function handleText(text, name, driveId = null, startIndex = null) {
    try {
        const result = parseConversation(text);
        state.parsedData = result.data;
        state.currentPrompts = result.prompts;
        state.pendingInputs = result.pendingInputs;
        state.currentFileName = name;
        state.currentFileId = driveId;
        state.rawContent = text;
        
        saveFileToHistory({
            name,
            data: result.data,
            raw: text,
            driveId: driveId
        }, (id, finalName) => {
            state.currentFileRecordId = id;
            state.currentFileName = finalName;
            loadHistory();
            processAndRender(startIndex);
        });
        UI.hideLoading();
    } catch (e) {
        console.error(e);
        UI.hideLoading();
        UI.showError("Invalid Content", "The content is not valid JSON.");
    }
}

function loadFileFromRecord(record, startIndex = null) {
    UI.showLoading();
    state.currentFileName = record.name;
    state.currentFileId = record.driveId || null;
    state.currentFileRecordId = record.id;
    state.parsedData = record.data;
    state.rawContent = record.raw || JSON.stringify(record.data, null, 2);
    
    // Re-parse to get prompts structure if not saved
    const result = parseConversation(state.rawContent);
    state.currentPrompts = result.prompts;
    state.pendingInputs = result.pendingInputs;
    
    processAndRender(startIndex);
    loadHistory();
    UI.hideLoading();
}

function loadFromDrive(id, startIndex = null, isSilent = false, fallbackText = null) {
    if (!isSilent) UI.showLoading();

    fetchDriveFile(id, {
        onSuccess: (text) => {
            if (isSilent) UI.showLoading(); // Show it now that we know it's valid
            updateUrl(id);
            state.currentFileId = id;
            handleText(text, `Drive File (${id})`, id, startIndex);
        },
        onError: (err) => {
            if (isSilent) {
                // If it was a silent attempt and we have fallback text, treat as regular text
                if (fallbackText) {
                    updateUrl(null);
                    handleText(fallbackText, "Pasted content", null);
                }
                return;
            }

            UI.hideLoading();
            if (err.message === "Private File / HTML content") {
                UI.showError("Access Denied", "This file appears to be private.", true, () => loadFromDrive(id, startIndex), id);
            } else {
                UI.showError("Network Error", "Failed to fetch file. CodeTabs proxy might be down or blocked.", false, () => loadFromDrive(id, startIndex), id);
            }
        }
    });
}

async function processAndRender(startIndex = null) {
    UI.updateRenamingUI(state.currentFileName, state.currentFileId);
    document.title = `${state.currentFileName} | Inspector`;
    
    // Metadata
    const meta = generateMetadataHTML(state.parsedData);
    UI.renderMetadata(meta);
    
    // Extract Media
    state.extractedMedia = extractMedia(state.parsedData);
    UI.showMediaButton(state.extractedMedia.length > 0);
    
    // Sidebar
    const record = await getFileById(state.currentFileRecordId);
    UI.populateSidebar(state.currentPrompts, {
        onPromptClick: (index) => handlePromptClick(index),
        onRenamePrompt: (index, newName) => handlePromptRename(index, newName),
        onRevertPrompt: (index) => handlePromptRevert(index),
        onExportTurn: (index) => handleExportTurn(index)
    }, record);
    
    // Show main UI elements
    document.getElementById('downloadGroup').classList.remove('hidden');
    document.getElementById('exportGroup').classList.remove('hidden');
    document.getElementById('export-widget').classList.remove('hidden');
    document.getElementById('nav-widget').classList.remove('hidden');

    // Render specified turn or default to 0
    if (startIndex !== null) {
        handlePromptClick(startIndex);
    } else if (state.currentPrompts.length > 0) {
        renderChat(0);
    } else {
        UI.renderFullConversation(state.parsedData, []);
    }
}

function handlePromptClick(index) {
    if (prefs.isScrollMode) {
        // Scroll logic handled by UI helper or implementation details
        const target = document.getElementById(`msg-user-${index}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            UI.setActiveSidebarItem(index);
            updateUrl(state.currentFileId, state.currentFileRecordId, null, index);
        } else {
            // If in scroll mode but not rendered (e.g. switch just happened), render full
            renderCompleteDialog();
            setTimeout(() => {
                 const targetAfterRender = document.getElementById(`msg-user-${index}`);
                 if (targetAfterRender) {
                     targetAfterRender.scrollIntoView({ behavior: 'smooth', block: 'start' });
                     UI.setActiveSidebarItem(index);
                 }
            }, 100);
        }
    } else {
        renderChat(index);
    }
    if (window.innerWidth <= 768) UI.toggleSidebar();
}

function renderChat(index) {
    state.focusIndex = index;
    UI.renderConversation(state.parsedData, index, state.currentPrompts, state.pendingInputs);
    if (prefs.isScrollMode) {
        updateUrl(state.currentFileId, state.currentFileRecordId, null, index);
    } else {
        updateUrl(state.currentFileId, state.currentFileRecordId, index);
    }
}

function renderCompleteDialog() {
    UI.renderFullConversation(state.parsedData, state.currentPrompts, state.pendingInputs);
}

// --- Sidebar & History ---

function loadHistory() {
    fetchHistory((recent, pinned) => {
        UI.renderHistoryLists(recent, pinned, {
            onLoad: (file) => {
                updateUrl(null);
                loadFileFromRecord(file);
            },
            onTogglePin: (file) => {
                togglePinInDB(file, () => loadHistory());
            },
            onDelete: (id) => {
                handleDeleteHistory(id);
            },
            onRename: (id, newName) => {
                handleRename(newName, id);
            },
            onBulkDelete: (ids) => {
                handleBulkDeleteHistory(ids);
            },
            onBulkPin: (ids, pinnedStatus) => {
                handleBulkPinHistory(ids, pinnedStatus);
            }
        }, state.currentFileRecordId);
    });
}

async function handleDeleteHistory(id) {
    await deleteFileFromDB(id);
    if (id === state.currentFileRecordId) {
        resetAppState();
    }
    loadHistory();
    showToast("Item deleted");
}

async function handleBulkDeleteHistory(ids) {
    await bulkDeleteFromDB(ids);
    if (ids.includes(state.currentFileRecordId)) {
        resetAppState();
    }
    loadHistory();
    showToast(`${ids.length} items deleted`);
}

async function handleBulkPinHistory(ids, pinnedStatus) {
    await bulkPinInDB(ids, pinnedStatus);
    loadHistory();
    showToast(`${ids.length} items ${pinnedStatus ? 'pinned' : 'unpinned'}`);
}

function resetAppState() {
    state.parsedData = null;
    state.currentPrompts = [];
    state.currentFileName = "Untitled";
    state.currentFileId = null;
    state.currentFileRecordId = null;
    state.rawContent = null;
    state.extractedMedia = [];
    state.pendingInputs = [];

    updateUrl(null);
    document.title = "Inspector - Google AI Studio Viewer";

    UI.updateRenamingUI("No file loaded", null);
    const chatStream = document.getElementById('chat-stream');
    chatStream.innerHTML = `
        <div class="empty-state-hero">
            <div class="hero-icon">
                <i class="ph ph-file-text"></i>
            </div>
            <h2>Ready to Inspect</h2>
            <p>Drag & Drop a file, use the link loader, or import a JSON from Google AI Studio.</p>
        </div>
    `;
    chatStream.removeAttribute('data-view');

    document.getElementById('prompt-list').innerHTML = '<div class="empty-state-sidebar"><span>Load a file to view conversation</span></div>';
    document.getElementById('metadata-panel').classList.add('hidden');
    document.getElementById('downloadGroup').classList.add('hidden');
    document.getElementById('exportGroup').classList.add('hidden');
    document.getElementById('export-widget').classList.add('hidden');
    document.getElementById('nav-widget').classList.add('hidden');
    UI.showMediaButton(false);
}

async function attemptScrapeName() {
    if (!state.currentFileId) return;
    UI.showLoading();
    const url = `https://aistudio.google.com/app/prompts/${state.currentFileId}`;
    try {
        const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const h1 = doc.querySelector('.toolbar-container h1') || doc.querySelector('h1');
        let scrapedName = h1 ? h1.textContent.trim() : null;

        if (!scrapedName) {
            const metaTitle = doc.querySelector('meta[property="og:title"]') || doc.querySelector('meta[name="twitter:title"]');
            if (metaTitle) scrapedName = metaTitle.getAttribute('content');
        }

        if (!scrapedName && doc.title) {
            scrapedName = doc.title.replace(' - Google Drive', '').replace(' - Google AI Studio', '').trim();
        }

        if (scrapedName) {
            if (scrapedName !== state.currentFileName) {
                // Populate the input for user review instead of direct save
                const input = document.getElementById('filename-input');
                const display = document.getElementById('filename-display');
                if (input && display) {
                    display.classList.add('hidden');
                    input.classList.remove('hidden');
                    input.value = scrapedName;
                    input.focus();
                    input.select();
                    showToast('Name scraped. Press Enter to confirm.');
                }
            } else {
                showToast('Name is already up to date');
            }
        } else {
            showToast('Could not find name in page', 'error');
        }
    } catch (e) {
        console.error("Scrape failed", e);
        showToast("Failed to scrape name", "error");
    } finally {
        UI.hideLoading();
    }
}

async function handleRename(newName, targetId = state.currentFileRecordId) {
    if (!targetId) return Promise.resolve();

    const existingFile = await findFileByName(newName);
    if (existingFile && existingFile.id !== targetId) {
        // Conflict
        return new Promise(async (resolve) => {
            let currentNameOfTarget = "";
            if (targetId === state.currentFileRecordId) {
                currentNameOfTarget = state.currentFileName;
            } else {
                const f = await getFileById(targetId);
                currentNameOfTarget = f ? f.name : "Unknown";
            }

            UI.showConflictResolver(newName, existingFile, currentNameOfTarget,
                async () => {
                    // Rename Anyways
                    const uniqueName = await getUniqueName(newName);
                    await finalizeRename(targetId, uniqueName);
                    resolve();
                },
                async (otherNewName, currentNewName) => {
                    // Resolve Both
                    if (otherNewName === currentNewName) {
                        // Scenario: both set to same name
                        await handleRename(otherNewName, existingFile.id);
                        const uniqueForCurrent = await getUniqueName(currentNewName);
                        await handleRename(uniqueForCurrent, targetId);
                    } else {
                        await handleRename(otherNewName, existingFile.id);
                        await handleRename(currentNewName, targetId);
                    }
                    resolve();
                },
                () => resolve() // On Cancel
            );
        });
    } else {
        return finalizeRename(targetId, newName);
    }
}

async function finalizeRename(id, newName) {
    await updateFileNameInDB(id, newName);
    if (id === state.currentFileRecordId) {
        state.currentFileName = newName;
        processAndRender();
    }
    loadHistory();
}

async function handlePromptRename(index, newName) {
    if (!state.currentFileRecordId) return;
    await import('./db.js').then(db => db.updatePromptNameInDB(state.currentFileRecordId, index, newName));
    processAndRender();
    showToast("Prompt group renamed");
}

async function handlePromptRevert(index) {
    if (!state.currentFileRecordId) return;
    await import('./db.js').then(db => db.revertPromptNameInDB(state.currentFileRecordId, index));
    processAndRender();
    showToast("Name reverted");
}

function getChunksForTurn(index) {
    if (!state.parsedData || !state.currentPrompts[index]) return [];
    const userPrompt = state.currentPrompts[index];
    const allChunks = state.parsedData.chunkedPrompt.chunks;
    let turnChunks = [];
    let i = userPrompt.originalIndex;

    while (i < allChunks.length && allChunks[i].role === 'user') {
        turnChunks.push(allChunks[i]);
        i++;
    }

    for (; i < allChunks.length; i++) {
        const chunk = allChunks[i];
        if (chunk.role === 'model') {
            turnChunks.push(chunk);
        } else if (chunk.role === 'user') break;
    }
    return turnChunks;
}

async function handleExportTurn(index) {
    const turnChunks = getChunksForTurn(index);
    const filename = `${state.currentFileName}_Turn_${index + 1}`;

    const container = document.createElement('div');
    container.className = 'export-options-container';
    container.innerHTML = `
        <div class="export-grid-options">
            <button class="btn btn-secondary" data-format="html"><i class="ph ph-code"></i> HTML</button>
            <button class="btn btn-secondary" data-format="image"><i class="ph ph-image"></i> Image</button>

            <div class="export-opt-group">
                <span class="opt-label">Markdown</span>
                <div class="btn-group-row">
                    <button class="btn btn-secondary" data-format="copy-markdown"><i class="ph ph-copy"></i> Copy</button>
                    <button class="btn btn-secondary" data-format="markdown"><i class="ph ph-download-simple"></i> Download</button>
                </div>
            </div>

            <div class="export-opt-group">
                <span class="opt-label">Plain Text</span>
                <div class="btn-group-row">
                    <button class="btn btn-secondary" data-format="copy-txt"><i class="ph ph-copy"></i> Copy</button>
                    <button class="btn btn-secondary" data-format="txt"><i class="ph ph-download-simple"></i> Download</button>
                </div>
            </div>
        </div>
    `;

    const { exportToMarkdown, exportToTxt, exportToHtml, exportToImage, copyToClipboardAsMarkdown, copyToClipboardAsText, copyToClipboardAsHtml } = await import('./export.js');

    container.querySelectorAll('button').forEach(btn => {
        btn.onclick = async () => {
            const format = btn.dataset.format;
            document.getElementById('generic-modal').classList.add('hidden');

            if (format === 'markdown') {
                exportToMarkdown(turnChunks, filename);
            } else if (format === 'copy-markdown') {
                copyToClipboardAsMarkdown(turnChunks);
            } else if (format === 'txt') {
                exportToTxt(turnChunks, filename);
            } else if (format === 'copy-txt') {
                copyToClipboardAsText(turnChunks);
            } else if (format === 'html' || format === 'copy-html') {
                const chatStream = document.getElementById('chat-stream');
                const isCopy = format === 'copy-html';
                const action = isCopy ? () => copyToClipboardAsHtml(chatStream, `Turn ${index + 1} Export`) : () => exportToHtml(chatStream, `Turn ${index + 1} Export`, filename);

                if (!prefs.isScrollMode && state.focusIndex === index) {
                    action();
                } else {
                    const oldHtml = chatStream.innerHTML;
                    UI.renderConversation(state.parsedData, index, state.currentPrompts);
                    action();
                    chatStream.innerHTML = oldHtml;
                }
            } else if (format === 'image') {
                const chatStream = document.getElementById('chat-stream');
                if (!prefs.isScrollMode && state.focusIndex === index) {
                    exportToImage(chatStream, filename);
                } else {
                    const oldHtml = chatStream.innerHTML;
                    UI.renderConversation(state.parsedData, index, state.currentPrompts);
                    await exportToImage(chatStream, filename);
                    chatStream.innerHTML = oldHtml;
                }
            }
        };
    });

    UI.showModal({
        title: 'Export Turn',
        message: 'Choose a format to export this turn:',
        headerColor: 'var(--accent-surface)',
        iconClass: 'ph ph-download-simple',
        extraContent: container,
        dismissBtn: { text: 'Cancel' }
    });
}

function performSearch(term) {
    term = term.toLowerCase();
    if (!term) {
        document.querySelectorAll('.prompt-item').forEach(item => item.style.display = 'block');
        return;
    }

    let matchingIndices;
    if (state.isDeepSearch) {
        matchingIndices = new Set();
        if (!state.parsedData || !state.currentPrompts) return;
        state.currentPrompts.forEach((prompt, promptIndex) => {
            let found = false;
            if (prompt.text && prompt.text.toLowerCase().includes(term)) {
                matchingIndices.add(promptIndex);
                found = true;
            }
            if (!found) {
                for (let i = prompt.originalIndex + 1; i < state.parsedData.chunkedPrompt.chunks.length; i++) {
                    const chunk = state.parsedData.chunkedPrompt.chunks[i];
                    if (chunk.role === 'user') break;
                    if (chunk.role === 'model' && chunk.text && chunk.text.toLowerCase().includes(term)) {
                        matchingIndices.add(promptIndex);
                        break;
                    }
                }
            }
        });
    }

    document.querySelectorAll('.prompt-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        const isVisible = state.isDeepSearch ? matchingIndices.has(index) : item.title.toLowerCase().includes(term);
        item.style.display = isVisible ? 'block' : 'none';
    });
}

// --- Event Listeners Setup ---

function setupEventListeners() {
    // File Inputs
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => {
        if(e.target.files[0]) {
            updateUrl(null);
            handleFile(e.target.files[0]);
        }
    });

    // Drag & Drop
    const isDropInLoadArea = (e) => {
        const loadGroup = document.getElementById('loadGroup');
        const linkPopover = document.getElementById('link-popover');
        return (loadGroup && loadGroup.contains(e.target)) || (linkPopover && linkPopover.contains(e.target));
    };

    window.addEventListener('dragover', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (isInput) {
            document.body.style.opacity = '1';
            return;
        }

        const isFileLoaded = !!state.parsedData;
        const inLoadArea = isDropInLoadArea(e);
        const loadGroup = document.getElementById('loadGroup');

        if (!isFileLoaded || inLoadArea) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            document.body.style.opacity = '0.5';
            if (inLoadArea && loadGroup) loadGroup.classList.add('drag-active');
            else if (loadGroup) loadGroup.classList.remove('drag-active');
        } else {
            document.body.style.opacity = '1';
            if (loadGroup) loadGroup.classList.remove('drag-active');
        }
    });

    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || e.relatedTarget === document.documentElement) {
            document.body.style.opacity = '1';
            const loadGroup = document.getElementById('loadGroup');
            if (loadGroup) loadGroup.classList.remove('drag-active');
        }
    });

    window.addEventListener('drop', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (isInput) {
            document.body.style.opacity = '1';
            const loadGroup = document.getElementById('loadGroup');
            if (loadGroup) loadGroup.classList.remove('drag-active');
            return;
        }

        const isFileLoaded = !!state.parsedData;
        const inLoadArea = isDropInLoadArea(e);
        const loadGroup = document.getElementById('loadGroup');
        if (loadGroup) loadGroup.classList.remove('drag-active');

        if (isFileLoaded && !inLoadArea) {
            document.body.style.opacity = '1';
            return;
        }

        e.preventDefault();
        document.body.style.opacity = '1';

        if (e.dataTransfer.files.length > 0) {
            updateUrl(null);
            handleFile(e.dataTransfer.files[0]);
        } else {
            const text = e.dataTransfer.getData('text');
            if (text) {
                const trimmed = text.trim();
                const id = parseDriveLink(trimmed);
                if (id) {
                    const isSilent = (trimmed === id);
                    loadFromDrive(id, null, isSilent, isSilent ? trimmed : null);
                } else {
                    updateUrl(null);
                    handleText(trimmed, "Dropped content", null);
                }
            }
        }
    });

    // Paste
    window.addEventListener('paste', async (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (isInput) return;

        if (!state.parsedData && e.clipboardData) {
            e.preventDefault();
            const text = e.clipboardData.getData('text');
            handlePaste(text);
        }
    });
    
    document.getElementById('pasteBtn').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            handlePaste(text);
        } catch (err) {
            UI.showError("Clipboard Error", "Could not access clipboard content. Please try using Ctrl+V or check permissions.");
        }
    });

    function handlePaste(text) {
        const trimmed = text.trim();
        const id = parseDriveLink(trimmed);

        if (id) {
            // It's a link or a raw ID
            const isSilent = (trimmed === id);
            loadFromDrive(id, null, isSilent, isSilent ? trimmed : null);
        } else {
            updateUrl(null);
            handleText(trimmed, "Pasted content", null);
        }
    }

    // Export / Download
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (!state.rawContent) return;
        downloadString(state.rawContent, state.currentFileName, 'application/json');
    });

    document.getElementById('mediaGalleryBtn').addEventListener('click', () => {
        if (!state.extractedMedia || state.extractedMedia.length === 0) return;
        UI.renderMediaGallery(state.extractedMedia, handleBulkDownload);
    });

    // Event listener for Tooltip Download Media button
    document.addEventListener('download-message-media', (e) => {
        const chunks = e.detail.chunks;
        // Mock a parsedData structure for the extractor
        const tempMedia = extractMedia({ chunkedPrompt: { chunks: chunks } });
        if(tempMedia.length > 0) {
            handleBulkDownload(tempMedia, (pct) => {
               if(pct === 0) showToast("Zipping media...");
               if(pct === 100) showToast("Download started");
            });
        }
    });

    document.getElementById('copyOriginalBtn').addEventListener('click', () => {
        if (state.rawContent) {
            navigator.clipboard.writeText(state.rawContent).then(() => showToast("Original JSON copied"));
        }
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const clean = getCleanJSON(state.parsedData);
        if (clean) downloadString(JSON.stringify(clean, null, 2), `CLEAN_${state.currentFileName}`, 'application/json');
    });

    document.getElementById('copyCleanBtn').addEventListener('click', () => {
        const clean = getCleanJSON(state.parsedData);
        if (clean) {
            navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => showToast("Copied JSON to clipboard"));
        }
    });

    // Drive Link Input
    const linkBtn = document.getElementById('linkBtn');
    const linkPopover = document.getElementById('link-popover');
    linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        linkPopover.classList.toggle('hidden');
        if (!linkPopover.classList.contains('hidden')) document.getElementById('driveLinkInput').focus();
    });
    
    document.getElementById('driveLoadBtn').addEventListener('click', () => {
        const val = document.getElementById('driveLinkInput').value;
        const id = parseDriveLink(val);
        if (id) {
            linkPopover.classList.add('hidden');
            loadFromDrive(id);
        } else {
            document.getElementById('drive-error-msg').classList.remove('hidden');
        }
    });

    // Sidebar & Settings
    document.getElementById('sidebar-toggle-btn').addEventListener('click', UI.toggleSidebar);
    document.getElementById('sidebar-close-btn').addEventListener('click', UI.toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', UI.toggleSidebar);

    document.getElementById('deepSearchToggle').addEventListener('click', function() {
        state.isDeepSearch = !state.isDeepSearch;
        this.classList.toggle('active', state.isDeepSearch);
        document.getElementById('searchPrompts').placeholder = state.isDeepSearch ? 'Search all content...' : 'Search prompts...';
        performSearch(document.getElementById('searchPrompts').value);
    });

    document.getElementById('searchPrompts').addEventListener('input', (e) => performSearch(e.target.value));

    // Full Export Logic (Widget)
    const exportWidgetBtn = document.getElementById('exportWidgetBtn');
    const exportWidgetPopover = document.getElementById('export-widget-popover');

    if (exportWidgetBtn) {
        exportWidgetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportWidgetPopover.classList.toggle('hidden');
        });
    }

    exportWidgetPopover.querySelectorAll('[data-format]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const format = item.dataset.format;
            exportWidgetPopover.classList.add('hidden');
            handleFullExport(format);
        });
    });

    document.addEventListener('click', (e) => {
        if (!exportWidgetPopover.contains(e.target) && e.target !== exportWidgetBtn) {
            exportWidgetPopover.classList.add('hidden');
        }
    });

    async function handleFullExport(format) {
        if (!state.parsedData) return;
        const { exportToMarkdown, exportToTxt, exportToHtml, exportToImage, copyToClipboardAsMarkdown, copyToClipboardAsText, copyToClipboardAsHtml } = await import('./export.js');
        const filename = state.currentFileName;
        const allChunks = state.parsedData.chunkedPrompt.chunks;

        if (format === 'markdown') {
            exportToMarkdown(allChunks, filename);
        } else if (format === 'copy-markdown') {
            copyToClipboardAsMarkdown(allChunks);
        } else if (format === 'txt') {
            exportToTxt(allChunks, filename);
        } else if (format === 'copy-txt') {
            copyToClipboardAsText(allChunks);
        } else if (format === 'html' || format === 'copy-html') {
            const chatStream = document.getElementById('chat-stream');
            const isCopy = format === 'copy-html';
            const action = isCopy ? () => copyToClipboardAsHtml(chatStream, state.currentFileName) : () => exportToHtml(chatStream, state.currentFileName, filename);

            if (prefs.isScrollMode) {
                action();
            } else {
                 const oldHtml = chatStream.innerHTML;
                 const oldView = chatStream.getAttribute('data-view');
                 UI.renderFullConversation(state.parsedData, state.currentPrompts);
                 action();
                 if (oldView === 'full') UI.renderFullConversation(state.parsedData, state.currentPrompts, state.pendingInputs);
                 else UI.renderConversation(state.parsedData, state.focusIndex, state.currentPrompts, state.pendingInputs);
            }
        } else if (format === 'image') {
            const chatStream = document.getElementById('chat-stream');
            if (prefs.isScrollMode) {
                showToast("Capturing long conversation as image... this may take a moment.");
                exportToImage(chatStream, filename);
            } else {
                UI.renderFullConversation(state.parsedData, state.currentPrompts);
                await exportToImage(chatStream, filename);
                UI.renderConversation(state.parsedData, state.focusIndex, state.currentPrompts);
            }
        }
    }
    
    document.getElementById('clearRecentsBtn').addEventListener('click', () => {
        UI.showModal({
            title: 'Clear History',
            message: 'Are you sure you want to clear all unpinned history items? This action cannot be undone.',
            headerColor: '#ef4444',
            iconClass: 'ph-fill ph-trash',
            primaryBtn: {
                text: 'Clear All',
                onClick: () => {
                    clearRecentsInDB(() => loadHistory());
                    showToast('History cleared');
                }
            },
            dismissBtn: { text: 'Cancel' }
        });
    });
    
    // View Modes
    document.getElementById('sidebarModeToggle').addEventListener('change', (e) => {
        prefs.isScrollMode = e.target.checked;
        // Don't save strictly to localstorage here if it's per-session, but original did specific logic
        if (!state.parsedData) return;
        UI.showLoading();
        setTimeout(async () => {
            // Re-populate sidebar to update <a> hrefs
            const record = await getFileById(state.currentFileRecordId);
            UI.populateSidebar(state.currentPrompts, {
                onPromptClick: (index) => handlePromptClick(index),
                onRenamePrompt: (index, newName) => handlePromptRename(index, newName),
                onRevertPrompt: (index) => handlePromptRevert(index),
                onExportTurn: (index) => handleExportTurn(index)
            }, record);

            if (prefs.isScrollMode) {
                const targetIdx = state.focusIndex;
                UI.renderFullConversation(state.parsedData, state.currentPrompts, state.pendingInputs);
                updateUrl(state.currentFileId, state.currentFileRecordId, null, targetIdx);

                // Use multiple attempts to ensure scroll happens after layout
                const performScroll = () => {
                    const target = document.getElementById(`msg-user-${targetIdx}`);
                    if (target) {
                        target.scrollIntoView({ behavior: 'auto', block: 'start' });
                        // Re-confirm URL hasn't been reset by observer
                        updateUrl(state.currentFileId, state.currentFileRecordId, null, targetIdx, true);
                    }
                };

                setTimeout(performScroll, 50);
                setTimeout(performScroll, 200);
            } else {
                renderChat(state.focusIndex);
            }
            UI.hideLoading();
        }, 50);
    });

    document.getElementById('thinkingModeToggle').addEventListener('change', (e) => {
        prefs.collapseThoughts = !e.target.checked;
        localStorage.setItem('collapseThoughts', JSON.stringify(prefs.collapseThoughts));
        if (!state.parsedData) return;
        
        UI.showLoading();
        setTimeout(() => {
            try {
                if (prefs.isScrollMode) {
                    renderCompleteDialog();
                } else if (state.focusIndex > -1) {
                    renderChat(state.focusIndex);
                }
            } catch (err) {
                console.error("Error re-rendering for thinking mode:", err);
            } finally {
                UI.hideLoading();
            }
        }, 50);
    });

    document.getElementById('cancel-processing-btn').addEventListener('click', () => {
        cancelFetch();
        window.location.reload();
    });

    const logo = document.querySelector('#sidebar .logo-img');
    if (logo) {
        logo.addEventListener('click', () => {
            resetAppState();
        });
    }
}

function setupThemeLogic() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
        // Icon update logic handled in settings or UI helper, but for now:
        const icon = document.querySelector('#theme-toggle i');
        const text = document.querySelector('#theme-toggle span');
        if (current !== 'dark') { // switching to dark
            icon.className = 'ph-fill ph-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'ph-fill ph-moon';
            text.textContent = 'Dark Mode';
        }
    });
}

// --- Bulk Download Logic ---
async function handleBulkDownload(mediaItems, onProgress) {
    /* global JSZip */
    if (typeof JSZip === 'undefined') {
        UI.showError("Missing Library", "JSZip library not loaded. Please refresh.");
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder("media");
    
    let processedCount = 0;
    const total = mediaItems.length;
    
    const updateProgress = () => {
        processedCount++;
        if(onProgress) onProgress((processedCount / total) * 50); // First 50% is fetching
    };

    const promises = mediaItems.map(async (item, i) => {
        const filename = `${item.role}_${item.index}_${i}.${item.ext}`;
        
        try {
            if (item.type === 'inline') {
                folder.file(filename, item.data, { base64: true });
            } else if (item.type === 'drive') {
                const url = `https://drive.google.com/uc?export=download&id=${item.id}`;
                const blob = await fetchProxyBlob(url);
                folder.file(filename, blob);
            }
        } catch (e) {
            console.error(`Failed to zip ${filename}`, e);
            folder.file(`${filename}.error.txt`, `Failed to fetch: ${e.message}`);
        } finally {
            updateProgress();
        }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        if(onProgress) onProgress(50 + (metadata.percent / 2));
    });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `Media_${state.currentFileName}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if(onProgress) onProgress(100);
}

function downloadString(content, filename, contentType) {
    const a = document.createElement('a');
    const blob = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}