#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'site', 'en', 'posts');

const ul = (items) => `<ul class="ref-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
const ol = (items) => `<ol class="ref-list">${items.map((item) => `<li>${item}</li>`).join('')}</ol>`;
const table = (headers, rows) => `<div class="table-wrap"><table class="data"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const defs = (rows) => `<div class="def-list">${rows.map(([key, value]) => `<div class="row"><div class="k">${key}</div><div class="v">${value}</div></div>`).join('')}</div>`;
const p = (text) => `<p>${text}</p>`;

const saleRelated = [
  ['property-tour.html', 'Property Viewing Checklist', 'Inspect the unit, building, and neighborhood systematically.'],
  ['registry-reading.html', 'How to Read a Property Register', 'Check ownership, mortgages, seizures, and other rights.'],
  ['sale-contract-tips.html', 'Essential Sale Contract Clauses', 'Put condition, payoff, handover, and remedies in writing.'],
  ['balance-day-settlement.html', 'Closing-Day Settlement', 'Settle management fees, utilities, taxes, and registration.'],
  ['tax-roadmap.html', 'Korean Property Tax Roadmap', 'Plan acquisition, holding, sale, and transfer taxes together.'],
];

const movingRelated = [
  ['moving-company.html', 'How to Choose a Moving Company', 'Verify the license, insurance, terms, and track record.'],
  ['moving-quote.html', 'Moving Quotes: On-site vs Remote', 'Compare the same scope and prevent surprise charges.'],
  ['moving-types.html', 'Transport, Partial Packing, or Full Service?', 'Match the service boundary to your time and budget.'],
  ['moving-day-tips.html', 'Prevent Moving-Day Disputes', 'Photograph, inspect, document damage, and pay at the right time.'],
  ['storage-moving.html', 'Temporary Storage Moves', 'Compare storage type, price, insurance, security, and climate control.'],
  ['move-in-admin.html', 'Address, Mail, and Utility Changes', 'Finish move-in registration and account transfers promptly.'],
];

const guides = [
  {
    slug: 'property-tour',
    hub: 'sale',
    category: 'Buy & Sell',
    title: 'Property Viewing Checklist: 30 Things to Check',
    description: 'A practical checklist for inspecting an apartment, its building, defects, management, transport, and neighborhood before buying in Korea.',
    summary: 'Compare at least three units in the same complex with different buildings, floors, and orientations. Visit around noon for daylight and again in the evening for noise and parking; rainy days are useful for spotting leaks and condensation.',
    readTime: '8 min read',
    sections: [
      ['Outside the building', ol([
        '<strong>Walk to the nearest station yourself.</strong> Listing times may not reflect crossings, hills, or station entrances.',
        '<strong>Check the access road and traffic.</strong> Revisit during commuting hours if congestion matters.',
        '<strong>Look for lighting and CCTV.</strong> Walk the route you would use at night.',
        '<strong>Trace the parking route.</strong> Note entrances, ramps, guest parking, and surface versus underground access.',
        '<strong>Inspect the management office and security desk.</strong> Cleanliness is a useful first signal of building management.',
        '<strong>Review shared facilities.</strong> Check the playground, gym, community rooms, and their maintenance.',
        '<strong>Walk to schools and academies.</strong> Confirm the real route rather than relying only on a map.',
        '<strong>Check daily services.</strong> Locate supermarkets, pharmacies, laundries, clinics, and banks.',
      ])],
      ['Inside the unit', ol([
        '<strong>Entry door, soundproofing, and lock.</strong> Include replacement cost in the repair budget.',
        '<strong>Entry storage.</strong> Confirm that the shoe cabinet and utility storage fit the household.',
        '<strong>Daylight and orientation.</strong> Observe how far direct light reaches around noon.',
        '<strong>Balcony expansion.</strong> Confirm approval, insulation, condensation, and the actual usable area.',
        '<strong>Cross-ventilation.</strong> Open windows and test airflow through living and sleeping areas.',
        '<strong>Ceiling height.</strong> Compare the plans with what the rooms feel like in person.',
        '<strong>Room count and dimensions.</strong> Bring a tape measure for large furniture.',
        '<strong>Built-ins and included fixtures.</strong> Record what remains and its condition.',
        '<strong>Kitchen workflow and storage.</strong> Check refrigerator, sink, cooktop, outlets, and counter space.',
        '<strong>Bathroom ventilation and water.</strong> Run taps, flush toilets, and check corners and ceilings.',
      ])],
      ['Defects and aging', ol([
        '<strong>Condensation and mold around frames</strong> can signal weak insulation or glazing.',
        '<strong>Lifted wallpaper or flooring</strong> may point to moisture or poor prior installation.',
        '<strong>Wall cracks</strong> should be distinguished from cosmetic finish cracks.',
        '<strong>Ceiling stains</strong> can indicate a roof, pipe, or upstairs leak.',
        '<strong>Water pressure</strong> should be tested in the kitchen and bathroom at the same time.',
        '<strong>Hot-water speed and temperature</strong> help reveal boiler condition.',
        '<strong>Outlets, switches, and lights</strong> may need replacement in an older unit.',
        '<strong>Windows and doors</strong> should open, close, and lock smoothly.',
        '<strong>Bathroom fixtures</strong> should be checked for leaks, chips, and movement.',
        '<strong>Kitchen doors and counters</strong> should be priced into the renovation plan if damaged.',
      ])],
      ['Neighborhood and building operations', ol([
        '<strong>Sun obstruction.</strong> Check the distance and height of buildings in front of the unit.',
        '<strong>Impact and airborne noise.</strong> Pause quietly and revisit at another time if possible.',
        '<strong>Road, rail, school, and retail noise.</strong> Open the windows during the visit.',
        '<strong>Night parking.</strong> Evening availability may differ sharply from daytime.',
        '<strong>Elevator wait.</strong> Consider peak hours and the number of elevators per household.',
        '<strong>Management fees.</strong> Review the complex average and the unit\'s latest three bills.',
      ])],
      ['Prepare before the visit', ul([
        'Issue a property-register copy and plan to issue fresh copies immediately before signing and closing.',
        'Check the building ledger for unapproved or non-compliant alterations.',
        'Review recent reported transaction prices at <a href="https://rt.molit.go.kr" target="_blank" rel="noopener">MOLIT\'s transaction-price system</a>.',
        'Bring a tape measure, phone flashlight, notes, and the floor plan.',
        'Visit once between noon and 2 p.m. and, when possible, again around 7 p.m.',
      ])],
    ],
    related: saleRelated,
  },
  {
    slug: 'registry-reading',
    hub: 'sale',
    category: 'Buy & Sell',
    title: 'How to Read a Korean Property Register',
    description: 'How to read the title section, Gap-gu ownership section, and Eul-gu encumbrance section of a Korean property register before a sale or Jeonse contract.',
    summary: 'A Korean property register has three parts: the property description, Gap-gu for ownership, and Eul-gu for non-ownership rights. Before buying or leasing, focus first on uncancelled seizures in Gap-gu and the total secured debt in Eul-gu.',
    readTime: '10 min read',
    sections: [
      ['The property\'s legal résumé', p('The register is the public record of rights over a property. Issue it through the <a href="https://www.iros.go.kr" target="_blank" rel="noopener">Supreme Court Internet Registry</a>. Obtain fresh copies at least before signing, before any interim payment, and immediately before closing so a new filing is not missed.')],
      ['Title section: identify the property', ul([
        '<strong>Address:</strong> it must match the contract exactly.',
        '<strong>Exclusive-use area:</strong> this is the registered private area and may differ from the marketing area.',
        '<strong>Land-share ratio:</strong> the unit\'s share of the complex land, which can matter in redevelopment.',
      ])],
      ['Gap-gu: ownership history', defs([
        ['Ownership preservation', 'The first registered owner, often the developer for a newly built property.'],
        ['Ownership transfer', 'Changes caused by sale, gift, or inheritance. The latest active entry identifies the owner.'],
        ['Provisional seizure', 'A creditor has frozen the property. Stop and resolve it before contracting.'],
        ['Provisional disposition', 'Pending litigation may affect ownership. Do not proceed without specialist review.'],
        ['Auction commencement', 'The property is already in enforcement. Do not enter a normal sale or lease.'],
        ['Trust registration', 'The trustee is the legal owner; a lease or sale may require the trustee\'s consent.'],
      ])],
      ['Eul-gu: mortgages and other rights', defs([
        ['Maximum secured claim', 'The registered ceiling is commonly about 120% of the actual loan, not the outstanding loan itself.'],
        ['Jeonse right registration', 'A registered leasehold-style right that separately secures the tenant\'s position.'],
        ['Superficies', 'A right to use land owned by another party; it needs careful review for houses and small buildings.'],
        ['Attachment or tax enforcement', 'Unpaid debt or tax enforcement is a stop signal until released.'],
      ])],
      ['Red flags when buying', ol([
        'An active provisional seizure, provisional disposition, or auction entry in Gap-gu.',
        'Several ownership transfers within a short period without a clear explanation.',
        'Maximum secured claims approaching 70% or more of the price without a documented simultaneous payoff.',
        'A trust registration without the trustee\'s written authority.',
        'Unapproved construction shown on the building ledger, even if it is absent from the register.',
      ])],
      ['Red flags for Jeonse', ol([
        'Market value minus senior mortgages and senior deposits is less than your deposit.',
        'A Jeonse-to-price ratio above roughly 80%, especially in a falling market.',
        'A newly built villa or multi-family building with few comparable sale transactions.',
        'A landlord or company holding many units with concentrated deposit-return risk.',
        'National or local tax arrears that may rank ahead of the tenant; request current clearance certificates.',
      ])],
      ['Read only the active entries', p('A cancelled entry no longer has effect; focus on rights without a cancellation notation. At closing, issue another copy before sending funds. If an active mortgage will be paid off from the balance, the contract should require simultaneous payoff and cancellation, with the release documents delivered at closing.')],
      ['Official records', ul([
        '<a href="https://www.iros.go.kr" target="_blank" rel="noopener">Supreme Court Internet Registry</a> — property registers.',
        '<a href="https://www.gov.kr" target="_blank" rel="noopener">Government24</a> — building ledgers and administrative records.',
        '<a href="https://rt.molit.go.kr" target="_blank" rel="noopener">MOLIT Transaction Price System</a> — reported sale and lease prices.',
        '<a href="https://www.eum.go.kr" target="_blank" rel="noopener">Land Use Regulation Information Service</a> — zoning and land-use plans.',
      ])],
    ],
    related: saleRelated,
  },
  {
    slug: 'sale-contract-tips',
    hub: 'sale',
    category: 'Buy & Sell',
    title: 'Seven Essential Clauses for a Korean Home Sale Contract',
    description: 'Practical special clauses for property condition, included fixtures, closing adjustments, mortgage release, tenants, unauthorized work, and seller identity.',
    summary: 'The printed contract is standardized, but negotiated special clauses allocate the real transaction risk. Put every important promise, deadline, document, and remedy in writing.',
    readTime: '8 min read',
    sections: [
      ['Seven clauses worth negotiating', defs([
        ['1. Present condition plus exceptions', 'State that the buyer inspected the current condition, then list every defect the seller must repair before closing, such as a ceiling leak or bedroom condensation.'],
        ['2. Included fixtures', 'List each air conditioner, built-in cabinet, appliance, and other fixture by quantity and condition, and require working handover.'],
        ['3. Closing adjustments', 'Specify that advance management deposits, long-term repair reserves where applicable, and prorated monthly fees will be settled as of closing.'],
        ['4. Mortgage cancellation', 'Identify the registered maximum secured claim and require payoff and filing of cancellation simultaneously with the balance payment.'],
        ['5. Unauthorized construction', 'Allocate correction duties or a price deduction if an unapproved alteration is discovered before closing.'],
        ['6. Tenant vacancy and handover', 'Make the seller responsible for vacant possession by closing and state a daily remedy if handover is late.'],
        ['7. Identity and agency', 'Contract only with the registered seller or a properly authorized agent holding the required power of attorney and seal documents.'],
      ])],
      ['Drafting tips', ul([
        '<strong>Do not rely on oral promises.</strong> Even if an oral agreement can be valid, proving it later is difficult.',
        '<strong>Use numbers and dates.</strong> Write exact deadlines, amounts, daily charges, and document names.',
        '<strong>List exceptions specifically.</strong> Avoid broad phrases such as “including but not limited to” when the scope matters.',
        '<strong>Initial every special-clause page.</strong> Both parties should sign or seal alterations and attachments.',
        '<strong>Use paid legal review for a high-value or unusual deal.</strong> A short review can be inexpensive compared with a closing dispute.',
      ])],
      ['Clauses to challenge', ul([
        '“The seller has no responsibility for any defect.” A blanket waiver may shift too much risk and may not cover a defect intentionally concealed.',
        '“Everything found after closing is the buyer\'s responsibility.” Separate disclosed condition from known but undisclosed defects.',
        '“Oral agreements have no effect.” This can improve certainty but also erase a promise the buyer relied on; ensure all agreed points are written first.',
      ])],
      ['Useful sources', ul([
        '<a href="https://www.law.go.kr" target="_blank" rel="noopener">Korean Law Information Center</a> — Civil Act provisions on sale, earnest money, and seller liability.',
        '<a href="https://www.kar.or.kr" target="_blank" rel="noopener">Korea Association of Realtors</a> — standard contract resources.',
        '<a href="registry-reading.html">How to Read a Korean Property Register</a>.',
        '<a href="balance-day-settlement.html">Closing-Day Settlement</a>.',
      ])],
    ],
    related: saleRelated,
  },
  {
    slug: 'balance-day-settlement',
    hub: 'sale',
    category: 'Buy & Sell',
    title: 'Five Closing-Day Adjustments Buyers and Sellers Miss',
    description: 'How to settle advance management deposits, long-term repair reserves, prorated fees, utility readings, taxes, and registration costs on closing day.',
    summary: 'Advance management deposits, long-term repair reserves, and prorated monthly fees can easily change the closing balance by hundreds of thousands of won. Confirm every amount with the management office before closing.',
    readTime: '9 min read',
    sections: [
      ['What gets adjusted at closing', table(
        ['Item', 'Usual direction', 'Basis'],
        [
          ['Advance management deposit', 'Buyer pays seller', 'Exact balance confirmed by the management office'],
          ['Long-term repair reserve', 'Owner reimburses tenant when a lease ends', 'Cumulative amount paid on the owner\'s behalf'],
          ['Current-month management fee', 'Prorated', 'Seller through closing date; buyer afterward'],
          ['Gas, electricity, and water', 'Each party\'s usage', 'Closing-day meter readings'],
          ['Tax and registration', 'Usually buyer', 'Separate from building-management settlement'],
        ],
      )],
      ['1. Advance management deposit', p('Many apartment complexes hold an advance management deposit that follows the unit. When ownership transfers, the buyer commonly reimburses the seller for the balance. Ask the management office for a written balance confirmation one or two days before closing and settle it while the parties and agent are together.')],
      ['2. Long-term repair reserve', p('The long-term repair reserve is legally an owner expense but is often collected through the tenant\'s monthly bill. When the lease ends, the tenant can request reimbursement of the amount paid. If a tenant leaves as part of a sale, the seller should normally settle this before handing the unit to the buyer. Keep the management office\'s payment statement.')],
      ['3. Prorate the current month', p('When closing occurs mid-month, divide the current month\'s management fee at the closing date. Because the final bill may arrive later, the parties can retain contact and settle afterward or agree on a reasonable estimate and document it at closing.')],
      ['4. Read every meter', ul([
        'Photograph electricity, gas, and water meters with a timestamp.',
        'Ask the relevant provider to close or transfer the seller\'s account.',
        'Record the reading and responsibility split in the handover note.',
      ])],
      ['5. Taxes and registration are separate', p('Acquisition tax, registration filing, housing bonds, judicial-scrivener fees, and brokerage commission are separate from management-office adjustments. Budget them before closing and use the <a href="../calculators/acquisition-tax.html">English acquisition-tax calculator</a> and <a href="../calculators/balance-settlement.html">closing settlement calculator</a> as planning tools.')],
      ['If a party refuses to settle', p('Try to resolve the amount through the agent and management office before funds move. If money is withheld from the balance, write and sign a clear settlement agreement. A later civil claim is possible but can cost more time and money than resolving the evidence at closing.')],
    ],
    related: saleRelated,
  },
  {
    slug: 'tax-roadmap',
    hub: 'sale',
    category: 'Buy & Sell',
    title: 'Korean Property Tax Roadmap',
    description: 'Plan Korean acquisition, holding, rental, capital-gains, gift, and inheritance taxes as one timeline before signing a property contract.',
    summary: 'Tax planning happens before the contract, not after the transaction. Purchase order, ownership structure, and closing or sale dates can materially change the combined tax result.',
    readTime: '11 min read',
    sections: [
      ['Map the full property life cycle', table(
        ['Stage', 'Main taxes', 'Critical variables', 'Planning focus'],
        [
          ['Acquisition', 'Acquisition tax and surtaxes', 'Home count, location, value', 'Purchase order and ownership'],
          ['Holding', 'Property tax and comprehensive real-estate holding tax', 'June 1 owner, assessed value, per-person aggregation', 'Closing date and ownership split'],
          ['Rental', 'Rental income tax', 'Rent, deposit, and home count', 'Income and registration records'],
          ['Sale', 'Capital-gains and local income tax', 'Exemption, holding and residence periods', 'Eligibility, order, and tax year'],
          ['Gift or inheritance', 'Gift and inheritance tax', 'Ten-year aggregation and carryover basis rules', 'Long-term transfer plan'],
        ],
      )],
      ['Acquisition: order and ownership matter', ul([
        'Acquisition-tax rates depend on the tax-law home count, value, and regulated-area status.',
        'Residential officetels, presale rights, occupancy rights, and inherited homes can each have special counting rules.',
        'Joint ownership may affect later per-person deductions and progressive rates, but financing and insurance consequences also matter.',
        'Estimate the current rules with the <a href="../calculators/acquisition-tax.html">acquisition-tax calculator</a> and verify them before signing.',
      ])],
      ['Holding: use the calendar', ul([
        '<strong>June 1 is the annual assessment date</strong> for key holding taxes. A one-day change in closing can shift that year\'s legal taxpayer.',
        'Some holding taxes aggregate property per individual, so joint versus sole ownership can change deductions and rates.',
        'Review the annual assessed value during the objection period if it appears inconsistent with the applicable valuation rules.',
      ])],
      ['Sale: complete the conditions first', ul([
        'The one-home exemption depends on the current price threshold and required holding or residence period.',
        'Temporary two-home relief requires sale of the former home within the applicable deadline.',
        'Long-term holding deductions can depend on both ownership and actual residence.',
        'Gains are aggregated by tax year; spreading two gains across years or matching gains and losses in one year may change the result.',
      ])],
      ['Gift and inheritance: think in ten-year blocks', ul([
        'Gift deductions aggregate over ten years, so a long-term plan may use more than one deduction window.',
        'Carryover-basis rules can remove the expected benefit when gifted property is sold within the statutory period.',
        'A debt-assumption gift can create a taxable sale component; compare the total gift and capital-gains result.',
      ])],
      ['Five frequent mistakes', ol([
        'Agreeing to a closing date without considering the June 1 holding-tax date.',
        'Missing a temporary two-home deadline.',
        'Ignoring an officetel, presale right, or occupancy right in the tax-law home count.',
        'Selling before a residence or holding requirement is completed.',
        'Seeking tax advice only after signing, when the practical choices are already limited.',
      ])],
      ['Pre-contract tax routine', ol([
        'Confirm the household\'s tax-law home count.',
        'Estimate acquisition tax, several years of holding tax, and an exit scenario in one worksheet.',
        'Compare two or three alternatives for ownership, closing date, and sale order.',
        'For multiple homes, gifts, inheritance, or a high-value transaction, obtain advice from a Korean tax professional before signing.',
      ])],
    ],
    related: saleRelated,
  },
  {
    slug: 'moving-company',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'How to Choose a Moving Company in Korea',
    description: 'Eight checks for a licensed moving company: cargo insurance, standard terms, on-site estimates, comparable quotes, real reviews, timing, storage, and dispute help.',
    summary: 'A licensed mover, cargo-liability insurance, standard terms, and three comparable on-site estimates prevent most moving disputes.',
    readTime: '10 min read',
    sections: [
      ['1. Verify the business license', p('Moving freight is a licensed business in Korea. Search the business name or registration number through the <a href="https://www.kffa.or.kr" target="_blank" rel="noopener">Korea Federation of Freight Transportation Associations</a>. Compensation can be much harder to recover from an unlicensed operator.')],
      ['2. Obtain proof of cargo-liability insurance', p('Ask for the policy certificate, coverage limit, exclusions, and deductible with the estimate. The certificate should cover the company that will actually move the goods, including any subcontractor.')],
      ['3. Use the standard moving terms', p('The Korea Fair Trade Commission\'s standard moving terms address damage, delay, cancellation, and additional charges. Read any company-specific terms and do not accept a vague oral substitute.')],
      ['4. Require an on-site written estimate', p('A remote estimate may miss the real volume and access conditions. The written estimate should state vehicle size, crew size, start and arrival times, packing scope, appliances, lift truck, stairs, parking, disposal, VAT, and every condition that could increase the price.')],
      ['5. Compare three to five companies', p('Quotes for the same move can differ substantially. Compare the same written scope, not just the total. A mid-range quote with a verified license, insurance, and credible reviews is often safer than the lowest number.')],
      ['6. Check whether reviews are credible', ul([
        'Treat clusters of nearly identical reviews posted on the same date with caution.',
        'Look for specific details about the route, crew, damage handling, and final price.',
        'Search community reviews as well as the company\'s own marketing channels.',
        'Contact the <a href="https://www.kca.go.kr" target="_blank" rel="noopener">Korea Consumer Agency</a> for complaint and mediation guidance.',
      ])],
      ['7. Understand peak-date pricing', p('Weekends and traditional “days without spirits” can cost much more than an ordinary weekday. If the transaction schedule is flexible, compare a weekday before fixing the moving date.')],
      ['8. Check temporary storage separately', p('When sale and purchase closing dates do not align, confirm the daily storage charge, two separate handling charges, insurance during storage, inventory method, temperature and humidity, fire protection, security, and the long-storage rate.')],
      ['Prevent disputes on moving day', ol([
        'Photograph the old home, new home, and valuable items before and after handling.',
        'Record damage immediately on the handover receipt and ask the team leader to acknowledge it.',
        'Pay the final amount after unloading and inspection, as stated in the contract.',
        'Keep the contract, estimate, insurance certificate, receipt, photographs, and handover record.',
        'For unresolved disputes, contact the Korea Consumer Agency at 1372 or the relevant local authority.',
      ])],
    ],
    related: movingRelated,
  },
  {
    slug: 'moving-quote',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'Moving Quotes in Korea: On-site vs Remote',
    description: 'How to compare Korean moving estimates, current reference price ranges, and the access, equipment, and specialty-item charges that cause disputes.',
    summary: 'Remote quotes often become more expensive on moving day when the actual volume and access differ. Use an on-site estimate and write the truck, crew, schedule, scope, equipment, insurance, and surcharge conditions into the quote.',
    readTime: '7 min read',
    sections: [
      ['How to collect comparable quotes', ol([
        'Request on-site estimates from three to five licensed companies.',
        'Record truck size: 1, 1.5, 2.5, or 5 metric tons.',
        'Record the number of crew members and whether any work is subcontracted.',
        'Write the departure and arrival windows.',
        'List air conditioners, washers, pianos, safes, built-ins, disposal, and reassembly.',
        'State whether elevators, stairs, lift trucks, long carries, and parking fees are included.',
        'Write every surcharge condition and the cargo-insurance limit and deductible.',
      ])],
      ['Reference ranges as of May 2026', table(
        ['Home and truck', 'Transport only', 'Partial packing', 'Full service'],
        [
          ['Studio / 1 ton', 'KRW 200,000–400,000', 'KRW 400,000–600,000', 'KRW 600,000–900,000'],
          ['Approx. 20 pyeong / 2.5 ton', 'KRW 400,000–700,000', 'KRW 700,000–1,100,000', 'KRW 1,100,000–1,600,000'],
          ['Approx. 30 pyeong / 5 ton', 'KRW 700,000–1,200,000', 'KRW 1,100,000–1,800,000', 'KRW 1,800,000–2,800,000'],
          ['Approx. 40 pyeong or more', 'KRW 1,200,000–2,000,000', 'KRW 1,800,000–2,800,000', 'KRW 2,800,000–4,500,000'],
        ],
      ) + p('These are market-practice references, not fixed prices. Peak dates and weekends can add roughly 30–50%, and lift-truck charges vary by height, access, and time.')],
      ['Five common extra charges', ul([
        'A larger truck because the actual volume exceeds the estimate.',
        'Stair labor where an elevator cannot be used.',
        'Distance, fuel, tolls, or a long carry from the truck to the door.',
        'Pianos, safes, large appliances, or other specialty items.',
        'Wardrobe, bed, or built-in disassembly and reassembly.',
      ]) + p('Put each applicable item into the estimate before signing. A written fixed scope is the best defense against a moving-day price dispute.')],
      ['Verify before booking', ul([
        '<a href="https://www.kffa.or.kr" target="_blank" rel="noopener">Korea Federation of Freight Transportation Associations</a> — license verification.',
        '<a href="https://www.ftc.go.kr" target="_blank" rel="noopener">Korea Fair Trade Commission</a> — standard terms.',
        '<a href="moving-company.html">How to Choose a Moving Company in Korea</a>.',
        '<a href="moving-types.html">Transport, Partial Packing, or Full Service?</a>',
      ])],
    ],
    related: movingRelated,
  },
  {
    slug: 'moving-types',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'Transport, Partial Packing, or Full-Service Moving?',
    description: 'Compare transport-only, partial-packing, and full-service moves in Korea by scope, responsibility, price, and the items commonly excluded from a quote.',
    summary: 'Transport-only means you pack; partial packing divides responsibility; full service normally packs, moves, unpacks, and reassembles. The service name alone is not enough—write the exact boundary into the estimate.',
    readTime: '6 min read',
    sections: [
      ['Compare the three service types', table(
        ['Type', 'Typical scope', 'Relative price', 'Best fit'],
        [
          ['Transport only', 'Customer packs; mover transports', 'Lowest', 'Studio or light move'],
          ['Partial packing', 'Mover packs fragile goods, clothing, dishes, and appliances; customer handles general items', 'About 1.5–2× transport only', 'One- or two-person household with preparation time'],
          ['Full service', 'Packing, transport, furniture disassembly and reassembly, unpacking, and basic placement', 'About 2.5–4× transport only', 'Larger household or compressed schedule'],
        ],
      )],
      ['Confirm what full service actually includes', ul([
        '<strong>Commonly included:</strong> boxes, furniture disassembly and reassembly, bedding, and basic appliance disconnection.',
        '<strong>Often optional:</strong> air-conditioner removal and installation, washer hoses, detailed dish arrangement, and specialty furniture.',
        '<strong>Usually excluded:</strong> deep cleaning, wall mounting, internet installation, waste fees, and mail or address changes.',
      ])],
      ['Reduce cost with self-packing', p('Moving from full service to partial packing can reduce the quote by roughly 30–40%, depending on the home. Start a week early with books, clothing, dishes, décor, albums, and documents. Keep passports, valuables, medicine, contracts, and digital backups with you rather than in the moving truck.')],
      ['Choose by risk, not only price', ul([
        'Estimate how many days of packing and unpacking the household can realistically provide.',
        'Identify fragile, oversized, or high-value items that need specialist handling.',
        'State who supplies packing materials and removes empty materials afterward.',
        'Use the same inventory and access assumptions when comparing quotes.',
      ])],
    ],
    related: movingRelated,
  },
  {
    slug: 'moving-day-tips',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'How to Prevent Moving-Day Disputes',
    description: 'A moving-day evidence and handover guide: photographs, damage records, payment timing, insurance claims, appliances, and Korean consumer mediation.',
    summary: 'Photographs, a signed handover record, and correct final-payment timing prevent most disputes. Inspect before the crew leaves and report damage promptly.',
    readTime: '7 min read',
    sections: [
      ['Five rules for the day', defs([
        ['1. Photograph before and after', 'Record both homes and valuable items before loading and before unpacking.'],
        ['2. Record damage immediately', 'Photograph the item with the team leader and write it on the handover receipt before signing.'],
        ['3. Pay after inspection', 'Follow the contract and make final payment after unloading and the initial damage check.'],
        ['4. Keep a traceable receipt', 'Use a company that can issue a proper receipt or tax invoice; avoid undocumented cash-only demands.'],
        ['5. Treat tips as optional', 'A tip is not a legal requirement and should never replace the agreed price.'],
      ])],
      ['Damage or loss claim', ol([
        'Photograph the loss or damage and note it on the signed handover record.',
        'Ask the moving company for a written compensation response.',
        'Submit the evidence to the cargo-liability insurer within the policy deadline; the Korean source guide uses 30 days as the working rule.',
        'If the company or insurer refuses, request mediation through the <a href="https://www.kca.go.kr" target="_blank" rel="noopener">Korea Consumer Agency</a> at 1372.',
      ])],
      ['Check appliances after installation', ul([
        '<strong>Refrigerator:</strong> follow the manufacturer\'s wait time before power-up after transport.',
        '<strong>Washer:</strong> check hose connections, drainage, and leveling.',
        '<strong>Air conditioner:</strong> confirm reinstallation scope and inspect for refrigerant leaks.',
        '<strong>TV:</strong> inspect the panel before the protective packaging is discarded.',
        '<strong>Gas appliance:</strong> use the local authorized gas-safety or utility process for connection.',
      ])],
      ['Keep the evidence bundle', ul([
        'Signed contract and itemized estimate.',
        'Cargo-insurance certificate.',
        'Before-and-after photographs and video.',
        'Payment receipt and signed handover note.',
        'Messages with the company and insurer.',
      ])],
    ],
    related: movingRelated,
  },
  {
    slug: 'storage-moving',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'Temporary Storage Moves When Closing Dates Do Not Match',
    description: 'Compare short-term container and warehouse storage, daily reference prices, two-stage moving costs, insurance, security, climate, and inventory controls.',
    summary: 'For a gap of one or two weeks, temporary storage is often practical. Fix the daily storage rate, both handling charges, insurance, climate, security, and inventory procedure in the quote.',
    readTime: '6 min read',
    sections: [
      ['Storage move or another option?', defs([
        ['Temporary storage move', 'Goods are stored by the day in a container or warehouse; practical for a short gap of roughly 1–30 days.'],
        ['Short-term rental', 'The household uses temporary accommodation while goods remain in storage; often better for a longer gap.'],
        ['Family or friend arrangement', 'Can reduce lodging cost but needs a realistic plan for goods, privacy, and insurance.'],
      ])],
      ['Reference storage prices', table(
        ['Capacity', 'Typical household', 'Daily storage only'],
        [
          ['1-ton container', 'Studio / one person', 'KRW 20,000–30,000'],
          ['2.5-ton container', 'Approx. 20 pyeong', 'KRW 30,000–40,000'],
          ['4-ton container', 'Approx. 30 pyeong', 'KRW 40,000–50,000'],
          ['5 tons or warehouse', 'Approx. 40 pyeong or more', 'Quoted individually'],
        ],
      ) + p('First-stage transport and second-stage delivery are additional. A package quote may reduce the combined price, but compare the exact scope and insurance rather than the headline discount.')],
      ['Five checks before storage', ul([
        '<strong>Insurance:</strong> obtain proof that fire, theft, and handling damage remain covered during storage.',
        '<strong>Temperature and humidity:</strong> ordinary containers can become extremely hot and damage electronics, furniture, books, and artwork.',
        '<strong>Security:</strong> check CCTV, access controls, guards, locks, and fire protection.',
        '<strong>Inventory:</strong> number boxes, photograph the load, and obtain a signed inventory.',
        '<strong>Longer than one month:</strong> request a separate monthly rate and inspect the storage conditions rather than multiplying a short-term daily quote.',
      ])],
      ['Keep valuables with you', p('Do not place passports, identity documents, cash, jewelry, medicine, keys, original contracts, tax documents, or irreplaceable data backups in general moving storage.')],
    ],
    related: movingRelated,
  },
  {
    slug: 'move-in-admin',
    hub: 'moving',
    category: 'Moving & Move-in',
    title: 'Move-in Registration, Mail, and Utility Changes',
    description: 'A Korea move-in administration guide covering address registration, fixed-date stamps, mail forwarding, gas, electricity, water, internet, banking, and insurance.',
    summary: 'Complete the legally required address process promptly. Tenants should handle the Korean protection steps that apply to them on move-in day and should not assume every service transfers automatically.',
    readTime: '7 min read',
    sections: [
      ['Address registration', p('The Korean source guide states that domestic move-in registration is required within 14 days and that tenants should act on moving day because address registration is part of establishing protection against third parties. Korean citizens can use <a href="https://www.gov.kr" target="_blank" rel="noopener">Government24</a> or the local community service center. Foreign residents should update the address through the immigration process applicable to their status and confirm the protection steps for their lease.') + ul([
        'Bring the identification and authorization documents required for the filer.',
        'For a lease, ask whether the fixed-date stamp can be completed at the same time.',
        'Keep confirmation receipts with the signed lease.',
      ])],
      ['Government24 related services', ul([
        '<strong>Mail forwarding:</strong> Korea Post can forward mail for the available service period.',
        '<strong>Utility support:</strong> some address-linked services may be offered during the move-in filing.',
        '<strong>Vehicle address:</strong> check whether the relevant vehicle record updates automatically.',
        '<strong>School administration:</strong> primary-school and other placement processes can differ.',
        '<strong>Civil-defense or reserve records:</strong> domestic residents should confirm automatic updates where applicable.',
      ])],
      ['Services to transfer directly', table(
        ['Service', 'Contact', 'What to do'],
        [
          ['City gas', 'Local gas company / safety process', 'Book the final reading and safe connection; change the account name'],
          ['Electricity', '<a href="https://cyber.kepco.co.kr" target="_blank" rel="noopener">KEPCO</a> / 123', 'Record the meter and transfer or open the account'],
          ['Water', 'Municipal water office or building management', 'Confirm the final reading and billing route'],
          ['Internet and IPTV', 'Your telecom provider', 'Book relocation several business days in advance'],
          ['Bank and card', 'Each provider\'s app or branch', 'Update the mailing address and delivery details'],
          ['Health insurance', '<a href="https://www.nhis.or.kr" target="_blank" rel="noopener">NHIS</a>', 'Confirm the registered address and any household implications'],
        ],
      )],
      ['Move-in day record', ul([
        'Photograph utility meters and the condition of every room.',
        'Confirm keys, access cards, parking registration, and building rules.',
        'Notify building management and reserve any elevator or move-in access.',
        'Save the handover record, meter photographs, lease, address filings, and utility confirmations together.',
      ])],
    ],
    related: movingRelated,
  },
];

function renderRelated(page) {
  const cards = page.related
    .filter(([href]) => href !== `${page.slug}.html`)
    .slice(0, 4)
    .map(([href, title, description]) => `<a class="card" href="${href}"><span class="badge badge-accent">${page.category}</span><h3>${title}</h3><p>${description}</p></a>`)
    .join('');
  const calculator = page.hub === 'sale'
    ? `<a class="card" href="../calculators/acquisition-tax.html"><span class="badge badge-success">Calculator</span><h3>Acquisition Tax</h3><p>Estimate tax by price, home count, area, and location.</p></a>
       <a class="card" href="../calculators/balance-settlement.html"><span class="badge badge-success">Calculator</span><h3>Closing-Day Settlement</h3><p>Prorate management charges and closing adjustments.</p></a>
       <a class="card" href="../calculators/brokerage-fee.html"><span class="badge badge-success">Calculator</span><h3>Brokerage Fee</h3><p>Check the maximum commission by transaction amount.</p></a>`
    : `<a class="card" href="../calculators/balance-settlement.html"><span class="badge badge-success">Calculator</span><h3>Closing-Day Settlement</h3><p>Prorate management charges and utility adjustments.</p></a>`;
  return `<section class="hub-section" style="margin-top:40px"><div class="hub-section-head"><span class="hub-section-tag">${page.category}</span><h2>Related guides</h2></div><div class="cards-grid">${cards}</div></section>
  <section class="hub-section" style="margin-top:40px"><div class="hub-section-head"><span class="hub-section-tag">Tools</span><h2>Related calculators</h2></div><div class="cards-grid">${calculator}</div></section>`;
}

function render(page) {
  const hubTitle = page.hub === 'sale' ? 'Buy & Sell' : 'Moving & Move-in';
  const toc = page.sections.map(([title], index) => `<li><a href="#s${index + 1}">${title}</a></li>`).join('');
  const body = page.sections.map(([title, html], index) => `<h2 id="s${index + 1}">${title}</h2>${html}`).join('\n');
  const image = `https://topda.kr/assets/images/categories/${page.hub}.webp`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: page.title,
        description: page.description,
        inLanguage: 'en',
        dateModified: '2026-07-25',
        mainEntityOfPage: `https://topda.kr/en/posts/${page.slug}.html`,
        publisher: { '@type': 'Organization', name: 'TOPDA', url: 'https://topda.kr/en/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://topda.kr/en/index.html' },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://topda.kr/en/guides.html' },
          { '@type': 'ListItem', position: 3, name: hubTitle, item: `https://topda.kr/en/${page.hub}.html` },
          { '@type': 'ListItem', position: 4, name: page.title, item: `https://topda.kr/en/posts/${page.slug}.html` },
        ],
      },
    ],
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${page.title} — TOPDA</title>
<meta name="description" content="${page.description}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="canonical" href="https://topda.kr/en/posts/${page.slug}.html" />
<link rel="alternate" hreflang="ko" href="https://topda.kr/posts/${page.slug}.html" />
<link rel="alternate" hreflang="en" href="https://topda.kr/en/posts/${page.slug}.html" />
<link rel="alternate" hreflang="x-default" href="https://topda.kr/posts/${page.slug}.html" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${page.title} — TOPDA" />
<meta property="og:description" content="${page.description}" />
<meta property="og:url" content="https://topda.kr/en/posts/${page.slug}.html" />
<meta property="og:image" content="${image}" />
<meta property="og:locale" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${page.title} — TOPDA" />
<meta name="twitter:description" content="${page.description}" />
<meta name="twitter:image" content="${image}" />
<script defer src="https://topda.kr/assets/analytics.js?v=3e86e8b800"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../../assets/styles.css?v=b54e7c9b22" />
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<header class="site-header">
  <div class="container row">
    <a href="../index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="../guides.html" data-nav class="active">Guides</a>
      <a href="../calculators/index.html" data-nav>Calculators</a>
      <a href="../market.html" data-nav>Market Data</a>
      <a href="../../checklists/index.html" data-nav>Checklists</a>
      <a href="../../board.html" data-nav>Board</a>
    </nav>
    <div class="lang-switch"><a href="../../posts/${page.slug}.html">KR</a><a href="${page.slug}.html" class="active">EN</a></div>
    <button class="nav-toggle" data-nav-toggle aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
  </div>
  <div class="mobile-menu" data-mobile-menu>
    <a href="../guides.html">Guides</a>
    <a href="../calculators/index.html">Calculators</a>
    <a href="../market.html">Market Data</a>
    <a href="../../checklists/index.html">Checklists</a>
    <a href="../about.html">About</a>
    <a href="../../posts/${page.slug}.html">Korean</a>
  </div>
</header>
<main class="container-narrow">
  <div class="article-header">
    <div class="breadcrumb"><a href="../index.html">Home</a> / <a href="../guides.html">Guides</a> / <a href="../${page.hub}.html">${hubTitle}</a> / ${page.title}</div>
    <div class="g-hero-media" style="margin-top:14px"><img src="../../assets/images/categories/${page.hub}.webp" alt="${page.title}" loading="eager" /></div>
    <div class="tag-row"><span class="badge badge-accent">${page.category}</span><span class="badge">Detailed guide</span></div>
    <h1>${page.title}</h1>
    <div class="meta"><span>Updated July 2026</span><span class="dot">·</span><span>${page.readTime}</span></div>
  </div>
  <div class="article-summary"><div class="label">In brief</div><p>${page.summary}</p></div>
  <nav class="g-toc" aria-label="On this page" data-collapsed="false">
    <div class="g-toc-head"><h2>On this page</h2><button type="button" class="g-toc-toggle" aria-expanded="true">Collapse</button></div>
    <ol class="g-toc-list">${toc}</ol>
  </nav>
  <div class="prose">${body}</div>
  ${renderRelated(page)}
  <div class="callout callout-warn" style="margin-top:32px"><div class="icon">!</div><div class="body"><strong>General information only.</strong> Requirements, rates, market prices, and contract terms change. Verify current official records and consult a qualified Korean professional before making a legal, tax, financial, or contractual decision.</div></div>
</main>
<footer class="site-footer"><div class="container"><p class="disclaimer">&copy; TOPDA. General information only, not legal, tax, or financial advice.</p></div></footer>
<script src="../../assets/app.js?v=61e054e88c"></script>
</body>
</html>
`;
}

mkdirSync(outDir, { recursive: true });
for (const guide of guides) {
  writeFileSync(join(outDir, `${guide.slug}.html`), render(guide), 'utf8');
}
console.log(`Generated ${guides.length} English sale and moving detail guides.`);
