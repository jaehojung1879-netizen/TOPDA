# content-priority — 언어별 콘텐츠 노출 우선순위 매핑

각 언어판은 한국어 원본을 그대로 번역하지 않고, **해당 국적 외국인이 실제로 검색·궁금해할 항목을 상단에 배치**한다.
이 디렉터리의 `{lang}.yaml` 파일이 그 노출 순서(`rank`)와 노출 여부(`hidden`)를 관리한다.

## 스키마

```yaml
lang: vi                    # 언어 코드 (ko/en/zh-Hans/zh-Hant/vi/th)
profile: "…"               # 해당 언어권 외국인 프로파일 한 줄 요약
sections:
  guides:      [ { id, rank, hidden? }, … ]
  calculators: [ { id, rank, hidden? }, … ]
  checklists:  [ { id, rank, hidden? }, … ]
```

- `id` — 콘텐츠 canonical 슬러그 (아래 카탈로그 참조). 언어와 무관하게 동일.
- `rank` — 카테고리 내 표시 순서. **낮을수록 상단.**
- `hidden` — `true`면 해당 언어판에서 노출하지 않음(예: 외국인이 사실상 이용 불가한 청약가점·정책대출).

## 사용처

1. **홈/카테고리 페이지 렌더링** — 카테고리 내 카드/링크를 이 `rank` 순으로 정렬하고 `hidden` 항목은 제외한다.
   현재 정적 HTML은 이 매핑에 맞춰 **수기로 정렬**되어 있으며, 향후 빌드 단계에서 자동 주입할 수 있도록 id를 부여했다.
2. **`i18n-maintenance` 워크플로** — 신규 콘텐츠(한국어)가 추가됐는데 각 언어 매핑에 반영되지 않은 경우를 감지해 이슈를 생성한다.

## 콘텐츠 카탈로그 (canonical id)

### guides
| id | 의미 |
|---|---|
| buy-process | 주택 매입 절차 |
| acquisition-tax-guide | 취득세 이해 |
| transfer-tax-guide | 양도세 이해 |
| foreigner-regulation | 외국인 부동산 규제(허가구역·신고의무) |
| foreigner-acq-report | 외국인 취득 신고 의무 |
| double-taxation | 이중과세·본국 세금 이슈 |
| fund-transfer | 자금 반출입(외환 규제) |
| docs-before-buy | 매매 전 확인 서류 |
| registry-reading | 등기부등본 읽는 법 |
| jeonse-101 | 전세 제도 이해 |
| lease-protection | 임대차보호법 핵심(전입·확정일자·대항력·우선변제권) |
| jeonse-scam | 전세사기 예방 |
| deposit-return | 보증금 반환 절차 |
| standard-lease | 표준임대차계약서 이해 |
| short-term-lease | 단기 계약 유의사항 |

### calculators
| id | 파일 |
|---|---|
| acquisition-tax | calculators/acquisition-tax.html |
| brokerage-fee | calculators/brokerage-fee.html |
| jeonse-monthly | calculators/jeonse-monthly.html |
| balance-settlement | calculators/balance-settlement.html |
| transfer-tax | calculators/transfer-tax.html |
| auction-bid | calculators/auction-bid.html |
| loan-limit | calculators/loan-limit.html |
| dsr | calculators/dsr.html |
| housing-subscription | calculators/housing-subscription.html |

### checklists
| id | 파일 |
|---|---|
| lease-contract | checklists/lease-contract.html |
| moving-day | checklists/moving-day.html |
| sale-balance-day | checklists/sale-balance-day.html |
| interior-contract | checklists/interior-contract.html |
