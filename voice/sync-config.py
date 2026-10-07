#!/usr/bin/env python3
"""Update static branding/metadata. No runtime fetch or site build is required."""
from pathlib import Path
from html import escape
import json
import re
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
config = json.loads((ROOT / 'site-config.json').read_text())
if '--check-release' in sys.argv:
    endpoint = urlparse(config['signupEndpoint'])
    if endpoint.scheme != 'https' or not endpoint.hostname or endpoint.hostname in ('localhost', '127.0.0.1'):
        raise SystemExit('Release blocked: configure and verify an HTTPS signupEndpoint first.')
name, url = (config[key] for key in ('name', 'productionUrl'))
title = escape(name + ' — Work without a screen.', quote=True)
description = escape(config['description'], quote=True)
page = (ROOT / 'index.html').read_text()
page = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', page)
for selector, value in [('name="description"', description), ('property="og:title"', title),
                        ('property="og:description"', description), ('property="og:url"', escape(url)),
                        ('property="og:image"', escape(url + 'og.png')),
                        ('property="og:image:alt"', escape(name + '. Work without a screen. Private beta.'))]:
    page = re.sub(r'(<meta ' + selector + r' content=")[^"]*(">)', lambda m: m[1] + value + m[2], page)
page = re.sub(r'(<link rel="canonical" href=")[^"]*(">)', lambda m: m[1] + escape(url) + m[2], page)
page = re.sub(r'(<span data-brand>).*?(</span>)', lambda m: m[1] + escape(name) + m[2], page)
page = re.sub(r'aria-label="[^"]* home"', lambda _: 'aria-label="' + escape(name) + ' home"', page)
page = re.sub(r'(<(?:span|p) data-credit>).*?(</(?:span|p)>)', lambda m: m[1] + escape(config['credit']) + m[2], page)
runtime = {'signupEndpoint': config['signupEndpoint']}
(ROOT / 'runtime-config.js').write_text('window.VOICE_CONFIG = Object.freeze(' + json.dumps(runtime) + ');\n')
(ROOT / 'index.html').write_text(page)
# The editable vector is also the source for the 1200×630 PNG share image.
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f4f2e9"/>
<path d="M56 102h1088M56 549h1088" stroke="#cecec0"/>
<rect x="56" y="43" width="32" height="32" rx="9" fill="#234b3d"/>
<path d="M64 52h7v7l-7 6V52Zm10 0h7v7l-7 6V52Z" fill="#f4f2e9"/>
<g fill="#253b31"><text x="101" y="67" font-family="Arial,sans-serif" font-size="23">{escape(name)}</text>
<text x="1144" y="65" text-anchor="end" font-family="Arial,sans-serif" font-size="13" letter-spacing="2">PRIVATE BETA</text>
<text x="600" y="270" text-anchor="middle" font-family="Georgia,serif" font-size="115" letter-spacing="-6">Work without</text>
<text x="600" y="395" text-anchor="middle" font-family="Georgia,serif" font-size="115" font-style="italic" letter-spacing="-6" fill="#234b3d">a screen.</text>
<path d="M325 417Q570 435 891 414" fill="none" stroke="#80937b"/>
<text x="600" y="488" text-anchor="middle" font-family="Arial,sans-serif" font-size="20">AI briefs you. You clarify, decide, and steer by voice.</text>
<text x="56" y="588" font-family="Arial,sans-serif" font-size="15">{escape(config['credit'])}</text>
<text x="1144" y="588" text-anchor="end" font-family="Arial,sans-serif" font-size="15">First version in development · Request access ↗</text></g></svg>'''
(ROOT / 'og.svg').write_text(svg)
print('Updated index.html and og.svg. Re-export og.png after a branding change.')
