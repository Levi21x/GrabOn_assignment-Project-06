import codecs

path = r'README.md'
with codecs.open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Keep only up to and including the "Total infrastructure cost" line
# plus one trailing newline
keep_up_to = None
for i, line in enumerate(lines):
    if '**Total infrastructure cost' in line:
        keep_up_to = i

if keep_up_to is None:
    print("ERROR: boundary not found")
else:
    print(f"Keeping lines 1-{keep_up_to+1}")
    clean = lines[:keep_up_to+1]
    # Ensure file ends with a newline
    if not clean[-1].endswith('\n'):
        clean[-1] += '\n'
    with codecs.open(path, 'w', encoding='utf-8') as f:
        f.writelines(clean)
    print(f"Done. File now has {keep_up_to+1} lines.")
