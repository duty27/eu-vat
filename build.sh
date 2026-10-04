#!/usr/bin/env bash
#
# Builds and tests all three libraries (Node, Python, Java) from ONE source of VAT rates.
#
# The source is data/eu-standard-vat-rates.json, a copy of what Duty27 publishes at
# https://duty27.com/data/eu-standard-vat-rates.json. Every build below first regenerates each language's data
# module from that one file (scripts/sync-data.mjs), so the three libraries cannot be built from different rates,
# and the script ends by checking that all three really carry the same source hash.
#
#   ./build.sh                 data, then build and test all three (the default)
#   ./build.sh node            data, then Node only        (npm ci, build, tests, tarball check)
#   ./build.sh python          data, then Python only      (tests on the source, build wheel and sdist, twine check,
#                              then install the wheel alone into a clean virtualenv and test THAT)
#   ./build.sh java            data, then Java only        (mvn verify: compile for Java 11, tests, jar)
#   ./build.sh mcp             data, then the MCP server   (typecheck, bundle the Node library into one file, tests over stdio)
#   ./build.sh data            only regenerate the data modules from the committed snapshot (works offline)
#   ./build.sh refresh         fetch the published rates, validate them, update the snapshot, regenerate everything
#   ./build.sh check           change nothing: fail if the published rates differ from the snapshot (a rate changed)
#                              or if any generated file is not exactly what the snapshot produces
#   ./build.sh clean           remove build output
#
# Needs: node (22 or later; the MCP server needs npm too), plus python3 (3.9 or later) for python, plus a JDK (11 or later) and Maven for java.
# Environment: PYTHON=python3.12 picks the Python used to build; the Python tests also run on it.
set -euo pipefail

# Always work from the folder this script is in, so it behaves the same from anywhere.
cd "$(dirname "$0")"
ROOT="$(pwd)"
PYTHON="${PYTHON:-python3}"

# ---------------------------------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------------------------------

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mok\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Fail early, with a useful message, if a tool a step needs is missing.
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required for '$2' but was not found on PATH."; }

# Run a command with its output saved to a log; show nothing on success except a one-line result, and show the
# end of the log if it fails. Keeps a full three-language build readable.
LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT
run() {
  local label="$1"; shift
  local log="$LOG_DIR/$(echo "$label" | tr -c 'A-Za-z0-9' '_').log"
  if "$@" >"$log" 2>&1; then
    ok "$label"
  else
    printf '   \033[31mFAILED\033[0m  %s\n\n--- last lines of the output ---\n' "$label" >&2
    tail -40 "$log" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------------------------------------------
# Data: the shared source for all three languages
# ---------------------------------------------------------------------------------------------------------------

# Regenerate node/src/data.ts, python/.../_data.py, java/.../Data.java and each language's test-vectors.csv from the snapshot.
build_data() {
  need node data
  step "Data: regenerate every library's data from data/eu-standard-vat-rates.json"
  node scripts/sync-data.mjs
  # The validator and the generators are themselves tested: a bad source must be rejected before it can become a release.
  # "No tests ran" is treated as a failure: a wrong file pattern makes `node --test` run nothing and still exit 0.
  run "data: validator and generator tests" bash -c '
    out="$(node --test scripts/*.test.mjs 2>&1)" || { echo "$out"; exit 1; }
    echo "$out" | grep -Eq "^ℹ tests [1-9]" || { echo "$out"; echo "no tests ran"; exit 1; }'
}

# Fetch the published file, validate it, update the snapshot, and regenerate (all inside sync-data.mjs).
refresh_data() {
  need node refresh
  step "Refresh: fetch the published rates and update the shared snapshot"
  node scripts/sync-data.mjs --refresh
}

# Read the source hash that each generated file carries, and require all three to be identical. This is the
# proof that no library was built from different rates than the others (for example a stale generated file).
verify_same_source() {
  step "Same source: every library carries the same rate-data hash"
  local ts py java
  ts="$(sed -n 's/.*DATA_SOURCE_SHA256 = "\([0-9a-f]*\)".*/\1/p' node/src/data.ts)"
  py="$(sed -n 's/^DATA_SOURCE_SHA256 = "\([0-9a-f]*\)".*/\1/p' python/src/duty27_eu_vat/_data.py)"
  java="$(sed -n 's/.*SOURCE_SHA256 = "\([0-9a-f]*\)".*/\1/p' java/src/main/java/com/duty27/euvat/Data.java)"
  [ -n "$ts" ] && [ -n "$py" ] && [ -n "$java" ] || die "could not read the source hash from every generated file"
  if [ "$ts" != "$py" ] || [ "$ts" != "$java" ]; then
    die "the libraries were NOT built from the same data (node ${ts:0:16}, python ${py:0:16}, java ${java:0:16}). Run ./build.sh data."
  fi
  ok "node, python and java all carry source hash ${ts:0:16}"
  # The MCP server bundles the Node library's data into one file. Check that file too, but only when this run built
  # it (an old dist/ from an earlier build would prove nothing).
  if [ "${MCP_BUILT:-0}" = 1 ]; then
    local mcp; mcp="$(sed -n 's/.*DATA_SOURCE_SHA256 = "\([0-9a-f]*\)".*/\1/p' mcp/dist/server.js | head -1)"
    [ -n "$mcp" ] || die "could not read the source hash from mcp/dist/server.js"
    [ "$mcp" = "$ts" ] || die "the MCP server bundle carries different data (${mcp:0:16}) than the libraries (${ts:0:16})."
    ok "the MCP server bundle carries the same hash"
  fi
}

# Change nothing; report whether the data is current and consistent.
check_data() {
  need node check
  step "Check: published rates against the snapshot, and generated files against the snapshot"
  node scripts/sync-data.mjs --check
  node scripts/sync-data.mjs --check-generated
  verify_same_source
}

# ---------------------------------------------------------------------------------------------------------------
# One build per language. Each is run AFTER build_data, so each uses the shared source.
# ---------------------------------------------------------------------------------------------------------------

build_node() {
  need node node; need npm node
  step "Node: install, build (ESM and CommonJS), test, check the package contents"
  # npm test = build + the test suite, which includes the shared vectors and a check of what `npm pack` would publish.
  run "node: npm ci"   npm --prefix node ci --no-audit --no-fund
  run "node: npm test" npm --prefix node test
}

build_python() {
  need "$PYTHON" python
  step "Python: test the source, build the wheel and sdist, then test the INSTALLED wheel"
  local work; work="$(mktemp -d)"
  # 1. The tests against the source tree (warnings are errors, so a deprecation cannot slip in).
  run "python: tests on the source" bash -c "cd python && PYTHONPATH=src '$PYTHON' -W error -m unittest discover -s tests"
  # 2. Build in a throwaway virtualenv so nothing is installed on this machine, and check the metadata.
  run "python: create a build environment" "$PYTHON" -m venv "$work/build"
  run "python: install build tools"        "$work/build/bin/pip" install --quiet build twine
  rm -rf python/dist
  run "python: build wheel and sdist"      bash -c "cd python && '$work/build/bin/python' -m build"
  run "python: twine check"                bash -c "cd python && '$work/build/bin/twine' check dist/*"
  # 3. What users get is the wheel, so install ONLY the wheel into a clean environment and run the tests against it.
  run "python: create a clean environment" "$PYTHON" -m venv "$work/clean"
  run "python: install the wheel"          bash -c "'$work/clean/bin/pip' install --quiet python/dist/*.whl"
  run "python: tests on the installed wheel" bash -c "cd python && '$work/clean/bin/python' -W error -m unittest discover -s tests"
  rm -rf "$work" python/build
}

build_java() {
  need java java; need mvn java
  step "Java: compile for Java 11, test, build the jar"
  run "java: mvn verify" bash -c "cd java && mvn -B verify"
}

build_mcp() {
  need node mcp; need npm mcp
  step "MCP server: install, typecheck, bundle the Node library into one file, test over stdio"
  run "mcp: npm ci"   npm --prefix mcp ci --no-audit --no-fund
  run "mcp: npm test" npm --prefix mcp test
  MCP_BUILT=1
}

clean_all() {
  step "Clean: remove build output"
  rm -rf node/dist node/node_modules mcp/dist mcp/node_modules python/dist python/build java/target
  find python -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
  ok "removed node/dist, node/node_modules, mcp/dist, mcp/node_modules, python/dist, python/build, java/target"
}

# ---------------------------------------------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------------------------------------------

case "${1:-all}" in
  all)     build_data; build_node; build_python; build_java; build_mcp; verify_same_source
           printf '\n\033[32mAll three libraries and the MCP server built and tested from one data source.\033[0m\n' ;;
  node)    build_data; build_node;   verify_same_source ;;
  python)  build_data; build_python; verify_same_source ;;
  java)    build_data; build_java;   verify_same_source ;;
  mcp)     build_data; build_mcp;    verify_same_source ;;
  data)    build_data; verify_same_source ;;
  refresh) refresh_data; verify_same_source ;;
  check)   check_data ;;
  clean)   clean_all ;;
  help|-h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' ;;
  *) die "unknown command '$1'. Try ./build.sh help" ;;
esac
