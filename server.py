import os
import subprocess
from fastapi import FastAPI, HTTPException, Body, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import glob
import shutil

app = FastAPI()

# Serve static files (HTML, CSS, JS) from 'static' directory
app.mount("/static", StaticFiles(directory="static"), name="static")

class FileContent(BaseModel):
    path: str
    content: str

@app.get("/")
def read_root():
    return FileResponse('static/index.html')

@app.get("/api/files")
def list_files():
    """List all files in the current directory (recursively), filtering out system files."""
    files = []
    # Files/Dirs to exclude
    EXCLUDED = {
        'server.py', 'Dockerfile', 'docker-compose.yml', 'static', '__pycache__'
    }
    
    for root, dirs, filenames in os.walk("."):
        # Modify dirs in-place to skip excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDED and not d.startswith('.')]
        
        for filename in filenames:
            if filename in EXCLUDED or filename.startswith('.'):
                continue
            
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, ".")
            files.append(rel_path)
    return sorted(files)

@app.get("/api/files/{file_path:path}")
def read_file(file_path: str):
    """Read content of a file."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return {"content": f.read()}
    except UnicodeDecodeError:
         return {"content": "Binary or non-UTF-8 file"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/files/{file_path:path}")
def save_file(file_path: str, file: FileContent):
    """Save content to a file."""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(file.content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to the root directory."""
    try:
        file_location = file.filename
        # Security check: prevent directory traversal/overwriting system files
        if file_location.startswith('/') or '..' in file_location:
             raise HTTPException(status_code=400, detail="Invalid filename")
        
        # Simple prevention of overwriting key system files
        if file_location in ['server.py', 'Dockerfile', 'docker-compose.yml']:
             raise HTTPException(status_code=403, detail="Cannot overwrite system files")

        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CompileRequest(BaseModel):
    filename: str = "main.tex"

@app.post("/api/compile")
def compile_latex(request: CompileRequest = Body(...)):
    """Compile specific tex file using latexmk."""
    target_file = request.filename
    try:
        # Run without text=True to get bytes, then decode safely
        # -g force compilation
        result = subprocess.run(["latexmk", "-pdf", "-g", "-interaction=nonstopmode", target_file], check=True, capture_output=True)
        return {"status": "success", "log": result.stdout.decode('utf-8', errors='replace')}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "log": (e.stdout + b"\n" + e.stderr).decode('utf-8', errors='replace')}

@app.get("/pdf")
def get_pdf(file: str = "main.pdf"):
    """Serve the generated PDF."""
    # Ensure it's a pdf
    if not file.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Not a PDF file")
    
    # Security: prevent basic traversal
    if ".." in file or file.startswith("/"):
         raise HTTPException(status_code=400, detail="Invalid filename")

    if os.path.exists(file):
        return FileResponse(file)
    raise HTTPException(status_code=404, detail="PDF not found")
