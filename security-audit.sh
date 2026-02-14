#!/bin/bash
# =============================================================================
# Security Audit Script for Claude Code
# Run before any production deployment: bash security-audit.sh [project-dir]
# =============================================================================

set -e

PROJECT_DIR="${1:-.}"
REPORT_FILE="security-audit-report.md"
PASS=0
WARN=0
FAIL=0
SKIP=0

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m'

log_pass()  { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); echo "- ✅ **PASS**: $1" >> "$REPORT_FILE"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); echo "- ⚠️ **WARN**: $1" >> "$REPORT_FILE"; }
log_fail()  { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); echo "- ❌ **FAIL**: $1" >> "$REPORT_FILE"; }
log_skip()  { echo -e "${GRAY}[SKIP]${NC} $1"; ((SKIP++)); echo "- ⏭️ **SKIP**: $1" >> "$REPORT_FILE"; }

cd "$PROJECT_DIR"

# Initialize report
cat > "$REPORT_FILE" << 'EOF'
# Security Audit Report

EOF
echo "**Project**: $(basename $(pwd))" >> "$REPORT_FILE"
echo "**Date**: $(date '+%Y-%m-%d %H:%M')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "============================================"
echo "  Security Audit — $(basename $(pwd))"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "============================================"
echo ""

# ─── 1. DEPENDENCY VULNERABILITIES ───────────────────────────────────────────

echo "## 1. Dependency Vulnerabilities" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "── 1. Dependency Vulnerabilities ──"

if [ -f "package.json" ]; then
    AUDIT_OUTPUT=$(npm audit --json 2>/dev/null || true)
    CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -o '"critical":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")
    HIGH=$(echo "$AUDIT_OUTPUT" | grep -o '"high":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")
    MODERATE=$(echo "$AUDIT_OUTPUT" | grep -o '"moderate":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")

    if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
        log_fail "npm audit: $CRITICAL critical, $HIGH high, $MODERATE moderate vulnerabilities"
    elif [ "$MODERATE" -gt 0 ]; then
        log_warn "npm audit: $MODERATE moderate vulnerabilities (run npm audit for details)"
    else
        log_pass "npm audit: no known vulnerabilities"
    fi
else
    log_skip "No package.json found"
fi

if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    if command -v pip-audit &> /dev/null; then
        if pip-audit 2>/dev/null | grep -q "found"; then
            log_warn "pip-audit found vulnerabilities (run pip-audit for details)"
        else
            log_pass "pip-audit: no known vulnerabilities"
        fi
    else
        log_skip "pip-audit not installed (pip install pip-audit)"
    fi
fi

echo "" >> "$REPORT_FILE"

# ─── 2. SECRETS & CREDENTIALS IN CODE ───────────────────────────────────────

echo ""
echo "── 2. Secrets & Credentials Scan ──"
echo "## 2. Secrets & Credentials" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check .gitignore covers .env
if [ -f ".gitignore" ]; then
    if grep -qE '^\s*\.env' .gitignore; then
        log_pass ".env is in .gitignore"
    else
        log_fail ".env is NOT in .gitignore"
    fi
else
    log_fail "No .gitignore file found"
fi

# Scan for hardcoded secrets in source files
SECRET_PATTERNS='(api[_-]?key|api[_-]?secret|password|passwd|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*["\x27][A-Za-z0-9+/=_\-]{8,}'
FOUND_SECRETS=$(grep -rniE "$SECRET_PATTERNS" \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --include="*.py" --include="*.json" --include="*.yaml" --include="*.yml" \
    --include="*.env.example" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    --exclude-dir=build --exclude-dir=.next --exclude="package-lock.json" \
    --exclude="*.lock" \
    2>/dev/null || true)

if [ -n "$FOUND_SECRETS" ]; then
    COUNT=$(echo "$FOUND_SECRETS" | wc -l)
    log_fail "Found $COUNT potential hardcoded secrets/credentials:"
    echo "$FOUND_SECRETS" | head -10 | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
    if [ "$COUNT" -gt 10 ]; then
        echo "       ... and $((COUNT - 10)) more"
    fi
else
    log_pass "No hardcoded secrets detected in source files"
fi

# Check for .env files committed
if [ -d ".git" ]; then
    TRACKED_ENV=$(git ls-files | grep -E '^\.env$|^\.env\.local$|^\.env\.production$' || true)
    if [ -n "$TRACKED_ENV" ]; then
        log_fail "Environment files tracked in git: $TRACKED_ENV"
    else
        log_pass "No .env files tracked in git"
    fi
fi

echo "" >> "$REPORT_FILE"

# ─── 3. API ROUTE AUTHENTICATION ────────────────────────────────────────────

echo ""
echo "── 3. API Route Authentication ──"
echo "## 3. API Route Authentication" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Find API route files and check for auth middleware/guards
API_DIRS=$(find . -type d \( -name "api" -o -name "routes" \) \
    -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null || true)

if [ -n "$API_DIRS" ]; then
    UNPROTECTED=0
    TOTAL_ROUTES=0
    UNPROTECTED_FILES=""

    while IFS= read -r dir; do
        find "$dir" -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \) 2>/dev/null | while IFS= read -r file; do
            ((TOTAL_ROUTES++)) || true
            # Check for common auth patterns
            if ! grep -qiE '(auth|protect|guard|middleware|getAuth|currentUser|requireAuth|withAuth|session|getServerSession|getToken|clerkClient|requireSession)' "$file" 2>/dev/null; then
                # Skip known public routes
                BASENAME=$(basename "$file")
                if [[ "$BASENAME" != "health"* ]] && [[ "$BASENAME" != "webhook"* ]] && [[ "$BASENAME" != "public"* ]]; then
                    ((UNPROTECTED++)) || true
                    UNPROTECTED_FILES="$UNPROTECTED_FILES\n       $file"
                fi
            fi
        done
    done <<< "$API_DIRS"

    if [ "$UNPROTECTED" -gt 0 ]; then
        log_warn "$UNPROTECTED API route file(s) may lack authentication (review manually):"
        echo -e "$UNPROTECTED_FILES"
        echo "  Files to review:" >> "$REPORT_FILE"
        echo -e "$UNPROTECTED_FILES" | while IFS= read -r f; do
            [ -n "$f" ] && echo "  - \`$f\`" >> "$REPORT_FILE"
        done
    else
        log_pass "All detected API routes appear to reference auth"
    fi
else
    log_skip "No api/ or routes/ directories found"
fi

echo "" >> "$REPORT_FILE"

# ─── 4. CORS CONFIGURATION ──────────────────────────────────────────────────

echo ""
echo "── 4. CORS Configuration ──"
echo "## 4. CORS Configuration" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

WILDCARD_CORS=$(grep -rnE "(origin:\s*['\"]?\*|Access-Control-Allow-Origin.*\*|cors\(\s*\))" \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    2>/dev/null || true)

if [ -n "$WILDCARD_CORS" ]; then
    log_fail "Wildcard CORS (*) detected — restrict to specific origins in production:"
    echo "$WILDCARD_CORS" | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
else
    log_pass "No wildcard CORS origins detected"
fi

echo "" >> "$REPORT_FILE"

# ─── 5. SQL INJECTION RISK ──────────────────────────────────────────────────

echo ""
echo "── 5. SQL Injection Risk ──"
echo "## 5. SQL Injection Risk" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Look for string concatenation in SQL queries
SQL_CONCAT=$(grep -rnE '(query|execute|raw)\s*\(\s*[`"'\'']\s*(SELECT|INSERT|UPDATE|DELETE|DROP).*\$\{' \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.py" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    2>/dev/null || true)

if [ -n "$SQL_CONCAT" ]; then
    log_fail "Potential SQL injection — string interpolation in queries:"
    echo "$SQL_CONCAT" | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
else
    log_pass "No obvious SQL string concatenation found"
fi

echo "" >> "$REPORT_FILE"

# ─── 6. XSS RISK ────────────────────────────────────────────────────────────

echo ""
echo "── 6. XSS Risk ──"
echo "## 6. XSS Risk" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

XSS_PATTERNS=$(grep -rnE '(dangerouslySetInnerHTML|innerHTML\s*=|\.html\s*\(|v-html)' \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    2>/dev/null || true)

if [ -n "$XSS_PATTERNS" ]; then
    COUNT=$(echo "$XSS_PATTERNS" | wc -l)
    log_warn "$COUNT instance(s) of raw HTML injection — verify input is sanitized:"
    echo "$XSS_PATTERNS" | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
else
    log_pass "No raw HTML injection patterns detected"
fi

echo "" >> "$REPORT_FILE"

# ─── 7. DEBUG & DEV MODE ────────────────────────────────────────────────────

echo ""
echo "── 7. Debug & Dev Mode ──"
echo "## 7. Debug & Dev Mode" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

DEBUG_FLAGS=$(grep -rnE '(DEBUG\s*[:=]\s*(true|1|"true")|console\.\s*(log|debug|trace)\s*\(.*password|console\.\s*(log|debug|trace)\s*\(.*token|console\.\s*(log|debug|trace)\s*\(.*secret)' \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=test \
    --exclude-dir=__tests__ --exclude="*.test.*" --exclude="*.spec.*" \
    2>/dev/null || true)

if [ -n "$DEBUG_FLAGS" ]; then
    log_warn "Potential debug/sensitive logging found:"
    echo "$DEBUG_FLAGS" | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
else
    log_pass "No obvious debug modes or sensitive logging detected"
fi

echo "" >> "$REPORT_FILE"

# ─── 8. SECURITY HEADERS (next.config / helmet) ─────────────────────────────

echo ""
echo "── 8. Security Headers ──"
echo "## 8. Security Headers" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ -f "next.config.js" ] || [ -f "next.config.mjs" ] || [ -f "next.config.ts" ]; then
    NEXT_CONFIG=$(find . -maxdepth 1 -name "next.config.*" | head -1)
    if grep -qiE '(headers|Content-Security-Policy|X-Frame-Options|securityHeaders)' "$NEXT_CONFIG" 2>/dev/null; then
        log_pass "Security headers configured in Next.js config"
    else
        log_warn "No security headers found in $NEXT_CONFIG — consider adding CSP, X-Frame-Options"
    fi
elif grep -rqlE 'helmet' package.json 2>/dev/null; then
    log_pass "Helmet.js detected for Express security headers"
else
    log_warn "No security header configuration detected (helmet, next.config headers, etc.)"
fi

echo "" >> "$REPORT_FILE"

# ─── 9. FILE UPLOAD CHECKS ──────────────────────────────────────────────────

echo ""
echo "── 9. File Upload Safety ──"
echo "## 9. File Upload Safety" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

UPLOAD_CODE=$(grep -rnlE '(multer|formidable|busboy|upload|multipart|FileReader|file.*input)' \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    2>/dev/null || true)

if [ -n "$UPLOAD_CODE" ]; then
    # Check if there's any file type/size validation near upload code
    HAS_VALIDATION=$(grep -rnE '(fileFilter|mimetype|maxFileSize|limits|accept=|allowedTypes|fileSize)' \
        --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
        --exclude-dir=node_modules --exclude-dir=.git \
        2>/dev/null || true)

    if [ -n "$HAS_VALIDATION" ]; then
        log_pass "File upload detected with apparent validation"
    else
        log_warn "File upload code found but no type/size validation detected — review:"
        echo "$UPLOAD_CODE" | while IFS= read -r line; do
            echo "       $line"
            echo "  - \`$line\`" >> "$REPORT_FILE"
        done
    fi
else
    log_skip "No file upload handling detected"
fi

echo "" >> "$REPORT_FILE"

# ─── 10. ENVIRONMENT VARIABLE USAGE ─────────────────────────────────────────

echo ""
echo "── 10. Environment Variables ──"
echo "## 10. Environment Variables" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check for NEXT_PUBLIC_ exposing sensitive values
PUBLIC_ENV=$(grep -rnE 'NEXT_PUBLIC_.*(SECRET|KEY|PASSWORD|TOKEN|PRIVATE)' \
    --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
    --include="*.env*" \
    --exclude-dir=node_modules --exclude-dir=.git \
    2>/dev/null || true)

if [ -n "$PUBLIC_ENV" ]; then
    log_fail "Sensitive values exposed via NEXT_PUBLIC_ (client-visible):"
    echo "$PUBLIC_ENV" | while IFS= read -r line; do
        echo "       $line"
        echo "  - \`$line\`" >> "$REPORT_FILE"
    done
else
    log_pass "No sensitive values exposed via NEXT_PUBLIC_"
fi

echo "" >> "$REPORT_FILE"

# ─── SUMMARY ────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  SUMMARY"
echo "============================================"
echo -e "  ${GREEN}PASS: $PASS${NC}  ${YELLOW}WARN: $WARN${NC}  ${RED}FAIL: $FAIL${NC}  ${GRAY}SKIP: $SKIP${NC}"
echo ""

echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Result | Count |" >> "$REPORT_FILE"
echo "|--------|-------|" >> "$REPORT_FILE"
echo "| ✅ Pass | $PASS |" >> "$REPORT_FILE"
echo "| ⚠️ Warn | $WARN |" >> "$REPORT_FILE"
echo "| ❌ Fail | $FAIL |" >> "$REPORT_FILE"
echo "| ⏭️ Skip | $SKIP |" >> "$REPORT_FILE"

if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}⛔ DO NOT DEPLOY — fix FAIL items first${NC}"
    echo "" >> "$REPORT_FILE"
    echo "**⛔ DO NOT DEPLOY — fix FAIL items first**" >> "$REPORT_FILE"
    EXIT_CODE=1
elif [ "$WARN" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  Review WARN items before deploying${NC}"
    echo "" >> "$REPORT_FILE"
    echo "**⚠️ Review WARN items before deploying**" >> "$REPORT_FILE"
    EXIT_CODE=0
else
    echo -e "  ${GREEN}✅ Looking good — proceed with deployment${NC}"
    echo "" >> "$REPORT_FILE"
    echo "**✅ Looking good — proceed with deployment**" >> "$REPORT_FILE"
    EXIT_CODE=0
fi

echo ""
echo "Full report saved to: $REPORT_FILE"
exit ${EXIT_CODE:-0}
