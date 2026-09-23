---
name: brand-research
description: Research and add overseas wellness/beauty/bodycare brand candidates to the 333° (삼삼삼도) marketplace Supabase DB as is_candidate=true rows, complete with normalized child-table data and hero/best-seller images uploaded to Storage. Trigger this whenever the user says things like "추가로 리서치 해줘", "브랜드 더 찾아줘", "새 후보 브랜드 리서치", "브랜드 리서치 해줘", or otherwise asks for more brand candidates for 333° — even a short one-line request. Do not re-derive the workflow from scratch; follow this skill.
---

# 333° brand research → Supabase pipeline

This captures the exact workflow validated in session `sauna-reserch-49` (2026-09): research overseas wellness/beauty brands region by region via parallel subagents, normalize into the DB schema, insert as candidates, then fetch and upload images. Read the two project memory files below before doing anything else — they hold state this skill depends on and must stay in sync with every run.

- `~/.claude/projects/-Users-lj-work-sauna-reserch/memory/333-brand-research-history.md` — every brand name already researched (accepted or rejected). Check this AND the live `brands` table so you never re-research a name.
- `~/.claude/projects/-Users-lj-work-sauna-reserch/memory/333-brand-selection-criteria.md` — the pattern inferred from what the user has actually saved vs. deleted in the app. Re-run the query in that file to pick up any newer decisions before you start, and bias your regional search briefs toward the pattern it describes.
- `public.brand_research_excluded` (Supabase table: name, reason, region, created_at) — the **live, durable** twin of the rejected-names section in the history memory file. This exists because a scheduled cloud routine (see below) also runs this research and has no access to local memory files — it reads/writes this table instead. Query it (`select name, reason, region from brand_research_excluded`) alongside the `brands` table before every run, whether you're running interactively or the user asks you to reconcile after the routine fired, and write any newly-rejected names here too (not just into the markdown file) so both paths stay in sync.

## A scheduled cloud routine already runs part of this automatically

Routine `trig_01KG7b66ssLC7iLQcWPdNG45` ("333 Brand Research (Daily 22:00 KST)") fires **daily** at 22:00 Asia/Seoul (cron `0 13 * * *`) and independently does Steps 1–5 below (research → normalize → insert as candidates → update `brand_research_excluded`). Don't create a second routine for this without checking `RemoteTrigger action:list` first. If the user reports duplicate-looking or off-brief candidates, use `RemoteTrigger action:list_runs` then `get_run_log` on the relevant routine run to see what it actually did before assuming this skill's own logic is at fault.

**Network/MCP setup (fixed 2026-09-13, don't re-break this):** the CCR cloud environment's egress firewall blocks all outbound curl/HTTPS except an Anthropic-infra allowlist — it can NEVER reach Supabase's REST/Storage API directly. The fix was connecting the official Supabase connector at claude.ai (`https://claude.ai/customize/connectors` → Supabase, OAuth'd to the user's personal Supabase account) and attaching it to the routine via `mcp_connections` (`connector_uuid: "2c4afff2-408b-4765-b41a-c537379c1fd0"`, `url: "https://mcp.supabase.com/mcp"`). The routine's prompt now does all reads/writes through `mcp__Supabase__execute_sql` (project_id `agwcymyrwaeykvfsivzt`) instead of curl. Two tool permissions had to be flipped from the connector's default "승인 필요" (needs approval — which would stall an unattended run forever) to "항상 허용" (always allow) on the connector's settings page: **Execute SQL** and **List projects**. If a future run stalls waiting on approval, check whether a *different* Supabase tool got used that's still gated — same settings page, same fix.

**Images are 100% out of scope for the cloud routine, by design (fixed 2026-09-13, v6)**: it's not just Storage upload that's blocked — `WebFetch` to arbitrary external domains (brand websites included) is *also* blocked by the same egress proxy in that sandbox, confirmed by an explicit `EGRESS_BLOCKED` test mid-run. Only `WebSearch` (result snippets) works there. So the routine can't even discover og:image URLs, let alone download/upload them. Its prompt (v6) now explicitly forbids trying — no `brand_pending_images` writes, no image fields in its normalization schema. **Every batch the routine inserts always needs a full local image pass** — don't bother checking `brand_pending_images` for cloud-supplied URLs anymore (that table will stay empty going forward); Step 4 below always starts image research from scratch. To find the backlog needing images at any time: `select b.id from public.brands b where not exists (select 1 from public.brand_images bi where bi.id = 'hero:' || b.id))`.

## Current phase stance (changed 2026-09-22): quality over quantity — the 20-a-day era is over

The volume phase from 2026-09-11 is done. User: "이제 양은 어느 정도 너무 많이 들어왔으니 양보다는 퀄리티에 좀 더 집중 했으면 좋겠다. 매일 이렇게 계속 찾아내려 하니깐 중복되거나 하는 것들이 너무 많다." (candidate volume is already more than enough; forcing 20/day is producing duplication and lower-quality picks). The reversal:

- **No forced count or region quota anymore.** There is no default "20 candidates, 4 regions" — that pattern is retired. A run can surface just 1 brand and that's a complete, successful run. Never pad a batch with a weaker candidate just to hit a number.
- **The brand-DNA brief below is a hard bar again, not a soft preference.** Judge every candidate against it seriously — recognition evidence, philosophy, distinctive visual identity, ritual/object-first positioning — the way the "참고용 가이드라인" framing invited leniency during the volume phase, don't read it that leniently anymore.
- **Use the existing Discover-list brands (`is_candidate = false`, i.e. already promoted out of ADD BRAND) as the taste benchmark.** Query `select name, country, why_fits from public.brands b left join public.brand_entries e on e.id=b.id where b.is_candidate=false and coalesce(e.status,'')!='deleted'` before researching — these are the brands the user actually kept (e.g. Absolution Cosmetics, Dulcie/Haeckels, Ghia, Kate McLeod, O'right, Soft Services). A new candidate should read like it could sit next to these, not like a filler pick.
- **The 30–40% food/beverage quota is retired too** — it was a volume-phase correction for a skew that no longer needs forcing. A good candidate is a good candidate regardless of category; don't hunt for beverage brands just to hit a ratio.
- The product-category-saturation rule (below) and all other hard exclusions still apply as before — duplication avoidance matters even more now that the goal is a tight, high-quality list, not a long one.

## Brand DNA to brief every research subagent with

Pull this from `/Users/lj/Downloads/333°_인테리어(0903).pdf` (or the 333° KV image if the PDF isn't at hand) if it's been a while, but the durable summary is:

- Wellness/bodycare/skincare/haircare brands that connect naturally to a sauna/hot-cold recovery ritual — body wash, oil, lotion, scrub, haircare, recovery/hydration drinks, bath goods.
- Must have real local recognition (editorial press, industry awards, hotel/spa adoption, cult following, or genuine TikTok/Instagram virality — a viral Reel/TikTok with real view counts, a known-influencer tag, or an active hashtag/UGC trend counts as real evidence; raw follower count alone does not). Search `"브랜드명" tiktok viral` and check the brand's own Instagram/TikTok for actual engagement, not just follower totals.
- **Overseas influencer PR seeding also counts as recognition evidence (2026-09-21 added).** A brand that's actively sending product to influencers abroad (unboxing/haul videos, "gifted"/"PR" disclosure tags, #ad or #sponsored posts featuring the brand, "thank you [brand] for sending" captions) is a real signal the brand already runs an active influencer program and has some traction — treat this the same tier as TikTok/Instagram virality evidence. Search `"브랜드명" gifted`, `"브랜드명" PR package`, `"브랜드명" unboxing`, `"브랜드명" sent me`/`"브랜드명" 협찬` to check. Note in `sourceNote` when a candidate was surfaced or supported this way.
- Clear, one-sentence brand philosophy/origin story.
- Strong, distinctive visual/package identity — per the selection-criteria memory, "weak identity" or "ambiguous visual sensibility" are real rejection reasons on their own.
- Sells a ritual, an object, or an experience over a plain skincare-line-first brand (see selection-criteria memory for why).
- Actively avoid the "AVOID" list from the brand's own KV: 찜질방/traditional-sauna imagery, beige/candle/flower static luxury spa tone, overly zen/bamboo/ryokan, biohacking/clinical-futuristic, dark-club neon, and over-reliance on wood/plant/green "natural wellness" cliché.
- Must NOT already be easily available in Korea. Check with a targeted search per candidate: `"브랜드명" site:coupang.com OR site:29cm.co.kr OR site:oliveyoung.co.kr OR site:gmarket.co.kr OR site:shinsegae.com OR site:lotteon.com OR site:sivillage.com` (add Naver Shopping too if useful). Real product listings with reviews = reject or deprioritize; zero or only personal-import listings = good sign. **Do not extend this exclusion check to TikTok Shop or Instagram** — the user explicitly said TikTok/Instagram are discovery/evidence sources only, never a reason to reject a brand.
- **Hard exclusion, narrowed 2026-09-16: only *directly-eaten solid* fermented foods (kimchi/kraut-type), not fermented drinks.** The user tried the broader version of this rule for less than a day and explicitly walked it back: "차나 이런류는 괜찮다. 발효되어서 그걸 직접 섭취하는(김치 같은)것이 아니라면 리스트에 포함시켜라." The actual bar is narrow: exclude a brand only if its core product is a solid fermented food you eat directly as-is — kimchi, sauerkraut/kraut, natto, or a fermented condiment central to the brand's identity (not just one SKU among many). **Kombucha, kefir soda, fermented tea, and any other fermented *drink* are fine** — tea-like/beverage fermentation is explicitly not what this rule targets. Fermented skincare (topical, not eaten/drunk) was never covered by this rule either. (2026-09-16: 12 of the 14 brands first removed under the broader version of this rule were restored — Kombucha Bros, Komvida, Kuppa Kombucha, ME Kombucha, On The Wagon Kombucha, Rise Kombucha, Taboocha, Saicho, Sobah, Versin, Oddbird, The Beauty Chef. Only Tabchilli and The Wild Fermentary stayed excluded, since kimchi/kraut are core, directly-eaten products in their lineups, not incidental SKUs.)
- **Alcohol/liquor exclusion abolished 2026-09-21.** Previously alcohol content (or non-alcoholic alcohol-styling) was a factor in the fermented-food rule above; the user explicitly reversed this: "이전에는 알콜류(주류)는 제외했었는데 이제 제외하지 말고 넣어라." **Do not exclude a brand for containing real alcohol, and do not exclude non-alcoholic alcohol-styled drinks either** — wine, beer, sake, spirits, non-alc aperitifs are all fair game now if the brand story fits a sauna/wellness ritual. No existing candidate had actually been soft-deleted purely for alcohol content (checked `brand_research_excluded` and soft-deleted `brand_entries` — none matched), so this was a forward-looking policy change only, nothing to restore.
- **Hard exclusion, added 2026-09-21: no more product-category saturation.** A new brand name is not enough on its own — if the candidate's core product category is already heavily represented among existing candidates, skip it. Kombucha is the concrete trigger case: 22+ kombucha brands had accumulated across batches (Kombucha Bros, Komvida, Kuppa Kombucha, Bebida Viva, Borécha, Camsbucha, Green Fermentation Lab, HappiLab, Kombuciao, Koral Kombucha, Lady Kombucha, Living Liquids Kombucha, Lo Bros, MAI Kombucha, ME Kombucha, On The Wagon Kombucha, Rise Kombucha, SiSú, Soul K, Taboocha, and more) — a new brand name each time, but functionally the same product for the marketplace's purposes. Before finalizing a candidate, check existing `brands`/`brand_products` for the same core-category keyword (kombucha/콤부차, kefir/케피어, matcha/말차, collagen/콜라겐, protein/단백질, etc.); if 5+ already exist, skip that category this round and look for an underrepresented one instead. **This is forward-looking only** — per the user's explicit instruction ("지금 것은 그대로 놓고, 앞으로만 막는다"), the 22 existing kombucha brands (and any other already-saturated category) were left as-is, not retroactively cleaned up. Same rule added to the cloud routine (v11).
- **Hard exclusion, added 2026-09-14: no sauna/cold-plunge equipment or hardware brands.** Barrel saunas, assembled sauna cabins/cubes, sauna heaters, cold-plunge tubs/ice-bath chillers, smart control panels — these are wellness-adjacent but not the "consumable/ritual product" brand this marketplace wants. **Electronics especially (heaters, controllers, chillers — anything with a power cord) are excluded with no exceptions.** "Connects to" the sauna/ritual is fine; "sells the equipment itself" is not — only things that get consumed or applied/drunk (bodycare, beverages, fragrance, textiles, etc.) qualify. This is why Dundalk LeisureCraft, Tylö, and Arctic Tub were soft-deleted from the existing candidate pool — don't re-suggest them or similar hardware brands.

## Step 1 — Scope the run

**No default count or region quota anymore (changed 2026-09-22).** Ask the user (or infer from their phrasing) how many candidates and which regions if they specify something; otherwise, research broadly and report back only the brands that actually clear the quality bar — this could be 1, could be a handful, rarely 20. Minimum viable output is 1 good brand. If a region/category turns up nothing that clears the bar, report that honestly rather than lowering the bar to fill a slot.

**Respect the user's standing instruction to cap concurrent subagents at 5** (see the feedback memory on this, if present — check MEMORY.md). Never launch more than 5 `Agent` calls in a single batch; if the scope needs more, run in sequential waves.

## Step 2 — Dispatch regional research subagents

One `general-purpose` subagent per region. Give each one:

1. The region and a firm count (e.g., "5 brands").
2. The full brand-DNA brief above.
3. The exclusion list: every name already in `333-brand-research-history.md` plus the live `brands` table contents (query it yourself first, pass the id/name list into the prompt).
4. **Explicit instruction: use WebSearch and WebFetch only — do NOT use ego-browser.** ego-browser task spaces reliably stall for 600s+ inside background subagents in this environment; WebSearch/WebFetch has been reliable for pure research (no interactive site behavior needed here).
5. **Require 2-3 distinct bestSellers per brand, not just whatever the first search turns up** — the cloud routine's WebSearch-only research kept stopping at 1 product per brand, which left `brand_best_sellers` thin for a lot of candidates. Interactive subagents have WebFetch, so there's no excuse: if the first pass only surfaces 1 product, browse the site's shop/collection page for 2 more.
6. The exact output JSON schema (one object per brand) — see Step 3, give it to the subagent verbatim so its output slots straight into the normalization step:

```json
{
  "id": "kebab-case-id",
  "name": "브랜드명",
  "country": "국가명(한국어만, 예: 호주)",
  "countryCode": "ISO 3166-1 alpha-3 (예: AUS, USA, JPN)",
  "city": "도시/지역명(원어 가능, 없으면 null)",
  "website": "https://...",
  "instagram": "https://www.instagram.com/...",
  "category": ["BODY"],
  "philosophy": "한국어 한 줄 스토리",
  "whyFits": "한국어 3~5문장 — 현지 인지도 근거, 철학, 비주얼, 사우나/스파 연결성, 한국 내 낮은 인지도",
  "products": ["제품 라인명1", "제품 라인명2"],
  "bestSellers": [{"name": "...", "priceLocal": "...", "priceKRW": "약 XX,000원", "url": "https://.../products/..."}],
  "potential": ["Retail"],
  "imageLabel": "브랜드명 대문자 (필요시 \\n으로 줄바꿈)",
  "sourceNote": "한국어 — 조사 근거 출처, 한국 인지도 체크 결과"
}
```

Ask each subagent to report: the JSON array, plus a short prose summary per brand, plus a "considered and rejected" list of names it looked at but excluded and why — that rejected list must be folded into `333-brand-research-history.md` after the run.

## Step 3 — Normalize and insert into Supabase

The `brands` table stores scalar fields directly; category/products/bestSellers/potential live in normalized child tables (`brand_categories`, `brand_products`, `brand_best_sellers`, `brand_potential`), all keyed by `brand_id` with a `sort_order`. There is no DB-level enum, but the frontend only recognizes these category values — **map every subagent-proposed category into this set** before inserting (SKINCARE/HAIR/SPA/BEVERAGE/WELLNESS etc. are not real values, map them to the nearest fit):

```
BODY, RECOVERY, HYDRATION, SAUNA, FITNESS, SLEEP, LONGEVITY, SUPPLEMENT, LIFESTYLE
```

Normalize `potential` tags too (subagents will invent variants like "Amenity" or "Spa Amenity" — fold those into `Amenities`; drop anything nonsensical like "F&B/음료"). Known good tags: `Retail, Amenities, Event / Program, Collaboration, Monthly Brand, Sauna / Recovery Experience`.

**Schema change 2026-09-21: `country`/`city`/`country_code` are now three separate columns, not one combined string.** The `brands` table has `country` (Korean-only country name, e.g. "호주" — no city, no parentheses), `country_code` (ISO 3166-1 alpha-3, e.g. "AUS", `char(3)`), and `city` (free text, original language is fine, nullable). This replaced the old single `country: "국가 (도시)"` free-text field — the user needs to filter candidates by country programmatically, which a combined string couldn't support. Two migrations happened the same day: first all 77 English-language country names got bulk-translated to Korean (e.g. "Australia (Byron Bay)" → "호주 (Byron Bay)"), then the whole `country` column got split into the three columns above across all 219 rows. **When inserting new brands, populate all three fields directly** — don't recreate the combined-string pattern. Look up the ISO alpha-3 code yourself (common ones: 미국=USA, 일본=JPN, 호주=AUS, 영국=GBR, 홍콩=HKG, 캐나다=CAN, 프랑스=FRA, 독일=DEU, 이탈리아=ITA, 스페인=ESP — for anything else, standard ISO 3166-1 alpha-3 lookup).

Build the insert as: one Python script pass (read the collected JSON, `esc()`-escape single quotes by doubling them, generate SQL) rather than hand-writing 20 rows of SQL by hand — that's what worked cleanly last time. Split into 5 separate `execute_sql` calls (one per table: brands, then delete+insert for categories/products/best_sellers/potential) because a single 30KB statement risks truncation issues; each table's insert is a clean, self-contained chunk. Always `insert ... on conflict (id) do update` for the `brands` table itself (idempotent reruns), and `delete ... where brand_id in (...)` before each child-table insert (avoids duplicate rows on rerun). Set `is_candidate = true, is_custom = false` on every new row — never touch existing rows' `is_candidate` unless the user explicitly asks to promote/demote one.

Verify with a query joining `brands` to the four child tables by `brand_id`, checking category/bestseller/product counts per new id, before moving to images.

## Step 4 — Images

Same region split, same subagent-count discipline (reuse the research subagents' region grouping — spin up a fresh batch of upload subagents, still ≤5 concurrent). Each image-upload subagent needs:

1. The brand id + website + 3 best-seller product URLs (pull these straight from what you already normalized in Step 3 — don't make the subagent re-derive them).
2. Instructions: for hero, WebFetch the homepage asking for the `og:image` meta content or, failing that, the most representative brand/product image URL; same per-product for the 3 best-seller images. If a site's `og:image` is a plain wordmark/logo, treat that as inadequate and find a real product/lifestyle photo instead.
3. Download via `curl -sL -A "Mozilla/5.0" -o <path>`, verify with `file` that it's actually an image (not an HTML error page), then upload:

```bash
URL="https://agwcymyrwaeykvfsivzt.supabase.co/storage/v1/object/brand-images"
KEY="<fetch fresh via mcp__supabase-personal__get_publishable_keys — anon/legacy key, do not hardcode a stale one>"
curl -s -o /tmp/resp.json -w "%{http_code}" -X POST "$URL/hero:<id>" \
  -H "Authorization: Bearer $KEY" -H "apikey: $KEY" \
  -H "Content-Type: image/jpeg" -H "x-upsert: true" \
  --data-binary "@<local-file>"
```

Keys: `hero:<brand-id>`, `bs:<brand-id>:0`, `bs:<brand-id>:1`, `bs:<brand-id>:2`. After a successful storage upload, upsert `public.brand_images` (id, updated_at=now()) for cache-busting — the frontend reads this table to know when to bust its cached image URL.

4. Retail sites (Taiwanese momoshop/books.com.tw, WAF-protected shops, brands with aggressive rate limiting like golde.co) will sometimes 403/429/block plain curl — that's a transient/bot-defense issue, not a dead end. First substitute with an equivalent product photo from the brand's own official site if one's on hand; if the *hero* or a specific bestseller image still comes up empty after that, don't burn more than one retry loop on it — a missing image just falls back to the initial-letter placeholder in the UI, which is an acceptable, non-broken outcome. Don't skip a brand's hero+3 bestsellers wholesale over one blocked source.

## Step 5 — Close the loop

After insert + images are verified:

1. Update `333-brand-research-history.md` — add the new accepted ids under the right region heading, and fold each subagent's "considered and rejected" list into the rejected section.
2. Re-run the selection-criteria query (see that memory file) in case the user made new saved/deleted decisions since the file was last written, and update `333-brand-selection-criteria.md` if the pattern shifted.
3. Report to the user: a region-grouped table of new candidates with one-line why-it-fits, and an image-upload success count (X/Y, name any real gaps).
