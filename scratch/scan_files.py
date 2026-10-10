import os
import json

root_dir = r"c:\Users\chinn\Desktop\AgroTrace"

exclude_dir_names = {
    "node_modules", ".git", "__pycache__", ".turbo", ".qoder", 
    "artifacts", "cache", "dist", "build", ".next", "coverage",
    ".venv", "venv", "env", ".mypy_cache", ".pytest_cache"
}

all_files = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    # filter out unwanted directories at all levels
    dirnames[:] = [d for d in dirnames if d.lower() not in exclude_dir_names]
    
    rel_dir = os.path.relpath(dirpath, root_dir)
    for f in filenames:
        if f in [".DS_Store", "package-lock.json", "turbo_log.txt", "edits.json"]:
            continue
        full_path = os.path.join(dirpath, f)
        rel_path = os.path.join(rel_dir, f) if rel_dir != "." else f
        rel_path = rel_path.replace("\\", "/")
        
        size = os.path.getsize(full_path)
        all_files.append({
            "path": rel_path,
            "size": size
        })

print(f"Total relevant source files: {len(all_files)}")
with open(os.path.join(root_dir, "scratch", "file_inventory.json"), "w", encoding="utf-8") as out:
    json.dump(all_files, out, indent=2)

# Categorize files by module
categories = {}
for item in all_files:
    p = item["path"]
    parts = p.split("/")
    top = parts[0]
    if top == "apps" and len(parts) > 1:
        cat = f"apps/{parts[1]}"
    elif top == "services" and len(parts) > 1:
        cat = f"services/{parts[1]}"
    elif top == "packages" and len(parts) > 1:
        cat = f"packages/{parts[1]}"
    else:
        cat = top
    categories.setdefault(cat, []).append(p)

for c, files in sorted(categories.items()):
    print(f"[{c}]: {len(files)} files")
