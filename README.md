# eu-vat

The standard VAT rate in every EU member state **on any date since 1 January 2016**, as small libraries with no
dependencies that work offline.

| Language | Package | Install | Status |
|---|---|---|---|
| Node and the browser (TypeScript) | [`@duty27/eu-vat`](node/) | `npm install @duty27/eu-vat` | [on npm](https://www.npmjs.com/package/@duty27/eu-vat) |
| Python 3.9+ | [`duty27-eu-vat`](python/) | `pip install duty27-eu-vat` | [on PyPI](https://pypi.org/project/duty27-eu-vat/) |
| Java 11+ | [`com.duty27:eu-vat`](java/) | Maven or Gradle, see [java/](java/) | [on Maven Central](https://central.sonatype.com/artifact/com.duty27/eu-vat) |
| AI assistants (MCP server) | [`@duty27/eu-vat-mcp`](mcp/) | `claude mcp add eu-vat -- npx -y @duty27/eu-vat-mcp` | [on npm](https://www.npmjs.com/package/@duty27/eu-vat-mcp) |

```js
import { getStandardRate } from '@duty27/eu-vat';
getStandardRate('DE', '2020-07-01');   // 16 (Germany's temporary cut)
```
```python
from duty27_eu_vat import get_standard_rate
get_standard_rate("DE", "2020-07-01")  # Decimal('16')
```
```java
EuVat.getStandardRate("DE", "2020-07-01");   // 16
```

All three give identical answers (so does the MCP server) and are built from the same dataset, which Duty27 publishes at
https://duty27.com/vat-rates/history, as CSV and JSON at https://duty27.com/data/eu-standard-vat-rates.json. Every
rate change there cites the law or tax-authority notice that made it, and the 2016 starting rates cite the European
Commission's rate table; the citations are on that page and in the CSV and JSON, not in the packages. It covers
**standard rates only**; reduced rates are not included. It looks rates up; it does not calculate tax. This is
information, not tax advice.

For deciding what to charge (B2B reverse charge, the EU €10,000 threshold, VIES checks) and keeping the proof
(archive and OSS reports), see the [Duty27 API](https://duty27.com/docs), which is free to try.

## Taking just the one you need

Most people never need this repository: install the package from its registry. To read or work on one library, each
folder is **self-contained**: it has its own README, licences, build file and tests, and needs nothing from the rest of
the repo. To fetch only one folder instead of the whole repository:

```sh
git clone --filter=blob:none --no-checkout https://github.com/duty27/eu-vat.git
cd eu-vat
git sparse-checkout set python        # or node, or java
git checkout main
```

## How they stay identical

One file, [`data/eu-standard-vat-rates.json`](data/eu-standard-vat-rates.json), is the source. `./build.sh` turns it into each
language's data module and a shared set of expected answers (`test-vectors.csv`, worked out by a plain scan of the
data, not by any library), then builds and tests all three libraries and the MCP server (which bundles the Node library's data), and finishes by
checking that every one of them carries the same source hash.

```sh
./build.sh            # regenerate the data, then build and test node, python, java and the MCP server
./build.sh java       # one language (or node, python, mcp)
./build.sh refresh    # fetch the published rates and update the snapshot
./build.sh check      # fail if the published rates changed, or a generated file was edited by hand
```

## Licence

Code: MIT ([LICENSE](LICENSE)). Data: CC BY 4.0 ([DATA-LICENSE.md](DATA-LICENSE.md)), credit
`Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0`.
