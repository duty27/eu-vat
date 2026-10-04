# eu-vat

The standard VAT rate in every EU member state **on any date since 1 January 2016**, as small libraries with
no dependencies that work offline.

| Language | Package | Status |
|---|---|---|
| Node and the browser (TypeScript) | [`@duty27/eu-vat`](node/) | 0.1.0, [on npm](https://www.npmjs.com/package/@duty27/eu-vat) once released |
| Python | not started | |
| Java | not started | |

```js
import { getStandardRate } from '@duty27/eu-vat';

getStandardRate('DE', '2020-07-01');   // 16 (Germany's temporary cut)
```

All of them are built from the same dataset, which Duty27 publishes with its sources at
https://duty27.com/vat-rates/history, as CSV and JSON at
https://duty27.com/data/eu-standard-vat-rates.json. It covers **standard rates only**; reduced rates are not
included. This is information, not tax advice.

For deciding what to charge (B2B reverse charge, the EU €10,000 threshold, VIES checks) and keeping the proof
(archive and OSS reports), see the [Duty27 API](https://duty27.com/docs), which is free to try.

## Licence

Code: MIT ([LICENSE](LICENSE)). Data: CC BY 4.0 ([DATA-LICENSE.md](DATA-LICENSE.md)), credit
`Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0`.
