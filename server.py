import os
import subprocess
from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
import re
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import shutil

app = FastAPI()

# static ディレクトリの HTML/CSS/JS を配信する。
app.mount("/static", StaticFiles(directory="static"), name="static")

ROOT_DIR = os.path.abspath(".")
EXCLUDED_DIRS = {"static", "__pycache__", ".git"}
EXCLUDED_FILES = {"server.py", "Dockerfile", "docker-compose.yml"}


def resolve_project_path(path: str) -> str:
    """プロジェクト外へのパス指定を拒否して絶対パスへ変換する。"""
    normalized = os.path.normpath(path or ".")
    if normalized == ".":
        return ROOT_DIR
    if normalized.startswith("/") or normalized == ".." or normalized.startswith("../"):
        raise HTTPException(status_code=400, detail="Invalid path")
    full_path = os.path.abspath(os.path.join(ROOT_DIR, normalized))
    if os.path.commonpath([ROOT_DIR, full_path]) != ROOT_DIR:
        raise HTTPException(status_code=400, detail="Invalid path")
    return full_path


def is_hidden_or_excluded(path: str) -> bool:
    parts = path.split(os.sep)
    return any(part in EXCLUDED_DIRS or part.startswith(".") for part in parts)


class FileContent(BaseModel):
    path: str
    content: str


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class RenameFileRequest(BaseModel):
    old_path: str
    new_path: str

@app.get("/")
def read_root():
    return FileResponse('static/index.html')

@app.get("/api/files")
def list_files():
    """List all files in the current directory (recursively), filtering out system files."""
    files = []

    for root, dirs, filenames in os.walk(ROOT_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]

        for filename in filenames:
            rel_path = os.path.relpath(os.path.join(root, filename), ROOT_DIR)
            if filename in EXCLUDED_FILES or is_hidden_or_excluded(rel_path):
                continue
            files.append(rel_path)
    return sorted(files)

@app.get("/api/files/{file_path:path}")
def read_file(file_path: str):
    """Read content of a file."""
    full_path = resolve_project_path(file_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            return {"content": f.read()}
    except UnicodeDecodeError:
         return {"content": "Binary or non-UTF-8 file"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/{file_path:path}")
def save_file(file_path: str, file: FileContent):
    """Save content to a file."""
    try:
        full_path = resolve_project_path(file_path)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(file.content)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-file")
def create_file(request: CreateFileRequest):
    """空ファイルを作成する。"""
    full_path = resolve_project_path(request.path)
    rel_path = os.path.relpath(full_path, ROOT_DIR)
    filename = os.path.basename(full_path)

    if filename in EXCLUDED_FILES or is_hidden_or_excluded(rel_path):
        raise HTTPException(status_code=403, detail="Cannot create this file")
    if os.path.exists(full_path):
        raise HTTPException(status_code=409, detail="File already exists")

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(request.content)

    return {"status": "success", "path": rel_path}

@app.delete("/api/files/{file_path:path}")
def delete_file(file_path: str):
    """指定ファイルを削除する。"""
    full_path = resolve_project_path(file_path)
    rel_path = os.path.relpath(full_path, ROOT_DIR)
    filename = os.path.basename(full_path)

    if filename in EXCLUDED_FILES or is_hidden_or_excluded(rel_path):
        raise HTTPException(status_code=403, detail="Cannot delete this file")
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.isdir(full_path):
        raise HTTPException(status_code=400, detail="Directory deletion is not supported")

    os.remove(full_path)
    return {"status": "success"}

@app.post("/api/rename-file")
def rename_file(request: RenameFileRequest):
    """ファイルをリネームする。"""
    old_full_path = resolve_project_path(request.old_path)
    new_full_path = resolve_project_path(request.new_path)
    old_rel_path = os.path.relpath(old_full_path, ROOT_DIR)
    new_rel_path = os.path.relpath(new_full_path, ROOT_DIR)
    old_filename = os.path.basename(old_full_path)
    new_filename = os.path.basename(new_full_path)

    if old_filename in EXCLUDED_FILES or new_filename in EXCLUDED_FILES:
        raise HTTPException(status_code=403, detail="Cannot rename this file")
    if is_hidden_or_excluded(old_rel_path) or is_hidden_or_excluded(new_rel_path):
        raise HTTPException(status_code=403, detail="Cannot rename this file")
    if not os.path.exists(old_full_path):
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.isdir(old_full_path):
        raise HTTPException(status_code=400, detail="Directory rename is not supported")
    if os.path.exists(new_full_path):
        raise HTTPException(status_code=409, detail="Destination already exists")

    os.makedirs(os.path.dirname(new_full_path), exist_ok=True)
    os.replace(old_full_path, new_full_path)
    return {"status": "success", "path": new_rel_path}

@app.get("/api/raw/{file_path:path}")
def raw_file(file_path: str):
    """画像などをそのまま配信する。"""
    full_path = resolve_project_path(file_path)
    if not os.path.exists(full_path) or os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), directory: str = Form(".")):
    """Upload a file to the specified directory."""
    try:
        filename = os.path.basename(file.filename or "").replace(" ", "_")

        if not filename or filename.startswith(".") or ".." in filename:
             raise HTTPException(status_code=400, detail="Invalid filename")

        if filename in EXCLUDED_FILES:
             raise HTTPException(status_code=403, detail="Cannot overwrite system files")

        target_dir = "." if directory in ("", ".") else directory
        target_dir_path = resolve_project_path(target_dir)
        os.makedirs(target_dir_path, exist_ok=True)

        full_path = os.path.join(target_dir_path, filename)
        with open(full_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        rel_path = os.path.relpath(full_path, ROOT_DIR)
        return {"status": "success", "filename": filename, "path": rel_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CompileRequest(BaseModel):
    filename: str = "main.tex"

@app.post("/api/compile")
def compile_latex(request: CompileRequest = Body(...)):
    """Compile specific tex file using latexmk."""
    target_file = request.filename
    if not target_file.endswith('.tex'):
        raise HTTPException(status_code=400, detail="Only .tex files can be compiled")
    resolve_project_path(target_file)
    
    try:
        # -cd により対象 .tex のディレクトリ基準で画像や \input を解決する。
        latexmkrc_path = os.path.abspath(".latexmkrc")
        cmd = ["latexmk", "-pdfdvi", "-synctex=1", "-cd", "-g", "-f", "-interaction=nonstopmode"]
        if os.path.exists(latexmkrc_path):
            cmd.extend(["-r", latexmkrc_path])
        cmd.append(target_file)
        
        result = subprocess.run(cmd, check=True, capture_output=True)
        
        pdf_path = target_file.rsplit('.', 1)[0] + '.pdf'

        return {
            "status": "success", 
            "logs": result.stdout.decode('utf-8', errors='replace'),
            "pdf_path": pdf_path
        }
    except subprocess.CalledProcessError as e:
        return {"status": "error", "logs": (e.stdout + b"\n" + e.stderr).decode('utf-8', errors='replace')}


@app.get("/api/citations")
def get_citations():
    """Extract citations from all .bib files in the project."""
    citations = []
    for root, dirs, filenames in os.walk(ROOT_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]
        rel_root = os.path.relpath(root, ROOT_DIR)
        if any(x in rel_root for x in ['template', 'Paper_template']):
            continue
        for filename in filenames:
            if filename.endswith(".bib"):
                bib_path = os.path.join(root, filename)
                try:
                    with open(bib_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        entries = re.finditer(r'@(\w+)\s*\{\s*([^,]+),', content)
                        for match in entries:
                            entry_type = match.group(1).lower()
                            key = match.group(2).strip()
                            
                            entry_content = content[match.end():]
                            title_match = re.search(r'title\s*=\s*[\{\"](.+?)[\}\"]', entry_content, re.IGNORECASE | re.DOTALL)
                            author_match = re.search(r'author\s*=\s*[\{\"](.+?)[\}\"]', entry_content, re.IGNORECASE | re.DOTALL)
                            year_match = re.search(r'year\s*=\s*[\{\"]?(\d{4})[\}\"]?', entry_content, re.IGNORECASE | re.DOTALL)
                            
                            citations.append({
                                "key": key,
                                "type": entry_type,
                                "title": title_match.group(1).strip() if title_match else "No Title",
                                "author": author_match.group(1).strip() if author_match else "Unknown Author",
                                "year": year_match.group(1).strip() if year_match else "",
                                "file": os.path.relpath(bib_path, ROOT_DIR)
                            })
                except Exception as e:
                    print(f"Error parsing {bib_path}: {e}")
    return citations

@app.get("/pdf")
def get_pdf(file: str = "main.pdf"):
    """Serve the generated PDF."""
    if not file.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Not a PDF file")

    full_path = resolve_project_path(file)
    if os.path.exists(full_path):
        return FileResponse(full_path, media_type='application/pdf')
    raise HTTPException(status_code=404, detail="PDF not found")
