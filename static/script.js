let editor;
let currentFilePath = null;
let mainFilePath = localStorage.getItem('latex_main_file') || null;
let isCompiling = false;
let searchMarks = [];
let searchMatches = [];
let currentSearchIndex = -1;
let resizer, editorContainer, previewContainer;

document.addEventListener('DOMContentLoaded', () => {
    updateMainFileLabel();
    restoreSidebarState();
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearchPanel(true);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
    document.addEventListener('click', hideFileContextMenu);
    document.addEventListener('scroll', hideFileContextMenu, true);

    loadFiles();
});

function restoreSidebarState() {
    const collapsed = localStorage.getItem('latex_sidebar_collapsed') === 'true';
    document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function toggleSidebar() {
    const collapsed = !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('latex_sidebar_collapsed', String(collapsed));
    setTimeout(() => {
        if (editor) editor.refresh();
    }, 220);
}

window.onload = () => {
    editorContainer = document.querySelector('.editor-container');
    previewContainer = document.querySelector('.preview-container');
    resizer = document.getElementById('resizer');

    initResizer();
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: "stex",
        theme: "nord",
        lineNumbers: true,
        lineWrapping: true,
        extraKeys: {
            "Ctrl-S": function () { saveFile(); },
            "Cmd-S": function () { saveFile(); },
            "Ctrl-F": function () { toggleSearchPanel(true); },
            "Cmd-F": function () { toggleSearchPanel(true); }
        }
    });
    let autoSaveTimeout;

    editor.on('change', () => {
        if (!currentFilePath) return;
        updateOutline();
        markCompileStale();
        const btn = document.getElementById('save-btn');
        if (!btn.innerHTML.includes('*')) {
            btn.innerHTML = '<i class="far fa-save"></i> Save *';
            btn.style.backgroundColor = 'var(--error)';
        }
        if (document.getElementById('auto-save-check').checked) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                if (!editor.isClean()) {
                    saveFile(true);
                }
            }, 1000);
        }

    });
    const editorWrapper = editor.getWrapperElement();
    editorWrapper.addEventListener('focusout', () => {
        if (document.getElementById('auto-save-check').checked && !editor.isClean()) {
            saveFile(true);
        }
    });
};
function updateMainFileLabel() {
    const label = document.getElementById('main-file-label');
    if (label) {
        if (mainFilePath) {
            const fname = mainFilePath.split('/').pop();
            label.textContent = `(${fname})`;
            label.title = mainFilePath;
        } else {
            label.textContent = "(None)";
        }
    }
}

function setAsMainFile() {
    if (!currentFilePath) {
        alert("まずファイルを開いてください。");
        return;
    }
    if (!currentFilePath.endsWith('.tex')) {
        alert("メインのコンパイル対象として設定できるのは .tex ファイルのみです。");
        return;
    }
    mainFilePath = currentFilePath;
    localStorage.setItem('latex_main_file', mainFilePath);
    updateMainFileLabel();
    const compileMainCheck = document.getElementById('compile-main-check');
    if (compileMainCheck) {
        compileMainCheck.checked = true;
    }
    loadFiles();
}

async function loadFiles() {
    const res = await fetch('/api/files');
    const files = await res.json();
    const list = document.getElementById('file-list');
    list.innerHTML = '';

    const showHidden = document.getElementById('show-hidden-files').checked;
    const tree = {};
    files.forEach(path => {
        const isHidden = path.startsWith('.') || path.includes('/.');
        if (!showHidden && isHidden) return;

        const parts = path.split('/');
        let currentLevel = tree;

        parts.forEach((part, index) => {
            if (!currentLevel[part]) {
                currentLevel[part] = index === parts.length - 1 ? null : {};
            }
            currentLevel = currentLevel[part];
        });
    });

    renderTree(tree, list, "");
}

function renderTree(node, container, prefix) {
    const items = Object.keys(node).sort((a, b) => {
        const aIsDir = node[a] !== null;
        const bIsDir = node[b] !== null;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
    });

    items.forEach(key => {
        const fullPath = prefix ? prefix + '/' + key : key;
        const isDir = node[key] !== null;

        const li = document.createElement('li');
        const contentDiv = document.createElement('div');
        contentDiv.className = 'file-item';

        if (isDir) {
            contentDiv.innerHTML = `<span class="caret"></span> <span class="icon"><i class="fas fa-folder"></i></span> ${key}`;
            contentDiv.onclick = function () {
                const caret = this.querySelector('.caret');
                caret.classList.toggle('caret-down');
                const ul = this.parentElement.querySelector('ul');
                if (ul) {
                    ul.style.display = ul.style.display === 'block' ? 'none' : 'block';
                }
                const folderIcon = this.querySelector('.icon i');
                if (caret.classList.contains('caret-down')) {
                    folderIcon.className = 'fas fa-folder-open';
                } else {
                    folderIcon.className = 'fas fa-folder';
                }
            };
            contentDiv.oncontextmenu = (e) => {
                e.preventDefault();
                currentFilePath = fullPath;
                showFileContextMenu(e.clientX, e.clientY);
            };
            li.appendChild(contentDiv);
            const ul = document.createElement('ul');
            renderTree(node[key], ul, fullPath);
            li.appendChild(ul);
        } else {
            let iconClass = 'far fa-file';
            let extraClass = '';
            if (key.endsWith('.tex')) {
                iconClass = 'far fa-file-alt';
                extraClass = 'tex-file';
            } else if (key.endsWith('.pdf')) {
                iconClass = 'far fa-file-pdf';
            } else if (key.endsWith('.bib')) {
                iconClass = 'fas fa-book';
                extraClass = 'bib-file';
            } else if (isImageFile(key)) {
                iconClass = 'far fa-file-image';
                extraClass = 'image-file';
            } else if (key.endsWith('.sty') || key.endsWith('.cls')) {
                iconClass = 'fas fa-cog';
            }
            let mainIndicator = '';
            if (fullPath === mainFilePath) {
                extraClass += ' main-file-node';
                mainIndicator = ' <span style="color:#f1c40f;">★</span>';
            }

            contentDiv.innerHTML = `<span class="icon"><i class="${iconClass}"></i></span> ${key}${mainIndicator}`;
            contentDiv.className = `file-item ${extraClass}`;
            contentDiv.onclick = () => openFile(fullPath);
            contentDiv.oncontextmenu = (e) => {
                e.preventDefault();
                currentFilePath = fullPath;
                updateActiveFileInTree(fullPath);
                showFileContextMenu(e.clientX, e.clientY);
            };
            contentDiv.dataset.path = fullPath;
            li.appendChild(contentDiv);
        }
        container.appendChild(li);
    });
}
function expandToPath(path) {
}

async function openFile(path) {
    if (currentFilePath === path) return;

    if (isImageFile(path)) {
        editor.setValue("--- Image Preview ---");
        editor.markClean();
        currentFilePath = path;
        const currentFileEl = document.getElementById('current-file');
        currentFileEl.innerHTML = `<i class="far fa-file-image"></i> <span>${path}</span>`;
        currentFileEl.title = path;

        document.getElementById('pdf-preview').src = `/api/raw/${encodeFilePath(path)}?t=${new Date().getTime()}`;
        updateActiveFileInTree(path);
        updateButtonStates(path);
        resetSaveButton();
        setCompileButtonState('idle');
        return;
    }

    if (path.endsWith('.pdf')) {
        editor.setValue("--- PDF Preview ---");
        editor.markClean();
        currentFilePath = path;
        const currentFileEl = document.getElementById('current-file');
        currentFileEl.innerHTML = `<i class="far fa-file-pdf"></i> <span>${path}</span>`;
        currentFileEl.title = path;

        document.getElementById('pdf-preview').src = `/pdf?file=${encodeURIComponent(path)}&t=${new Date().getTime()}`;
        updateButtonStates(path);
        updateActiveFileInTree(path);
        resetSaveButton();
        setCompileButtonState('idle');

        return;
    }

    const res = await fetch(`/api/files/${encodeFilePath(path)}`);
    if (res.ok) {
        const data = await res.json();
        editor.setValue(data.content);
        editor.markClean();
        currentFilePath = path;
        const currentFileEl = document.getElementById('current-file');
        currentFileEl.innerHTML = `<i class="far fa-file-alt"></i> <span>${path}</span>`;
        currentFileEl.title = path;
        updateActiveFileInTree(path);
        resetSaveButton();
        setCompileButtonState(path.endsWith('.tex') ? 'idle' : 'idle');

        updateButtonStates(path);
    } else {
        alert('Failed to load file');
    }
}

function updateActiveFileInTree(path) {
    document.querySelectorAll('.file-item').forEach(div => {
        div.classList.remove('active');
        if (div.dataset.path === path) {
            div.classList.add('active');
            let parentUl = div.parentElement.parentElement;
            while (parentUl && parentUl.tagName === 'UL' && parentUl.id !== 'file-list') {
                parentUl.style.display = 'block';
                if (parentUl.parentElement && parentUl.parentElement.querySelector('.caret')) {
                    parentUl.parentElement.querySelector('.caret').classList.add('caret-down');
                }
                parentUl = parentUl.parentElement.parentElement;
            }
        }
    });
}

function resetSaveButton() {
    const btn = document.getElementById('save-btn');
    btn.innerHTML = '<i class="far fa-save"></i> Save';
    btn.style.backgroundColor = 'var(--primary)';
    btn.style.color = 'white';
}

function showFileContextMenu(x, y, options = {}) {
    const menu = document.getElementById('file-context-menu');
    if (!menu) return;
    const hasSelection = !options.blankArea && Boolean(currentFilePath);
    menu.querySelectorAll('[data-needs-file]').forEach(button => {
        button.disabled = !hasSelection;
        button.style.display = hasSelection ? 'flex' : 'none';
    });
    menu.style.display = 'block';

    const rect = menu.getBoundingClientRect();
    const nextX = Math.min(x, window.innerWidth - rect.width - 8);
    const nextY = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, nextX)}px`;
    menu.style.top = `${Math.max(8, nextY)}px`;
}

function hideFileContextMenu() {
    const menu = document.getElementById('file-context-menu');
    if (menu) menu.style.display = 'none';
}

function showFilesTabContextMenu(event) {
    event.preventDefault();
    if (event.target.closest('.file-item')) return;
    showFileContextMenu(event.clientX, event.clientY, { blankArea: true });
}

function isImageFile(path) {
    return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path);
}

function updateButtonStates(path) {
    const actionButtons = Array.from(document.querySelectorAll('.toolbar-group button'));
    const refBtn = actionButtons.find(btn => btn.innerText.includes('+Ref'));
    const setMainBtn = document.getElementById('set-main-btn');
    if (path.endsWith('.bib')) {
        actionButtons.forEach(btn => {
            if (btn === refBtn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.title = "参考文献エントリを追加します";
            } else if (btn.id !== 'save-btn' && btn.id !== 'log-btn') {
                if (!btn.getAttribute('data-original-title')) {
                    btn.setAttribute('data-original-title', btn.title);
                }
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.title = ".bibファイルでは使用できません";
            }
        });
        if (setMainBtn) {
            setMainBtn.disabled = true;
            setMainBtn.style.opacity = '0.4';
            setMainBtn.style.cursor = 'not-allowed';
            setMainBtn.title = ".bibファイルはメインに設定できません";
        }
    } else if (path.endsWith('.pdf') || isImageFile(path)) {
        actionButtons.forEach(btn => {
            if (btn.id !== 'log-btn') {
                if (!btn.getAttribute('data-original-title')) {
                    btn.setAttribute('data-original-title', btn.title);
                }
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.title = "プレビューファイルでは使用できません";
            }
        });
        if (setMainBtn) {
            setMainBtn.disabled = true;
            setMainBtn.style.opacity = '0.4';
            setMainBtn.style.cursor = 'not-allowed';
            setMainBtn.title = "プレビューファイルはメインに設定できません";
        }
    }
    else {
        actionButtons.forEach(btn => {
            if (btn === refBtn) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                btn.title = ".bibファイル以外では使用できません";
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.title = btn.getAttribute('data-original-title') || btn.title;
            }
        });

        if (setMainBtn) {
            if (path.endsWith('.tex')) {
                setMainBtn.disabled = false;
                setMainBtn.style.opacity = '1';
                setMainBtn.style.cursor = 'pointer';
                setMainBtn.title = "このファイルをメインのコンパイル対象に設定します";
            } else {
                setMainBtn.disabled = true;
                setMainBtn.style.opacity = '0.4';
                setMainBtn.style.cursor = 'not-allowed';
                setMainBtn.title = ".texファイル以外はメインに設定できません";
            }
        }
    }
}

function initResizer() {
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.getElementById('pdf-preview').style.pointerEvents = 'none';
        if (editor) editor.refresh();
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;

        const sidebarWidth = document.querySelector('.sidebar').offsetWidth;
        const availableWidth = document.querySelector('.container').offsetWidth - sidebarWidth - resizer.offsetWidth;
        const minEditorWidth = availableWidth < 680 ? 260 : 360;
        const minPreviewWidth = availableWidth < 680 ? 220 : 320;
        const nextEditorWidth = Math.min(Math.max(e.clientX - sidebarWidth, minEditorWidth), availableWidth - minPreviewWidth);
        const nextPreviewWidth = availableWidth - nextEditorWidth;

        editorContainer.style.flex = `0 0 ${nextEditorWidth}px`;
        previewContainer.style.flex = `0 0 ${nextPreviewWidth}px`;
        if (editor) editor.refresh();
    }

    function stopResizing() {
        isResizing = false;
        document.body.style.cursor = 'default';
        document.getElementById('pdf-preview').style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        if (editor) editor.refresh();
    }
}

async function saveFile(silent = false) {
    if (!currentFilePath) return;
    if (!currentFilePath.endsWith('.tex') && !currentFilePath.endsWith('.bib')) {
        console.warn(`Skipping save for non-editable file: ${currentFilePath}`);
        return;
    }
    const content = editor.getValue();
    const res = await fetch(`/api/files/${encodeFilePath(currentFilePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFilePath, content: content })
    });
    if (res.ok) {
        editor.markClean();
        if (document.getElementById('auto-compile-check').checked && !isCompiling) {
            compileLatex();
        }

        if (!silent) {
            console.log('Saved manually');
            const btn = document.getElementById('save-btn');
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            btn.style.backgroundColor = 'var(--success)';
            setTimeout(() => {
                btn.innerHTML = '<i class="far fa-save"></i> Save';
                btn.style.backgroundColor = 'var(--primary)';
            }, 1000);
        } else {
            const btn = document.getElementById('save-btn');
            if (btn.innerHTML.includes('*')) {
                btn.innerHTML = '<i class="far fa-save"></i> Save';
                btn.style.backgroundColor = 'var(--primary)';
            }
        }
    } else {
        if (!silent) alert('Failed to save');
    }
}

async function compileLatex() {
    if (isCompiling) return;
    isCompiling = true;

    const btn = document.getElementById('compile-btn');
    const logArea = document.getElementById('log-content');
    const compileMain = document.getElementById('compile-main-check').checked;
    let targetFile = currentFilePath;
    if (compileMain && mainFilePath) {
        targetFile = mainFilePath;
    }

    if (!targetFile || !targetFile.endsWith('.tex')) {
        if (!targetFile) alert("Please open a file or set a Main File.");
        else console.warn(`Skipping compilation for non-tex file: ${targetFile}`);
        isCompiling = false;
        return;
    }
    if (currentFilePath && !editor.isClean()) {
        await saveFile(true);
    }

    setCompileButtonState('compiling');
    btn.disabled = true;
    logArea.textContent = 'Compiling...';

    try {
        const res = await fetch('/api/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: targetFile })
        });
        const data = await res.json();

        btn.disabled = false;
        const logContent = document.getElementById('log-content');
        const tsGuide = document.getElementById('troubleshooting-guide');
        
        if (data.status === 'success') {
            setCompileButtonState('compiled');
            logContent.textContent = data.logs || 'Compilation successful.';
            logContent.className = 'success';
            if (tsGuide) tsGuide.style.display = 'none';
            if (data.pdf_path) {
                const preview = document.getElementById('pdf-preview');
                const pdfUrl = `/pdf?file=${encodeURIComponent(data.pdf_path)}&t=${new Date().getTime()}`;
                preview.src = pdfUrl;
                if (preview.tagName === 'EMBED') {
                    const parent = preview.parentElement;
                    const newEmbed = preview.cloneNode();
                    newEmbed.src = pdfUrl;
                    parent.replaceChild(newEmbed, preview);
                }
            }
        } else {
            setCompileButtonState('error');
            logContent.textContent = data.logs || 'Compilation failed.';
            logContent.className = 'error';
            if (tsGuide) tsGuide.style.display = 'block';
            const logContainer = document.getElementById('log-container');
            const logBtn = document.getElementById('log-btn');
            if (logContainer.style.display === 'none' || logContainer.style.display === '') {
                logContainer.style.display = 'block';
                logBtn.style.backgroundColor = '#95a5a6';
            }
        }
    } catch (e) {
        setCompileButtonState('error');
        btn.disabled = false;
        alert('Error compiling: ' + e);
    } finally {
        isCompiling = false;
    }
}

function setCompileButtonState(state) {
    const btn = document.getElementById('compile-btn');
    btn.classList.remove('compiling', 'compiled', 'compile-error', 'compile-stale');

    if (state === 'compiling') {
        btn.classList.add('compiling');
        btn.innerHTML = '<i class="fas fa-spinner"></i> Compiling...';
        return;
    }

    if (state === 'compiled') {
        btn.classList.add('compiled');
        btn.innerHTML = '<i class="fas fa-check"></i> Compiled';
        setTimeout(() => {
            if (!isCompiling) {
                btn.classList.remove('compiled');
                btn.innerHTML = '<i class="fas fa-play"></i> Compile';
            }
        }, 1600);
        return;
    }

    if (state === 'error') {
        btn.classList.add('compile-error');
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
        return;
    }

    btn.innerHTML = '<i class="fas fa-play"></i> Compile';
}

function markCompileStale() {
    if (isCompiling || !currentFilePath || !currentFilePath.endsWith('.tex')) return;
    const btn = document.getElementById('compile-btn');
    btn.classList.remove('compiled', 'compile-error');
    btn.classList.add('compile-stale');
    btn.innerHTML = '<i class="fas fa-play"></i> Compile *';
}

function encodeFilePath(path) {
    return path.split('/').map(part => encodeURIComponent(part)).join('/');
}



function toggleLogs() {
    const logContainer = document.getElementById('log-container');
    const logBtn = document.getElementById('log-btn');

    if (logContainer.style.display === 'none' || logContainer.style.display === '') {
        logContainer.style.display = 'block';
        logBtn.style.backgroundColor = '#95a5a6';
    } else {
        logContainer.style.display = 'none';
        logBtn.style.backgroundColor = '#7f8c8d';
    }
}

async function copyLogs() {
    const text = document.getElementById('log-content').textContent;
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('log-content'));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function toggleSearchPanel(forceOpen = false) {
    const panel = document.getElementById('search-panel');
    const shouldOpen = forceOpen || panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = shouldOpen ? 'flex' : 'none';
    if (shouldOpen) {
        document.getElementById('search-input').focus();
        runSearch();
    } else {
        clearSearchMarks();
    }
}

function runSearch() {
    clearSearchMarks();
    searchMatches = [];
    currentSearchIndex = -1;

    const query = document.getElementById('search-input').value;
    if (!query) {
        updateSearchStatus();
        return;
    }

    const text = editor.getValue();
    let start = 0;
    while (true) {
        const index = text.indexOf(query, start);
        if (index === -1) break;
        const from = editor.posFromIndex(index);
        const to = editor.posFromIndex(index + query.length);
        searchMatches.push({ from, to });
        searchMarks.push(editor.markText(from, to, { className: 'search-match' }));
        start = index + query.length;
    }

    if (searchMatches.length) {
        currentSearchIndex = 0;
        highlightCurrentSearch();
    }
    updateSearchStatus();
}

function clearSearchMarks() {
    searchMarks.forEach(mark => mark.clear());
    searchMarks = [];
}

function highlightCurrentSearch() {
    searchMarks.forEach((mark, index) => {
        mark.clear();
        const match = searchMatches[index];
        searchMarks[index] = editor.markText(match.from, match.to, {
            className: index === currentSearchIndex ? 'search-match current' : 'search-match'
        });
    });

    const match = searchMatches[currentSearchIndex];
    if (match) {
        editor.setSelection(match.from, match.to);
        editor.scrollIntoView(match.from, 80);
    }
    updateSearchStatus();
}

function updateSearchStatus() {
    const total = searchMatches.length;
    const current = total ? currentSearchIndex + 1 : 0;
    document.getElementById('search-status').textContent = `${current}/${total}`;
}

function findNext() {
    if (!searchMatches.length) return;
    currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
    highlightCurrentSearch();
}

function findPrevious() {
    if (!searchMatches.length) return;
    currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
    highlightCurrentSearch();
}

function replaceCurrent() {
    if (!searchMatches.length || currentSearchIndex < 0) return;
    const replacement = document.getElementById('replace-input').value;
    const match = searchMatches[currentSearchIndex];
    editor.replaceRange(replacement, match.from, match.to);
    runSearch();
}

function replaceAll() {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    const replacement = document.getElementById('replace-input').value;
    editor.setValue(editor.getValue().split(query).join(replacement));
    runSearch();
}

function triggerUpload() {
    document.getElementById('file-upload').click();
}

async function createFilePrompt() {
    const baseDir = getCurrentDirectory();
    const defaultPath = baseDir === "." ? "new.tex" : `${baseDir}/new.tex`;
    const path = prompt("作成するファイル名", defaultPath);
    if (!path) return;

    const res = await fetch('/api/create-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, content: "" })
    });

    if (res.ok) {
        const data = await res.json();
        await loadFiles();
        openFile(data.path);
    } else {
        const err = await res.json();
        alert('File creation failed: ' + err.detail);
    }
}

async function deleteCurrentFile() {
    if (!currentFilePath) {
        alert("削除するファイルを選択してください。");
        return;
    }
    if (!confirm(`${currentFilePath} を削除しますか？`)) return;

    const res = await fetch(`/api/files/${encodeFilePath(currentFilePath)}`, {
        method: 'DELETE'
    });

    if (res.ok) {
        currentFilePath = null;
        editor.setValue('');
        editor.markClean();
        document.getElementById('current-file').innerHTML = '<i class="far fa-file"></i> <span>No file selected</span>';
        document.getElementById('current-file').title = 'No file selected';
        document.getElementById('pdf-preview').src = '';
        resetSaveButton();
        setCompileButtonState('idle');
        await loadFiles();
        updateOutline();
    } else {
        const err = await res.json();
        alert('Delete failed: ' + err.detail);
    }
}

async function renameCurrentFile() {
    hideFileContextMenu();
    if (!currentFilePath) {
        alert("リネームするファイルを選択してください。");
        return;
    }
    const newPath = prompt("新しいファイル名", currentFilePath);
    if (!newPath || newPath === currentFilePath) return;

    const res = await fetch('/api/rename-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: currentFilePath, new_path: newPath })
    });

    if (res.ok) {
        const data = await res.json();
        const renamedPath = data.path;
        if (mainFilePath === currentFilePath) {
            mainFilePath = renamedPath;
            localStorage.setItem('latex_main_file', mainFilePath);
            updateMainFileLabel();
        }
        currentFilePath = null;
        await loadFiles();
        openFile(renamedPath);
    } else {
        const err = await res.json();
        alert('Rename failed: ' + err.detail);
    }
}

async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    let targetDir = ".";
    if (currentFilePath && currentFilePath.includes('/')) {
        targetDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    }
    formData.append('directory', targetDir);

    const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });

    if (res.ok) {
        loadFiles();
        input.value = '';
        console.log(`Uploaded to ${targetDir}`);
    } else {
        let errMsg = 'Upload failed';
        try {
            const err = await res.json();
            errMsg += ': ' + err.detail;
        } catch (e) {
            errMsg += ': ' + res.statusText;
        }
        alert(errMsg);
    }
}

function triggerInsertImage() {
    if (!currentFilePath) {
        alert("Please open a file first.");
        return;
    }
    document.getElementById('image-insert').click();
}

async function insertImage(input) {
    const file = input.files[0];
    if (!file) return;
    let targetDir = ".";
    if (currentFilePath && currentFilePath.includes('/')) {
        targetDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('directory', targetDir);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });

    if (res.ok) {
        const data = await res.json();
        loadFiles();
        const doc = editor.getDoc();
        const cursor = doc.getCursor();
        const filename = data.filename || file.name;

        const texCode = `\\begin{figure}[htbp]\n    \\centering\n    \\includegraphics[width=\\linewidth]{${filename}}\n    \\caption{${filename}}\n    \\label{fig:${filename}}\n\\end{figure}\n`;
        doc.replaceRange(texCode, cursor);
        input.value = '';
    } else {
        let errMsg = 'Image upload failed';
        try {
            const err = await res.json();
            errMsg += ': ' + err.detail;
        } catch (e) {
            errMsg += ': ' + res.statusText;
        }
        alert(errMsg);
    }
}

function triggerInsertSubsection() {
    if (!currentFilePath) {
        alert("Please open a file first.");
        return;
    }
    const doc = editor.getDoc();
    const cursor = doc.getCursor();
    const texCode = `\\subsection{}`;
    doc.replaceRange(texCode, cursor);
    doc.setCursor({ line: cursor.line, ch: cursor.ch + 12 });
    editor.focus();
}

function triggerInsertSideBySide() {
    if (!currentFilePath) {
        alert("Please open a file first.");
        return;
    }
    document.getElementById('side-by-side-insert').click();
}

async function insertSideBySide(input) {
    const files = input.files;
    if (!files || files.length < 2) {
        alert("Please select at least 2 images for side-by-side.");
        return;
    }
    const file1 = files[0];
    const file2 = files[1];

    let targetDir = ".";
    if (currentFilePath && currentFilePath.includes('/')) {
        targetDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    }
    const formData = new FormData();
    formData.append('file', file1);
    formData.append('directory', targetDir);
    const res1 = await fetch('/api/upload', { method: 'POST', body: formData });
    const data1 = await res1.json();

    const formData2 = new FormData();
    formData2.append('file', file2);
    formData2.append('directory', targetDir);
    const res2 = await fetch('/api/upload', { method: 'POST', body: formData2 });
    const data2 = await res2.json();

    loadFiles();

    const doc = editor.getDoc();
    const cursor = doc.getCursor();

    const file1Name = data1.filename || file1.name;
    const file2Name = data2.filename || file2.name;
    const texCode = `
\\begin{figure}[htbp]
  \\begin{minipage}[b]{0.45\\linewidth}
    \\centering
    \\includegraphics[width=\\linewidth]{${file1Name}}
    \\caption{${file1Name}}
    \\label{fig:${file1Name}}
  \\end{minipage}
  \\hfill
  \\begin{minipage}[b]{0.45\\linewidth}
    \\centering
    \\includegraphics[width=\\linewidth]{${file2Name}}
    \\caption{${file2Name}}
    \\label{fig:${file2Name}}
  \\end{minipage}
\\end{figure}
`;
    doc.replaceRange(texCode, cursor);
    input.value = '';
}
async function showCitationModal() {
    const modal = document.getElementById('citation-modal');
    modal.style.display = 'block';
    const list = document.getElementById('citation-list');
    list.innerHTML = 'Loading citations...';

    try {
        const res = await fetch('/api/citations');
        const citations = await res.json();
        list.innerHTML = '';

        if (citations.length === 0) {
            list.innerHTML = 'No citations found in .bib files.';
            return;
        }

        citations.forEach(cite => {
            const item = document.createElement('div');
            item.className = 'citation-item';
            item.innerHTML = `
                <div class="citation-key">\\cite{${cite.key}}</div>
                <div class="citation-meta">
                    <strong>${cite.title}</strong><br>
                    ${cite.author} ${cite.year ? `(${cite.year})` : ''} 
                    <span style="color: #999; font-size: 0.8em;">[${cite.file}]</span>
                </div>
            `;
            item.onclick = () => {
                insertText(`\\cite{${cite.key}}`);
                closeModal('citation-modal');
            };
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = 'Error loading citations: ' + e;
    }
}
function showModalTips(tipId) {
    document.querySelectorAll('.modal-tip').forEach(el => el.style.display = 'none');
    const tip = document.getElementById(tipId);
    if (tip) tip.style.display = 'block';
}

function showTableModal() {
    document.getElementById('modal-title').textContent = '表の挿入';
    document.getElementById('table-inputs').style.display = 'block';
    document.getElementById('list-inputs').style.display = 'none';
    document.getElementById('ref-inputs').style.display = 'none';
    document.getElementById('equation-inputs').style.display = 'none';
    showModalTips('tip-table');
    document.getElementById('input-modal').style.display = 'block';
    document.getElementById('modal-confirm-btn').onclick = insertTable;
}

function showEquationModal() {
    document.getElementById('modal-title').textContent = '数式の挿入';
    document.getElementById('table-inputs').style.display = 'none';
    document.getElementById('list-inputs').style.display = 'none';
    document.getElementById('ref-inputs').style.display = 'none';
    document.getElementById('equation-inputs').style.display = 'block';
    showModalTips('tip-equation-detail');

    document.getElementById('input-modal').style.display = 'block';
    document.getElementById('modal-confirm-btn').onclick = insertEquation;
    const typeSelect = document.getElementById('equation-type');
    typeSelect.selectedIndex = 0;
    typeSelect.onchange = updateEquationTip;
    updateEquationTip();
}

function showListModal() {
    document.getElementById('modal-title').textContent = 'リストの挿入';
    document.getElementById('table-inputs').style.display = 'none';
    document.getElementById('list-inputs').style.display = 'block';
    document.getElementById('ref-inputs').style.display = 'none';
    document.getElementById('equation-inputs').style.display = 'none';
    showModalTips('tip-list');
    document.getElementById('input-modal').style.display = 'block';
    document.getElementById('modal-confirm-btn').onclick = insertList;
}

function showRefModal() {
    document.getElementById('modal-title').textContent = '引用の追加 (BibTeX)';
    document.getElementById('table-inputs').style.display = 'none';
    document.getElementById('list-inputs').style.display = 'none';
    document.getElementById('ref-inputs').style.display = 'block';
    document.getElementById('equation-inputs').style.display = 'none';
    showModalTips('tip-ref');
    document.getElementById('input-modal').style.display = 'block';

    document.getElementById('modal-confirm-btn').onclick = insertRef;
    const ids = ['ref-title', 'ref-author', 'ref-url', 'ref-key', 'ref-journal', 'ref-volume', 'ref-number', 'ref-pages', 'ref-year'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('ref-type').value = 'article';
    updateRefFields();
}

function updateRefFields() {
    const type = document.getElementById('ref-type').value;
    document.getElementById('ref-article-fields').style.display = (type === 'article') ? 'block' : 'none';
    document.getElementById('ref-misc-fields').style.display = (type === 'misc') ? 'block' : 'none';
}

function showTableModal() {
    document.getElementById('modal-title').textContent = '表の挿入';
    document.getElementById('table-inputs').style.display = 'block';
    document.getElementById('list-inputs').style.display = 'none';
    document.getElementById('ref-inputs').style.display = 'none';
    document.getElementById('equation-inputs').style.display = 'none';
    showModalTips('tip-table');
    document.getElementById('input-modal').style.display = 'block';
    document.getElementById('modal-confirm-btn').onclick = insertTable;
}

function showSidebarTab(tabId) {
    document.querySelectorAll('.sidebar-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    document.getElementById(tabId + '-btn').classList.add('active');

    if (tabId === 'outline-tab') {
        updateOutline();
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function insertText(text) {
    const doc = editor.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(text, cursor);
    editor.focus();
}

function insertTable() {
    const rows = parseInt(document.getElementById('table-rows').value);
    const cols = parseInt(document.getElementById('table-cols').value);

    let tableCode = `\\begin{table}[htbp]\n  \\centering\n  \\caption{Table Caption}\n  \\label{tab:my_table}\n  \\begin{tabular}{${'c'.repeat(cols)}}\n    \\toprule\n`;
    tableCode += `    ${' & '.repeat(cols - 1)} \\\\ \\midrule\n`;
    for (let i = 0; i < rows - 1; i++) {
        tableCode += `    ${' & '.repeat(cols - 1)} \\\\\n`;
    }

    tableCode += `    \\bottomrule\n  \\end{tabular}\n\\end{table}\n`;

    insertText(tableCode);
    closeModal('input-modal');
}

function insertList() {
    const count = parseInt(document.getElementById('list-items').value);
    const type = document.getElementById('list-type').value;

    let listCode = `\\begin{${type}}\n`;
    for (let i = 0; i < count; i++) {
        listCode += `  \\item \n`;
    }
    listCode += `\\end{${type}}\n`;

    insertText(listCode);
    closeModal('input-modal');
}

function insertRef() {
    const type = document.getElementById('ref-type').value;
    const title = document.getElementById('ref-title').value.trim();
    const author = document.getElementById('ref-author').value.trim();
    const year = document.getElementById('ref-year').value.trim();
    let key = document.getElementById('ref-key').value.trim();

    if (!title) {
        alert("タイトルは必須です。");
        return;
    }

    if (!key) {
        key = title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    }

    let bibCode = "";
    if (type === 'article') {
        const journal = document.getElementById('ref-journal').value.trim();
        const volume = document.getElementById('ref-volume').value.trim();
        const number = document.getElementById('ref-number').value.trim();
        const pages = document.getElementById('ref-pages').value.trim();

        bibCode = `@article{${key},\n`;
        if (author) bibCode += `  author = {${author}},\n`;
        bibCode += `  title = {{${title}}},\n`;
        if (journal) bibCode += `  journal = {${journal}},\n`;
        if (year) bibCode += `  year = {${year}},\n`;
        if (volume) bibCode += `  volume = {${volume}},\n`;
        if (number) bibCode += `  number = {${number}},\n`;
        if (pages) bibCode += `  pages = {${pages}}\n`;
        bibCode += `}\n`;
    } else {
        const url = document.getElementById('ref-url').value.trim();
        bibCode = `@misc{${key},\n`;
        if (author) bibCode += `  author = {${author}},\n`;
        bibCode += `  title = {{${title}}},\n`;
        if (url) bibCode += `  howpublished = {\\url{${url}}},\n`;
        if (year) bibCode += `  year = {${year}},\n`;
        bibCode += `  note = {Accessed: ${new Date().toISOString().split('T')[0]}}\n`;
        bibCode += `}\n`;
    }

    insertText(bibCode);
    closeModal('input-modal');
}

function insertEquation() {
    const type = document.getElementById('equation-type').value;
    let code = "";

    switch (type) {
        case 'equation':
            code = `\\begin{equation}\n    \\label{eq:}\n    \n\\end{equation}\n`;
            break;
        case 'align':
            code = `\\begin{align}\n    &  =  \\\\\n    &  =  \n\\end{align}\n`;
            break;
        case 'cases':
            code = `\\[\nf(x) = \\begin{cases}\n    1 & \\text{if } x > 0 \\\\\n    0 & \\text{otherwise}\n\\end{cases}\n\\]\n`;
            break;
        case 'inline':
            code = `$ $`;
            break;
        case 'display':
            code = `\\[\n    \n\\]\n`;
            break;
        case 'trig':
            code = `\\[ \\sin(\\theta) + \\cos(\\theta) = 1 \\]`;
            break;
    }

    insertText(code);
    closeModal('input-modal');
}

function updateEquationTip() {
    const type = document.getElementById('equation-type').value;
    const tipDetail = document.getElementById('tip-equation-detail');

    tipDetail.style.display = 'block';

    let html = "";
    switch (type) {
        case 'equation':
            html = `
                <strong>外観概要:</strong> 1つの数式が中央に大きく表示され、右端に (1) 等の番号が付きます。本文から参照したい式に。<br>
                <strong>書き方例:</strong> <code>\\begin{equation} \\label{eq:1} y = ax + b \\end{equation}</code>
            `;
            break;
        case 'align':
            html = `
                <strong>外観概要:</strong> イコール <code>=</code> の位置で縦に整列した数式になります。計算過程を順に示したい時に。<br>
                <strong>書き方例:</strong> <code>\\begin{align} a &= b+c \\\\ &= d+e \\end{align}</code>
            `;
            break;
        case 'cases':
            html = `
                <strong>外観概要:</strong> 左側に大きな中括弧 <code>{</code> が付き、条件ごとの式を並べられます。関数の定義などに。<br>
                <strong>書き方例:</strong> <code>f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}</code>
            `;
            break;
        case 'inline':
            html = `
                <strong>外観概要:</strong> 文章の中に自然に埋め込まれます（改行されません）。<br>
                <strong>書き方例:</strong> <code>文中 $E=mc^2$ のように書く</code>
            `;
            break;
        case 'display':
            html = `
                <strong>外観概要:</strong> 文章とは別の行の中央に表示されます（番号は付きません）。<br>
                <strong>書き方例:</strong> <code>\\[ E=mc^2 \\]</code>
            `;
            break;
    }
    tipDetail.innerHTML = html;
}

let outlineDebounce;
function updateOutline() {
    clearTimeout(outlineDebounce);
    outlineDebounce = setTimeout(() => {
        const text = editor.getValue();
        const list = document.getElementById('outline-list');
        list.innerHTML = '';

        const regex = /\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]+)\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const type = match[1];
            const title = match[2];
            const index = match.index;
            const lineNo = text.substring(0, index).split('\n').length - 1;
            const level = (type === 'subsection') ? 2 : (type === 'subsubsection' ? 3 : 1);

            const item = document.createElement('li');
            item.className = `outline-item level-${level}`;
            item.textContent = title;
            item.title = title;
            item.onclick = () => {
                editor.setCursor({ line: lineNo, ch: 0 });
                editor.focus();
                editor.scrollIntoView({ line: lineNo, ch: 0 }, 120);
            };
            list.appendChild(item);
        }

        if (list.innerHTML === '') {
            list.innerHTML = '<li class="outline-empty">No sections found</li>';
        }
    }, 500);
}

function insertNewPage() {
    insertText("\\newpage\n");
}
