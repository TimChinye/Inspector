/* global marked, DOMPurify, hljs */
import { prefs, CODE_THEMES } from './settings.js';
import { truncate, showToast, updateUrl, getUrl } from './utils.js';
import { fetchProxyContent, fetchProxyBlob } from './drive.js';

const driveAccessRegistry = JSON.parse(localStorage.getItem('driveAccessRegistry') || '{}');

function saveAccess(id, status) {
    driveAccessRegistry[id] = status;
    localStorage.setItem('driveAccessRegistry', JSON.stringify(driveAccessRegistry));
    
    // Update all matching dots currently in the DOM
    document.querySelectorAll(`.status-dot[data-id="${id}"]`).forEach(dot => {
        dot.classList.remove('accessible', 'inaccessible');
        dot.classList.add(status);
    });
}

let currentViewingText = ""; // State for manual language updates
let currentFileRecordId = null;
let selectedHistoryIds = new Set();
let _historyHandlers = {};

export function setCurrentFileRecordId(id) {
    currentFileRecordId = id;
}

function formatMessageTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const format = prefs.timeFormat || 'default';

    if (format === 'relative') {
        const diff = Math.floor((now - date) / 1000);
        if (diff < 0) return 'future';
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    if (format === 'full') return date.toISOString();

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');

    const showYear = year !== now.getFullYear();

    if (format === '12h') {
        let h = date.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        const timeStr = `${h.toString().padStart(2, '0')}:${mins} ${ampm}`;
        return `${month}/${day}${showYear ? '/' + year : ''} ${timeStr}`;
    }

    if (format === '24h') {
        return `${year}-${month}-${day} ${hours}:${mins}`;
    }

    // Default: mm dd, hh:mm
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[date.getMonth()];
    return `${monthName} ${day}${showYear ? ', ' + year : ''}, ${hours}:${mins}`;
}

function getExtensionFromMime(mime) {
    if (!mime || mime === 'application/octet-stream' || mime === 'text/plain') {
        // Best guess based on common ambiguous types
        if (mime === 'text/plain') return 'txt';
        return 'file'; 
    }

    // Helper to get display extension
    if (mime.includes('quicktime')) return 'mov';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('png')) return 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('text/plain')) return 'txt';
    if (mime.startsWith('audio/')) return mime.split('/')[1] || 'audio';
    if (mime.startsWith('video/')) return mime.split('/')[1] || 'video';
    return mime.split('/')[1] || 'bin';
}

function detectLanguageFromExtension(ext) {
    if (!ext) return 'plaintext';
    const map = {
        'cs': 'csharp', 'csharp': 'csharp',
        'js': 'javascript', 'javascript': 'javascript', 'jsx': 'javascript', 'user.js': 'javascript',
        'xml': 'xml', 'html': 'xml', 'xhtml': 'xml',
        'py': 'python', 'python': 'python',
        'css': 'css',
        'scss': 'css', 'less': 'css',
        'json': 'json',
        'md': 'markdown', 'markdown': 'markdown',
        'sh': 'bash', 'bash': 'bash', 'zsh': 'bash',
        'csv': 'plaintext', 'txt': 'plaintext'
    };
    
    // If not in map, guess the extension name is the language name
    return map[ext.toLowerCase()] || ext.toLowerCase();
}

let themePreviewTimeout = null;
let lastPreviewedTheme = null;
let previewShadowRoot = null;
let previewLang = "javascript";

const PREVIEW_CODE_SAMPLES = {
    javascript: `function greet(name) {\n  const message = \`Hello, \${name}!\`;\n  // A simple comment\n  return message;\n}\n\nconsole.log(greet("Inspector"));`,
    python: `import math\n\ndef calculate_area(radius):\n    """Calculates the area of a circle."""\n    return math.pi * radius ** 2\n\n# Calculate and print\nprint(f"Area: {calculate_area(5):.2f}")`,
    json: `{\n  "model": "gemini-1.5-pro",\n  "temperature": 0.7,\n  "safe": true\n}`
};

// --- DOM Elements ---
const els = {
    chatStream: document.getElementById('chat-stream'),
    scrollContainer: document.getElementById('scroll-container'),
    loading: document.getElementById('loading-overlay'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    filenameDisplay: document.getElementById('filename-display'),
    
    // History
    recentList: document.getElementById('recent-files-list'),
    pinnedList: document.getElementById('pinned-files-list'),
    historySection: document.getElementById('history-section'),
    
    // Metadata
    metaPanel: document.getElementById('metadata-panel'),
    metaBody: document.getElementById('metadata-body'),
    collapseBtn: document.querySelector('.collapse-btn'),
    
    // Modals
    imageModal: document.getElementById('image-modal'),
    modalImg: document.getElementById('modal-img'),
    textViewerModal: document.getElementById('text-viewer-modal'),
    textViewerCode: document.getElementById('text-viewer-code'),
    mediaModal: document.getElementById('media-modal'),
    mediaPlayerModal: document.getElementById('media-player-modal'),
    mediaPlayerContainer: document.getElementById('media-player-container'),
    genericModal: document.getElementById('generic-modal')
};

// --- Initialization & Settings Controls ---
export function initAllUI() {
    try {
        initSettingsUI();
        initHistoryUI();
        initNavUI();
        initCodeThemeUI();
        initTimeFormatUI();
        initModals();
    } catch (e) {
        console.error("Critical Initialization Error:", e);
    }
}

function initSettingsUI() {
    // Width Slider
    const widthSlider = document.getElementById('widthSlider');
    if (widthSlider) {
        widthSlider.value = prefs.contentWidth;
        widthSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            document.documentElement.style.setProperty('--content-width', `${val}px`);
            localStorage.setItem('contentWidth', val);
        });
    }

    // --- Toggles ---
    
    // Helper for simple boolean toggles
    const setupSimpleToggle = (id, prefKey, storageKey, onChange) => {
        const el = document.getElementById(id);
        if (!el) return; // Prevent crash if element is missing
        
        const sKey = storageKey || prefKey;
        el.checked = prefs[prefKey];
        el.addEventListener('change', (e) => {
            prefs[prefKey] = e.target.checked;
            localStorage.setItem(sKey, JSON.stringify(e.target.checked));
            if(onChange) onChange(e.target.checked);
        });
    };

    // Auto Restore
    setupSimpleToggle('autoRestoreToggle', 'openLastFileOnStartup', 'autoRestore');
    setupSimpleToggle('autoRestoreContent', 'autoRestoreContent', 'autoRestoreContent');

    // Thinking Mode Initial State (Event handled in app.js for re-rendering)
    const thinkingToggle = document.getElementById('thinkingModeToggle');
    if (thinkingToggle) {
        thinkingToggle.checked = !prefs.collapseThoughts; 
    }

    // Metadata Toggle
    const metaToggle = document.getElementById('metadataCollapseToggle');
    if (metaToggle) {
        metaToggle.checked = !prefs.collapseMetadataByDefault;
        metaToggle.addEventListener('change', (e) => {
            prefs.collapseMetadataByDefault = !e.target.checked;
            localStorage.setItem('collapseMetadata', JSON.stringify(prefs.collapseMetadataByDefault));
            
            // Apply immediately
            els.metaBody.classList.toggle('collapsed', prefs.collapseMetadataByDefault);
            const icon = els.collapseBtn.querySelector('i');
            if (icon) icon.className = prefs.collapseMetadataByDefault ? 'ph ph-caret-down' : 'ph ph-caret-up';
        });
    }

    // Code State Persistence
    setupSimpleToggle('codePersistenceToggle', 'preserveCodeState', 'preserveCodeState', (checked) => {
        if (!checked) {
            const currentFile = els.filenameDisplay.textContent;
            if (currentFile && currentFile !== 'No file loaded') {
                localStorage.removeItem(`code_states_${currentFile}`);
            }
        }
    });

    setupSimpleToggle('scrollableCodeToggle', 'isScrollableCode', 'scrollableCode', (checked) => {
        document.body.classList.toggle('scrollable-codeblocks', checked);
    });

    setupSimpleToggle('wrapCodeToggle', 'isWrapCode', 'wrapCode', (checked) => {
        document.body.classList.toggle('wrap-codeblocks', checked);
    });

    // Toggle All Code Action
    const toggleCodeBtn = document.getElementById('toggleAllCodeAction');
    if (toggleCodeBtn) {
        toggleCodeBtn.addEventListener('click', () => {
            const wrappers = document.querySelectorAll('.code-block-wrapper');
            if (wrappers.length === 0) return;
            const anyExpanded = Array.from(wrappers).some(w => !w.classList.contains('collapsed'));
            
            wrappers.forEach(w => {
                const shouldCollapse = anyExpanded;
                w.classList.toggle('collapsed', shouldCollapse);
                const icon = w.querySelector('.collapse-code-btn i');
                if (icon) icon.className = shouldCollapse ? 'ph ph-caret-right' : 'ph ph-caret-down';
                
                if (prefs.preserveCodeState && w.dataset.blockId) {
                    const filename = els.filenameDisplay.textContent;
                    const key = `code_states_${filename}`;
                    let states = JSON.parse(localStorage.getItem(key) || '{}');
                    states[w.dataset.blockId] = shouldCollapse;
                    localStorage.setItem(key, JSON.stringify(states));
                }
            });
        });
    }
}

function initHistoryUI() {
    const miniTabs = document.querySelectorAll('.mini-tab');
    const historyViews = document.querySelectorAll('.history-view');
    
    miniTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            miniTabs.forEach(t => t.classList.remove('active'));
            historyViews.forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            const targetId = `view-${tab.dataset.target}`;
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.classList.add('active');
        });
    });
}

function initNavUI() {
    // Scroll Widget
    const btnTop = document.getElementById('scroll-top');
    const btnBottom = document.getElementById('scroll-bottom');
    const btnNext = document.getElementById('scroll-next');
    const btnPrev = document.getElementById('scroll-prev');
    
    if(btnTop) btnTop.addEventListener('click', () => els.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' }));
    if(btnBottom) btnBottom.addEventListener('click', () => els.scrollContainer.scrollTo({ top: els.scrollContainer.scrollHeight, behavior: 'smooth' }));
    
    if(btnNext) btnNext.addEventListener('click', () => navigateMessages(1));
    if(btnPrev) btnPrev.addEventListener('click', () => navigateMessages(-1));
}

let _appState;
let _renderConversation;

export function setNavigationContext(state, renderConversation) {
    _appState = state;
    _renderConversation = renderConversation;
}

function navigateMessages(direction) {
    if (!_appState.parsedData) return;
    const messages = Array.from(document.querySelectorAll('.message'));
    if (messages.length === 0) return;

    const sc = els.scrollContainer;
    const containerTop = sc.scrollTop;
    const isAtBottom = Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) < 5;

    let currentIndex = -1;
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].offsetTop >= containerTop - 20) {
            currentIndex = i;
            break;
        }
    }
    if (currentIndex === -1) currentIndex = messages.length - 1;

    if (direction === 1 && isAtBottom) {
        currentIndex = messages.length - 1;
    }

    let nextIndex = currentIndex + direction;

    if (nextIndex >= 0 && nextIndex < messages.length) {
        const targetMsg = messages[nextIndex];
        const isModel = targetMsg.classList.contains('role-model') && !targetMsg.classList.contains('thought-message');
        if (isModel && nextIndex > 0) {
            const prevMsg = messages[nextIndex - 1];
            if (prevMsg?.classList.contains('thought-message') && prevMsg.classList.contains('collapsed')) {
                nextIndex += direction;
            }
        }
    }

    if (prefs.isScrollMode) {
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= messages.length) nextIndex = messages.length - 1;
        messages[nextIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    } else {
        if (nextIndex < 0) {
            if (_appState.focusIndex > 0) {
                const prevIdx = _appState.focusIndex - 1;
                if (typeof _renderConversation === 'function') _renderConversation(prevIdx);
                else if (_renderConversation && _renderConversation.onPromptClick) _renderConversation.onPromptClick(prevIdx);

                setTimeout(() => els.scrollContainer.scrollTo({
                    top: els.scrollContainer.scrollHeight,
                    behavior: 'auto'
                }), 20);
            }
        } else if (nextIndex >= messages.length) {
            if (_appState.focusIndex < _appState.currentPrompts.length - 1) {
                const nextIdx = _appState.focusIndex + 1;
                if (typeof _renderConversation === 'function') _renderConversation(nextIdx);
                else if (_renderConversation && _renderConversation.onPromptClick) _renderConversation.onPromptClick(nextIdx);
            }
        } else {
            messages[nextIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
}

function initCodeThemeUI() {
    const wrapper = document.getElementById('codeThemeWrapper');
    const options = document.getElementById('codeThemeOptions');
    const currentNameEl = document.getElementById('currentThemeName');
    const trigger = document.getElementById('codeThemeTrigger');
    const previewContainer = document.getElementById('theme-preview-container');
    const mainStylesheet = document.getElementById('highlight-stylesheet');

    if (!wrapper || !options || !currentNameEl || !previewContainer) return;

    function applyCodeTheme(themeValue) {
        prefs.codeTheme = themeValue;
        const themeObj = CODE_THEMES.find(t => t.value === themeValue);
        if (themeObj) currentNameEl.textContent = themeObj.name;

        mainStylesheet.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${themeValue}.min.css`;
        localStorage.setItem('codeTheme', themeValue);

        Array.from(options.children).forEach(child => {
            child.classList.toggle('selected', child.dataset.value === themeValue);
        });
    }

    function hideThemePreview() {
        previewContainer.classList.remove('visible');
        setTimeout(() => {
            if (!previewContainer.classList.contains('visible')) {
                previewContainer.classList.add('hidden');
                lastPreviewedTheme = null; // Reset for next time
            }
        }, 200);
    }

    function showThemePreview(themeValue) {
        clearTimeout(themePreviewTimeout);

        if (lastPreviewedTheme === themeValue && previewContainer.classList.contains('visible')) return;
        lastPreviewedTheme = themeValue;

        const rect = wrapper.getBoundingClientRect();
        previewContainer.style.top = `${rect.top}px`;
        previewContainer.style.left = `${rect.right + 12}px`;

        const styleUrl = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${themeValue}.min.css`;

        const dropdownCss = `
            .lang-select-wrapper { position: relative; margin-top: 8px; user-select: none; }
            .lang-select-trigger { background: var(--bg-surface, #fff); color: var(--text-main, #000); border: 1px solid var(--border-subtle, #ccc); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
            .lang-options { display: none; position: absolute; top: 100%; left: 0; width: 100%; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #ccc); border-radius: 4px; z-index: 10; margin-top: 2px; }
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
                code.hljs { padding: 0; }
                ${dropdownCss}
            </style>
            <div class="preview-box">
                <pre class="${prefs.isWrapCode ? 'wrapped' : ''}"><code class="hljs language-${previewLang}"></code></pre>
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

        const langTrigger = previewShadowRoot.querySelector('.lang-select-trigger');
        const langOptions = previewShadowRoot.querySelector('.lang-options');
        langTrigger.addEventListener('click', () => langOptions.classList.toggle('open'));

        previewShadowRoot.querySelectorAll('.lang-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                previewLang = e.target.dataset.val;
                lastPreviewedTheme = null; // Force refresh
                showThemePreview(themeValue);
            });
        });

        previewContainer.classList.remove('hidden');
        requestAnimationFrame(() => previewContainer.classList.add('visible'));
    }
    
    // --- Setup ---
    options.innerHTML = '';
    const initial = CODE_THEMES.find(t => t.value === prefs.codeTheme);
    if(initial) currentNameEl.textContent = initial.name;

    CODE_THEMES.forEach(t => {
        const div = document.createElement('div');
        div.className = 'custom-option';
        div.textContent = t.name;
        div.dataset.value = t.value;
        if (t.value === prefs.codeTheme) div.classList.add('selected');

        div.addEventListener('click', () => applyCodeTheme(t.value));
        div.addEventListener('mouseenter', () => showThemePreview(t.value));
        
        options.appendChild(div);
    });

    if (!previewShadowRoot) {
        previewShadowRoot = previewContainer.attachShadow({ mode: 'open' });
    }

    wrapper.addEventListener('mouseenter', () => clearTimeout(themePreviewTimeout));
    previewContainer.addEventListener('mouseenter', () => clearTimeout(themePreviewTimeout));
    wrapper.addEventListener('mouseleave', () => themePreviewTimeout = setTimeout(hideThemePreview, 300));
    previewContainer.addEventListener('mouseleave', () => themePreviewTimeout = setTimeout(hideThemePreview, 300));

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        if (isOpen) {
            const selected = options.querySelector('.selected');
            if (selected) showThemePreview(selected.dataset.value);
        } else {
            hideThemePreview();
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target) && !previewContainer.contains(e.target)) {
            wrapper.classList.remove('open');
            hideThemePreview();
        }
    });
}

function initTimeFormatUI() {
    const wrapper = document.getElementById('timeFormatWrapper');
    const options = document.getElementById('timeFormatOptions');
    const currentNameEl = document.getElementById('currentTimeFormatName');
    const trigger = document.getElementById('timeFormatTrigger');

    if (!wrapper || !options || !currentNameEl || !trigger) return;

    const names = {
        'default': 'Default',
        '12h': '12-hour',
        '24h': '24-hour',
        'relative': 'Relative',
        'full': 'Full (ISO)'
    };

    function applyTimeFormat(val) {
        prefs.timeFormat = val;
        currentNameEl.textContent = names[val] || 'Default';
        localStorage.setItem('timeFormat', val);

        Array.from(options.children).forEach(child => {
            child.classList.toggle('selected', child.dataset.value === val);
        });

        // Re-render if conversation is loaded
        if (_appState && _appState.parsedData) {
            if (prefs.isScrollMode) {
                 renderFullConversation(_appState.parsedData, _appState.currentPrompts, _appState.pendingInputs);
            } else {
                 renderConversation(_appState.parsedData, _appState.focusIndex, _appState.currentPrompts, _appState.pendingInputs);
            }
        }
    }

    currentNameEl.textContent = names[prefs.timeFormat] || 'Default';
    Array.from(options.children).forEach(child => {
        child.classList.toggle('selected', child.dataset.value === prefs.timeFormat);
        child.addEventListener('click', () => {
            applyTimeFormat(child.dataset.value);
            wrapper.classList.remove('open');
        });
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
}

function initModals() {
    // Image Modal
    const closeImgBtn = document.getElementById('close-image-modal-btn');
    if (closeImgBtn) closeImgBtn.addEventListener('click', () => els.imageModal.classList.add('hidden'));
    
    if(els.imageModal) {
        els.imageModal.addEventListener('click', (e) => {
            if(e.target === els.imageModal) els.imageModal.classList.add('hidden');
        });
    }

    const downloadImgBtn = document.getElementById('download-image-btn');
    if (downloadImgBtn) {
        downloadImgBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = els.modalImg.src;
            a.download = `image_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // Text Viewer Modal
    const closeTextBtn = document.getElementById('close-text-viewer-btn');
    if (closeTextBtn) closeTextBtn.addEventListener('click', () => els.textViewerModal.classList.add('hidden'));
    
    if (els.textViewerModal) {
        els.textViewerModal.addEventListener('click', (e) => {
            if(e.target === els.textViewerModal) els.textViewerModal.classList.add('hidden');
        });
    }

    const copyTextBtn = document.getElementById('copy-viewer-btn');
    if (copyTextBtn) {
        copyTextBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(els.textViewerCode.textContent).then(() => showToast("Copied to clipboard"));
        });
    }

    // Media Gallery Modal
    const closeMediaBtn = document.getElementById('close-media-btn');
    if (closeMediaBtn) closeMediaBtn.addEventListener('click', () => els.mediaModal.classList.add('hidden'));
    
    if (els.mediaModal) {
        els.mediaModal.addEventListener('click', (e) => {
            if(e.target === els.mediaModal) els.mediaModal.classList.add('hidden');
        });
    }

    // Media Player Modal
    const closePlayerBtn = document.getElementById('close-media-player-btn');
    if (closePlayerBtn) {
        closePlayerBtn.addEventListener('click', () => {
            els.mediaPlayerModal.classList.add('hidden');
            els.mediaPlayerContainer.innerHTML = ''; // Stop playback
        });
    }
    
    if (els.mediaPlayerModal) {
        els.mediaPlayerModal.addEventListener('click', (e) => {
            if (e.target === els.mediaPlayerModal) {
                els.mediaPlayerModal.classList.add('hidden');
                els.mediaPlayerContainer.innerHTML = ''; // Stop playback
            }
        });
    }

    // Generic Modal
    if(els.genericModal) {
        els.genericModal.addEventListener('click', (e) => {
            if(e.target === els.genericModal) els.genericModal.classList.add('hidden');
        });
    }
    
    // Metadata Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            
            const target = document.getElementById(btn.dataset.tab);
            if(target) target.classList.add('active');
            
            console.log("2-Click")
            if(els.metaBody.classList.contains('collapsed')) {
                els.metaBody.classList.remove('collapsed');
                els.collapseBtn.querySelector('i').className = 'ph ph-caret-up';
            }
        });
    });
    
    const langTag = document.getElementById('text-viewer-lang-tag');
    if (langTag) {
        langTag.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                langTag.blur();
            }
        });
        langTag.addEventListener('blur', () => {
            const newLang = detectLanguageFromExtension(langTag.textContent.trim());
            if (currentViewingText && newLang) {
                try {
                    const result = window.hljs.highlight(currentViewingText, { language: newLang, ignoreIllegals: true });
                    els.textViewerCode.innerHTML = result.value;
                    els.textViewerCode.className = `hljs language-${newLang}`;
                } catch (e) {
                    console.error("Manual highlight failed", e);
                }
            }
        });
    }
    
    // Metadata Header Click to Toggle
    const metaHeader = document.getElementById('metadata-header');
    if (metaHeader) {
        metaHeader.addEventListener('click', (e) => {
            console.log("3-Click")
            if (e.target.closest('.tab-btn')) return;
            els.metaBody.classList.toggle('collapsed');
            const icon = els.collapseBtn.querySelector('i');
            icon.className = els.metaBody.classList.contains('collapsed') ? 'ph ph-caret-down' : 'ph ph-caret-up';
        });
    }
}

// --- Main UI Exported Functions ---

/**
 * Generic Modal System
 * @param {Object} config
 * @param {string} config.title - Header title
 * @param {string} config.message - Body text or HTML
 * @param {string} config.headerColor - CSS background color for header
 * @param {string} config.iconClass - Phosphor icon class for header
 * @param {Object} config.primaryBtn - { text, onClick, className, href, target }
 * @param {Object} config.secondaryBtn - { text, onClick, className }
 * @param {Object} config.dismissBtn - { text, onClick }
 * @param {Element} config.extraContent - Optional DOM element to inject into body
 */
export function showModal(config) {
    const modal = els.genericModal;
    const header = modal.querySelector('.error-header');
    const title = header.querySelector('span');
    const icon = header.querySelector('i');
    const bodyText = document.getElementById('modal-message-text');
    const extraContainer = document.getElementById('modal-extra-content');
    const footer = document.getElementById('modal-footer');

    // Reset
    extraContainer.innerHTML = '';
    extraContainer.classList.add('hidden');
    footer.innerHTML = '';

    // Set Header
    title.textContent = config.title || 'Notification';
    header.style.backgroundColor = config.headerColor || 'var(--accent-surface)';
    if (config.iconClass) icon.className = config.iconClass;
    else icon.className = 'ph-fill ph-warning-circle';

    // Set Body
    bodyText.innerHTML = config.message || '';
    if (config.extraContent) {
        extraContainer.appendChild(config.extraContent);
        extraContainer.classList.remove('hidden');
    }

    // Footer Buttons Logic
    // Rule:
    // 1 Button: Secondary Left (Dismiss)
    // 2 Buttons: Secondary Left (Dismiss), Primary Right
    // 3 Buttons: Secondary Left (Dismiss), Primary Centre, Secondary Right

    // Left: Dismiss (Always there)
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn-sm btn-secondary';
    dismissBtn.textContent = (config.dismissBtn && config.dismissBtn.text) || 'Dismiss';
    dismissBtn.onclick = () => {
        modal.classList.add('hidden');
        if (config.dismissBtn && config.dismissBtn.onClick) config.dismissBtn.onClick();
    };
    footer.appendChild(dismissBtn);

    const primary = config.primaryBtn;
    const secondary = config.secondaryBtn;

    if (primary && secondary) {
        // 3 Buttons: [Dismiss Left] [Primary Center] [Secondary Right]
        const centerBtn = (primary.href) ? document.createElement('a') : document.createElement('button');
        centerBtn.className = primary.className || 'btn btn-sm btn-primary';
        centerBtn.classList.add('btn-centered');
        centerBtn.innerHTML = primary.text;
        if (primary.href) {
            centerBtn.href = primary.href;
            centerBtn.target = primary.target || '_blank';
        }
        centerBtn.onclick = (e) => {
            let shouldClose = !primary.href;
            if (primary.onClick) {
                const result = primary.onClick(e);
                if (result === false) shouldClose = false;
            }
            if (shouldClose) modal.classList.add('hidden');
        };

        const rightBtn = (secondary.href) ? document.createElement('a') : document.createElement('button');
        rightBtn.className = secondary.className || 'btn btn-sm btn-secondary';
        rightBtn.innerHTML = secondary.text;
        if (secondary.href) {
            rightBtn.href = secondary.href;
            rightBtn.target = secondary.target || '_blank';
        }
        rightBtn.onclick = (e) => {
            let shouldClose = !secondary.href;
            if (secondary.onClick) {
                const result = secondary.onClick(e);
                if (result === false) shouldClose = false;
            }
            if (shouldClose) modal.classList.add('hidden');
        };

        footer.appendChild(centerBtn);
        footer.appendChild(rightBtn);
    } else if (primary || secondary) {
        // 2 Buttons: [Dismiss Left] [Primary or Secondary Right]
        const btnConfig = primary || secondary;
        // User says 2 buttons: Secondary Left, Primary Right.
        // So if we only have one action button, it should be Primary.
        const btn = (btnConfig.href) ? document.createElement('a') : document.createElement('button');
        btn.className = btnConfig.className || 'btn btn-sm btn-primary';
        btn.innerHTML = btnConfig.text;
        if (btnConfig.href) {
            btn.href = btnConfig.href;
            btn.target = btnConfig.target || '_blank';
        }
        btn.onclick = (e) => {
            let shouldClose = !btnConfig.href;
            if (btnConfig.onClick) {
                const result = btnConfig.onClick(e);
                if (result === false) shouldClose = false;
            }
            if (shouldClose) modal.classList.add('hidden');
        };
        footer.appendChild(btn);
    }

    modal.classList.remove('hidden');
}

export function showLoading() { els.loading.classList.remove('hidden'); }
export function hideLoading() { els.loading.classList.add('hidden'); }

export function toggleSidebar() {
    if (window.innerWidth <= 768) {
        // Mobile: Overlay Drawer
        els.sidebar.classList.toggle('open');
        els.sidebarOverlay.classList.toggle('open');
    } else {
        // Desktop: Push/Collapse
        els.sidebar.classList.toggle('collapsed');
    }
}

export function updateRenamingUI(name, driveId = null) {
    const nameToDisplay = name || 'No file loaded';
    els.filenameDisplay.textContent = truncate(nameToDisplay, 64);
    els.filenameDisplay.title = nameToDisplay;

    const wrapper = document.querySelector('.filename-wrapper');
    const scrapeBtn = document.getElementById('scrape-name-btn');
    const container = document.getElementById('file-info-container');
    const popover = document.getElementById('file-info-popover');
    const openBtn = document.getElementById('open-in-ai-studio-btn');
    const copyBtn = document.getElementById('copy-file-id-btn');

    if (nameToDisplay === 'No file loaded') {
        wrapper.classList.add('is-empty');
    } else {
        wrapper.classList.remove('is-empty');
    }

    scrapeBtn.classList.toggle('hidden', !driveId);

    if (driveId && typeof driveId === 'string') {
        container.classList.add('has-id');
        popover.classList.remove('hidden');
        
        openBtn.href = `https://aistudio.google.com/app/prompts/${driveId}`;
        openBtn.title = `https://aistudio.google.com/app/prompts/${driveId}`;
        
        // Remove old listener to prevent duplicates
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        newCopyBtn.title = driveId;
        
        newCopyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(driveId).then(() => showToast("ID copied to clipboard"));
        });
    } else {
        container.classList.remove('has-id');
        popover.classList.add('hidden');
    }
}

export function setupRenamingUI(onRename, onScrape) {
    const filenameInput = document.getElementById('filename-input');
    const scrapeBtn = document.getElementById('scrape-name-btn');

    els.filenameDisplay.addEventListener('click', () => {
        if (els.filenameDisplay.textContent === 'No file loaded') return;
        filenameInput.value = els.filenameDisplay.title; // Use full title for editing
        els.filenameDisplay.classList.add('hidden');
        filenameInput.classList.remove('hidden');
        filenameInput.focus();
    });

    filenameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const newName = filenameInput.value.trim();
            if (newName && newName !== els.filenameDisplay.title) {
                onRename(newName);
            }
            revert();
        } else if (e.key === 'Escape') {
            revert();
        }
    });

    filenameInput.addEventListener('blur', revert);

    function revert() {
        els.filenameDisplay.classList.remove('hidden');
        filenameInput.classList.add('hidden');
    }

    scrapeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onScrape();
    });
}

export function showConflictResolver(targetName, existingFile, currentFileName, onRenameAnyways, onRenameBoth, onCancel) {
    const container = document.createElement('div');
    container.className = 'conflict-resolver-container';

    container.innerHTML = `
        <div id="conflict-initial-actions" class="flex-column gap-10">
            <button id="resolve-conflicts-trigger" class="btn btn-primary w-full">Resolve Conflicts</button>
            <button id="rename-anyways-btn" class="btn btn-secondary w-full">Rename Anyways</button>
        </div>
        <div id="conflict-resolver-expandable" class="hidden mt-15">
            <div class="conflict-input-group">
                <label class="input-label" for="other-filename-input">New name for the other file:</label>
                <input type="text" id="other-filename-input" class="filename-input mb-10 w-full" spellcheck="false">

                <label class="input-label" for="current-filename-input">New name for this current file:</label>
                <input type="text" id="current-filename-input" class="filename-input mb-15 w-full" spellcheck="false">
            </div>
            <div class="conflict-resolution-actions flex-column gap-10">
                <button id="rename-both-btn" class="btn btn-primary w-full">Rename Both</button>
                <button id="open-conflicting-btn" class="btn btn-secondary w-full">
                    <i class="ph ph-arrow-square-out"></i> Open conflicting file
                </button>
            </div>
        </div>
    `;

    const resolveTrigger = container.querySelector('#resolve-conflicts-trigger');
    const renameAnywaysBtn = container.querySelector('#rename-anyways-btn');
    const expandable = container.querySelector('#conflict-resolver-expandable');
    const initialActions = container.querySelector('#conflict-initial-actions');

    const otherInput = container.querySelector('#other-filename-input');
    const currentInput = container.querySelector('#current-filename-input');
    const renameBothBtn = container.querySelector('#rename-both-btn');
    const openConflictingBtn = container.querySelector('#open-conflicting-btn');

    resolveTrigger.onclick = () => {
        initialActions.classList.add('hidden');
        expandable.classList.remove('hidden');

        otherInput.placeholder = existingFile.name;
        otherInput.value = '';
        currentInput.placeholder = currentFileName;
        currentInput.value = targetName;

        setTimeout(() => currentInput.focus(), 50);
    };

    renameAnywaysBtn.onclick = () => {
        document.getElementById('generic-modal').classList.add('hidden');
        onRenameAnyways();
    };

    renameBothBtn.onclick = () => {
        const otherNewName = otherInput.value.trim() || existingFile.name;
        const currentNewName = currentInput.value.trim() || currentFileName;
        if (otherNewName && currentNewName) {
            document.getElementById('generic-modal').classList.add('hidden');
            onRenameBoth(otherNewName, currentNewName);
        }
    };

    openConflictingBtn.onclick = () => {
        window.open(getUrl(existingFile.driveId, existingFile.id), '_blank');
    };

    showModal({
        title: 'File Name Conflict',
        message: `The name is already taken.`,
        headerColor: '#ef4444',
        iconClass: 'ph-fill ph-warning-circle',
        extraContent: container,
        dismissBtn: { text: 'Cancel', onClick: onCancel }
    });
}

export function renderMetadata(metaHtml) {
    document.getElementById('tab-run-settings').innerHTML = metaHtml.settingsHtml;
    document.getElementById('tab-system').innerHTML = metaHtml.sysHtml;
    document.getElementById('tab-citations').innerHTML = metaHtml.citesHtml;
    
    els.metaPanel.classList.remove('hidden');
    els.metaBody.classList.toggle('collapsed', prefs.collapseMetadataByDefault);
    els.collapseBtn.querySelector('i').className = prefs.collapseMetadataByDefault ? 'ph ph-caret-up' : 'ph ph-caret-down';
}

export function showMediaButton(show) {
    const widget = document.getElementById('media-widget');
    if(widget) {
        if(show) widget.classList.remove('hidden');
        else widget.classList.add('hidden');
    }
}

export function populateSidebar(prompts, handlers, activeRecord = null) {
    const list = document.getElementById('prompt-list');
    list.innerHTML = '';
    
    if (prompts.length === 0) {
        list.innerHTML = '<div class="empty-state-sidebar">No user prompts found</div>';
        return;
    }

    const { onPromptClick, onRenamePrompt, onRevertPrompt, onExportTurn } = handlers;
    const customNames = (activeRecord && activeRecord.customPromptNames) ? activeRecord.customPromptNames : {};

    prompts.forEach((p, index) => {
        const item = document.createElement('a');
        item.className = 'prompt-item';
        
        const mediaCount = p.mediaCount || 0;
        let originalText = p.text ? p.text.trim() : "";
        
        // --- Label Logic ---
        if (!originalText) {
            if (mediaCount > 0) {
                const types = p.mediaTypes || [];
                const uniqueTypes = [...new Set(types)];
                
                if (uniqueTypes.length === 1) {
                    const type = uniqueTypes[0];
                    const suffix = mediaCount > 1 ? 's' : '';
                    originalText = `[Uploaded ${mediaCount > 1 ? mediaCount + ' ' : ''}${type}${suffix}]`;
                } else {
                    originalText = `[Uploaded ${mediaCount} Files]`;
                }
            } else {
                originalText = "[Empty Message]";
            }
        }

        const isEdited = !!customNames[index];
        const displayText = customNames[index] || originalText;
        if (isEdited) item.classList.add('is-edited');

        // --- Icon Logic ---
        let iconHtml = '';
        const baseIconClass = (mediaCount > 0) ? "ph ph-paperclip" : "ph ph-chat-circle";

        if (mediaCount > 1) {
            // Icon + Badge
            iconHtml = `<i class="${baseIconClass} icon-wrapper"><span class="icon-badge">${mediaCount}</span></i>`;
        } else {
            // Just Icon
            iconHtml = `<i class="${baseIconClass}"></i>`;
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'prompt-item-content';
        contentSpan.textContent = truncate(displayText, 35);

        item.innerHTML = iconHtml;
        item.appendChild(contentSpan);

        item.title = displayText;
        item.dataset.index = index;

        // URL construction for CTRL+Click
        item.href = prefs.isScrollMode
            ? getUrl(activeRecord.driveId, activeRecord.id, null, index)
            : getUrl(activeRecord.driveId, activeRecord.id, index, null);

        item.onclick = (e) => {
            if (item.classList.contains('is-editing')) {
                e.preventDefault();
                return;
            }
            if (e.ctrlKey || e.metaKey) return; // Allow default behavior for CTRL+Click
            e.preventDefault();
            onPromptClick(index);
        };

        // Actions Group (Rename, Revert)
        const actionsGroup = document.createElement('div');
        actionsGroup.className = 'prompt-item-actions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'history-action-btn';
        renameBtn.title = 'Rename Prompt Group';
        renameBtn.innerHTML = '<i class="ph ph-pencil-simple"></i>';
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            startPromptRename(index, displayText, item, onRenamePrompt);
        };

        actionsGroup.appendChild(renameBtn);

        const exportBtn = document.createElement('button');
        exportBtn.className = 'history-action-btn';
        exportBtn.title = 'Export Turn';
        exportBtn.innerHTML = '<i class="ph ph-download-simple"></i>';
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (onExportTurn) onExportTurn(index, e);
        };

        actionsGroup.appendChild(exportBtn);

        if (isEdited) {
            const revertBtn = document.createElement('button');
            revertBtn.className = 'history-action-btn';
            revertBtn.title = 'Revert to Original Prompt';
            revertBtn.innerHTML = '<i class="ph ph-arrow-u-up-left"></i>';
            revertBtn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                onRevertPrompt(index);
            };
            actionsGroup.appendChild(revertBtn);
        }

        item.appendChild(actionsGroup);
        list.appendChild(item);
    });
}

function startPromptRename(index, currentName, itemEl, onSave) {
    const contentSpan = itemEl.querySelector('.prompt-item-content');
    if (!contentSpan) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prompt-rename-input';
    input.value = currentName;
    input.spellcheck = false;
    input.onclick = (e) => e.stopPropagation();
    input.onmousedown = (e) => e.stopPropagation();

    itemEl.classList.add('is-editing');
    itemEl.replaceChild(input, contentSpan);
    input.focus();
    input.select();

    const finish = (save) => {
        if (!itemEl.classList.contains('is-editing')) return;
        const newName = input.value.trim();

        if (save && newName && newName !== currentName) {
            onSave(index, newName);
        } else {
            // Revert UI immediately if not saving or no change
            itemEl.classList.remove('is-editing');
            if (itemEl.contains(input)) itemEl.replaceChild(contentSpan, input);
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    };

    input.onblur = () => finish(false);
}

export function setActiveSidebarItem(index) {
    document.querySelectorAll('.prompt-item').forEach(e => e.classList.remove('active'));
    const target = document.querySelector(`.prompt-item[data-index="${index}"]`);
    if(target) {
        target.classList.add('active');
        // Optional: ensure visible
        if (!isElementInViewport(target)) {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    return (
        rect.top >= parent.top &&
        rect.bottom <= parent.bottom
    );
}

export function setNavigationMode(isScrollMode) {
    const toggle = document.getElementById('sidebarModeToggle');
    if (toggle) {
        toggle.checked = isScrollMode;
        // The event listener in app.js will handle the re-render if we dispatch change
        toggle.dispatchEvent(new Event('change'));
    }
}

export function renderHistoryLists(recentFiles, pinnedFiles, handlers, activeId = null) {
    _historyHandlers = handlers;
    const { onLoad, onTogglePin, onDelete, onRename, onBulkDelete, onBulkPin } = handlers;
    if (activeId) currentFileRecordId = activeId;
    
    els.historySection.classList.toggle('hidden', recentFiles.length === 0 && pinnedFiles.length === 0);
    
    const createItem = (file) => {
        const div = document.createElement('div');
        div.className = 'recent-file-item';
        div.dataset.id = file.id;
        if (selectedHistoryIds.has(file.id)) div.classList.add('selected');

        if (currentFileRecordId && file.id === currentFileRecordId) {
            div.classList.add('active');
        } else if (!currentFileRecordId && file.name === els.filenameDisplay.title) {
            div.classList.add('active');
        }
        
        div.onclick = () => onLoad(file);

        // Checkbox for bulk selection
        const cbWrapper = document.createElement('div');
        cbWrapper.className = 'history-checkbox-wrapper';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedHistoryIds.has(file.id);
        checkbox.onclick = (e) => {
            e.stopPropagation();
            toggleHistorySelection(file.id);
        };
        cbWrapper.appendChild(checkbox);

        const nameGroup = document.createElement('div');
        nameGroup.className = 'file-name-group';

        const fileIcon = document.createElement('i');
        fileIcon.className = 'ph ph-file-text';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-text';
        nameSpan.textContent = truncate(file.name, 22);
        nameSpan.title = file.name;

        nameGroup.appendChild(fileIcon);
        nameGroup.appendChild(nameSpan);

        // Actions Group (Rename, Delete, Pin)
        const actionsGroup = document.createElement('div');
        actionsGroup.className = 'history-item-actions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'history-action-btn';
        renameBtn.title = 'Rename';
        renameBtn.innerHTML = '<i class="ph ph-pencil-simple"></i>';
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            startHistoryRename(file, div);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-action-btn delete';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            confirmDeleteHistory(file);
        };

        const pinBtn = document.createElement('button');
        pinBtn.className = `pin-btn ${file.pinned ? 'is-pinned' : ''}`;
        const iconClass = file.pinned ? 'ph-fill' : 'ph-bold';
        pinBtn.innerHTML = `<i class="${iconClass} ph-push-pin"></i>`;
        
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            onTogglePin(file);
        };
        
        if (!file.pinned) {
            pinBtn.onmouseenter = () => pinBtn.querySelector('i').className = 'ph-fill ph-push-pin';
            pinBtn.onmouseleave = () => pinBtn.querySelector('i').className = 'ph-bold ph-push-pin';
        } else {
            pinBtn.onmouseenter = () => pinBtn.querySelector('i').className = 'ph-bold ph-push-pin';
            pinBtn.onmouseleave = () => pinBtn.querySelector('i').className = 'ph-fill ph-push-pin';
        }

        actionsGroup.appendChild(renameBtn);
        actionsGroup.appendChild(deleteBtn);
        actionsGroup.appendChild(pinBtn);

        div.appendChild(cbWrapper);
        div.appendChild(nameGroup);
        div.appendChild(actionsGroup);
        return div;
    };

    els.recentList.innerHTML = '';
    recentFiles.forEach(f => els.recentList.appendChild(createItem(f)));
    
    els.pinnedList.innerHTML = '';
    pinnedFiles.forEach(f => els.pinnedList.appendChild(createItem(f)));

    updateBulkBar();
}

function toggleHistorySelection(id) {
    if (selectedHistoryIds.has(id)) {
        selectedHistoryIds.delete(id);
    } else {
        selectedHistoryIds.add(id);
    }

    // Update UI elements
    const items = document.querySelectorAll(`.recent-file-item[data-id="${id}"]`);
    items.forEach(item => {
        item.classList.toggle('selected', selectedHistoryIds.has(id));
        const cb = item.querySelector('.history-checkbox-wrapper input');
        if (cb) cb.checked = selectedHistoryIds.has(id);
    });

    updateBulkBar();
}

function updateBulkBar() {
    let bar = document.getElementById('bulk-history-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'bulk-history-bar';
        bar.className = 'bulk-history-bar hidden';
        const historySection = document.getElementById('history-section');
        const tabs = historySection.querySelector('.sidebar-mini-tabs');
        if (tabs) tabs.parentNode.insertBefore(bar, tabs.nextSibling);
    }

    if (selectedHistoryIds.size > 0) {
        bar.classList.remove('hidden');
        bar.innerHTML = `
            <div class="bulk-info">
                <button id="cancel-bulk-btn" class="icon-btn-sm" title="Clear Selection"><i class="ph ph-x"></i></button>
                <span><b>${selectedHistoryIds.size}</b> selected</span>
            </div>
            <div class="bulk-actions">
                <button id="bulk-pin-btn" class="bulk-action-btn" title="Pin all selected"><i class="ph-fill ph-push-pin"></i></button>
                <button id="bulk-unpin-btn" class="bulk-action-btn" title="Unpin all selected"><i class="ph ph-push-pin-slash"></i></button>
                <button id="bulk-delete-btn" class="bulk-action-btn delete" title="Delete selected"><i class="ph ph-trash"></i></button>
            </div>
        `;

        document.getElementById('cancel-bulk-btn').onclick = () => {
            selectedHistoryIds.clear();
            document.querySelectorAll('.recent-file-item.selected').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.history-checkbox-wrapper input').forEach(el => el.checked = false);
            updateBulkBar();
        };

        document.getElementById('bulk-pin-btn').onclick = () => {
            if (_historyHandlers.onBulkPin) _historyHandlers.onBulkPin(Array.from(selectedHistoryIds), true);
            selectedHistoryIds.clear();
            updateBulkBar();
        };

        document.getElementById('bulk-unpin-btn').onclick = () => {
            if (_historyHandlers.onBulkPin) _historyHandlers.onBulkPin(Array.from(selectedHistoryIds), false);
            selectedHistoryIds.clear();
            updateBulkBar();
        };

        document.getElementById('bulk-delete-btn').onclick = () => {
            confirmBulkDelete();
        };
    } else {
        bar.classList.add('hidden');
    }
}

function confirmDeleteHistory(file) {
    const safeName = window.DOMPurify.sanitize(file.name);
    showModal({
        title: 'Delete History Item',
        message: `Are you sure you want to delete "<b>${safeName}</b>"? This action cannot be undone.`,
        headerColor: '#ef4444',
        iconClass: 'ph-fill ph-trash',
        primaryBtn: {
            text: 'Delete',
            className: 'btn btn-sm btn-primary',
            onClick: () => {
                if (_historyHandlers.onDelete) _historyHandlers.onDelete(file.id);
            }
        },
        dismissBtn: { text: 'Cancel' }
    });
}

function confirmBulkDelete() {
    showModal({
        title: 'Delete Multiple Items',
        message: `Are you sure you want to delete <b>${selectedHistoryIds.size}</b> items? This action cannot be undone.`,
        headerColor: '#ef4444',
        iconClass: 'ph-fill ph-trash',
        primaryBtn: {
            text: 'Delete All',
            className: 'btn btn-sm btn-primary',
            onClick: () => {
                if (_historyHandlers.onBulkDelete) _historyHandlers.onBulkDelete(Array.from(selectedHistoryIds));
                selectedHistoryIds.clear();
                updateBulkBar();
            }
        },
        dismissBtn: { text: 'Cancel' }
    });
}

function startHistoryRename(file, itemEl) {
    const textSpan = itemEl.querySelector('.file-text');
    const nameGroup = itemEl.querySelector('.file-name-group');
    if (!textSpan || !nameGroup) return;

    const originalName = file.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'history-rename-input';
    input.value = originalName;
    input.spellcheck = false;
    input.onclick = (e) => e.stopPropagation();
    input.onmousedown = (e) => e.stopPropagation();

    itemEl.classList.add('is-editing');
    nameGroup.replaceChild(input, textSpan);
    input.focus();
    input.select();

    const finish = (save) => {
        if (!itemEl.classList.contains('is-editing')) return;
        const newName = input.value.trim();

        if (save && newName && newName !== originalName) {
            if (_historyHandlers.onRename) _historyHandlers.onRename(file.id, newName);
        } else {
            // Revert UI immediately if not saving or no change
            itemEl.classList.remove('is-editing');
            if (nameGroup.contains(input)) nameGroup.replaceChild(textSpan, input);
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    };

    input.onblur = () => finish(false); // Follow memory: revert on blur
}

// --- Conversation Rendering ---

export function renderConversation(parsedData, promptIndex, promptsList, pendingInputs = []) {
    els.chatStream.innerHTML = '';
    els.chatStream.removeAttribute('data-view');
    setActiveSidebarItem(promptIndex);

    const userPrompt = promptsList[promptIndex];
    const allChunks = parsedData.chunkedPrompt.chunks;

    let userChunks = [];
    let userChunkIndices = [];
    let i = userPrompt.originalIndex;
    while (i < allChunks.length && allChunks[i].role === 'user') {
        userChunks.push(allChunks[i]);
        userChunkIndices.push(i);
        i++;
    }
    els.chatStream.appendChild(createMessageElement(userChunks, 'user', null, userChunkIndices));

    for (; i < allChunks.length; i++) {
        const chunk = allChunks[i];
        if (chunk.role === 'model') {
            els.chatStream.appendChild(createMessageElement([chunk], 'model', null, [i]));
        } else if (chunk.role === 'user') break;
    }

    if (pendingInputs && pendingInputs.length > 0) {
        renderPendingInputs(pendingInputs);
    }

    postProcessCodeBlocks();
    els.scrollContainer.scrollTop = 0;
}

export function renderFullConversation(parsedData, promptsList, pendingInputs = []) {
    els.chatStream.innerHTML = '<div class="full-history-header">Full Conversation History</div>';
    els.chatStream.setAttribute('data-view', 'full');

    let currentTurn = [];
    let currentTurnIndices = [];
    let currentRole = null;
    let userPromptCount = 0;

    parsedData.chunkedPrompt.chunks.forEach((chunk, idx) => {
        let shouldFlush = false;

        if (currentTurn.length > 0) {
            if (chunk.role !== currentRole) {
                shouldFlush = true;
            } else if (currentRole === 'model') {
                const currentIsThought = currentTurn[0].isThought;
                const newIsThought = chunk.isThought;
                if (currentIsThought !== newIsThought) shouldFlush = true;
            }
        }

        if (shouldFlush) {
            let id = null;
            if (currentRole === 'user') {
                id = `msg-user-${userPromptCount}`;
                userPromptCount++;
            }
            els.chatStream.appendChild(createMessageElement(currentTurn, currentRole, id, currentTurnIndices));
            currentTurn = [];
            currentTurnIndices = [];
        }
        currentRole = chunk.role;
        currentTurn.push(chunk);
        currentTurnIndices.push(idx);
    });

    if (currentTurn.length > 0) {
        let id = null;
        if (currentRole === 'user') id = `msg-user-${userPromptCount}`;
        els.chatStream.appendChild(createMessageElement(currentTurn, currentRole, id, currentTurnIndices));
    }

    if (pendingInputs && pendingInputs.length > 0) {
        renderPendingInputs(pendingInputs);
    }

    postProcessCodeBlocks();
    
    let observerIgnore = true;
    setTimeout(() => { observerIgnore = false; }, 500);

    const observer = new IntersectionObserver((entries) => {
        if (observerIgnore) return;
        let visible = entries.filter(e => e.isIntersecting);
        if(visible.length > 0) {
            visible.sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
            const id = visible[0].target.id;
            const idx = parseInt(id.split('-').pop());
            setActiveSidebarItem(idx);

            if (_appState) _appState.focusIndex = idx;

            // Update URL with scrollTo if in scroll mode
            if (prefs.isScrollMode && _appState) {
                updateUrl(_appState.currentFileId, _appState.currentFileRecordId, null, idx, true);
            }
        }
    }, { root: els.scrollContainer, threshold: 0.1 });
    
    document.querySelectorAll('.message.role-user[id]').forEach(el => observer.observe(el));
}

function renderPendingInputs(pendingInputs) {
    const container = document.createElement('div');
    container.className = 'pending-inputs-container';

    const header = document.createElement('div');
    header.className = 'pending-header';
    header.innerHTML = '<i class="ph ph-clock-counter-clockwise"></i> Pending Input';
    container.appendChild(header);

    pendingInputs.forEach(input => {
        if (!input.text) return;
        const msg = createMessageElement([input], input.role || 'user');
        msg.classList.add('pending-msg');
        container.appendChild(msg);
    });

    els.chatStream.appendChild(container);
}

function createMessageElement(chunks, role, id = null, chunkIndices = null) {
    const wrapper = document.createElement('div');
    wrapper.className = `message role-${role}`;
    if (id) wrapper.id = id;
    if (chunkIndices && chunkIndices.length > 0) {
        wrapper.dataset.chunkIndices = chunkIndices.join(' ');
    }

    const mainChunk = chunks[0] || {};
    const isThought = mainChunk.isThought || false;
    const createTime = mainChunk.createTime;
    
    // Check for media for Tooltip
    const hasMedia = chunks.some(c => c.inlineData || c.inlineImage || c.driveDocument || c.driveImage || c.driveVideo || c.driveAudio);

    if (isThought) {
        wrapper.classList.add('thought-message');
        if (prefs.collapseThoughts) wrapper.classList.add('collapsed');
    }

    const isUser = role === 'user';
    const iconHtml = isUser ? 'You' : (isThought ? '<i class="ph-fill ph-brain"></i> Thinking' : '<i class="ph-fill ph-sparkle"></i> Gemini');
    const totalTokens = chunks.reduce((acc, c) => acc + (c.tokenCount || 0), 0);
    const tokens = totalTokens > 0 ? `<span class="token-count">${totalTokens} tokens</span>` : '';
    const expandIcon = isThought ? `<span class="thought-icon-rotate thought-expand-icon"><i class="ph ph-caret-${prefs.collapseThoughts ? 'down' : 'up'}"></i></span>` : '';

    const header = document.createElement('div');
    header.className = 'message-header';

    const labelGroup = document.createElement('div');
    labelGroup.className = 'message-label-group';
    labelGroup.innerHTML = isUser ? `${tokens} ${iconHtml}` : `${iconHtml} ${tokens} ${expandIcon}`;

    header.appendChild(labelGroup);

    if (createTime) {
        const timeSpan = document.createElement('div');
        timeSpan.className = 'message-time';
        timeSpan.textContent = formatMessageTime(createTime);
        timeSpan.title = new Date(createTime).toLocaleString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        header.prepend(timeSpan);
    }

    if (isThought) {
        header.onclick = () => {
            wrapper.classList.toggle('collapsed');
            const icon = header.querySelector('.thought-icon-rotate i');
            icon.className = wrapper.classList.contains('collapsed') ? 'ph ph-caret-down' : 'ph ph-caret-up';
        };
    }
    
    const tooltipTemplate = document.getElementById('message-tooltip-template');
    if(tooltipTemplate) {
        const tooltip = tooltipTemplate.content.cloneNode(true);
        const copyMd = tooltip.querySelector('[data-action="copy-md"]');
        const exportMd = tooltip.querySelector('[data-action="export-md"]');
        const copyText = tooltip.querySelector('[data-action="copy-text"]');
        const expHtml = tooltip.querySelector('[data-action="export-html"]');
        const expTxt = tooltip.querySelector('[data-action="export-txt"]');
        const expImg = tooltip.querySelector('[data-action="export-image"]');
        const dlMedia = tooltip.querySelector('[data-action="download-media"]');
        
        // Find the main text content for copying. Use the first chunk's text if available.
        // Note: This works because code blocks rely on the original markdown/text inside the chunk.
        const mainTextContent = chunks.map(c => c.text).filter(Boolean).join('\n\n');

        if (mainTextContent) {
            copyMd.onclick = async () => {
                const { copyToClipboardAsMarkdown } = await import('./export.js');
                copyToClipboardAsMarkdown(chunks);
            };
            exportMd.onclick = async () => {
                const { exportToMarkdown } = await import('./export.js');
                exportToMarkdown(chunks, `Message_${filename}`);
            };
            copyText.onclick = async () => {
                const { copyToClipboardAsText } = await import('./export.js');
                copyToClipboardAsText(chunks);
            };
        } else {
            // Hide text buttons if no text
            copyMd.parentElement.classList.add('hidden');
            copyText.parentElement.classList.add('hidden');
        }

        const filename = els.filenameDisplay.title || "export";

        expHtml.onclick = async () => {
            const { exportToHtml } = await import('./export.js');
            exportToHtml(wrapper, "Message Export", `Message_${filename}`);
        };

        expTxt.onclick = async () => {
            const { exportToTxt } = await import('./export.js');
            exportToTxt(chunks, `Message_${filename}`);
        };

        expImg.onclick = async () => {
            const { exportToImage } = await import('./export.js');
            exportToImage(wrapper, `Message_${filename}`);
        };

        if (hasMedia && dlMedia) {
            dlMedia.classList.remove('hidden');
            // Trigger custom event handled in app.js or attach directly if we pass handler
            // For now, let's attach a specific event to the wrapper that app.js can listen for
            // Or simpler: dispatch global event
            dlMedia.onclick = () => {
                const event = new CustomEvent('download-message-media', { detail: { chunks } });
                document.dispatchEvent(event);
            };
        }

        wrapper.appendChild(tooltip);
    }
    
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
                contentHtml = window.marked.parse(chunk.text || '');
            }
            contentContainer.innerHTML = window.DOMPurify.sanitize(contentHtml, { ADD_TAGS: ['img'] });
            
            const img = contentContainer.querySelector('.inline-img');
            if (img) {
                img.onclick = () => {
                    els.modalImg.src = img.src;
                    els.imageModal.classList.remove('hidden');
                };
            }
            contentContainer.querySelectorAll('a').forEach(a => a.setAttribute('target', '_blank'));
        }
        else if (chunk.inlineFile) {
            contentContainer = document.createElement('div');
            contentContainer.className = 'message-bubble inline-file-bubble align-start';

            const mimeType = chunk.inlineFile.mimeType || '';
            const dataUrl = `data:${mimeType};base64,${chunk.inlineFile.data}`;

            if (mimeType.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.className = 'media-fluid';
                contentContainer.appendChild(img);
            } else if (mimeType.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = dataUrl;
                video.controls = true;
                video.className = 'media-fluid';
                contentContainer.appendChild(video);
            } else if (mimeType.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.src = dataUrl;
                audio.controls = true;
                audio.className = 'media-full-width';
                contentContainer.appendChild(audio);
            } else {
                // Text/Code handling
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                
                try {
                    const binaryString = window.atob(chunk.inlineFile.data);
                    const decodedText = new TextDecoder().decode(Uint8Array.from(binaryString, c => c.charCodeAt(0)));
                    const ext = getExtensionFromMime(mimeType);
                    const lang = detectLanguageFromExtension(ext) || 'plaintext';
                    
                    code.className = `language-${lang}`;
                    code.textContent = decodedText; 
                    pre.appendChild(code);
                    contentContainer.appendChild(pre);
                    
                    // Mark this wrapper so postProcessCodeBlocks can add the Expand button
                    contentContainer.dataset.inlineData = chunk.inlineFile.data;
                    contentContainer.dataset.mimeType = mimeType;
                } catch (e) {
                    contentContainer.textContent = "[Binary File]";
                }
            }

            if (mimeType.startsWith('image/')) {
                contentContainer.classList.add('cursor-zoom');
                contentContainer.onclick = () => viewInlineFile(chunk.inlineFile.data, mimeType);
            }
        }
        else if (chunk.inlineAudio) {
            contentContainer = document.createElement('div');
            contentContainer.className = 'message-bubble';
            const audioButton = document.createElement('button');
            audioButton.className = 'btn btn-secondary';
            audioButton.innerHTML = '<i class="ph ph-play"></i> Play Inline Audio';
            audioButton.addEventListener('click', () => {
                const audioSrc = `data:${chunk.inlineAudio.mimeType};base64,${chunk.inlineAudio.data}`;
                showMediaPlayer(audioSrc, chunk.inlineAudio.mimeType);
            });
            contentContainer.appendChild(audioButton);
        }
else if (chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile) {
            let templateId = 'drive-doc-template';
            let driveId = null;
            const driveData = chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile;
            
            // Primary Mime Detection: Key-based override
            let mimeType = driveData.mimeType || '';
            if (chunk.driveImage && !mimeType.startsWith('image/')) mimeType = 'image/jpeg';
            if (chunk.driveAudio && !mimeType.startsWith('audio/')) mimeType = 'audio/mpeg';
            if (chunk.driveVideo && !mimeType.startsWith('video/')) mimeType = 'video/mp4';
            
            if (mimeType.startsWith('image/') || chunk.driveImage) templateId = 'drive-image-template';
            else if (mimeType.startsWith('audio/') || chunk.driveAudio) templateId = 'drive-audio-template';
            else if (mimeType.startsWith('video/') || chunk.driveVideo) templateId = 'drive-video-template';
            
            driveId = driveData.id;

            const template = document.getElementById(templateId);
            if(template) {
                contentContainer = template.content.cloneNode(true).firstElementChild;
                const ext = getExtensionFromMime(mimeType).toUpperCase();

                contentContainer.querySelector('.drive-doc-type').textContent = ext;
                contentContainer.querySelector('.drive-id-display').textContent = truncate(driveId, 15);
                contentContainer.querySelector('.drive-id-display').title = driveId;
                
                const dot = contentContainer.querySelector('.status-dot');
                if (dot) {
                    dot.dataset.id = driveId;
                    if (driveAccessRegistry[driveId]) dot.classList.add(driveAccessRegistry[driveId]);
                }

                contentContainer.querySelector('.open-drive-link-btn').href = `https://drive.google.com/file/d/${driveId}`;
                contentContainer.querySelector('.view-drive-file-btn').onclick = (e) => viewDriveFile(driveId, e.currentTarget, mimeType);
            }
        }

        if (contentContainer) contentWrapper.appendChild(contentContainer);
    });

    return wrapper;
}

function viewInlineFile(base64Data, mimeType) {
    showLoading();

    try {
        if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            if (mimeType.startsWith('image/')) {
                els.modalImg.src = dataUrl;
                document.getElementById('image-viewer-filename').textContent = "Inline Image";
                els.imageModal.classList.remove('hidden');
            } else {
                showMediaPlayer(dataUrl, mimeType);
            }
        } else {
            // Assume text-based content
            const binaryString = window.atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const decodedText = new TextDecoder().decode(bytes);
            currentViewingText = decodedText;

            const ext = getExtensionFromMime(mimeType);
            const explicitLang = detectLanguageFromExtension(ext);
            let detectedLanguage = explicitLang || 'plaintext';

            try {
                const result = window.hljs.highlight(decodedText, { language: detectedLanguage, ignoreIllegals: true });
                els.textViewerCode.innerHTML = result.value;
            } catch (e) {
                const auto = window.hljs.highlightAuto(decodedText);
                detectedLanguage = auto.language || 'plaintext';
                els.textViewerCode.innerHTML = auto.value;
            }
            
            document.getElementById('text-viewer-filename').textContent = `Inline File (${ext})`;
            document.getElementById('text-viewer-lang-tag').textContent = detectedLanguage;
            els.textViewerCode.className = `hljs language-${detectedLanguage}`;

            els.textViewerModal.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Failed to view inline file:", e);
        showError("Display Error", "Could not decode or display the inline file content.");
    } finally {
        hideLoading();
    }
}

function viewDriveFile(driveId, element, knownMimeType) {
    showLoading();
    const card = element ? element.closest('.drive-document-card, .media-item-card') : null;
    const dot = card ? card.querySelector('.status-dot') : null;

    if (dot) {
        dot.dataset.id = driveId;
        dot.classList.remove('accessible', 'inaccessible');
    }

    // Context-aware media detection: Check MIME first, then fall back to Card Type
    const isMedia = (knownMimeType && (
        knownMimeType.startsWith('image/') || 
        knownMimeType.startsWith('video/') || 
        knownMimeType.startsWith('audio/') ||
        knownMimeType.includes('quicktime') ||
        knownMimeType.includes('video') || 
        knownMimeType.includes('audio')
    )) || (card && (
        card.classList.contains('drive-video-card') || 
        card.classList.contains('drive-audio-card') || 
        card.classList.contains('drive-image-card')
    ));

    if (knownMimeType === 'application/pdf') {
        hideLoading();
        showError("Preview Unavailable", "PDF files cannot be previewed directly. Please use the 'Open' button.", false, null, driveId);
        if (dot) dot.classList.add('inaccessible');
        return;
    }

    const originalUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;

    // If it's media, we fetch as blob and force the media players
    if (isMedia) {
        fetchProxyBlob(originalUrl)
            .then(blob => {
                hideLoading();
                if (blob.type.includes('text/html')) throw new Error("Private File");

                const url = URL.createObjectURL(blob);
                if (knownMimeType.startsWith('image/')) {
                    els.modalImg.src = url;
                    document.getElementById('image-viewer-filename').textContent = "Image Preview";
                    els.imageModal.classList.remove('hidden');
                } else {
                    showMediaPlayer(url, knownMimeType);
                }
                saveAccess(driveId, 'accessible');
            })
            .catch(err => {
                hideLoading();
                saveAccess(driveId, 'inaccessible');
                showError("Access Denied", "Could not access media. Ensure the file is shared with 'Anyone with the link'.", true, () => viewDriveFile(driveId, element, knownMimeType), driveId);
            });
        return;
    }

    // 2. Fallback / Text Handling
    fetchProxyContent(originalUrl)
        .then(async response => {
            hideLoading();
            const contentType = response.headers.get('content-type') || '';
            const finalMime = knownMimeType || contentType;

            // Strict block: if network headers reveal it's media we missed, route it and STOP text processing
            if (finalMime.startsWith('image/') || finalMime.startsWith('video/') || finalMime.startsWith('audio/')) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                if (finalMime.startsWith('image/')) {
                    els.modalImg.src = url;
                    els.imageModal.classList.remove('hidden');
                } else {
                    showMediaPlayer(url, finalMime);
                }
                saveAccess(driveId, 'accessible');
                return;
            }

            const text = await response.text();
            
            // Handle Google Drive Virus Scan Warning (Interstitial for >100MB files)
            const isHtmlResponse = text.trim().startsWith('<');
            if (isHtmlResponse && text.includes('Virus scan warning')) {
                const match = text.match(/href="([^"]+confirm=[^"]+)"/);
                if (match) {
                    const confirmUrl = match[1].replace(/&amp;/g, '&');
                    // Recurse using the confirmation URL
                    return fetchProxyContent(confirmUrl).then(async res => {
                        const newText = await res.text();
                        return processDriveText(newText, driveId, element, knownMimeType, dot, res.headers.get('content-type') || knownMimeType);
                    });
                }
            }

            // Check if response is a Google Login/Auth page
            const lower = text.toLowerCase();
            const isGoogleAuth = isHtmlResponse && (lower.includes('accounts.google.com') || lower.includes('sign in - google') || (lower.includes('google') && lower.includes('service=wise')));

            if (isGoogleAuth) throw new Error("Private File");

            // Binary check: If we find null bytes or control chars in the first 100 chars, it's not text
            if (/[\x00-\x08\x0E\x0F]/.test(text.slice(0, 100))) {
                showError("Preview Unavailable", "This file type contains binary data and cannot be viewed as text.", false, null, driveId);
                return;
            }

            currentViewingText = text;
            const ext = getExtensionFromMime(finalMime);
            const explicitLang = detectLanguageFromExtension(ext);
            let detectedLanguage = explicitLang || 'plaintext';

            try {
                const result = window.hljs.highlight(text, { language: detectedLanguage, ignoreIllegals: true });
                els.textViewerCode.innerHTML = result.value;
            } catch (e) {
                const auto = window.hljs.highlightAuto(text);
                detectedLanguage = auto.language || 'plaintext';
                els.textViewerCode.innerHTML = auto.value;
            }

            document.getElementById('text-viewer-filename').textContent = `File: ${truncate(driveId, 15)} (${ext})`;
            document.getElementById('text-viewer-lang-tag').textContent = detectedLanguage;
            els.textViewerCode.className = `hljs language-${detectedLanguage}`;
            
            const pre = els.textViewerModal.querySelector('pre');
            pre.classList.toggle('wrapped', prefs.isWrapCode);
            els.textViewerModal.classList.remove('hidden');
            saveAccess(driveId, 'accessible');
        })
        .catch(err => {
            hideLoading();
            saveAccess(driveId, 'inaccessible');
            if (err.message === "Private File") {
                showError("Access Denied", "This file is private.", true, () => viewDriveFile(driveId, element, knownMimeType), driveId);
            } else {
                showError("Error", "Failed to fetch file content.", false, null, driveId);
            }
        });
}

function showMediaPlayer(url, contentType) {
    const container = els.mediaPlayerContainer;
    container.innerHTML = '';
    let mediaElement;

    if (contentType.startsWith('audio/')) {
        const audioContainer = document.createElement('div');
        audioContainer.className = 'audio-player-container';
        audioContainer.innerHTML = `<i class="ph-fill ph-speaker-high audio-placeholder-icon"></i>`;
        
        mediaElement = document.createElement('audio');
        mediaElement.controls = true;
        mediaElement.autoplay = true;
        mediaElement.className = 'media-full-width';
        
        audioContainer.appendChild(mediaElement);
        container.appendChild(audioContainer);
        document.getElementById('media-player-filename').textContent = "Audio Player";
    } else if (contentType.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.controls = true;
        mediaElement.autoplay = true;
        mediaElement.className = 'media-fluid';
        container.appendChild(mediaElement);
        document.getElementById('media-player-filename').textContent = "Video Player";
    }

    if (mediaElement) {
        mediaElement.src = url;
        els.mediaPlayerModal.classList.remove('hidden');
    }
}

// --- Media Gallery Logic ---

export function renderMediaGallery(mediaItems, onDownload) {
    const grid = document.getElementById('media-grid');
    const countDisplay = document.getElementById('media-count-display');
    const selectAllBtn = document.getElementById('select-all-media-btn');
    const downloadBtn = document.getElementById('download-zip-btn');
    const zipProgress = document.getElementById('zip-progress');
    const zipPercent = document.getElementById('zip-percent');
    
    grid.innerHTML = '';
    countDisplay.textContent = `${mediaItems.length} items`;
    zipProgress.classList.add('hidden');
    
    // State for selection
    let selectedIndices = new Set();
    
    mediaItems.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'media-item-card';
        card.dataset.index = idx;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'media-checkbox';
        checkbox.onclick = (e) => {
            e.stopPropagation();
            toggleSelect(idx);
        };
        
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'media-thumb-wrapper';
        thumbWrapper.onclick = () => toggleSelect(idx);

        if (item.type === 'drive') {
            const dot = document.createElement('div');
            dot.className = 'status-dot';
            dot.dataset.id = item.id;
            if (driveAccessRegistry[item.id]) dot.classList.add(driveAccessRegistry[item.id]);
            thumbWrapper.appendChild(dot);
        }
        
        if (item.type === 'inline' && item.mimeType.startsWith('image/')) {
            const img = document.createElement('img');
            img.className = 'media-thumb';
            img.src = `data:${item.mimeType};base64,${item.data}`;
            thumbWrapper.appendChild(img);
        } else {
            thumbWrapper.classList.add('solid-bg');
            // Check mimeType if available from extractMedia, otherwise guess from extension
            const mime = item.mimeType || '';
            const iconClass = getIconClassForExtension(item.ext, mime);
            const i = document.createElement('i');
            i.className = `${iconClass} media-icon-placeholder`;
            thumbWrapper.appendChild(i);
        }

        const body = document.createElement('div');
        body.className = 'media-card-body';

        const info = document.createElement('span');
        info.className = 'media-info';
        const label = item.type === 'inline' ? `Embedded ${item.ext.toUpperCase()}` : `Drive ${item.ext.toUpperCase()}`;
        info.textContent = label;
        info.title = item.type === 'drive' ? item.id : 'Embedded Content';

        const actions = document.createElement('div');
        actions.className = 'media-card-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-secondary btn-sm';
        viewBtn.innerHTML = '<i class="ph ph-eye"></i> View';
        viewBtn.onclick = (e) => {
            e.stopPropagation();
            if (item.type === 'drive') {
                viewDriveFile(item.id, card, item.mimeType);
            } else {
                viewInlineFile(item.data, item.mimeType);
            }
        };

        const openBtn = document.createElement('a');
        openBtn.className = 'btn btn-secondary btn-sm';
        openBtn.innerHTML = 'Open <i class="ph ph-arrow-square-out"></i>';
        openBtn.target = '_blank';
        if (item.type === 'drive') {
            openBtn.href = `https://drive.google.com/file/d/${item.id}`;
            openBtn.onclick = (e) => e.stopPropagation();
            actions.appendChild(openBtn);
        }

        actions.appendChild(viewBtn);

        const showInChatBtn = document.createElement('button');
        showInChatBtn.className = 'btn btn-secondary btn-sm';
        showInChatBtn.innerHTML = '<i class="ph ph-chat-text"></i> Show in chat';
        showInChatBtn.onclick = (e) => {
            e.stopPropagation();
            scrollToChunk(item.index);
        };
        actions.appendChild(showInChatBtn);

        body.appendChild(info);
        body.appendChild(actions);

        card.appendChild(checkbox);
        card.appendChild(thumbWrapper);
        card.appendChild(body);
        
        grid.appendChild(card);
    });
    
    function toggleSelect(idx) {
        if (selectedIndices.has(idx)) selectedIndices.delete(idx);
        else selectedIndices.add(idx);
        
        const card = grid.querySelector(`.media-item-card[data-index="${idx}"]`);
        const cb = card.querySelector('input');
        
        if (selectedIndices.has(idx)) {
            card.classList.add('selected');
            cb.checked = true;
        } else {
            card.classList.remove('selected');
            cb.checked = false;
        }
        
        updateButtons();
    }
    
    function updateButtons() {
        downloadBtn.textContent = `Download ZIP (${selectedIndices.size})`;
        downloadBtn.disabled = selectedIndices.size === 0;
        if(selectedIndices.size === 0) downloadBtn.classList.add('btn-secondary'); 
        else downloadBtn.classList.remove('btn-secondary');

        const allSelected = selectedIndices.size === mediaItems.length && mediaItems.length > 0;
        selectAllBtn.textContent = allSelected ? "Unselect All" : "Select All";
    }
    
    selectAllBtn.onclick = () => {
        const allSelected = selectedIndices.size === mediaItems.length;
        if (allSelected) {
            selectedIndices.clear();
        } else {
            mediaItems.forEach((_, idx) => selectedIndices.add(idx));
        }
        
        // Re-render selection visuals
        grid.querySelectorAll('.media-item-card').forEach((card, idx) => {
             const cb = card.querySelector('input');
             if (selectedIndices.has(idx)) {
                 card.classList.add('selected');
                 cb.checked = true;
             } else {
                 card.classList.remove('selected');
                 cb.checked = false;
             }
        });
        updateButtons();
    };
    
    downloadBtn.onclick = () => {
        if (selectedIndices.size === 0) return;
        zipProgress.classList.remove('hidden');
        zipPercent.textContent = "0%";
        
        const itemsToDownload = mediaItems.filter((_, i) => selectedIndices.has(i));
        
        onDownload(itemsToDownload, (percent) => {
            zipPercent.textContent = `${Math.floor(percent)}%`;
        }).then(() => {
            zipProgress.classList.add('hidden');
        }).catch(err => {
            zipProgress.textContent = "Error creating ZIP";
            console.error(err);
        });
    };

    els.mediaModal.classList.remove('hidden');
    updateButtons();
}

function scrollToChunk(chunkIndex) {
    els.mediaModal.classList.add('hidden');

    if (!_appState || !_appState.parsedData) return;

    const prompts = _appState.currentPrompts || [];
    let targetPromptIndex = -1;
    for (let i = prompts.length - 1; i >= 0; i--) {
        if (prompts[i].originalIndex <= chunkIndex) {
            targetPromptIndex = i;
            break;
        }
    }
    if (targetPromptIndex < 0) return;

    const isFullView = els.chatStream.getAttribute('data-view') === 'full';

    if (!isFullView) {
        if (typeof _renderConversation === 'function') {
            _renderConversation(targetPromptIndex);
        } else if (_renderConversation && typeof _renderConversation.onPromptClick === 'function') {
            _renderConversation.onPromptClick(targetPromptIndex);
        }
    }

    const doScroll = () => {
        const msg = document.querySelector(`.message[data-chunk-indices~="${chunkIndex}"]`);
        if (msg) {
            msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
            highlightElement(msg);
        }
    };

    if (isFullView) {
        doScroll();
    } else {
        setTimeout(doScroll, 100);
    }
}

function highlightElement(el) {
    document.querySelectorAll('.message-highlight').forEach(e => e.classList.remove('message-highlight'));
    el.classList.add('message-highlight');
}

function postProcessCodeBlocks() {
    const filename = els.filenameDisplay.textContent;
    const persistedStates = prefs.preserveCodeState ? JSON.parse(localStorage.getItem(`code_states_${filename}`) || '{}') : {};

    document.querySelectorAll('pre code').forEach((block, idx) => {
        if (block.id === 'text-viewer-code') return;
        window.hljs.highlightElement(block);

        let lang = 'Plain Text';
        const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
        if (langClass) lang = langClass.replace('language-', '');
        if (lang === 'undefined') lang = 'Unknown';

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
        const inlineBubble = pre.closest('.inline-file-bubble');
        const expandBtnHtml = inlineBubble ? `<button class="expand-inline-btn"><i class="ph ph-arrows-out"></i> Full View</button>` : '';

        header.innerHTML = `
            <div class="code-title-group">
                <button class="collapse-code-btn" title="Toggle Code">
                    <i class="${iconClass}"></i>
                </button>
                <span class="lang-tag">${lang}</span>
            </div>
            <div class="code-header-actions">
                ${expandBtnHtml}
                <button class="copy-btn"><i class="ph ph-copy"></i> Copy</button>
            </div>
        `;

        pre.parentNode.insertBefore(wrapper, pre);

        if (inlineBubble && expandBtnHtml) {
            header.querySelector('.expand-inline-btn').onclick = () => {
                viewInlineFile(inlineBubble.dataset.inlineData, inlineBubble.dataset.mimeType);
            };
        }
        wrapper.appendChild(sentinel);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);

        if (prefs.isWrapCode) pre.classList.add('wrapped');

        const observer = new IntersectionObserver(([e]) => {
            header.classList.toggle('is-sticky', !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top || 0));
        }, { root: els.scrollContainer, threshold: 0 });
        observer.observe(sentinel);

        header.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(block.textContent).then(() => showToast("Copied code"));
        });
        
        const collapseBtn = header.querySelector('.collapse-code-btn');
        collapseBtn.addEventListener('click', () => {
            const nowCollapsed = wrapper.classList.toggle('collapsed');
            collapseBtn.querySelector('i').className = nowCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down';
            
            if (prefs.preserveCodeState) {
                const key = `code_states_${filename}`;
                let states = JSON.parse(localStorage.getItem(key) || '{}');
                states[blockId] = nowCollapsed;
                localStorage.setItem(key, JSON.stringify(states));
            }
        });
    });
}

// --- Helpers ---

export function showError(title, message, showGif, retryCallback, fileId) {
    let gifContent = null;
    if (showGif) {
        gifContent = document.createElement('div');
        gifContent.id = 'error-gif-container';
        gifContent.innerHTML = `
            <img src="./assets/share-instruction.gif" alt="Share Settings: Anyone with link">
            <p>Ensure sharing is set to "Anyone with the link".</p>
        `;
    }

    const config = {
        title: title || 'System Notification',
        message: message,
        headerColor: '#ef4444',
        iconClass: 'ph-fill ph-warning-circle',
        extraContent: gifContent
    };

    if (retryCallback && fileId) {
        config.primaryBtn = { text: 'Retry', onClick: retryCallback };
        config.secondaryBtn = {
            text: 'Open <i class="ph ph-arrow-square-out"></i>',
            href: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
            className: 'btn btn-secondary btn-sm'
        };
    } else if (retryCallback) {
        config.primaryBtn = { text: 'Retry', onClick: retryCallback };
    } else if (fileId) {
        config.primaryBtn = {
            text: 'Open <i class="ph ph-arrow-square-out"></i>',
            href: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
        };
    }

    showModal(config);
}

export function showConfirmModal(htmlMessage, onOk, onCancel) {
    showModal({
        title: 'Confirm Action',
        message: htmlMessage,
        headerColor: 'var(--accent-surface)',
        iconClass: 'ph-fill ph-question',
        dismissBtn: { text: 'Cancel', onClick: onCancel },
        primaryBtn: { text: 'Load File', onClick: onOk }
    });
}

function getIconClassForExtension(ext, mimeType = '') {
    if (!ext) return 'ph-fill ph-file';

    // Check mimeType first if valid
    if (mimeType.startsWith('video/')) return 'ph-fill ph-film-strip';
    if (mimeType.startsWith('audio/')) return 'ph-fill ph-speaker-high';
    if (mimeType.startsWith('image/')) return 'ph-fill ph-image';

    switch (ext.toLowerCase()) {
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'webp':
        case 'gif':
        case 'bmp':
        case 'svg':
            return 'ph-fill ph-image';
        case 'pdf':
            return 'ph-fill ph-file-pdf';
        case 'txt':
        case 'md':
        case 'json':
        case 'js':
        case 'html':
        case 'css':
        case 'py':
            return 'ph-fill ph-file-text';
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
            return 'ph-fill ph-file-archive';
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'flac':
        case 'm4a':
        case 'aac':
            return 'ph-fill ph-speaker-high';
        case 'mp4':
        case 'mov':
        case 'avi':
        case 'webm':
        case 'mkv':
            return 'ph-fill ph-film-strip';
        case 'csv':
        case 'xls':
        case 'xlsx':
            return 'ph-fill ph-file-csv';
        case 'doc':
        case 'docx':
            return 'ph-fill ph-file-doc';
        default:
            return 'ph-fill ph-file';
    }
}