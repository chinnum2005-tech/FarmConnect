import json

with open("scratch/file_inventory.json", "r", encoding="utf-8") as f:
    files = json.load(f)

print(f"Total files: {len(files)}")
# Let's inspect unique paths
paths = [x["path"] for x in files]
paths.sort()

# Group by directory
groups = {}
for p in paths:
    parts = p.split('/')
    if len(parts) == 1:
        grp = "Root Files"
    elif parts[0] == "apps":
        if len(parts) >= 3:
            grp = f"apps/{parts[1]}/{parts[2]}"
        else:
            grp = f"apps/{parts[1]}"
    elif parts[0] == "services":
        if len(parts) >= 3:
            grp = f"services/{parts[1]}/{parts[2]}"
        else:
            grp = f"services/{parts[1]}"
    elif parts[0] == "packages":
        if len(parts) >= 3:
            grp = f"packages/{parts[1]}/{parts[2]}"
        else:
            grp = f"packages/{parts[1]}"
    else:
        grp = parts[0]
    groups.setdefault(grp, []).append(p)

for g, filelist in sorted(groups.items()):
    print(f"\n=== {g} ({len(filelist)} files) ===")
    for f in filelist[:10]:
        print(f"  - {f}")
    if len(filelist) > 10:
        print(f"  ... and {len(filelist) - 10} more")
