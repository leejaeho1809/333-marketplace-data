# -*- coding: utf-8 -*-
"""v2 데이터셋 조립 — 파트별 id·판정 필드 부여, 상세 카테고리 역구성, 조사 이력 레지스트리"""
import json, collections, re

def L(f): return json.load(open(f, encoding='utf-8'))

sauna = L('v2_sauna.json'); mem = L('v2_mem.json'); prog = L('v2_prog.json')
prod  = L('v2_prod.json');  trend = L('v2_trend.json')
market= L('v2_market.json'); reg  = L('v2_reg.json')
for _m in market: _m['val'] = _m.pop('v')   # 'v'는 판정 필드라 값을 val로 옮긴다

def stamp(rows, pre):
    for i, r in enumerate(rows, 1):
        r['id'] = '%s%03d' % (pre, i)
        r['v'] = ''            # 판정: '' 미판정 / fit 적합 / hold 보류
    return rows

stamp(sauna,'c'); stamp(mem,'m'); stamp(prog,'g')
stamp(prod,'p');  stamp(trend,'t'); stamp(market,'k'); stamp(reg,'r')

# ── 상세 카테고리 — 검색된 상품을 토대로 단순하게 재구성
CATG = {'B':('뷰티','열이 빠지는 30분'),'F':('식품','다시 채우는 것'),
        'S':('건기식','회복의 과학'),'L':('생활용품','집으로 가져가는 333˚')}
# (코드, 이름, 매칭 키워드) — 순서대로 첫 매칭에 배정
RULES = {
 'B':[('B1','세정 — 비누·워시·샴푸', r'바디워시|비누|핸드워시|솝|샴푸|스크럽'),
      ('B2','향 — 향수·캔들·향 원액',  r'향수|프래그런스|향초|캔들|인센스|에센셜 오일|뢰윌리'),
      ('B3','바디 — 오일·크림·데오', r'두피|핸드크림|데오도란트|바디오일|밤|바디크림|로션')],
 'F':[('F1','논알콜 — 아페리티프·소다·비터스', r'논알콜|소다|스파클링|비터스|아페리티프'),
      ('F2','차 — 블렌드·말차·호지차', r'블렌드 티|말차|호지차|허브티|백차|잎차|녹차|티\b'),
      ('F3','커피 — 원두·드립', r'커피|원두|에스프레소'),
      ('F4','주방·스낵 — 집으로 가져가는 맛', r'통조림|올리브오일|초콜릿|꿀|브로스|육수|스낵|바\b')],
 'S':[('S1','미네랄 — 발한 직후 재충전', r'마그네슘|전해질|미네랄'),
      ('S2','수면 — 세션 후', r'수면|나이트'),
      ('S3','회복 — 단백질·콜라겐·버섯', r'콜라겐|단백질|프로틴|버섯|어댑토젠|집중|크레아틴')],
 'L':[('L1','린넨 — 가운·타월·매트·시트', r'가운|타월|배스매트|배스 매트|로브|시트 커버|페플렛티|린넨'),
      ('L2','목욕 도구 — 브러시·스크럽', r'브러싱|브러시'),
      ('L3','사우나 기물 — 버킷·모자·스톤', r'사우나 기물|사우나 향|사우나 모자|온도계|버킷|스톤|래들'),
      ('L4','오브제 — 컵·유리·오래 쓰는 것', r'오브제|유리컵|글라스|세라믹|컵'),
      ('L5','향 — 인센스·캔들·룸스프레이', r'인센스|캔들|룸 프래그런스|디퓨저')],
}
import re as _re
bucket = {}
for p in prod:
    g = p['cat']
    for code, nm, pat in RULES[g]:
        if _re.search(pat, p['sub']):
            p['subCode'] = code; p['subName'] = nm
            bucket.setdefault(code, []).append(p); break
    else:
        code = g + '9'; p['subCode'] = code; p['subName'] = '기타'
        bucket.setdefault(code, []).append(p)

cats = []
for g,(gn,note) in CATG.items():
    items = []
    for code, nm, _ in RULES[g]:
        ps = bucket.get(code, [])
        if not ps: continue
        items.append({'c':code,'n':nm,'cnt':len(ps),
                      'brands':sorted({x['brand'] for x in ps}),
                      'ex':' · '.join(x['product'][:28] for x in ps[:3])})
    cats.append({'g':gn,'code':g,'note':note,'items':items,
                 'cnt':sum(i['cnt'] for i in items)})


# ── 사우나 멤버십 기준표 — 회비를 월 환산 원화로 정규화
# 원칙 ① 회차권(N회권·패스팩)은 절대 월 환산하지 않는다. 유효기간으로 나누면 정기회비처럼 보인다.
#      ② '유효 3개월' 같은 만료 표기는 과금 주기가 아니다 — 주기 탐색 전에 지운다.
#      ③ 주기 토큰이 여러 개면 문자열에서 가장 앞에 나온 것을 채택한다.
KRW_RE = _re.compile(r'약\s*([\d,]+(?:\.\d+)?)\s*(만원|억원|원)')
MON_RE = _re.compile(r'월\s*환산\s*(?:약\s*)?([\d,]+(?:\.\d+)?)\s*(만원|원)')
PACK_RE = _re.compile(r'\d+\s*(?:Sessions?|회권|회차|회\b|매|크레딧|Credits?|Passe?s?|Pack)|'
                      r'회수권|클립카드|멀티패스|multi-?pass|[-\s]Pack\b|Pass\s*Pack|Credit\s*Pack', _re.I)
SUB_RE  = _re.compile(r'/\s*(?:월|주|년|연)|월\s*정액|월\s*회비|주\s*당|monthly|weekly|annual|'
                      r'per\s*(?:month|week|year)|매\s*월|서브스크립션|subscription|자동\s*갱신', _re.I)
VALID_RE = _re.compile(r'유효(?:기간)?\s*[:·]?\s*\d+\s*(?:개월|년|일|주)|'
                       r'\d+\s*(?:개월|년|일)\s*(?:동안\s*)?유효|valid\s*(?:for\s*)?\d+\s*\\w+|'
                       r'\d+\s*(?:개월|년)\s*(?:후\s*)?(?:만료|소멸)', _re.I)
# 주기로 오인하기 쉬운 표현 — 탐색 전에 지운다 (약정기간·유효기간·연회비는 과금 주기가 아니다)
EXCL_RE = _re.compile(r'최소\s*\d+\s*(?:개월|주|년)\s*약정|\d+\s*개월\s*약정|약정\s*\d+\s*개월|'
                      r'연\s*회비|가입비|입회금|개설비|'
                      r'유효(?:기간)?\s*[:·]?\s*\d+\s*(?:개월|년|일|주)|\d+\s*(?:개월|년|일)\s*(?:동안\s*)?유효|'
                      r'valid\s*(?:for\s*)?\d+|\d+\s*(?:개월|년)\s*(?:후\s*)?(?:만료|소멸)', _re.I)
CUR = r'[A-Z¥£€$₩฿\d]'
PERIOD = [
 (_re.compile(r'/\s*월|월\s*정액|월\s*회비|월\s*무제한|monthly|per\s*month|매\s*월|/\s*1\s*개월|'
              r'(?:^|[\s(/·—-])월\s*(?:약|' + CUR + r')|1\s*개월\s*무제한|30\s*일\s*무제한', _re.I), 1.0),
 (_re.compile(r'/\s*4\s*주|4\s*주\s*마다|every\s*4\s*weeks', _re.I), 1.0857),
 (_re.compile(r'/\s*주|주\s*당|per\s*week|weekly|(?:^|[\s(/·—-])주\s*(?:약|' + CUR + r')', _re.I), 4.345),
 (_re.compile(r'/\s*(?:년|연)|per\s*year|annual|1\s*년|12\s*개월|'
              r'(?:^|[\s(/·—-])연\s*(?:약|' + CUR + r')|연간\s*(?:구독|패스|회원|권)', _re.I), 1/12.0),
 (_re.compile(r'6\s*개월|반\s*년|semestral', _re.I), 1/6.0),
 (_re.compile(r'3\s*개월|90\s*일|trimestral|분기', _re.I), 1/3.0),
 (_re.compile(r'45\s*일', _re.I), 30/45.0),
]

def _period(fee, at):
    """금액이 놓인 자리 주변에서 과금 주기를 찾는다 — 앞 30자 → 뒤 14자 → 문장 전체 순."""
    t = EXCL_RE.sub(lambda m: ' ' * len(m.group(0)), fee)
    # 앞쪽 창에서는 금액에 '가장 가까운' 토큰을, 뒤쪽·전체 창에서는 가장 앞선 토큰을 쓴다
    for lo, hi, nearest in ((max(0, at - 30), min(len(t), at + 6), True),
                            (at, min(len(t), at + 14), False),
                            (0, len(t), False)):
        seg = t[lo:hi]
        hits = []
        for rx, mu in PERIOD:
            for mo in rx.finditer(seg):
                hits.append((mo.start(), mu))
        if hits:
            hits.sort(key=lambda x: -x[0] if nearest else x[0])
            return hits[0][1]
    return None

ONLY_JOIN = _re.compile(r'^(?:입회금|가입비|출자금|보증금|개설비|신청비)')
THIRD_RE  = _re.compile(r'3자\s*출처|third\s*party|보도\s*기준|기사\s*기준|\d{4}년\s*(?:보도|기준|기사)')
DIVLAB = {4.345: '주→월', 1.0857: '4주→월', 1/12.0: '연→월', 1/6.0: '6개월→월',
          1/3.0: '3개월→월', 30/45.0: '45일→월'}

def _krw(m):
    n = float(m.group(1).replace(',', ''))
    return n * (10**4 if m.group(2) == '만원' else 10**8 if m.group(2) == '억원' else 1)

saunaMem, saunaPack, saunaOpen = [], [], []
for c in sauna:
    mm = c.get('membership') or {}
    base = {'co': c['name'], 'coId': c['id'], 'country': c.get('country',''),
            'url': c.get('url',''), 'type': mm.get('type',''),
            'guest': mm.get('guest',''), 'booking': mm.get('booking',''),
            'vs': mm.get('vsNonMember',''), 'cap333': mm.get('cap','')}
    if not (mm.get('tiers') or []):
        saunaOpen.append(dict(base, n='', fee='', why=('멤버십 없음' if mm.get('type')=='없음' else '미확인')))
        continue
    for t in mm['tiers']:
        fee = str(t.get('fee') or '')
        row = dict(base, n=str(t.get('n') or ''), fee=fee,
                   cap=str(t.get('cap') or ''), perks=t.get('perks') or [],
                   join=str(t.get('join') or ''), term=str(t.get('term') or ''))
        row['src'] = '3자 출처' if THIRD_RE.search(fee) else '공식'
        row['chk'] = t.get('chk', '미검증')
        row['note'] = t.get('note', '')
        row['was'] = t.get('was', '')
        # ── 재검증으로 구조 필드가 붙은 티어는 문장 파싱을 타지 않는다
        if t.get('per') == 'pack' and t.get('krwTotal'):
            row['krw'] = int(t['krwTotal']); row['how'] = '회차권 총액 (검증)'
            row['per1'] = int(t['krwTotal'] / t['qty']) if t.get('qty') else 0
            row['fixed'] = True
            saunaPack.append(row); continue
        if isinstance(t.get('krwMonth'), (int, float)) and t['krwMonth']:
            row['krw'] = int(t['krwMonth'])
            row['how'] = '검증 (%s)' % {'month':'월','week':'주→월','4week':'4주→월','year':'연→월',
                                        '3month':'3개월→월','6month':'6개월→월','45day':'45일→월'}.get(t.get('per'), '월')
            row['fixed'] = True
            saunaMem.append(row); continue
        if not fee or '미확인' in fee:
            saunaOpen.append(dict(row, why='금액 미확인')); continue
        km = KRW_RE.search(fee)
        if not km:
            saunaOpen.append(dict(row, why='원화 병기 없음')); continue
        blob = row['n'] + ' ' + fee + ' ' + row['cap']
        if PACK_RE.search(blob) and not SUB_RE.search(fee):
            row['krw'] = int(_krw(km))          # 총액 — 월 환산하지 않는다
            pu = _re.search(r'회당[^약]{0,20}약\s*([\d,.]+)\s*만원', fee)
            row['per1'] = int(float(pu.group(1).replace(',', '')) * 10**4) if pu else 0
            row['how'] = '회차권 총액'
            saunaPack.append(row); continue
        if ONLY_JOIN.search(fee.strip()):
            saunaOpen.append(dict(row, why='일회성 가입비')); continue
        m1 = MON_RE.search(fee)
        if m1:
            row['krw'] = int(float(m1.group(1).replace(',', '')) * (10**4 if m1.group(2)=='만원' else 1))
            row['how'] = '월 환산 표기'
            saunaMem.append(row); continue
        mu = _period(fee, km.start())
        if mu is None:
            saunaOpen.append(dict(row, why='과금 주기 불명')); continue
        row['krw'] = int(_krw(km) * mu)
        row['how'] = '월 환산' + ('' if mu == 1.0 else ' (%s)' % DIVLAB.get(mu, ''))
        saunaMem.append(row)

# 회원 정원 상한 추출 — 회사 전체 텍스트에서 「N명 한정」류를 찾는다
CAPN = [_re.compile(x) for x in [
  r'회원\s*(?:수\s*)?(?:상한|정원)?\s*(\d{2,4})\s*명\s*한정', r'(\d{2,4})\s*명\s*한정',
  r'창립\s*회원\s*(\d{2,4})\s*명', r'(\d{2,4})\s*名限定', r'限量\s*(\d{2,4})\s*位',
  r'회원\s*(\d{2,4})\s*명\s*(?:으로\s*)?(?:제한|마감)', r'정원\s*(\d{2,4})\s*명\s*(?:의\s*)?회원',
  r'capped\s*at\s*(\d{2,4})\s*members', r'(\d{2,4})\s*member\s*cap']]
_capOf = {}
for c in sauna:
    mm = c.get('membership') or {}
    blob = json.dumps(mm, ensure_ascii=False) + ' ' + json.dumps(c.get('numbers') or [], ensure_ascii=False) \
           + ' ' + str(c.get('scale','')) + ' ' + str(c.get('model','')) + ' ' + str(c.get('takeaway',''))
    n = None
    for rx in CAPN:
        mo = rx.search(blob)
        if mo:
            try: n = int(mo.group(1))
            except Exception: n = None
            if n and 5 <= n <= 5000: break
            n = None
    _capOf[c['id']] = n

# 이용 한도 분류
UNL = _re.compile(r'무제한|unlimited|시간\s*제한\s*없', _re.I)
NTIMES = _re.compile(r'(?:월|매월|monthly)?\s*(\d+)\s*(?:회|번|크레딧|credits?|visits?|x)\b', _re.I)
for r in saunaMem + saunaPack + saunaOpen:
    r['capN'] = _capOf.get(r['coId'])
for r in saunaMem:
    blob = (r.get('cap','') or '') + ' ' + r['n'] + ' ' + r['fee'] + ' ' + (r.get('note') or '')
    if r.get('fixed') and 'unlimited' in r:
        r['limit'] = '무제한' if r['unlimited'] else ''
    if not r.get('limit'):
        if UNL.search(blob): r['limit'] = '무제한'
        else:
            mo = NTIMES.search(blob)
            r['limit'] = ('월 %s회' % mo.group(1)) if mo else '기타'
    if r.get('fixed') and 'offpeak' in r:
        r['offpeak'] = bool(r['offpeak'])
    else:
        r['offpeak'] = bool(_re.search(r'오프피크|off-?peak|평일|daytime|before\s*15|비피크', blob, _re.I))

saunaMem.sort(key=lambda x: x['krw'])
saunaPack.sort(key=lambda x: x['krw'])
TARGET = 500000   # 333˚ 월 50만원
_below = len([x for x in saunaMem if x['krw'] < TARGET])
_unl = [x for x in saunaMem if x['limit'] == '무제한' and not x['offpeak']]
_unl.sort(key=lambda x: x['krw'])
memStatUnl = {'n': len(_unl),
  'min': _unl[0]['krw'] if _unl else 0, 'max': _unl[-1]['krw'] if _unl else 0,
  'med': _unl[len(_unl)//2]['krw'] if _unl else 0,
  'below': len([x for x in _unl if x['krw'] < TARGET]),
  'minCo': (_unl[0]['co'] if _unl else ''), 'maxCo': (_unl[-1]['co'] if _unl else '')}
memStat = {'target': TARGET, 'n': len(saunaMem), 'below': _below,
           'above': len(saunaMem) - _below,
           'min': saunaMem[0]['krw'] if saunaMem else 0,
           'max': saunaMem[-1]['krw'] if saunaMem else 0,
           'med': saunaMem[len(saunaMem)//2]['krw'] if saunaMem else 0,
           'pack': len(saunaPack), 'open': len(saunaOpen),
           'noMem': len([c for c in sauna if (c.get('membership') or {}).get('type')=='없음']),
           'chkCo': len([c for c in sauna if c.get('memChk')]),
           'chkTier': len([r for r in saunaMem + saunaPack if str(r.get('chk','')).startswith('공식 확인')]),
           'unchkTier': len([r for r in saunaMem + saunaPack if not str(r.get('chk','')).startswith('공식 확인')])}


# ── 사우나 멤버십 혜택 축 비교표
SAXES = [
 ('무제한 이용',      r'무제한|unlimited|시간\s*제한\s*없'),
 ('회원 선예약 창',   r'선예약|우선\s*예약|\d+\s*일\s*전부터|advance\s*book|priority\s*book|먼저\s*예약'),
 ('게스트 동반',      r'게스트|동반|guest'),
 ('전 지점 이용',     r'전\s*지점|모든\s*지점|all\s*locations?|any\s*(?:studio|location)|지점\s*간\s*이동'),
 ('동결·일시정지',    r'동결|일시\s*정지|freeze|pause|보류|holiday\s*suspension'),
 ('크레딧 이월',      r'이월|rollover|roll\s*over|carry\s*over|누적'),
 ('리테일·F&B 할인',  r'할인|discount|%\s*off|\d+%'),
 ('회원 전용 이벤트', r'회원\s*전용|members?\s*only|전용\s*이벤트|초대|워크숍\s*우선|커뮤니티\s*이벤트'),
 ('타월·가운 포함',   r'타월|가운|로브|robe|towel|어메니티|amenit'),
 ('정원 상한·대기자', r'한정|대기\s*(?:자|명단)|waitlist|정원\s*마감|sold\s*out|만석'),
]
saunaMx = []
_axCnt = {a: 0 for a, _ in SAXES}
for c in sauna:
    mm = c.get('membership') or {}
    if mm.get('type') not in ('회비형', '회수권'): continue
    if not (mm.get('tiers') or []): continue
    blob = json.dumps(mm, ensure_ascii=False)
    ax = [a for a, pat in SAXES if _re.search(pat, blob, _re.I)]
    for a in ax: _axCnt[a] += 1
    mine = [r['krw'] for r in saunaMem if r['coId'] == c['id']]
    saunaMx.append({'co': c['name'], 'coId': c['id'], 'country': c.get('country',''),
                    'url': c.get('url',''), 'type': mm.get('type',''),
                    'tierN': len(mm['tiers']), 'axes': ax,
                    'min': min(mine) if mine else 0,
                    'capN': _capOf.get(c['id'])})
saunaMx.sort(key=lambda x: (x['min'] == 0, x['min']))
saunaAxes = [a for a, _ in SAXES]
axRank = sorted(_axCnt.items(), key=lambda kv: -kv[1])

# ── 멤버십 혜택 비교 매트릭스 — 반복되는 혜택 축을 뽑는다
AXES = [
 ('예약 우선권', r'우선 예약|예약 창|선예약|선행 입장|조기 입장|우선 구매|선행 오픈|우선 예매|우선권'),
 ('게스트 동반', r'게스트|동반'),
 ('전용 공간·라운지', r'라운지|전용 시설|전용층|전용 라운지|프라이빗'),
 ('할인·적립', r'할인|적립|리워드|크레딧'),
 ('전 지점 이용', r'전 지점|전 세계|모든 .*지점|미국 내'),
 ('전용 이벤트', r'전용 이벤트|회원 전용|마스터클래스|프리뷰|초대'),
 ('정원 제한·심사', r'초대제|심사|정원|대기'),
 ('일시정지·동결', r'동결|일시정지|freeze'),
 ('개인 보관·락커', r'락커|보관|우편 주소'),
 ('전담 인력', r'전담|컨시어지|스타일리스트|앰배서더'),
]
for m in mem:
    blob = json.dumps(m.get('tiers', []), ensure_ascii=False) + m.get('gate','')
    m['axes'] = [a for a, pat in AXES if re.search(pat, blob)]
    m['tierN'] = len(m.get('tiers', []))

# ── 조사 이력 — 같은 대상을 다시 찾지 않도록
seen = []
def add_seen(part, name, url, extra=''):
    seen.append({'part': part, 'name': name, 'url': url or '', 'note': extra})
for c in sauna: add_seen('기업', c['name'], c.get('url'), c.get('country',''))
for m in mem:   add_seen('멤버십', m['name'], m.get('url'), m.get('field',''))
for p in prod:  add_seen('상품', p['brand'] + ' — ' + p['product'], p.get('url'), p.get('origin',''))

ds = {
 'meta': {'project':'333˚','updated':'2026-09-01','verdictAt':'2026-09-01',
   'brief':'333명 정원 회원제 소셜 사우나 → 글로벌 웰니스 마켓플레이스. 멤버십 3개월 150만원(월 50만원), 워크인 1회 7만원.',
   'note':'해외 리서치를 재료로 삼고, 한국 조건에 맞춰 판단한다. 한국 사례는 벤치마크가 아니라 가격 기준선으로만 쓴다.'},
 'parts': [
   {'k':'cos','n':'벤치마크 기업','sec':'s1','desc':'해외 소셜 사우나 — 가격·멤버십·프로그램·분위기·인스타'},
   {'k':'mem','n':'멤버십 구조','sec':'s2','desc':'사우나 밖 업종의 티어·혜택 설계'},
   {'k':'prog','n':'프로그램','sec':'s3','desc':'중복 제거한 프로그램 원형과 333˚ 적합성·운영법'},
   {'k':'prod','n':'상품 소싱','sec':'s4','desc':'국내 미유통 · 디자인 감도 중심'},
   {'k':'trend','n':'트렌드','sec':'s5','desc':'2026년 기준 최신 웰니스 동향'},
   {'k':'market','n':'시장 분석','sec':'s6','desc':'규모 · 지역 · 상품 3축'},
   {'k':'reg','n':'규제 체크리스트','sec':'s7','desc':'개점까지 확인해야 할 법령·인허가'},
 ],
 'cos': sauna, 'mem': mem, 'prog': prog, 'prod': prod,
 'trend': trend, 'market': market, 'reg': reg,
 'cats': cats, 'axes': [a for a,_ in AXES], 'seen': seen,
 'saunaMem': saunaMem, 'saunaPack': saunaPack, 'saunaOpen': saunaOpen,
 'saunaMx': saunaMx, 'saunaAxes': saunaAxes, 'axRank': axRank,
 'memStat': memStat, 'memStatUnl': memStatUnl,
 'trash': {'cos':[], 'mem':[], 'prog':[], 'prod':[], 'trend':[], 'market':[], 'reg':[]},
}
json.dump(ds, open('dataset_v2.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)

print('기업', len(sauna), '| 멤버십', len(mem), '| 프로그램', len(prog), '| 상품', len(prod))
print('트렌드', len(trend), '| 시장', len(market), '| 규제', len(reg), '| 조사이력', len(seen))
print()
for c in cats:
    print(c['code'], c['g'], '—', len(c['items']), '개 상세 카테고리')
    for it in c['items']: print('   ', it['c'], it['n'], '(%d)' % it['cnt'])
print()
print('규제 영역:', collections.Counter(r['area'] for r in reg))
print('시장 축:', collections.Counter(m['axis'] for m in market))
print()
print('사우나 멤버십 기준표 — 월 환산 %d건 / 회차권 %d건 / 미산정 %d건' % (len(saunaMem), len(saunaPack), len(saunaOpen)))
print('  최저 %s원 · 중앙값 %s원 · 최고 %s원' % (format(memStat['min'],','), format(memStat['med'],','), format(memStat['max'],',')))
print('  333˚ 50만원보다 싼 티어 %d / 비싼 티어 %d · 멤버십 없는 곳 %d' % (memStat['below'], memStat['above'], memStat['noMem']))
print('  공식 재검증: %d곳 / 검증된 티어 %d건 · 미검증 %d건' % (memStat['chkCo'], memStat['chkTier'], memStat['unchkTier']))
print('  혜택 축 비교표 — 사우나 %d곳' % len(saunaMx))
print('  반복 순위:', ' · '.join('%s %d/%d' % (a, n, len(saunaMx)) for a, n in axRank))
print('  [전일 무제한 티어만] %d건 · 최저 %s(%s) · 중앙값 %s · 최고 %s(%s) · 50만원 미만 %d'
      % (memStatUnl['n'], format(memStatUnl['min'],','), memStatUnl['minCo'][:20], format(memStatUnl['med'],','),
         format(memStatUnl['max'],','), memStatUnl['maxCo'][:20], memStatUnl['below']))
