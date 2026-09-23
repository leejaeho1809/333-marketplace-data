# -*- coding: utf-8 -*-
"""2026-08-31 오늘자 업데이트 병합
   - 기존 항목에 addedOn='2026-08-28' 부여(최초 1회)
   - 신규 항목은 addedOn='2026-08-31' + 스키마 정규화 후 배열 뒤에 append (id 안정성 유지)
"""
import json, io, re, unicodedata

R = '/root/333/'
TODAY = '2026-08-31'
BASE = '2026-08-28'

def L(f): return json.load(open(R + f, encoding='utf-8'))
def W(f, d): io.open(R + f, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1))
def norm(s): return re.sub(r'[^a-z0-9가-힣]', '', unicodedata.normalize('NFKC', str(s or '')).lower())

def stampBase(rows):
    for r in rows: r.setdefault('addedOn', BASE)
    return rows

report = []

# ── 1. 기업
cos = stampBase(L('v2_sauna.json'))
have = {norm(c['name']) for c in cos}
haveurl = {(c.get('url') or '').rstrip('/').replace('https://','').replace('http://','').replace('www.','') for c in cos}
add = 0
for e in L('v2_new_cos.json'):
    u = (e.get('url') or '').rstrip('/').replace('https://','').replace('http://','').replace('www.','')
    if norm(e['name']) in have or (u and u in haveurl):
        report.append('  ~ 중복 제외(기업): ' + e['name']); continue
    e['addedOn'] = TODAY
    cos.append(e); have.add(norm(e['name'])); add += 1
report.append('기업 +%d → %d' % (add, len(cos)))
W('v2_sauna.json', cos)

# ── 2. 멤버십
mem = stampBase(L('v2_mem.json'))
have = {norm(m['name']) for m in mem}
add = 0
for e in L('v2_new_mem.json'):
    if norm(e['name']) in have:
        report.append('  ~ 중복 제외(멤버십): ' + e['name']); continue
    e['addedOn'] = TODAY
    mem.append(e); have.add(norm(e['name'])); add += 1
report.append('멤버십 +%d → %d' % (add, len(mem)))
W('v2_mem.json', mem)

# ── 3. 프로그램 원형 (오늘은 신규 조사 없음, addedOn만 부여)
prog = stampBase(L('v2_prog.json'))
report.append('프로그램 %d (변동 없음)' % len(prog))
W('v2_prog.json', prog)

# ── 4. 상품
prod = stampBase(L('v2_prod.json'))
pair = {(norm(p['brand']), norm(p['product'])) for p in prod}
bn = {}
for p in prod: bn[norm(p['brand'])] = bn.get(norm(p['brand']), 0) + 1

def ig_obj(v):
    if not v or str(v).lower() in ('null', 'none', '미확인'):
        return {'handle': '미확인', 'url': '', 'followers': '미확인'}
    h = v if str(v).startswith('@') else '@' + str(v)
    return {'handle': h, 'url': 'https://instagram.com/' + h.lstrip('@'), 'followers': '미확인'}

add = 0
for e in L('v2_new_prod.json'):
    b, n = norm(e['brand']), norm(e['name'])
    if (b, n) in pair:
        report.append('  ~ 중복 제외(상품): ' + e['brand'] + ' ' + e['name']); continue
    if bn.get(b, 0) >= 3:
        report.append('  ~ 브랜드 3종 초과(상품): ' + e['brand'] + ' ' + e['name']); continue
    price = e.get('price') or '미확인'
    prod.append({
        'brand': e['brand'], 'product': e['name'], 'cat': e['cat'], 'sub': e['sub'],
        'origin': e['origin'], 'url': e['url'], 'priceSrc': e['url'], 'price': price,
        'ig': ig_obj(e.get('ig')), 'design': e.get('design', ''), 'story': e.get('story', ''),
        'why333': e.get('fit', ''), 'edge': e.get('edge', ''), 'krDist': e.get('krStatus', '미확인'),
        'verified': e.get('verified', ''), 'wholesale': e.get('wholesale', '미확인'),
        'confidence': '낮음' if ('미확인' in price or '3자' in price) else '높음',
        'sources': e.get('sources', []), 'addedOn': TODAY,
    })
    pair.add((b, n)); bn[b] = bn.get(b, 0) + 1; add += 1
report.append('상품 +%d → %d' % (add, len(prod)))
W('v2_prod.json', prod)

# ── 5. 트렌드
trend = stampBase(L('v2_trend.json'))
have = {norm(t['t'])[:30] for t in trend}
add = 0
for e in L('v2_new_trend.json'):
    if norm(e['t'])[:30] in have:
        report.append('  ~ 중복 제외(트렌드): ' + e['t'][:40]); continue
    e['addedOn'] = TODAY
    trend.append(e); add += 1
report.append('트렌드 +%d → %d' % (add, len(trend)))
W('v2_trend.json', trend)

# ── 6. 시장
market = stampBase(L('v2_market.json'))
have = {norm(m['m']) for m in market}
add = 0
for e in L('v2_new_market.json'):
    if norm(e['m']) in have:
        report.append('  ~ 중복 제외(시장): ' + e['m']); continue
    e['addedOn'] = TODAY
    market.append(e); add += 1
report.append('시장 +%d → %d' % (add, len(market)))
W('v2_market.json', market)

# ── 7. 규제 (키 이름 정규화: t→item, priority→pri, org→who, eff 는 law 에서 시행일 추출)
reg = stampBase(L('v2_reg.json'))
have = {norm(r['item'])[:40] for r in reg}
add = 0
for e in L('v2_new_reg.json'):
    item = e.get('item') or e.get('t') or ''
    if norm(item)[:40] in have:
        report.append('  ~ 중복 제외(규제): ' + item[:40]); continue
    mm = re.search(r'(\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?)', e.get('law', ''))
    reg.append({
        'area': e['area'], 'item': item, 'law': e.get('law', ''),
        'eff': ('시행 ' + mm.group(1)) if mm else '시행일 미확인',
        'todo': e.get('todo', ''), 'who': e.get('who') or e.get('org', ''),
        'when': e.get('when', '개점전'), 'pri': e.get('pri') or e.get('priority', '보통'),
        'risk': e.get('risk', ''),
        'status': '확인됨' if e.get('status') == '확인완료' else e.get('status', '확인필요'),
        'url': e.get('url', ''), 'addedOn': TODAY,
    })
    add += 1
report.append('규제 +%d → %d' % (add, len(reg)))
W('v2_reg.json', reg)

print('\n'.join(report))
