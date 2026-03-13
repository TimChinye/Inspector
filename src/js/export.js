/* global htmlToImage */
import { showToast } from './utils.js';

/**
 * Exports a set of chunks as Markdown
 */
export function exportToMarkdown(chunks, filename) {
    const md = chunksToMarkdown(chunks);
    downloadString(md, `${filename}.md`, 'text/markdown');
}

/**
 * Exports a set of chunks as Plain Text
 */
export function exportToTxt(chunks, filename) {
    const txt = chunksToTxt(chunks);
    downloadString(txt, `${filename}.txt`, 'text/plain');
}

/**
 * Copy chunks to clipboard as Markdown
 */
export function copyToClipboardAsMarkdown(chunks) {
    const md = chunksToMarkdown(chunks);
    navigator.clipboard.writeText(md).then(() => showToast('Copied as Markdown'));
}

/**
 * Copy chunks to clipboard as Plain Text
 */
export function copyToClipboardAsText(chunks) {
    const txt = chunksToTxt(chunks);
    navigator.clipboard.writeText(txt).then(() => showToast('Copied as Plain Text'));
}

/**
 * Exports a set of chunks or an element as HTML
 */
export function exportToHtml(element, title, filename) {
    const html = generateStandaloneHtml(element, title);
    downloadString(html, `${filename}.html`, 'text/html');
}

/**
 * Copy element to clipboard as HTML
 */
export function copyToClipboardAsHtml(element, title) {
    const html = generateStandaloneHtml(element, title);
    navigator.clipboard.writeText(html).then(() => showToast('HTML copied to clipboard'));
}

function generateStandaloneHtml(element, title) {
    const styles = Array.from(document.styleSheets)
        .map(sheet => {
            try {
                return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
            } catch (e) {
                return '';
            }
        }).join('\n');

    const themeLink = document.getElementById('highlight-stylesheet');
    const themeUrl = themeLink ? themeLink.href : '';

    const rootStyles = getComputedStyle(document.documentElement);
    const cssVars = [
        '--bg-app', '--bg-surface', '--bg-sidebar', '--bg-code', '--text-main', '--text-muted', '--text-faint',
        '--accent-primary', '--accent-surface', '--border-subtle', '--border-focus',
        '--radius-sm', '--radius-md', '--radius-lg'
    ].map(v => `${v}: ${rootStyles.getPropertyValue(v).trim()};`).join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${themeUrl}">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
        :root {
            ${cssVars}
        }
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 40px 20px;
            background: var(--bg-app);
            color: var(--text-main);
            line-height: 1.6;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 0;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            width: 100%;
            max-width: 850px;
        }
        ${styles}
        .message-tooltip, .code-header-actions, .collapse-code-btn, .sticky-sentinel, .tooltip-btn, .edit-icon, #scrape-name-btn, .token-count { display: none !important; }
        .message { max-width: 100% !important; margin: 0 auto 40px auto !important; opacity: 1 !important; visibility: visible !important; }

        .export-header {
            width: 100%;
            margin-bottom: 50px;
            padding-bottom: 25px;
            border-bottom: 2px solid var(--border-subtle);
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .header-title-group h1 { margin: 0; font-size: 28px; font-weight: 600; color: var(--text-main); }
        .header-title-group p { color: var(--text-muted); margin: 8px 0 0 0; font-size: 14px; font-weight: 500; }
        .header-meta { text-align: right; color: var(--text-faint); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

        .export-footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid var(--border-subtle);
            width: 100%;
            text-align: center;
            color: var(--text-faint);
            font-size: 12px;
        }
        .export-footer a { color: var(--accent-primary); text-decoration: none; font-weight: 600; }

        pre { border-radius: 8px !important; }
        .message-bubble { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        [data-theme="dark"] .message-bubble { box-shadow: 0 4px 12px rgba(0,0,0,0.2); }

        @media (max-width: 600px) {
            body { padding: 20px 15px; }
            .export-header { flex-direction: column; align-items: flex-start; gap: 15px; }
            .header-meta { text-align: left; }
            .header-title-group h1 { font-size: 22px; }
        }
    </style>
</head>
<body data-theme="${document.documentElement.getAttribute('data-theme') || 'light'}">
    <div class="container">
        <header class="export-header">
            <div class="header-title-group">
                <h1>${title}</h1>
                <p>Gemini Conversation Export</p>
            </div>
            <div class="header-meta">
                ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </header>

        <main class="content-wrapper">
            ${element.innerHTML}
        </main>

        <footer class="export-footer">
            Generated by <a href="https://ai-inspector.vercel.app/" target="_blank">Inspector</a> &bull; Google AI Studio Viewer
        </footer>
    </div>
</body>
</html>`;
}


/**
 * Export element as Image (Carbon.sh Style)
 */
export async function exportToImage(element, filename) {
    try {
        showToast("Preparing snapshot...");

        // Create a temporary container for capture
        const captureContainer = document.createElement('div');
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        captureContainer.setAttribute('data-theme', currentTheme);
        captureContainer.className = 'image-capture-container';

        captureContainer.style.position = 'absolute';
        captureContainer.style.top = '0';
        captureContainer.style.left = '-9999px';
        captureContainer.style.opacity = '1';
        captureContainer.style.visibility = 'visible';
        captureContainer.style.pointerEvents = 'none';

        captureContainer.style.width = '1000px';
        captureContainer.style.padding = '80px';
        captureContainer.style.backgroundColor = '#667eea'; // Solid fallback
        captureContainer.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        captureContainer.style.display = 'flex';
        captureContainer.style.justifyContent = 'center';
        captureContainer.style.alignItems = 'center';

        const card = document.createElement('div');
        const bgSurface = getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim() || (currentTheme === 'dark' ? '#1e1e1e' : '#ffffff');
        card.style.background = bgSurface;
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 30px 60px rgba(0,0,0,0.4)';
        card.style.width = '100%';
        card.style.overflow = 'hidden';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';

        // Window Controls Header
        const header = document.createElement('div');
        header.style.padding = '16px';
        header.style.display = 'flex';
        header.style.gap = '8px';
        header.style.borderBottom = '1px solid ' + getComputedStyle(document.documentElement).getPropertyValue('--border-subtle');

        ['#ff5f56', '#ffbd2e', '#27c93f'].forEach(color => {
            const dot = document.createElement('div');
            dot.style.width = '12px';
            dot.style.height = '12px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = color;
            dot.style.border = '1px solid rgba(0,0,0,0.1)';
            header.appendChild(dot);
        });

        const body = document.createElement('div');
        body.style.padding = '30px';

        // Clone the content
        const clone = element.cloneNode(true);

        // --- Pre-capture cleanup ---

        // Remove UI noise
        clone.querySelectorAll('.message-tooltip, .code-header-actions, .collapse-code-btn, .sticky-sentinel, .edit-icon, #scrape-name-btn').forEach(t => t.remove());

        // Ensure all images are loaded and have CORS set
        const imgs = Array.from(clone.querySelectorAll('img'));
        await Promise.all(imgs.map(img => {
            return new Promise((resolve) => {
                if (img.complete && img.naturalHeight !== 0) {
                    resolve();
                } else {
                    img.onload = () => resolve();
                    img.onerror = () => {
                        console.warn("Removing broken image from export:", img.src);
                        img.remove();
                        resolve();
                    };
                    // If it's not started yet
                    if (!img.src) resolve();
                }
            });
        }));

        // Apply some styles to clone for better rendering in isolation
        clone.style.width = '100%';
        clone.style.margin = '0';
        clone.style.opacity = '1';
        clone.style.visibility = 'visible';
        clone.style.position = 'relative';
        clone.style.display = 'block';

        body.appendChild(clone);
        card.appendChild(header);
        card.appendChild(body);
        captureContainer.appendChild(card);

        // Add font-face links directly to container to encourage loading in clone
        const phosphor = document.createElement('link');
        phosphor.rel = 'stylesheet';
        phosphor.href = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css';
        captureContainer.appendChild(phosphor);

        document.body.appendChild(captureContainer);

        // Ensure fonts are loaded
        await document.fonts.ready;
        // Small delay to ensure rendering
        await new Promise(r => setTimeout(r, 500));

        const dataUrl = await htmlToImage.toPng(captureContainer, {
            width: 1000,
            pixelRatio: 2,
            backgroundColor: null,
            cacheBust: true,
            skipFonts: false,
            style: {
                transform: 'none',
                opacity: '1',
                visibility: 'visible',
                position: 'static',
                display: 'flex',
                top: '0',
                left: '0'
            },
            filter: (node) => {
                // Filter out problematic elements if any
                if (node.classList && node.classList.contains('message-tooltip')) return false;
                return true;
            }
        });

        document.body.removeChild(captureContainer);

        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = dataUrl;
        link.click();
        showToast("Snapshot saved");
    } catch (error) {
        console.error('Image export failed:', error);
        showToast('Image export failed. Try HTML or Markdown.', 'ph-fill ph-x-circle');
    }
}

// --- Internal Helpers ---

function chunksToMarkdown(chunks) {
    let output = "";
    let currentRole = null;
    let currentIsThought = null;

    chunks.forEach(chunk => {
        const isThought = !!chunk.isThought;
        if (chunk.role !== currentRole || isThought !== currentIsThought) {
            currentRole = chunk.role;
            currentIsThought = isThought;
            const label = currentRole === 'user' ? 'User' : (isThought ? 'Thinking' : 'Gemini');
            output += `\n\n## ${label}\n\n`;
        }

        let content = '';
        if (chunk.text) {
            content = chunk.text;
        } else if (chunk.inlineData || chunk.inlineImage) {
            const type = (chunk.inlineData || chunk.inlineImage).mimeType || 'image';
            content = `\n![Attached ${type}](Embedded Data)\n`;
        } else if (chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile) {
            const data = chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile;
            content = `\n[Drive Attachment: ${data.id}]\n`;
        } else if (chunk.inlineFile) {
            content = `\n[Attached File: ${chunk.inlineFile.mimeType}]\n`;
        }
        output += content + "\n";
    });

    return output.trim();
}

function chunksToTxt(chunks) {
    return chunks.map(chunk => {
        let content = '';
        if (chunk.text) {
            // Advanced Markdown to Plain Text stripping
            content = chunk.text
                .replace(/^#+\s+/gm, '') // Remove headers
                .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
                .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
                .replace(/`{3}[\s\S]*?`{3}/g, (match) => { // Code blocks
                    return match.replace(/`{3}/g, '').trim();
                })
                .replace(/`(.+?)`/g, '$1') // Inline code
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // Links
                .replace(/^\s*[-*+]\s+/gm, '') // Unordered lists
                .replace(/^\s*\d+\.\s+/gm, '') // Ordered lists
                .replace(/^\s*>\s+/gm, ''); // Blockquotes
        } else if (chunk.inlineData || chunk.inlineImage) {
            content = `[Attached Image/Media]`;
        } else if (chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile) {
            const data = chunk.driveDocument || chunk.driveImage || chunk.driveAudio || chunk.driveVideo || chunk.driveFile;
            content = `[Drive Attachment: ${data.id}]`;
        } else if (chunk.inlineFile) {
            content = `[Attached File]`;
        }

        const prefix = chunk.role === 'user' ? 'USER: ' : (chunk.isThought ? 'THINKING: ' : 'GEMINI: ');
        return prefix + content;
    }).join('\n\n');
}

function downloadString(content, filename, contentType) {
    const a = document.createElement('a');
    const blob = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
