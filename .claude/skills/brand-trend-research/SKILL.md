---
name: brand-trend-research
description: Country-scoped research to find wellness-adjacent consumer brands (from a specific country, not brands popular in that country) that are showing real, dated, multi-channel evidence of rising momentum right now — not simply famous. Requires the user to supply a country (or countries) and, optionally, a period to compare against. Trigger on requests like "국가별 트렌드 브랜드 리서치", "지금 [국가]에서 뜨는 브랜드 찾아줘", "왜 지금 이 브랜드가 뜨는지 조사해줘", or any request framed around "지금 실제로 관심이 빠르게 올라오고 있는 브랜드" — this is a different, stricter pipeline than the brand-research skill (global brand-DNA fit, no momentum requirement) and the weekly brand_weekly_hot Apify tracker (re-ranks brands already in our DB, no new-brand discovery). Do not conflate the three.
---

# 333° country-scoped trend-brand research

Set up 2026-09-22 per the user's own detailed methodology (preserved almost verbatim below — it is unusually specific and every clause exists to rule out a real failure mode the user named, so don't paraphrase it away). This is NOT the same job as [[brand-research]] (which asks "does this brand fit our DNA," with no requirement that it be currently trending) or the weekly `brand_weekly_hot` Apify pass (which only re-ranks brands already sitting in our DB by mention count — it can't discover a brand we've never seen). This skill's whole point is: **given a country, find brands actually FROM that country that are gaining real momentum right now, with dated evidence, and explain concretely why.**

## Required inputs — do not guess these

- **Country or countries.** The user passes this each time ("국가값"). Never substitute a country of your own choosing, and never research "brands popular in [country]" — it must be brands whose home country IS the one given.
- **Period** (optional from the user; defaults below if not given). The comparison is never just "last 7 days" — it's always three windows at once:
  1. **Most recent completed week** (Mon–Sun, same convention as `brand_weekly_hot`) — the primary window.
  2. **Trailing ~14 days** — is the rise continuing, not a one-day spike?
  3. **Trailing 30–60 days baseline** — is this actually elevated versus normal, or just always-there noise?
  A single post blowing up in the last 72 hours is a *supporting* signal (viral content, sold-out, restock, new retail placement, pop-up, collab, hotel/spa/café adoption) — never sufficient on its own without the above three windows showing a real pattern.

If the user's message doesn't include a country, ask for it before doing anything else — this is a genuine blocker, not something to infer from context.

## Step 0 — Load the dedup reference (query the DB yourself; don't ask the user to paste a list)

The user's methodology says to check "기존 브랜드 목록" — that's our live DB, not something they need to hand you:

```sql
select b.id, b.name, b.country, b.country_code, b.city, b.website, b.instagram,
       b.is_candidate, coalesce(e.status,'') as status, b.re_surfaced
from public.brands b
left join public.brand_entries e on e.id = b.id
where b.country_code = '<ISO alpha-3 for the requested country>';

select name, reason, region from public.brand_research_excluded
where region ilike '%<country>%' or region ilike '%<countryCode>%';
```

Pull **every** row for that country regardless of status (including soft-deleted and already-promoted-to-Discover ones) — you need the full history to correctly classify a candidate as brand-new vs. RE-SURFACED, not just to avoid exact duplicates.

## Step 1 — Dispatch research (one subagent per country, ≤5 concurrent per the standing cap)

Give each subagent the full brief below almost verbatim — it is intentionally this specific:

> 우리가 찾고 싶은 것은 단순히 유명한 웰니스 브랜드가 아니라, 지정된 국가에서 지금 실제로 관심이 빠르게 올라오고 있는 브랜드다. 뷰티·스킨케어에 한정하지 말고 식음료, 기능성 음료, 티, 커피, 건강 간식, 바디케어, 헤어케어, 퍼스널케어, 사우나·스파 제품, 아로마, 리커버리, 피트니스, 수면, 휴식, 웰니스 라이프스타일 제품 등 웰니스와 연결되는 소비재 전반을 폭넓게 조사한다.
>
> **국가 조건**: 지정된 국가 "안에서 유행하는 브랜드"가 아니라, 그 국가 "출신 브랜드" 중 지금 뜨는 것을 찾는다. 브랜드의 원산지/본사가 확실하지 않으면 공식 홈페이지·법인 정보·신뢰할 수 있는 자료로 확인하고, 확인되지 않으면 후보에서 제외한다 (임의 추측 금지).
>
> **핵심 질문은 "유명한가"가 아니라 "왜 지금 뜨는가"다.** 오래 유명했던 브랜드를 다시 나열하지 말고, 아직 대중적으로 알려지지 않았지만 현지 소비자·크리에이터·커뮤니티·리테일에서 최근 반복적으로 등장하기 시작한 브랜드를 우선한다.
>
> **기간**: 가장 최근 완료된 주간을 중심으로, 최근 14일간 상승 흐름이 이어지는지, 최근 30~60일 평소 반응과 비교해 실제로 관심도가 올라간 것인지 확인한다. 최근 72시간 내 바이럴/품절/재입고/입점/팝업/콜라보/호텔·스파·카페 채택 같은 신호는 참고만 하고, 하루짜리 게시물 하나로 HOT하다고 판단하지 않는다.
>
> **리서치 우선순위**: 기사보다 소셜·실제 소비자 반응을 우선한다. TikTok, Instagram, YouTube, Reddit, Pinterest, Google Trends뿐 아니라 그 국가에서 실제로 쓰이는 현지 SNS·커뮤니티·리뷰 플랫폼·온라인 쇼핑몰·식품 리테일러·웰니스/뷰티 스토어·편집숍·백화점·카페·호텔·스파·사우나·피트니스 공간 자료까지 확인한다. 가능하면 현지 언어로도 검색한다. 뉴스/매거진은 트렌드를 처음 발견하는 용도가 아니라 이미 찾은 신호를 검증하는 용도로만 쓴다.
>
> **제품 단위로도 찾는다**: 브랜드명 검색만으로는 부족하다. 웰니스 시장은 특정 음료·간식·바디 제품·리커버리 제품 하나가 먼저 바이럴된 뒤 브랜드가 알려지는 경우가 많다. Trending/Viral Product, Sold Out, Restock, New Launch, Creator Favorite, Morning/Night Routine, Gym Routine, Recovery Routine, Sauna Routine, What I Eat/Drink, Wellness Essentials 같은 흐름을 확인하고, 강한 제품 신호를 발견하면 그 브랜드까지 역으로 찾는다.
>
> **HOT 판단 기준은 상승 속도지 절대량이 아니다.** 팔로워 수·언급량 절대치가 아니라: 이전보다 검색량/언급이 얼마나 늘었는지, 브랜드 광고가 아닌 실사용자·여러 크리에이터 사이에서 자연 확산되는지, 인플루언서 한 명이 아니라 서로 다른 계정에서 반복 등장하는지, 한 플랫폼이 아니라 여러 채널로 퍼지는지. 조회수·좋아요보다 "어디서 사냐" 질문, 맛/향/텍스처/사용감 질문, 실제 구매 후기·재구매 반응, 품절·재입고·입점 같은 구매 신호를 더 중요하게 본다.
>
> **HOT의 근거로 인정하지 않는 것**: Giveaway/협찬 콘텐츠만 반복, 브랜드 자체 광고 급증, 유명 셀럽 1인 착용, 논란으로 인한 언급 증가, 오래된 콘텐츠 재노출, 동일 보도자료의 반복 기사. **독립적인 트렌드 신호가 최소 3개 이상 확인된 브랜드만** 우선 선정한다.
>
> **규모**: 국가당 최소 20개 이상의 후보를 먼저 탐색한 뒤, 근거가 약하거나 단순 유명 브랜드이거나 기존 브랜드와 중복되는 후보를 걸러내고 최종 10~15개만 남긴다. 적절한 후보가 부족하면 억지로 채우지 않는다.

Also give each subagent:
1. **The dedup reference from Step 0** (full id/name/status list for that country, plus excluded names) — used for RE-SURFACED judgment, not a blanket "never mention again" list. A brand already in our DB should only be re-surfaced if there's a genuinely new, dated reason (new viral moment, restock, big collab, hotel/spa adoption) that wasn't there before — explain in `reSurfacedReason` if so; otherwise skip it silently, don't re-list it as if new.
2. **WebSearch + WebFetch** (not ego-browser — same reliability reasoning as [[brand-research]]: ego-browser task spaces stall for 600s+ in background subagents).
3. Explicit instruction to write **"확인되지 않음"** for anything it can't verify from real web sources — never invent a number, a date, or a reaction. Check every source's actual publish date; don't treat old material as current.

## Step 2 — Output schema per brand

```json
{
  "id": "kebab-case-id",
  "name": "브랜드명",
  "country": "국가명(한국어만)",
  "countryCode": "ISO 3166-1 alpha-3",
  "city": "도시/지역명 (원어 가능, 없으면 null)",
  "website": "https://...",
  "instagram": "https://www.instagram.com/...",
  "category": ["BODY"],
  "philosophy": "한국어 한 줄 브랜드 소개",
  "trendingProducts": [{"name": "...", "url": "https://...", "whyTrending": "이 제품이 왜 지금 주목받는지 한 줄"}],
  "whyNow": "한국어 3~6문장. 반드시 구체적으로: 언제, 어떤 플랫폼/채널에서, 어떤 제품을 중심으로, 어떤 변화(바이럴 게시물, 품절, 재입고, 신규 입점, 콜라보 등)가 있었는지. '최근 인기다', 'SNS에서 화제다' 같은 추상적 표현 금지.",
  "trendSignals": [
    {"platform": "Instagram|TikTok|YouTube|Reddit|Pinterest|Google Trends|현지 SNS|리테일러|기타", "date": "YYYY-MM-DD", "evidence": "구체적 근거 (게시물 링크/설명, 품절 공지, 입점 소식 등)"}
  ],
  "momentumStage": "EARLY_SIGNAL | EMERGING | BREAKOUT | MAINSTREAMING",
  "whyFits": "한국어 — 333° 사우나/웰니스 공간 활용 적합도 (체험/F&B/리커버리/라운지/VIP 어메니티/판매/기프트/팝업). HOT 여부와 분리해서 판단 — 지금 뜨지만 공간엔 안 맞을 수도, 공간엔 맞지만 지금 트렌디하진 않을 수도 있다.",
  "reSurfaced": false,
  "reSurfacedReason": "이미 본 브랜드를 다시 올리는 경우에만 채움 — 왜 다시 봐야 하는지 구체적으로",
  "sourceNote": "조사에 사용한 주요 출처 요약, 확인되지 않은 항목 목록"
}
```

`trendSignals` needs **3+ entries from independent sources/platforms** before a brand qualifies at all — this is a hard bar, not a nice-to-have. `momentumStage` prioritizes `EARLY_SIGNAL` and `EMERGING` — those are what this workflow is actually hunting for; `BREAKOUT`/`MAINSTREAMING` brands can still be included if they're genuinely brand-new to us and well-evidenced, but don't let the list skew toward them.

## Step 3 — Normalize and insert into Supabase

Same mechanics as [[brand-research]] Step 3 (category mapping into the fixed set `BODY, RECOVERY, HYDRATION, SAUNA, FITNESS, SLEEP, LONGEVITY, SUPPLEMENT, LIFESTYLE`; `potential` tag normalization; Python-script-built SQL rather than hand-typed; `insert ... on conflict (id) do update` for `brands`, delete+reinsert for child tables; `is_candidate = true, is_custom = false`), plus these additional columns that exist specifically for this workflow (migration `add_trend_research_fields`, applied 2026-09-22):

```sql
-- brands table additions used only by this skill:
--   why_now          text    (the whyNow field above)
--   momentum_stage    text    ('EARLY_SIGNAL' | 'EMERGING' | 'BREAKOUT' | 'MAINSTREAMING')
--   trend_signals     jsonb   (the trendSignals array above, verbatim)
--   re_surfaced       boolean (default false)
--   re_surfaced_reason text
```

`why_fits` (pre-existing column) holds the space-fit judgment as before — this workflow just also fills `why_now`/`momentum_stage`/`trend_signals` alongside it, so the two judgments (hot vs. fits) stay visibly separate in the data, matching the user's explicit ask to not conflate them.

**`trendingProducts` has no dedicated child table yet** — until one exists, fold it into `source_note` or `philosophy` as a clearly-labeled line (e.g. "지금 뜨는 제품: ..."), and flag to the user in your run summary that a proper `brand_trending_products` table would be a cleaner home for it if this workflow gets reused regularly.

**RE-SURFACED handling**: if `reSurfaced: true`, the row already exists (matched an id in Step 0's reference) — `on conflict (id) do update` naturally handles this as an update, just make sure `re_surfaced`/`re_surfaced_reason` actually get set (they won't be on the existing row otherwise) and that `is_candidate` gets flipped back to `true` if the row had been soft-deleted or was sitting in Discover and genuinely warrants a second look (rare — confirm with the user before flipping a Discover-promoted brand back into ADD BRAND).

## Step 4 — Exclusion-list update, carefully

`brand_research_excluded` still means "structurally excluded" (Korea-availability, hardware/electronics, solid fermented food, product-category saturation — same hard rules as [[brand-research]]) — a brand rejected here stays rejected regardless of new momentum. But a brand simply **already present in `brands`** (found before, not rejected) is NOT automatically excluded from this workflow — that's exactly the RE-SURFACED case Step 3 handles. Don't write "already exists" rejections into `brand_research_excluded`; that table is for genuine disqualifications only.

## Step 5 — Images

Same split as [[brand-research]]: this is an interactive/local run (not the cloud routine), so do the full image pass yourself (hero + up to 3 best-seller images) rather than leaving it for later, unless the user says otherwise.

## Wrap-up report

Group by momentum stage, lead with EARLY_SIGNAL/EMERGING. For each brand, the summary must let the user judge "왜 지금 뜨는지 / 이미 본 브랜드인지 / 지금 더 볼 가치가 있는지" in a few seconds — so lead every brand's line with the `whyNow` sentence, not the philosophy blurb. Explicitly call out any RE-SURFACED brands as their own small group with the reason. Report the actual explored-vs-kept ratio (e.g. "27개 탐색 → 12개 선정") so the user can see the filtering really happened, not just trust a claim.
