# 333˚ 상품 리서치 — 개발용 참조 자료

`333_상품리서치_배치명세_v1.md` 와 **함께** 쓰는 자료다.
명세서는 규칙, 이쪽은 **실제 데이터 모양과 검증된 정답지**다.

---

## 폴더 구성

```
sample/     — 실제 데이터 모양
  prod_sample_20.json      최종 스키마 20건 (엣지케이스 위주로 골랐다)
  v2_new_prod_sample.json  배치가 만들어야 할 원시 입력 3건
  seen_prod.json           중복 방지용 조사 이력 121건 (상품 파트 전량)
  cats.json                subCode 자동 배정의 실제 산출 결과

fixtures/   — 골든 테스트 (§7.2 병합 로직 검증용)
  master_before.json       기존 마스터 5건
  new_input.json           오늘 배치 결과 4건 (정상 1 · 중복 1 · 브랜드초과 1 · 가격미확인 1)
  expected_after.json      기대 결과 — 이 값이 나와야 통과

scripts/    — 원본 구현 (참조용, 그대로 옮기면 된다)
  merge_0831.py            명세서 §7.2 의 원본. 54~84행이 상품 파트
  build_v2.py              명세서 §2 RULES 의 원본. 22~68행이 카테고리 배정
```

---

## fixtures 로 무엇을 검증하나

`master_before.json` + `new_input.json` → 병합 → `expected_after.json` 이 나와야 한다.
이 4건이 §7.2 규칙 전부를 덮는다.

| 입력 | 기대 | 검증 대상 |
|---|---|---|
| KOLO Sauna — Bucket and Ladle Set | **통과** → `p006` | 정상 경로, `ig: null` → `미확인` 객체화 |
| `Bathing  Culture` — `Mind and Body Bar!` | **제외** | `norm()` 이 공백 2칸·느낌표를 지우고 `p002` 와 같다고 판정하는가 |
| Bathing Culture — Gift Box | **제외** | 브랜드 3종 상한 (이미 p001·p002·p003) |
| Kaurilan Sauna — Sauna Soap Bar | **통과** → `p007`, `confidence: 낮음` | `price: "미확인"` → 확신도 자동 하향 |

그리고 **병합 후에도 이게 그대로여야 한다.**

```
p001 → v: "fit"     addedOn: 2026-08-28
p002 → v: ""        addedOn: 2026-08-28
p003 → v: "hold"    addedOn: 2026-08-28
p004 → v: ""        addedOn: 2026-08-28   (브랜드명에 한자 — norm 이 깨지면 여기서 티가 난다)
p005 → v: ""        addedOn: 2026-08-28
```

`v` 가 하나라도 옮겨 가거나 `addedOn` 이 오늘로 바뀌면 **실패**다.
신규분만 `addedOn = 오늘`, `subCode` 는 `p006 → L3` · `p007 → B1` 이 나와야 한다.

> 이 픽스처는 실제로 돌려서 결과를 확인해 뒀다. 위 표가 곧 정답이다.

---

## sample 의 엣지케이스 지도

`prod_sample_20.json` 20건은 무작위가 아니라 **까다로운 것들만** 골랐다.

| id | 무엇이 까다로운가 |
|---|---|
| `p075` Ippodo Tea (一保堂茶舗) | 브랜드명에 한자 + 괄호 — `norm()` 정규식 테스트 |
| `p107` Yuan (阿原) | 동일 |
| `p100` TOYO STEEL (東洋スチール) | 가타카나 포함 + `subCode` 가 `L9`(기타)로 떨어진 사례 |
| `p037` Kaikado (開化堂) | 동일 계열 |
| `p121` Wild Nutrition | 할인 표기 `£18.00 정가 (현재 20% 할인가 £14.40) (약 3.3만원)` + `v: "hold"` |
| `p090` | `subCode` 기타 사례 |
| 확신도 `중간` 5건 | 자동 산출식(높음/낮음)으로는 안 나오는 값 — **수동 하향분이다.** 배치가 덮어쓰면 안 된다 |
| `wholesale` 없는 건 | 이 필드는 선택이다. 없어도 유효한 레코드 |

---

## 알아 둘 것 — 명세서에 적힌 규칙의 구멍 3가지

구현하면서 그대로 옮기되, **아래는 알고 옮겨라.**

### 1. `confidence` 산출식이 제3자 가격을 못 잡는다

```python
confidence = '낮음' if ('미확인' in price or '3자' in price) else '높음'
```

`v2_new_prod_sample.json` 의 HUUM 항목을 보면 `verified` 에
"가격은 미국 리테일러 cedar-sense.com 제품 페이지에서 확인" 이라고 적혀 있는데
`price` 문자열에는 그 사실이 없어서 **`높음`으로 계산된다.** 공식몰 가격이 아닌데 높음이다.

→ 개선안: `verified` 문자열에 `리테일러|retailer|아마존|Amazon|3자` 가 걸리면 `중간`으로.
다만 **기존 120건을 재계산하지는 마라** — 사장님이 이미 그 값을 보고 판정한 것들이다.
신규분에만 적용하고, 적용 시작일을 `meta` 에 남겨라.

### 2. `wholesale` 이 필드 자체가 없을 수 있다

현행 120건 중 37건에 이 키가 아예 없다. `p.get('wholesale', '미확인')` 로 읽어야 한다.
`p['wholesale']` 로 읽으면 KeyError 난다.

### 3. `ig` 가 `None` 인 레코드가 있다

`ig_obj()` 를 거치지 않고 들어간 과거 데이터가 있다.
`(p.get('ig') or {}).get('handle')` 패턴으로 방어해라.

---

## 두 스크립트를 볼 때

`merge_0831.py` 와 `build_v2.py` 는 **상품 외에 다른 파트도 처리하는 파일**이다.
필요한 부분만 보면 된다.

- `merge_0831.py` **54~84행** — 상품 병합. 명세서 §7.2 는 이걸 그대로 옮긴 것이다
- `build_v2.py` **12~19행** — `stamp()`, id 부여 방식. **왜 append 만 되는지가 여기 있다**
- `build_v2.py` **22~68행** — `CATG` / `RULES` / 카테고리 역산. 명세서 §2 의 원본
- `build_v2.py` 70행 이후 — 사우나 회비 파서다. **상품 배치와 무관하니 보지 마라**

`build_v2.py` 는 `v2_sauna.json` 등 7개 파일을 전부 읽으므로 그대로는 안 돌아간다.
상품 파트만 떼어 쓸 거면 `stamp()` 와 `RULES` 블록만 가져가라.
