let editor;
let currentFilePath = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: "stex",
        theme: "monokai",
        lineNumbers: true,
        lineWrapping: true
    });

    // Track changes for "Unsaved" status
    editor.on('change', () => {
        if (!currentFilePath) return;
        const btn = document.getElementById('save-btn');
        if (btn.textContent !== 'Save (Ctrl+S) *') {
            btn.textContent = 'Save (Ctrl+S) *';
            btn.style.backgroundColor = '#e74c3c'; // Redish for unsaved
        }
    });

    // Handle Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    loadFiles();
});

async function loadFiles() {
    const res = await fetch('/api/files');
    const files = await res.json();
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file;
        li.onclick = () => openFile(file);
        list.appendChild(li);
    });
}

async function openFile(path) {
    if (currentFilePath === path) return;

    // Save current file? (Maybe auto-save later)

    const res = await fetch(`/api/files/${path}`);
    if (res.ok) {
        const data = await res.json();
        editor.setValue(data.content);
        currentFilePath = path;
        document.getElementById('current-file').textContent = path;

        // Highlight active file in list
        document.querySelectorAll('#file-list li').forEach(li => {
            li.classList.remove('active');
            if (li.textContent === path) li.classList.add('active');
        });

        // Reset save button
        const btn = document.getElementById('save-btn');
        btn.textContent = 'Save (Ctrl+S)';
        btn.style.backgroundColor = '#2980b9'; // Blue (Default)

        // If it's a pdf, open it? No logic for now.
        if (path.endsWith('.pdf')) {
            document.getElementById('pdf-preview').src = `/api/files/${path}`;
        } else if (path === 'main.tex') {
            document.getElementById('pdf-preview').src = "/pdf?t=" + new Date().getTime();
        }
    } else {
        alert('Failed to load file');
    }
}

async function saveFile() {
    if (!currentFilePath) return;
    const content = editor.getValue();
    const res = await fetch(`/api/files/${currentFilePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFilePath, content: content })
    });
    if (res.ok) {
        // Maybe show a small toast
        console.log('Saved');
        const btn = document.getElementById('save-btn');
        btn.textContent = 'Saved!';
        btn.style.backgroundColor = '#27ae60'; // Green
        setTimeout(() => {
            btn.textContent = 'Save (Ctrl+S)';
            btn.style.backgroundColor = '#2980b9'; // Back to Blue
        }, 1000);
    } else {
        alert('Failed to save');
    }
}

async function compileLatex() {
    if (!currentFilePath) {
        alert("Select a file first!");
        return;
    }

    const btn = document.getElementById('compile-btn');
    btn.textContent = 'Compiling...';
    btn.disabled = true;

    // Save first
    await saveFile();

    const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentFilePath })
    });
    const data = await res.json();

    btn.textContent = 'Compile';
    btn.disabled = false;

    if (data.status === 'success') {
        const iframe = document.getElementById('pdf-preview');
        // Determine PDF name from tex file
        const pdfName = currentFilePath.replace(/\.tex$/, '.pdf');
        iframe.src = `/pdf?file=${pdfName}&t=` + new Date().getTime();

        // Hide log on success, or maybe show it if there are warnings?
        // For now, hide it to reduce clutter unless there's an error.
        document.getElementById('log-container').style.display = 'none';
    } else {
        // Show log
        const logArea = document.getElementById('log-container');
        const logContent = document.getElementById('log-content');
        logArea.style.display = 'block';
        logContent.textContent = data.log || "Unknown error occurred.";

        alert('Compilation failed!\nCheck the log panel.');
        console.error(data.log);
    }
}

function toggleLogs() {
    const logContainer = document.getElementById('log-container');
    const logBtn = document.getElementById('log-btn');

    if (logContainer.style.display === 'none' || logContainer.style.display === '') {
        logContainer.style.display = 'block';
        logBtn.style.backgroundColor = '#95a5a6'; // Active state
    } else {
        logContainer.style.display = 'none';
        logBtn.style.backgroundColor = '#7f8c8d'; // Inactive state
    }
}

function triggerUpload() {
    document.getElementById('file-upload').click();
}

async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });

    if (res.ok) {
        // Refresh file list
        loadFiles();
        // Clear input
        input.value = '';
    } else {
        const err = await res.json();
        alert('Upload failed: ' + err.detail);
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

    // Reuse upload logic, but we need to handle the UI update separately
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });

    if (res.ok) {
        // Refresh file list
        loadFiles();

        // Insert LaTeX code at cursor
        const doc = editor.getDoc();
        const cursor = doc.getCursor();
        const texCode = `\\begin{figure}[htbp]\n    \\centering\n    \\includegraphics[width=\\linewidth]{${file.name}}\n    \\caption{${file.name}}\n    \\label{fig:${file.name}}\n\\end{figure}\n`;
        doc.replaceRange(texCode, cursor);

        // Clear input
        input.value = '';
    } else {
        const err = await res.json();
        alert('Image upload failed: ' + err.detail);
    }
}
