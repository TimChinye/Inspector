export const prefs = {
    openLastFileOnStartup: true,
    collapseThoughts: true,
    collapseMetadataByDefault: false,
    preserveCodeState: false,
    isScrollableCode: false,
    isWrapCode: false,
    autoRestoreContent: true,
    contentWidth: 800,
    codeTheme: 'androidstudio',
    timeFormat: 'default'
};

export const CODE_THEMES = [
    { name: "Android Studio", value: "androidstudio" },
    { name: "Atom One Dark", value: "atom-one-dark" },
    { name: "Atom One Light", value: "atom-one-light" },
    { name: "Monokai", value: "monokai" },
    { name: "GitHub Dark", value: "github-dark" },
    { name: "GitHub", value: "github" },
    { name: "Dracula", value: "base16/dracula" },
    { name: "Nord", value: "nord" },
    { name: "Solarized Dark", value: "base16/solarized-dark" },
    { name: "Solarized Light", value: "base16/solarized-light" },
    { name: "VS 2015", value: "vs2015" },
    { name: "Agate", value: "agate" },
    { name: "Obsidian", value: "obsidian" },
    { name: "A11y Dark", value: "a11y-dark" },
    { name: "A11y Light", value: "a11y-light" },
];

export function initPreferences() {
    const savedRestore = localStorage.getItem('autoRestore');
    prefs.openLastFileOnStartup = savedRestore ? JSON.parse(savedRestore) : true;

    const savedThinking = localStorage.getItem('collapseThoughts');
    prefs.collapseThoughts = savedThinking ? JSON.parse(savedThinking) : true;

    const savedMetadata = localStorage.getItem('collapseMetadata');
    prefs.collapseMetadataByDefault = savedMetadata ? JSON.parse(savedMetadata) : false;

    const savedCodePersistence = localStorage.getItem('preserveCodeState');
    prefs.preserveCodeState = savedCodePersistence ? JSON.parse(savedCodePersistence) : false;

    const savedScrollCode = localStorage.getItem('scrollableCode');
    prefs.isScrollableCode = savedScrollCode ? JSON.parse(savedScrollCode) : false;

    const savedWrapCode = localStorage.getItem('wrapCode');
    prefs.isWrapCode = savedWrapCode ? JSON.parse(savedWrapCode) : false;
    
    const savedAutoRestore = localStorage.getItem('autoRestoreContent');
    prefs.autoRestoreContent = savedAutoRestore !== null ? JSON.parse(savedAutoRestore) : true;

    const savedWidth = localStorage.getItem('contentWidth');
    prefs.contentWidth = savedWidth ? parseInt(savedWidth) : 800;

    const savedCodeTheme = localStorage.getItem('codeTheme');
    prefs.codeTheme = savedCodeTheme || 'androidstudio';

    const savedTimeFormat = localStorage.getItem('timeFormat');
    prefs.timeFormat = savedTimeFormat || 'default';

    // Apply basic CSS states based on prefs
    applyGlobalStyles();
    applyThemePreference();
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function applyThemePreference() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) setTheme('dark');
    else setTheme('light');
}

export function applyGlobalStyles() {
    document.body.classList.toggle('scrollable-codeblocks', prefs.isScrollableCode);
    document.body.classList.toggle('wrap-codeblocks', prefs.isWrapCode);
    document.documentElement.style.setProperty('--content-width', `${prefs.contentWidth}px`);
    
    const link = document.getElementById('highlight-stylesheet');
    if(link) link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${prefs.codeTheme}.min.css`;
}