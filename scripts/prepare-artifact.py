"""Turns dist/ into a claude.ai artifact bundle: body-only HTML + base64 copies of binary assets."""
import base64, pathlib, re
d = pathlib.Path(__file__).resolve().parent.parent / 'dist'
s = (d / 'index.html').read_text()
head = re.search(r'<head>(.*)</head>', s, re.S).group(1)
body = re.search(r'<body>(.*)</body>', s, re.S).group(1)
head = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', '', head)
head = head.replace('<title>Shift City</title>', '<title>Shift City</title>\n<style>:root{color-scheme:dark}</style>')
(d / 'publish.html').write_text(head.strip() + '\n' + body.strip() + '\n')
for f in list(d.rglob('*.hdr')) + list(d.rglob('*.glb')):
    f.with_name(f.name + '.b64.txt').write_text(base64.b64encode(f.read_bytes()).decode())
for f in sorted(d.rglob('*')):
    if f.is_file() and f.suffix not in ('.hdr', '.glb') and f.name not in ('index.html', 'publish.html', 'ferrari_ao.png'):
        print(f.relative_to(d))
