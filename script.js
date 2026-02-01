// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('fileInput');
    const downloadGroup = document.getElementById('downloadGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyOriginalBtn = document.getElementById('copyOriginalBtn');
    const exportGroup = document.getElementById('exportGroup');
    const exportBtn = document.getElementById('exportBtn');
    const copyCleanBtn = document.getElementById('copyCleanBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const searchInput = document.getElementById('searchPrompts');
    const deepSearchToggle = document.getElementById('deepSearchToggle');
    const chatStream = document.getElementById('chat-stream');
    const metadataPanel = document.getElementById('metadata-panel');
    const filenameDisplay = document.getElementById('filename-display');
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const scrollContainer = document.getElementById('scroll-container');
    const navWidget = document.getElementById('nav-widget');
    const loadingOverlay = document.getElementById('loading-overlay');
    const cancelBtn = document.getElementById('cancel-processing-btn')

    // Image Modal
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const closeImageModalBtn = document.getElementById('close-image-modal-btn');
    const downloadImageBtn = document.getElementById('download-image-btn');

    // Text Viewer Modal
    const textViewerModal = document.getElementById('text-viewer-modal');
    const textViewerFilename = document.getElementById('text-viewer-filename');
    const textViewerLangTag = document.getElementById('text-viewer-lang-tag');
    const textViewerCode = document.getElementById('text-viewer-code');
    const copyViewerBtn = document.getElementById('copy-viewer-btn');
    const closeTextViewerBtn = document.getElementById('close-text-viewer-btn');

    // Error Modal
    const errorModal = document.getElementById('error-modal');
    const errorMessageText = document.getElementById('error-message-text');
    const errorGifContainer = document.getElementById('error-gif-container');
    const closeErrorBtn = document.getElementById('close-error-btn');
    const retryErrorBtn = document.getElementById('retry-error-btn');
    const openDriveErrorBtn = document.getElementById('open-drive-error-btn');

    // Confirm Modal
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessageText = document.getElementById('confirm-message-text');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');

    // Link Elements
    const linkBtn = document.getElementById('linkBtn');
    const linkPopover = document.getElementById('link-popover');
    const driveLinkInput = document.getElementById('driveLinkInput');
    const driveLoadBtn = document.getElementById('driveLoadBtn');
    const driveErrorMsg = document.getElementById('drive-error-msg');

    // Sidebar & Settings
    const themeToggle = document.getElementById('theme-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const toggleAllCodeAction = document.getElementById('toggleAllCodeAction');
    const autoRestoreToggle = document.getElementById('autoRestoreToggle');
    const sidebarModeToggle = document.getElementById('sidebarModeToggle');
    const thinkingModeToggle = document.getElementById('thinkingModeToggle');
    const metadataCollapseToggle = document.getElementById('metadataCollapseToggle');
    const codePersistenceToggle = document.getElementById('codePersistenceToggle');
    const scrollableCodeToggle = document.getElementById('scrollableCodeToggle');
    const wrapCodeToggle = document.getElementById('wrapCodeToggle');

    // Width Slider
    const widthSlider = document.getElementById('widthSlider');

    // Code Theme Selectors
    const codeThemeWrapper = document.getElementById('codeThemeWrapper');
    const codeThemeTrigger = document.getElementById('codeThemeTrigger');
    const codeThemeOptions = document.getElementById('codeThemeOptions');
    const currentThemeNameEl = document.getElementById('currentThemeName');
    const themePreviewContainer = document.getElementById('theme-preview-container');
    const mainHighlightStylesheet = document.getElementById('highlight-stylesheet');

    // History
    const historySection = document.getElementById('history-section');
    const recentListEl = document.getElementById('recent-files-list');
    const pinnedListEl = document.getElementById('pinned-files-list');
    const clearRecentsBtn = document.getElementById('clearRecentsBtn');
    const miniTabs = document.querySelectorAll('.mini-tab');
    const historyViews = document.querySelectorAll('.history-view');

    let parsedData = null;
    let currentPrompts = [];
    let currentFileName = "Untitled";
    let openLastFileOnStartup = true;
    let isScrollMode = false;
    let currentFocusIndex = -1;
    let collapseThoughts = true;
    let collapseMetadataByDefault = false;
    let preserveCodeState = false;
    let isScrollableCode = false;
    let isWrapCode = false;
    let isDeepSearch = false;
    let rawFileContent = null;
    let abortController = null;
    let themePreviewTimeout = null;
    let lastPreviewedTheme = null;
    let autoRestoreContent = true;
    
    // Confirm Modal State
    let onConfirmAction = null;
    let onCancelAction = null;
    let onRetryAction = null;

    // --- Code Theme Data ---
    const THEMES = [{
            name: "Android Studio",
            value: "androidstudio"
        },
        {
            name: "Atom One Dark",
            value: "atom-one-dark"
        },
        {
            name: "Atom One Light",
            value: "atom-one-light"
        },
        {
            name: "Monokai",
            value: "monokai"
        },
        {
            name: "GitHub Dark",
            value: "github-dark"
        },
        {
            name: "GitHub",
            value: "github"
        },
        {
            name: "Dracula",
            value: "dracula"
        },
        {
            name: "Nord",
            value: "nord"
        },
        {
            name: "Solarized Dark",
            value: "solarized-dark"
        },
        {
            name: "Solarized Light",
            value: "solarized-light"
        },
        {
            name: "VS 2015",
            value: "vs2015"
        },
        {
            name: "Agate",
            value: "agate"
        },
        {
            name: "Obsidian",
            value: "obsidian"
        },
        {
            name: "A11y Dark",
            value: "a11y-dark"
        },
        {
            name: "A11y Light",
            value: "a11y-light"
        },
    ];
    let currentCodeTheme = "androidstudio";
    let previewShadowRoot = null;
    let previewLang = "javascript";

    const PREVIEW_CODE_SAMPLES = {
        javascript: `function greet(name) {\n  const message = \`Hello, \${name}!\`;\n  // A simple comment\n  return message;\n}\n\nconsole.log(greet("Inspector"));`,
        python: `import math\n\ndef calculate_area(radius):\n    """Calculates the area of a circle."""\n    return math.pi * radius ** 2\n\n# Calculate and print\nprint(f"Area: {calculate_area(5):.2f}")`,
        json: `{\n  "model": "gemini-1.5-pro",\n  "temperature": 0.7,\n  "safe": true\n}`
    };

    // --- IndexedDB ---
    const DB_NAME = 'GeminiInspectorDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'files';
    let db;

    // --- 1. Init & Preferences ---
    function initPreferences() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) setTheme('dark');
        else setTheme('light');

        const savedRestore = localStorage.getItem('autoRestore');
        openLastFileOnStartup = savedRestore ? JSON.parse(savedRestore) : true;
        autoRestoreToggle.checked = openLastFileOnStartup;

        const savedThinking = localStorage.getItem('collapseThoughts');
        collapseThoughts = savedThinking ? JSON.parse(savedThinking) : true;
        thinkingModeToggle.checked = !collapseThoughts;

        const savedMetadata = localStorage.getItem('collapseMetadata');
        collapseMetadataByDefault = savedMetadata ? JSON.parse(savedMetadata) : false;
        metadataCollapseToggle.checked = collapseMetadataByDefault;

        const savedCodePersistence = localStorage.getItem('preserveCodeState');
        preserveCodeState = savedCodePersistence ? JSON.parse(savedCodePersistence) : false;
        codePersistenceToggle.checked = preserveCodeState;

        const savedScrollCode = localStorage.getItem('scrollableCode');
        isScrollableCode = savedScrollCode ? JSON.parse(savedScrollCode) : false;
        scrollableCodeToggle.checked = isScrollableCode;
        document.body.classList.toggle('scrollable-codeblocks', isScrollableCode);

        const savedWrapCode = localStorage.getItem('wrapCode');
        isWrapCode = savedWrapCode ? JSON.parse(savedWrapCode) : false;
        wrapCodeToggle.checked = isWrapCode;
        document.body.classList.toggle('wrap-codeblocks', isWrapCode);

        const savedAutoRestore = localStorage.getItem('autoRestoreContent');
        autoRestoreContent = savedAutoRestore !== null ? JSON.parse(savedAutoRestore) : true;
        autoRestoreToggle.checked = autoRestoreContent;

        // Width Slider
        const savedWidth = localStorage.getItem('contentWidth');
        const initialWidth = savedWidth ? savedWidth : 800;
        widthSlider.value = initialWidth;
        document.documentElement.style.setProperty('--content-width', `${initialWidth}px`);

        const savedCodeTheme = localStorage.getItem('codeTheme');
        if (savedCodeTheme) applyCodeTheme(savedCodeTheme);
        else applyCodeTheme('androidstudio');

        // --- URL PARSING LOGIC ---
        const urlParams = new URLSearchParams(window.location.search);
        
        // 1. Check Query Params
        let fileId = urlParams.get('view') || urlParams.get('id') || urlParams.get('chat');

        // 2. Check Hash (Static site routing: /#/id)
        if (!fileId && window.location.hash) {
                        let hashVal = window.location.hash.substring(1);
            if (hashVal.startsWith('/')) hashVal = hashVal.substring(1);
                        if (/^[a-zA-Z0-9_-]+$/.test(hashVal) && hashVal.length > 20) {
                fileId = hashVal;
            }
        }

        // 3. Check Path (SPA Routing: /id, /view/id, /chat/id, /id/id)
        if (!fileId) {
            const pathSegments = window.location.pathname.split('/').filter(seg => seg && seg !== 'index.html');
            if (pathSegments.length > 0) {
                const lastSegment = pathSegments[pathSegments.length - 1];
                const secondLastSegment = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2].toLowerCase() : null;
                
                // Helper to validate ID format
                const isLikelyId = (id) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 20;

                if (isLikelyId(lastSegment)) {
                    // Case: domain.com/<id>
                    if (pathSegments.length === 1) {
                    fileId = lastSegment;
                    } 
                    // Case: domain.com/view/<id>, /chat/<id>, /id/<id>
                    else if (['view', 'chat', 'id'].includes(secondLastSegment)) {
                        fileId = lastSegment;
                    }
                }
            }
        }

        if (fileId) {
            if (autoRestoreContent) {
                handleDriveLink(fileId, false);
            } else {
                showConfirmModal(
                    `Do you want to load this file (${truncate(fileId, 15)})?`, 
                    () => handleDriveLink(fileId, false),
                    () => updateUrl(null) // Clean URL if cancelled
                );
            }
        }
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('span');
        if (theme === 'dark') {
            icon.className = 'ph-fill ph-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'ph-fill ph-moon';
            text.textContent = 'Dark Mode';
        }
    }

    // Width Slider Listener
    widthSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.documentElement.style.setProperty('--content-width', `${val}px`);
        localStorage.setItem('contentWidth', val);
    });

    // --- Code Theme Logic ---
    function initCodeThemes() {
        codeThemeOptions.innerHTML = '';
        THEMES.forEach(t => {
            const div = document.createElement('div');
            div.className = 'custom-option';
            div.textContent = t.name;
            div.dataset.value = t.value;
            if (t.value === currentCodeTheme) div.classList.add('selected');

            div.addEventListener('click', () => applyCodeTheme(t.value));
            div.addEventListener('mouseenter', () => {
                showThemePreview(t.value);
            });

            codeThemeOptions.appendChild(div);
        });

        previewShadowRoot = themePreviewContainer.attachShadow({
            mode: 'open'
        });

        codeThemeWrapper.addEventListener('mouseenter', () => clearTimeout(themePreviewTimeout));
        themePreviewContainer.addEventListener('mouseenter', () => clearTimeout(themePreviewTimeout));

        codeThemeWrapper.addEventListener('mouseleave', () => themePreviewTimeout = setTimeout(hideThemePreview, 300));
        themePreviewContainer.addEventListener('mouseleave', () => themePreviewTimeout = setTimeout(hideThemePreview, 300));
    }

    function applyCodeTheme(themeValue) {
        currentCodeTheme = themeValue;
        const themeObj = THEMES.find(t => t.value === themeValue);
        if (themeObj) currentThemeNameEl.textContent = themeObj.name;

        mainHighlightStylesheet.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${themeValue}.min.css`;
        localStorage.setItem('codeTheme', themeValue);

        Array.from(codeThemeOptions.children).forEach(child => {
            child.classList.toggle('selected', child.dataset.value === themeValue);
        });
    }

    function showThemePreview(themeValue) {
                clearTimeout(themePreviewTimeout);

        // Fix FOUC: Don't rebuild if theme hasn't changed
        if (lastPreviewedTheme === themeValue && themePreviewContainer.classList.contains('visible')) return;
        lastPreviewedTheme = themeValue;

        const rect = codeThemeWrapper.getBoundingClientRect();
        themePreviewContainer.style.top = `${rect.top}px`;
        themePreviewContainer.style.left = `${rect.right + 12}px`;

        const styleUrl = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${themeValue}.min.css`;

        const dropdownCss = `
            .lang-select-wrapper { position: relative; margin-top: 8px; user-select: none; }
            .lang-select-trigger {
                background: var(--bg-surface, #fff); color: var(--text-main, #000);
                border: 1px solid var(--border-subtle, #ccc); border-radius: 4px;
                padding: 4px 8px; font-size: 11px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
            }
            .lang-options {
                display: none; position: absolute; top: 100%; left: 0; width: 100%;
                background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #ccc);
                border-radius: 4px; z-index: 10; margin-top: 2px;
            }
            .lang-options.open { display: block; }
            .lang-option { padding: 4px 8px; cursor: pointer; }
            .lang-option:hover { background: rgba(0,0,0,0.05); }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
            pre.wrapped { white-space: pre-wrap; word-wrap: break-word; }
        `;

        previewShadowRoot.innerHTML = `
            <link rel="stylesheet" href="${styleUrl}">
            <style>
                :host { display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
                .preview-box { border-radius: 6px; overflow: hidden; background: var(--bg-code, #1e293b); }
                pre { margin: 0; padding: 10px; }
                code.hljs { padding: 0; background: transparent; }
                ${dropdownCss}
            </style>
            <div class="preview-box">
                <pre class="${isWrapCode ? 'wrapped' : ''}"><code class="hljs language-${previewLang}"></code></pre>
            </div>
            <div class="lang-select-wrapper">
                <div class="lang-select-trigger">
                    <span>${previewLang.charAt(0).toUpperCase() + previewLang.slice(1)}</span>
                    <span>▼</span>
                </div>
                <div class="lang-options">
                    <div class="lang-option" data-val="javascript">JavaScript</div>
                    <div class="lang-option" data-val="python">Python</div>
                    <div class="lang-option" data-val="json">JSON</div>
                </div>
            </div>
        `;

        const codeBlock = previewShadowRoot.querySelector('code');
        codeBlock.textContent = PREVIEW_CODE_SAMPLES[previewLang];
        hljs.highlightElement(codeBlock);

        const trigger = previewShadowRoot.querySelector('.lang-select-trigger');
        const options = previewShadowRoot.querySelector('.lang-options');

        trigger.addEventListener('click', () => options.classList.toggle('open'));

        previewShadowRoot.querySelectorAll('.lang-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                previewLang = e.target.dataset.val;
                // Force refresh on lang change even if theme is same
                lastPreviewedTheme = null;
                showThemePreview(themeValue);
            });
        });

        themePreviewContainer.classList.remove('hidden');
        requestAnimationFrame(() => themePreviewContainer.classList.add('visible'));
    }

    function hideThemePreview() {
        themePreviewContainer.classList.remove('visible');
        setTimeout(() => {
            if (!themePreviewContainer.classList.contains('visible')) {
                themePreviewContainer.classList.add('hidden');
                lastPreviewedTheme = null; // Reset for next time
            }
        }, 200);
    }

    codeThemeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        codeThemeWrapper.classList.toggle('open');
        if (codeThemeWrapper.classList.contains('open')) {
            const selected = codeThemeOptions.querySelector('.selected');
            if (selected) showThemePreview(selected.dataset.value);
        } else {
            hideThemePreview();
        }
    });

    document.addEventListener('click', (e) => {
                if (!codeThemeWrapper.contains(e.target) && !themePreviewContainer.contains(e.target)) {
            codeThemeWrapper.classList.remove('open');
            hideThemePreview();
        }
    });

    initCodeThemes();

    // --- 2. Database Logic ---
    function initDB() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                e.target.result.createObjectStore(STORE_NAME, {
                    keyPath: 'id'
                });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            loadHistoryLists();
            
            // Don't auto-load last file if we are loading from URL (Params, Hash, or Path)
            const urlParams = new URLSearchParams(window.location.search);
            const hasParams = urlParams.get('id') || urlParams.get('view') || urlParams.get('chat');
            const hasHash = window.location.hash.length > 1;
            
            // Check for path logic used in initPreferences
            let hasPathId = false;
            const pathSegments = window.location.pathname.split('/').filter(seg => seg && seg !== 'index.html');
            if (pathSegments.length > 0) {
                const potentialId = pathSegments[pathSegments.length - 1];
                if (/^[a-zA-Z0-9_-]+$/.test(potentialId) && potentialId.length > 20) {
                    hasPathId = true;
                }
            }

            // Only call loadLastFile if no URL ID is present AND preference is true
            if (window.location.protocol !== 'file:' && !hasParams && !hasHash && !hasPathId) {
                if (openLastFileOnStartup) loadLastFile();
            } else if (window.location.protocol === 'file:') {
                if (openLastFileOnStartup) loadLastFile();
            }
        };
        request.onerror = (e) => console.error("DB Error", e);
    }

    function saveFileToHistory(fileObj) {
        if (!db) return;
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record = {
            id: fileObj.id || Date.now(),
            name: fileObj.name,
            data: fileObj.data,
            raw: fileObj.raw,
            timestamp: Date.now(),
            pinned: fileObj.pinned || false
        };
        store.put(record);
        transaction.oncomplete = () => cleanupHistory();
    }

    function cleanupHistory() {
        if (!db) return;
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.getAll().onsuccess = (e) => {
            const files = e.target.result;
            let unpinned = files.filter(f => !f.pinned).sort((a, b) => b.timestamp - a.timestamp);

            const seenNames = new Set();
            for (const f of unpinned) {
                if (!seenNames.has(f.name)) seenNames.add(f.name);
                else store.delete(f.id);
            }
            if (unpinned.length > 20) unpinned.slice(20).forEach(f => store.delete(f.id));
            loadHistoryLists();
        };
    }

    function loadHistoryLists() {
        if (!db) return;
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        store.getAll().onsuccess = (e) => {
            const files = e.target.result;
            historySection.classList.toggle('hidden', files.length === 0);
            if (files.length === 0) return;

            const pinned = files.filter(f => f.pinned).sort((a, b) => b.timestamp - a.timestamp);
            let unpinned = files.filter(f => !f.pinned).sort((a, b) => b.timestamp - a.timestamp);
            const uniqueRecent = unpinned.filter((f, index, self) => index === self.findIndex(t => t.name === f.name));

            renderRecentList(uniqueRecent.slice(0, 5));
            renderPinnedList(pinned);
        };
    }

    function renderRecentList(files) {
        recentListEl.innerHTML = '';
        files.forEach(f => recentListEl.appendChild(createFileElement(f, false)));
    }

    function renderPinnedList(files) {
        pinnedListEl.innerHTML = '';
        files.forEach(f => pinnedListEl.appendChild(createFileElement(f, true)));
    }

    function createFileElement(file, isPinnedSection) {
        const div = document.createElement('div');
        div.className = 'recent-file-item';
        if (file.name === currentFileName) div.classList.add('active');
        
        // Move click handler to parent container for better hit area
        div.onclick = () => {
            updateUrl(null);
            loadFromFileRecord(file);
        };

        const nameGroup = document.createElement('div');
        nameGroup.className = 'file-name-group';
        nameGroup.innerHTML = `<i class="ph ph-file-text"></i> <span class="file-text" title="${file.name}">${truncate(file.name, 22)}</span>`;

        const pinBtn = document.createElement('button');
        pinBtn.className = `pin-btn ${file.pinned ? 'pinned' : ''}`;
        const iconClass = file.pinned ? 'ph-fill' : 'ph-bold';
        pinBtn.innerHTML = `<i class="${iconClass} ph-push-pin"></i>`;
        pinBtn.title = file.pinned ? "Unpin" : "Pin";

        if (!file.pinned) {
            pinBtn.onmouseenter = () => {
                pinBtn.querySelector('i').className = 'ph-fill ph-push-pin';
            };
            pinBtn.onmouseleave = () => {
                pinBtn.querySelector('i').className = 'ph-bold ph-push-pin';
            };
        } else {
            pinBtn.onmouseenter = () => {
                pinBtn.querySelector('i').className = 'ph-bold ph-push-pin';
            };
            pinBtn.onmouseleave = () => {
                pinBtn.querySelector('i').className = 'ph-fill ph-push-pin';
            };
        }
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            togglePin(file);
        };

        div.appendChild(nameGroup);
        div.appendChild(pinBtn);
        return div;
    }

    function togglePin(file) {
        if (!db) return;
        const tx = db.transaction([STORE_NAME], 'readwrite');
        file.pinned = !file.pinned;
        tx.objectStore(STORE_NAME).put(file);
        tx.oncomplete = () => loadHistoryLists();
    }

    function loadLastFile() {
        if (!db) return;
        const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
        req.onsuccess = (e) => {
            const files = e.target.result;
            if (files.length > 0) {
                files.sort((a, b) => b.timestamp - a.timestamp);
                loadFromFileRecord(files[0]);
            }
        };
    }

    function loadFromFileRecord(record) {
        showLoading();
        currentFileName = record.name;
        parsedData = record.data;
        rawFileContent = record.raw || JSON.stringify(record.data, null, 2);
        filenameDisplay.textContent = truncate(currentFileName, 64);
        filenameDisplay.title = currentFileName;
        document.title = `${currentFileName} | Inspector`;
        loadHistoryLists();
        startProcessing();
    }

    function clearRecents() {
        if (!db) return;
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.getAll().onsuccess = (e) => {
            e.target.result.forEach(f => {
                if (!f.pinned) store.delete(f.id);
            });
            loadHistoryLists();
        };
    }

    // --- 3. Main Event Listeners ---
    initDB();
    initPreferences();

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    clearRecentsBtn.addEventListener('click', clearRecents);
    miniTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            miniTabs.forEach(t => t.classList.remove('active'));
            historyViews.forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`view-${tab.dataset.target}`).classList.add('active');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            if (!imageModal.classList.contains('hidden')) imageModal.classList.add('hidden');
            if (!textViewerModal.classList.contains('hidden')) textViewerModal.classList.add('hidden');
            if (!errorModal.classList.contains('hidden')) errorModal.classList.add('hidden');
            if (!linkPopover.classList.contains('hidden')) linkPopover.classList.add('hidden');
            if (codeThemeWrapper.classList.contains('open')) codeThemeWrapper.classList.remove('open');
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (abortController) abortController.abort();
        window.location.reload();
    });

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('open');
    }
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    sidebarCloseBtn.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    autoRestoreToggle.addEventListener('change', (e) => {
        openLastFileOnStartup = e.target.checked;
        localStorage.setItem('autoRestore', JSON.stringify(openLastFileOnStartup));
    });

    sidebarModeToggle.addEventListener('change', (e) => {
        isScrollMode = e.target.checked;
        if (!parsedData) return;
        showLoading();
        setTimeout(() => {
            try {
                if (isScrollMode) renderCompleteDialog(false);
                else renderConversation(currentFocusIndex > -1 ? currentFocusIndex : 0);
            } catch (e) {
                console.error(e);
            } finally {
                hideLoading();
            }
        }, 50);
    });

    thinkingModeToggle.addEventListener('change', (e) => {
        collapseThoughts = !e.target.checked;
        localStorage.setItem('collapseThoughts', JSON.stringify(collapseThoughts));
        if (!parsedData) return;
        showLoading();
        setTimeout(() => {
            try {
                if (isScrollMode) renderCompleteDialog(false);
                else if (currentFocusIndex > -1) renderConversation(currentFocusIndex);
            } catch (e) {
                console.error(e);
            } finally {
                hideLoading();
            }
        }, 50);
    });

    metadataCollapseToggle.addEventListener('change', (e) => {
        collapseMetadataByDefault = e.target.checked;
        localStorage.setItem('collapseMetadata', JSON.stringify(collapseMetadataByDefault));
        
        // Apply to current UI
        if (parsedData) {
            metadataBody.classList.toggle('collapsed', !collapseMetadataByDefault);
            const icon = collapseBtn.querySelector('i');
            if (icon) icon.className = collapseMetadataByDefault ? 'ph ph-caret-up' : 'ph ph-caret-down';
        }
    });

    codePersistenceToggle.addEventListener('change', (e) => {
        preserveCodeState = e.target.checked;
        localStorage.setItem('preserveCodeState', JSON.stringify(preserveCodeState));
        if (!preserveCodeState) {
            localStorage.removeItem(`code_states_${currentFileName}`);
        }
    });

    toggleAllCodeAction.addEventListener('click', () => {
        const wrappers = document.querySelectorAll('.code-block-wrapper');
        if (wrappers.length === 0) return;
        const anyExpanded = Array.from(wrappers).some(w => !w.classList.contains('collapsed'));
        wrappers.forEach(w => {
            const isCollapsed = anyExpanded;
            w.classList.toggle('collapsed', isCollapsed);
            const icon = w.querySelector('.collapse-code-btn i');
            if (icon) icon.className = isCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down';
            
            if (preserveCodeState && w.dataset.blockId) {
                updatePersistedCodeState(w.dataset.blockId, isCollapsed);
            }
        });
    });

    scrollableCodeToggle.addEventListener('change', (e) => {
        isScrollableCode = e.target.checked;
        localStorage.setItem('scrollableCode', JSON.stringify(isScrollableCode));
        document.body.classList.toggle('scrollable-codeblocks', isScrollableCode);
    });

    wrapCodeToggle.addEventListener('change', (e) => {
        isWrapCode = e.target.checked;
        localStorage.setItem('wrapCode', JSON.stringify(isWrapCode));
        document.body.classList.toggle('wrap-codeblocks', isWrapCode);
        if (codeThemeWrapper.classList.contains('open')) {
            const selected = codeThemeOptions.querySelector('.selected');
            if (selected) showThemePreview(selected.dataset.value);
        }
    });

    autoRestoreToggle.addEventListener('change', (e) => {
        autoRestoreContent = e.target.checked;
        localStorage.setItem('autoRestoreContent', JSON.stringify(autoRestoreContent));
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        updateUrl(null);
        handleFile(file);
    });

    deepSearchToggle.addEventListener('click', () => {
        isDeepSearch = !isDeepSearch;
        deepSearchToggle.classList.toggle('active', isDeepSearch);
        searchInput.placeholder = isDeepSearch ? 'Search all content...' : 'Search prompts...';
        performSearch(searchInput.value.toLowerCase());
    });

    searchInput.addEventListener('input', (e) => performSearch(e.target.value.toLowerCase()));

    exportBtn.addEventListener('click', () => {
        const clean = getCleanJSON();
        if (!clean) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clean, null, 2));
        const dl = document.createElement('a');
        dl.href = dataStr;
        dl.download = `CLEAN_${currentFileName}`;
        document.body.appendChild(dl);
        dl.click();
        dl.remove();
        showToast("Clean JSON downloaded");
    });
    copyCleanBtn.addEventListener('click', () => {
        const clean = getCleanJSON();
        if (!clean) return;
        navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => showToast("Copied JSON to clipboard"));
    });

    downloadBtn.addEventListener('click', () => {
        if (!rawFileContent) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(rawFileContent);
        const dl = document.createElement('a');
        dl.href = dataStr;
        dl.download = currentFileName;
        document.body.appendChild(dl);
        dl.click();
        dl.remove();
    });

    copyOriginalBtn.addEventListener('click', () => {
        if (!rawFileContent) return;
        navigator.clipboard.writeText(rawFileContent).then(() => showToast("Original JSON copied"));
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            const trimmed = text.trim();
            updateUrl(null);

            if (trimmed.includes('aistudio.google.com') || trimmed.includes('/prompts/') || trimmed.includes('/file/d/')) {
                handleDriveLink(trimmed);
            } else {
                handleText(trimmed, "Pasted from clipboard");
            }
        } catch (err) {
            showError("Clipboard Error", "Could not access clipboard content. Please try using Ctrl+V or check permissions.");
        }
    });

    linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        linkPopover.classList.toggle('hidden');
        driveErrorMsg.classList.add('hidden');
        if (!linkPopover.classList.contains('hidden')) {
            driveLinkInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!linkPopover.classList.contains('hidden') && !linkPopover.contains(e.target) && e.target !== linkBtn && !linkBtn.contains(e.target)) {
            linkPopover.classList.add('hidden');
        }
    });

    driveLoadBtn.addEventListener('click', () => {
        const input = driveLinkInput.value.trim();
        if (input) handleDriveLink(input);
    });

    driveLinkInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') driveLoadBtn.click();
    });

    function handleDriveLink(input, doUpdateUrl = true) {
        driveErrorMsg.classList.add('hidden');
        let id = null;

        const urlStrings = input.split(', ').map(url => url.trim());
        let targetUrl = input;

        if (urlStrings && urlStrings.length > 0) {
            const aiStudioUrl = urlStrings.find(u => u.includes('aistudio.google.com'));
            targetUrl = aiStudioUrl || urlStrings[0];
        }

        if (/^[a-zA-Z0-9_-]+$/.test(targetUrl) && targetUrl.length > 25) {
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

        if (id) {
            if (doUpdateUrl) updateUrl(id);
            fetchDriveFile(id);
            linkPopover.classList.add('hidden');
            driveLinkInput.value = '';
        } else {
            driveErrorMsg.textContent = "Could not extract a valid ID from that link.";
            driveErrorMsg.classList.remove('hidden');
        }
    }

    function fetchDriveFile(id) {
        showLoading();
        const originalUrl = `https://drive.google.com/uc?export=download&id=${id}`;
        const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(originalUrl)}`;

        abortController = new AbortController();

        fetch(proxyUrl, {
                signal: abortController.signal
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(text => {
                if (text.trim().startsWith('<')) {
                    linkPopover.classList.remove('hidden');
                    driveErrorMsg.classList.remove('hidden');
                    throw new Error("Private File / HTML content");
                }
                handleText(text, `Drive File (${id})`);
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                console.error("Fetch failed", err);
                hideLoading();
                if (err.message === "Private File / HTML content") {
                    showError("Access Denied", "This file appears to be private.", true, () => fetchDriveFile(id), id);
                } else {
                    showError("Network Error", "Failed to fetch file. CodeTabs proxy might be down or blocked.", false, () => fetchDriveFile(id), id);
                }
            });
    }

    function updateUrl(id) {
        try {
            const newUrl = new URL(window.location);
            // Clear old params to be clean
            newUrl.searchParams.delete('id');
            newUrl.searchParams.delete('chat');

            if (id) {
                newUrl.searchParams.set('view', id);
            } else {
                newUrl.searchParams.delete('view');
            }
            window.history.pushState({}, '', newUrl);
        } catch (e) {}
    }

    document.getElementById('scroll-top').addEventListener('click', () => scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
    }));
    document.getElementById('scroll-bottom').addEventListener('click', () => scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
    }));
    document.getElementById('scroll-next').addEventListener('click', () => navigateMessages(1));
    document.getElementById('scroll-prev').addEventListener('click', () => navigateMessages(-1));

    const metadataHeader = document.getElementById('metadata-header');
    const metadataBody = document.getElementById('metadata-body');
    const collapseBtn = document.querySelector('.collapse-btn');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            if (metadataBody.classList.contains('collapsed')) {
                metadataBody.classList.remove('collapsed');
                collapseBtn.querySelector('i').className = 'ph ph-caret-up';
            }
        });
    });

    metadataHeader.addEventListener('click', (e) => {
        if (e.target.closest('.tab-btn')) return;
        metadataBody.classList.toggle('collapsed');
        const icon = collapseBtn.querySelector('i');
        icon.className = metadataBody.classList.contains('collapsed') ? 'ph ph-caret-down' : 'ph ph-caret-up';
    });

    closeImageModalBtn.addEventListener('click', () => imageModal.classList.add('hidden'));
    imageModal.addEventListener('click', (e) => {
        if (e.target === imageModal) imageModal.classList.add('hidden');
    });
    downloadImageBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = modalImg.src;
        a.download = `image_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    closeTextViewerBtn.addEventListener('click', () => textViewerModal.classList.add('hidden'));
    textViewerModal.addEventListener('click', (e) => {
        if (e.target === textViewerModal) textViewerModal.classList.add('hidden');
    });
    copyViewerBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(textViewerCode.textContent).then(() => showToast("Copied to clipboard"));
    });

    // Error Modal Logic
    closeErrorBtn.addEventListener('click', () => errorModal.classList.add('hidden'));
    retryErrorBtn.addEventListener('click', () => {
        if (onRetryAction) {
            errorModal.classList.add('hidden');
            onRetryAction();
        }
    });

    errorModal.addEventListener('click', (e) => {
        if (e.target === errorModal) errorModal.classList.add('hidden');
    });

    function showError(title, message, showGif = false, retryCallback = null, fileId = null) {
        errorModal.querySelector('.error-header span').textContent = title;
        errorMessageText.textContent = message;
        errorGifContainer.classList.toggle('hidden', !showGif);
        
        onRetryAction = retryCallback;
        if (retryCallback) {
            retryErrorBtn.classList.remove('hidden');
        } else {
            retryErrorBtn.classList.add('hidden');
        }

        if (fileId) {
            openDriveErrorBtn.href = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
            openDriveErrorBtn.classList.remove('hidden');
        } else {
            openDriveErrorBtn.classList.add('hidden');
        }

        errorModal.classList.remove('hidden');
    }

    // Confirm Modal Logic
    function showConfirmModal(htmlMessage, onOk, onCancel) {
        confirmMessageText.innerHTML = htmlMessage;
        confirmModal.classList.remove('hidden');
        onConfirmAction = onOk;
        onCancelAction = onCancel;
    }

    confirmOkBtn.addEventListener('click', () => {
        if (onConfirmAction) onConfirmAction();
        confirmModal.classList.add('hidden');
    });

    confirmCancelBtn.addEventListener('click', () => {
        if (onCancelAction) onCancelAction();
        confirmModal.classList.add('hidden');
    });
    
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            if (onCancelAction) onCancelAction();
            confirmModal.classList.add('hidden');
        }
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.body.style.opacity = '0.5';
    });
    window.addEventListener('dragleave', () => document.body.style.opacity = '1');
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.style.opacity = '1';
        if (e.dataTransfer.files.length > 0) {
            updateUrl(null);
            handleFile(e.dataTransfer.files[0]);
        }
    });
    window.addEventListener('paste', (e) => {
        if (!parsedData && e.clipboardData) {
            e.preventDefault();
            const text = e.clipboardData.getData('text');
            if (text.includes('aistudio.google.com') || text.includes('/prompts/') || text.includes('/file/d/')) {
                handleDriveLink(text);
            } else {
                updateUrl(null);
                handleText(text, "Pasted content");
            }
        }
    });

    // --- 4. Main Functions ---
    function handleFile(file) {
        showLoading();
        const reader = new FileReader();
        reader.onload = (e) => handleText(e.target.result, file.name);
        reader.readAsText(file);
    }

    function handleText(text, name) {
        try {
            const data = JSON.parse(text);
            saveFileToHistory({
                name,
                data,
                raw: text,
                pinned: false
            });
            currentFileName = name;
            parsedData = data;
            rawFileContent = text;
            filenameDisplay.textContent = currentFileName;
            document.title = `${currentFileName} | Inspector`;
            loadHistoryLists();
            startProcessing();
        } catch (err) {
            console.error(err);
            hideLoading();
            showError("Invalid Content", "The pasted text or file is not valid JSON.");
        }
    }

    function startProcessing() {
        isScrollMode = false;
        sidebarModeToggle.checked = false;
        currentFocusIndex = 0;

        setTimeout(() => {
            try {
                processData();
                downloadGroup.classList.remove('hidden');
                exportGroup.classList.remove('hidden');
                navWidget.classList.remove('hidden');
            } catch (e) {
                console.error(e);
            } finally {
                hideLoading();
            }
        }, 100);
    }

    function performSearch(term) {
        if (!term) {
            document.querySelectorAll('.prompt-item').forEach(item => item.style.display = 'block');
            return;
        }

        let matchingIndices;
        if (isDeepSearch) {
            matchingIndices = new Set();
            if (!parsedData || !currentPrompts) return;
            currentPrompts.forEach((prompt, promptIndex) => {
                let found = false;
                if (prompt.text && prompt.text.toLowerCase().includes(term)) {
                    matchingIndices.add(promptIndex);
                    found = true;
                }
                if (!found) {
                    for (let i = prompt.originalIndex + 1; i < parsedData.chunkedPrompt.chunks.length; i++) {
                        const chunk = parsedData.chunkedPrompt.chunks[i];
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
            const isVisible = isDeepSearch ? matchingIndices.has(index) : item.title.toLowerCase().includes(term);
            item.style.display = isVisible ? 'block' : 'none';
        });
    }

    function getCleanJSON() {
        if (!parsedData || !parsedData.chunkedPrompt?.chunks) return null;
        return parsedData.chunkedPrompt.chunks.map(chunk => {
            if (chunk.inlineData) {
                return {
                    role: chunk.role,
                    inlineImage: "Image data omitted."
                };
            }
            if (chunk.driveDocument) {
                return {
                    role: chunk.role,
                    driveDocument: `File ID: ${chunk.driveDocument.id}`
                };
            }
            if (chunk.driveImage) {
                return {
                    role: chunk.role,
                    driveImage: `File ID: ${chunk.driveImage.id}`
                };
            }
            return {
                role: chunk.role,
                text: chunk.text
            };
        });
    }

    function processData() {
        fillMetadata();
        metadataPanel.classList.remove('hidden');
        // If collapseMetadataByDefault is true (Open), remove 'collapsed'. If false (Shut), add 'collapsed'.
        metadataBody.classList.toggle('collapsed', !collapseMetadataByDefault);
        const icon = collapseBtn.querySelector('i');
        if (icon) icon.className = !collapseMetadataByDefault ? 'ph ph-caret-down' : 'ph ph-caret-up';

        currentPrompts = [];
        const chunks = parsedData.chunkedPrompt?.chunks || [];
        chunks.forEach((chunk, index) => {
            if (chunk.role === 'user' && (chunk.text || chunk.driveDocument || chunk.driveImage)) {
                if (index === 0 || chunks[index - 1].role !== 'user') {
                    currentPrompts.push({
                        ...chunk,
                        originalIndex: index
                    });
                }
            }
        });
        populateSidebar();
        if (currentPrompts.length > 0) renderConversation(0);
    }

    function populateSidebar() {
        const list = document.getElementById('prompt-list');
        list.innerHTML = '';
        if (currentPrompts.length === 0) {
            list.innerHTML = '<div class="empty-state-sidebar">No user prompts found</div>';
            return;
        }
        currentPrompts.forEach((p, index) => {
            const btn = document.createElement('button');
            btn.className = 'prompt-item';
            const promptText = p.text || "[Uploaded File]";
            btn.innerHTML = `<i class="ph ph-chat-circle"></i> ${truncate(promptText, 35)}`;
            btn.title = promptText;
            btn.dataset.index = index;
            btn.onclick = () => handlePromptClick(index);
            list.appendChild(btn);
        });
    }

    function handlePromptClick(index) {
        if (isScrollMode) {
            const target = document.getElementById(`msg-user-${index}`);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                setActiveSidebarItem(document.querySelector(`.prompt-item[data-index="${index}"]`));
            } else {
                renderCompleteDialog(false);
                setTimeout(() => handlePromptClick(index), 100);
            }
        } else {
            renderConversation(index);
        }
        if (window.innerWidth <= 768) toggleSidebar();
    }

    function renderConversation(promptIndex) {
        currentFocusIndex = promptIndex;
        chatStream.innerHTML = '';
        chatStream.removeAttribute('data-view');

        const userPrompt = currentPrompts[promptIndex];
        setActiveSidebarItem(document.querySelector(`.prompt-item[data-index="${promptIndex}"]`));

        let userTurnChunks = [];
        let i = userPrompt.originalIndex;
        while (i < parsedData.chunkedPrompt.chunks.length && parsedData.chunkedPrompt.chunks[i].role === 'user') {
            userTurnChunks.push(parsedData.chunkedPrompt.chunks[i]);
            i++;
        }
        chatStream.appendChild(createMessageElement(userTurnChunks, 'user'));

        for (; i < parsedData.chunkedPrompt.chunks.length; i++) {
            const chunk = parsedData.chunkedPrompt.chunks[i];
            if (chunk.role === 'model') chatStream.appendChild(createMessageElement([chunk], 'model'));
            else if (chunk.role === 'user') break;
        }
        postProcessCodeBlocks();
        scrollContainer.scrollTop = 0;
    }

    function renderCompleteDialog(isClick = true) {
        chatStream.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-faint); text-transform:uppercase; font-size:11px; font-weight:600; letter-spacing:0.05em;">Full Conversation History</div>';
        chatStream.setAttribute('data-view', 'full');

        let currentTurn = [];
        let currentRole = null;
        let userPromptCount = 0;

        parsedData.chunkedPrompt.chunks.forEach((chunk, index) => {
            let shouldFlush = false;

            if (currentTurn.length > 0) {
                if (chunk.role !== currentRole) {
                    shouldFlush = true;
                } else if (currentRole === 'model') {
                    // Split model messages if "Thought" status changes (fixes bug where response merges into thought)
                    const currentIsThought = currentTurn[0].isThought;
                    const newIsThought = chunk.isThought;
                    if (currentIsThought !== newIsThought) {
                        shouldFlush = true;
                    }
                }
            }

            if (shouldFlush) {
                let id = null;
                if (currentRole === 'user') {
                    id = `msg-user-${userPromptCount}`;
                    userPromptCount++;
                }
                chatStream.appendChild(createMessageElement(currentTurn, currentRole, id));
                currentTurn = [];
            }
            currentRole = chunk.role;
            currentTurn.push(chunk);
        });

        if (currentTurn.length > 0) {
            let id = null;
            if (currentRole === 'user') id = `msg-user-${userPromptCount}`;
            chatStream.appendChild(createMessageElement(currentTurn, currentRole, id));
        }

        postProcessCodeBlocks();
        if (isClick) {
            if (window.innerWidth <= 768) toggleSidebar();
        }
        updateActivePromptOnScroll();
    }

    const stickyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const header = entry.target.nextElementSibling;
            if (header && header.classList.contains('code-header')) {
                const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
                const isStuck = !entry.isIntersecting && entry.boundingClientRect.top < rootTop;
                header.classList.toggle('is-sticky', isStuck);
            }
        });
    }, {
        root: scrollContainer,
        threshold: 0
    });

    function createMessageElement(chunks, role, id = null) {
        const wrapper = document.createElement('div');
        wrapper.className = `message role-${role}`;
        if (id) wrapper.id = id;

        const mainChunk = chunks[0] || {};
        const isThought = mainChunk.isThought || false;
        if (isThought) {
            wrapper.classList.add('thought-message');
            if (collapseThoughts) wrapper.classList.add('collapsed');
        }

        const isUser = role === 'user';
        const iconHtml = isUser ? 'You' : (isThought ? '<i class="ph-fill ph-brain"></i> Thinking' : '<i class="ph-fill ph-sparkle"></i> Gemini');
        const totalTokens = chunks.reduce((acc, c) => acc + (c.tokenCount || 0), 0);
        const tokens = totalTokens > 0 ? `<span style="opacity:0.5; font-weight:400; margin-left:8px;">${totalTokens} tokens</span>` : '';
        const expandIcon = isThought ? `<span class="thought-icon-rotate" style="margin-left:auto;"><i class="ph ph-caret-${collapseThoughts ? 'down' : 'up'}"></i></span>` : '';

        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = isUser ? `${tokens} ${iconHtml}` : `${iconHtml} ${tokens} ${expandIcon}`;

        if (isThought) {
            header.onclick = () => {
                wrapper.classList.toggle('collapsed');
                const icon = header.querySelector('.thought-icon-rotate i');
                icon.className = wrapper.classList.contains('collapsed') ? 'ph ph-caret-down' : 'ph ph-caret-up';
            };
        }

        const tooltipTemplate = document.getElementById('message-tooltip-template');
        const tooltip = tooltipTemplate.content.cloneNode(true);
        wrapper.appendChild(tooltip);
        wrapper.appendChild(header);

        const contentWrapper = (isUser) ? document.createElement('div') : wrapper;
        if (isUser) {
            contentWrapper.className = 'user-content-wrapper';
            wrapper.appendChild(contentWrapper);
        }

        chunks.forEach(chunk => {
            let contentContainer;
            if (chunk.text || chunk.inlineData || chunk.inlineImage) {
                contentContainer = document.createElement('div');
                contentContainer.className = 'message-bubble';
                let contentHtml = '';
                if (chunk.inlineData || chunk.inlineImage) {
                    const imgData = chunk.inlineData || chunk.inlineImage;
                    const imgSrc = `data:${imgData.mimeType};base64,${imgData.data}`;
                    contentHtml = `<img src="${imgSrc}" class="inline-img" alt="Generated Image"/>`;
                } else {
                    contentHtml = marked.parse(chunk.text || '');
                }
                contentContainer.innerHTML = DOMPurify.sanitize(contentHtml, {
                    ADD_TAGS: ['img']
                });
                contentContainer.querySelectorAll('a').forEach(a => a.setAttribute('target', '_blank'));

                const img = contentContainer.querySelector('.inline-img');
                if (img) img.onclick = () => {
                    modalImg.src = img.src;
                    imageModal.classList.remove('hidden');
                };
            } else if (chunk.driveDocument || chunk.driveImage) {
                let template;
                if (chunk.driveDocument) template = document.getElementById('drive-doc-template');
                if (chunk.driveImage) template = document.getElementById('drive-image-template');

                contentContainer = template.content.cloneNode(true).firstElementChild;
                const driveId = chunk.driveDocument?.id || chunk.driveImage?.id;
                contentContainer.querySelector('.drive-id-display').textContent = truncate(driveId, 15);
                contentContainer.querySelector('.drive-id-display').title = driveId;
                contentContainer.querySelector('.open-drive-link-btn').href = `https://drive.google.com/file/d/${driveId}`;
                contentContainer.querySelector('.view-drive-file-btn').onclick = () => fetchAndDisplayDriveFileContent(driveId);
            }

            if (contentContainer) {
                contentWrapper.appendChild(contentContainer);
            }
        });

        return wrapper;
    }

    async function fetchAndDisplayDriveFileContent(driveId) {
        showLoading();
        const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${driveId}`)}`;
        abortController = new AbortController();

        try {
            const response = await fetch(proxyUrl, {
                signal: abortController.signal
            });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.startsWith('image/')) {
                const blob = await response.blob();
                modalImg.src = URL.createObjectURL(blob);
                imageModal.classList.remove('hidden');
            } else {
                const text = await response.text();
                if (text.trim().startsWith('<')) throw new Error("Private File / HTML response");

                const highlightResult = hljs.highlightAuto(text);
                const detectedLanguage = highlightResult.language || 'Plain Text';

                textViewerFilename.textContent = `Drive File: ${truncate(driveId, 15)}`;
                textViewerFilename.title = driveId;
                textViewerLangTag.textContent = detectedLanguage;
                textViewerCode.textContent = text;
                textViewerCode.className = `hljs language-${detectedLanguage}`; // Reset class
                hljs.highlightElement(textViewerCode);

                const pre = textViewerModal.querySelector('pre');
                pre.classList.toggle('wrapped', isWrapCode);

                textViewerModal.classList.remove('hidden');
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error("Fetch failed", err);
            if (err.message === "Private File / HTML response") {
                showError("Access Denied", "This file is private. You can open it in Drive to check permissions.", true, () => fetchAndDisplayDriveFileContent(driveId), driveId);
            } else {
                showError("Fetch Error", "Failed to fetch file content from Google Drive via the proxy.", false, () => fetchAndDisplayDriveFileContent(driveId), driveId);
            }
        } finally {
            hideLoading();
        }
    }


    let observerTimeout;
    const debouncedObserver = (entries) => {
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
            let intersectingPrompts = [];
            entries.forEach(entry => {
                if (entry.isIntersecting) intersectingPrompts.push(entry.target);
            });

            if (intersectingPrompts.length > 0) {
                intersectingPrompts.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                const id = intersectingPrompts[0].id;
                const index = id.split('-').pop();
                setActiveSidebarItem(document.querySelector(`.prompt-item[data-index="${index}"]`));
            }
        }, 100);
    };

    let intersectionObserver = new IntersectionObserver(debouncedObserver, {
        root: scrollContainer,
        threshold: 0.1
    });

    function updateActivePromptOnScroll() {
        intersectionObserver.disconnect();
        if (isScrollMode) {
            const userPromptsInView = document.querySelectorAll('.message.role-user[id]');
            userPromptsInView.forEach(el => intersectionObserver.observe(el));
        }
    }

    function navigateMessages(direction) {
        if (!parsedData) return;
        const messages = Array.from(document.querySelectorAll('.message'));
        if (messages.length === 0) return;

        const containerTop = scrollContainer.scrollTop;
        let currentIndex = -1;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].offsetTop >= containerTop - 20) {
                currentIndex = i;
                break;
            }
        }
        if (currentIndex === -1) currentIndex = messages.length - 1;

        let nextIndex = currentIndex + direction;

        if (nextIndex >= 0 && nextIndex < messages.length) {
            const targetMsg = messages[nextIndex];
            const isModel = targetMsg.classList.contains('role-model') && !targetMsg.classList.contains('thought-message');
            if (isModel && nextIndex > 0) {
                const prevMsg = messages[nextIndex - 1];
                if (prevMsg?.classList.contains('thought-message') && prevMsg.classList.contains('collapsed')) {
                    nextIndex += (direction === 1) ? 1 : -1;
                }
            }
        }

        if (isScrollMode) {
            if (nextIndex < 0) nextIndex = 0;
            if (nextIndex >= messages.length) nextIndex = messages.length - 1;
            messages[nextIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            if (nextIndex < 0) {
                if (currentFocusIndex > 0) {
                    renderConversation(currentFocusIndex - 1);
                    setTimeout(() => scrollContainer.scrollTo({
                        top: scrollContainer.scrollHeight,
                        behavior: 'auto'
                    }), 20);
                }
            } else if (nextIndex >= messages.length) {
                if (currentFocusIndex < currentPrompts.length - 1) renderConversation(currentFocusIndex + 1);
            } else {
                messages[nextIndex].scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    }

    // --- Metadata Helper Functions ---
    function formatSafetySettings(settingsArray) {
        if (!Array.isArray(settingsArray) || settingsArray.length === 0) return '<span style="color:var(--text-faint)">No safety settings provided.</span>';

        let html = '<div class="safety-grid">';
        settingsArray.forEach(s => {
            const category = s.category.replace('HARM_CATEGORY_', '').replace(/_/g, ' ');
            const threshold = s.threshold || 'UNKNOWN';

            let badgeClass = 'off';
            if (threshold.includes('BLOCK_NONE')) badgeClass = 'block-none';
            else if (threshold.includes('BLOCK_ONLY_HIGH')) badgeClass = 'block-high';
            else if (threshold.includes('BLOCK_MEDIUM')) badgeClass = 'block-med';
            else if (threshold.includes('BLOCK_LOW')) badgeClass = 'block-low';

            const readableThreshold = threshold.replace('BLOCK_', '').replace(/_/g, ' ');

            html += `
                <div class="safety-card">
                    <span class="safety-category">${category}</span>
                    <span class="safety-badge ${badgeClass}">${readableThreshold}</span>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    function fillMetadata() {
        const settings = parsedData.runSettings || {};
        let settingsHtml = '';

        if (Object.keys(settings).length === 0) {
            settingsHtml = '<p style="color:var(--text-faint)">No settings found.</p>';
        } else {
            Object.entries(settings).forEach(([k, v]) => {
                if (k === 'safetySettings') {
                    settingsHtml += `
                        <div style="padding:12px 0; border-bottom:1px solid var(--border-subtle);">
                            <span style="color:var(--text-muted); font-weight:500;">safetySettings</span>
                            ${formatSafetySettings(v)}
                        </div>`;
                } else {
                    settingsHtml += `
                        <div class="meta-item">
                            <span class="meta-key">${k}</span>
                            <span class="meta-value">${typeof v === 'object' ? JSON.stringify(v) : v}</span>
                        </div>`;
                }
            });
        }

        document.getElementById('tab-run-settings').innerHTML = settingsHtml;

        const sys = parsedData.systemInstruction;
        let sysText = sys ? (sys.text || (sys.parts ? sys.parts.map(p => p.text).join('\n') : '')) : '';
        document.getElementById('tab-system').innerHTML = sysText ? marked.parse(sysText) : '<p style="color:var(--text-faint)">No instructions found.</p>';

        const cites = parsedData.citations || [];
        const citesHtml = cites.map(c => `<li><a href="${c.uri}" target="_blank" style="color:var(--accent-primary)">${c.uri}</a></li>`).join('');
        document.getElementById('tab-citations').innerHTML = citesHtml ? `<ul>${citesHtml}</ul>` : '<p style="color:var(--text-faint)">No citations found.</p>';
    }

    function showLoading() {
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    function updatePersistedCodeState(blockId, isCollapsed) {
        const key = `code_states_${currentFileName}`;
        let states = JSON.parse(localStorage.getItem(key) || '{}');
        states[blockId] = isCollapsed;
        localStorage.setItem(key, JSON.stringify(states));
    }

    function postProcessCodeBlocks() {
        const persistedStates = preserveCodeState ? JSON.parse(localStorage.getItem(`code_states_${currentFileName}`) || '{}') : {};
        
        document.querySelectorAll('pre code').forEach((block, idx) => {
            if (block.id === 'text-viewer-code') return;

            hljs.highlightElement(block);

            let lang = 'Plain Text';
            const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');

            if (lang === 'undefined') lang = 'Unknown Language';

            const pre = block.parentElement;
            if (pre.parentElement.classList.contains('code-block-wrapper')) return;

            const blockId = `b-${idx}`;
            const isCollapsed = persistedStates[blockId] === true;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            wrapper.dataset.blockId = blockId;
            if (isCollapsed) wrapper.classList.add('collapsed');

            const sentinel = document.createElement('div');
            sentinel.className = 'sticky-sentinel';

            const iconClass = isCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <div class="code-title-group">
                    <button class="collapse-code-btn" title="Toggle Code">
                        <i class="${iconClass}"></i>
                    </button>
                    <span class="lang-tag">${lang}</span>
                </div>
                <button class="copy-btn"><i class="ph ph-copy"></i> Copy</button>
            `;

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(sentinel);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);

            if (isWrapCode) pre.classList.add('wrapped');

            stickyObserver.observe(sentinel);

            header.querySelector('.copy-btn').addEventListener('click', () => navigator.clipboard.writeText(block.textContent).then(() => showToast("Copied to clipboard")));
            const collapseBtn = header.querySelector('.collapse-code-btn');
            collapseBtn.addEventListener('click', () => {
                const nowCollapsed = wrapper.classList.toggle('collapsed');
                const icon = collapseBtn.querySelector('i');
                icon.className = nowCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down';
                
                if (preserveCodeState) {
                    updatePersistedCodeState(blockId, nowCollapsed);
                }
            });
        });
    }

    function showToast(msg) {
        toastMsg.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function setActiveSidebarItem(el) {
        document.querySelectorAll('.prompt-item, .nav-item, .recent-file-item').forEach(e => e.classList.remove('active'));
        if (el) el.classList.add('active');
    }

    function truncate(str, n) {
        return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
    }
});