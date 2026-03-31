
---

# Fix: Numbered List Restart Per Finding

Implementation date: 2026-02-02

## Status: IMPLEMENTED ✅

Successfully fixed the issue where numbered lists continued across all paragraphs and findings instead of restarting.

## Summary

Previously, all `<ol>` (ordered lists) in the document shared the same `numId="2"`, causing continuous numbering throughout the entire document. Now each separate `<ol>` gets a unique `numId` starting from 100, and numbering definitions are dynamically added to the template's numbering.xml.

## Problem

**Before the fix:**
- All ordered lists used `reference: 2` in `html2ooxml.js`
- Generated OOXML had all lists with `w:numId="2"`
- Word treated all lists as one continuous numbering sequence
- Finding #1 list: 1, 2, 3...
- Finding #2 list: 4, 5, 6... (continued instead of restarting)

## Solution

**1. html2ooxml.js changes:**
- Track unique `numId` counter starting at 100
- Each `<ol>` tag gets a unique `numId` (100, 101, 102, etc.)
- Export `getUsedNumIds()` and `clearUsedNumIds()` functions
- Update regex to handle dynamic numId values

**2. report-generator.js changes:**
- Clear used numIds before document generation
- After processing audit data, read template's numbering.xml
- Extract `abstractNumId` from existing `numId="2"` definition
- Dynamically add `<w:num>` entries for each unique numId used
- Each new numId references the template's formatting definition
- Write updated numbering.xml back to zip

## Files Modified

### 1. Backend - HTML to OOXML Conversion
**File**: `backend/src/lib/html2ooxml.js`

**Added module-level tracking:**
```javascript
var usedNumIds = [];
var numIdCounter = 100;
```

**Modified `<ol>` handler (lines 82-84):**
```javascript
else if (tag === "ol") {
    var newNumId = numIdCounter++;
    list_state.push('number:' + newNumId);
    if (!usedNumIds.includes(newNumId)) {
        usedNumIds.push(newNumId);
    }
}
```

**Modified `<li>` handler (lines 85-93):**
```javascript
else if (tag === "li") {
    var level = list_state.length - 1
    if (level >= 0 && list_state[level] === 'bullet')
        cParagraphProperties.bullet = {level: level}
    else if (level >= 0 && list_state[level].startsWith('number:')) {
        var numRef = parseInt(list_state[level].split(':')[1]);
        cParagraphProperties.numbering = {reference: numRef, level: level}
    }
    else
        cParagraphProperties.bullet = {level: 0}
}
```

**Updated post-processing regex (line ~195):**
```javascript
dataXml = dataXml.replace(/w:numId w:val="\{(\d+)-0\}"/g, 'w:numId w:val="$1"')
```

**Added exports at end:**
```javascript
html2ooxml.getUsedNumIds = function() {
    return usedNumIds;
};

html2ooxml.clearUsedNumIds = function() {
    usedNumIds = [];
    numIdCounter = 100;
};
```

### 2. Backend - Report Generation
**File**: `backend/src/lib/report-generator.js`

**Added import:**
```javascript
var html2ooxml = require('./html2ooxml');
```

**Added numbering.xml modification (after prepAuditData):**
```javascript
html2ooxml.clearUsedNumIds();

var preppedAudit = await prepAuditData(audit, settings)

var usedNumIds = html2ooxml.getUsedNumIds();
if (usedNumIds.length > 0) {
    var numberingXml = zip.file("word/numbering.xml").asText();
    
    var match = numberingXml.match(/<w:num[^>]*w:numId="2"[^>]*>[\s\S]*?<w:abstractNumId[^>]*w:val="(\d+)"/);
    var targetAbstractNumId = match ? match[1] : "2";
    
    var newEntries = usedNumIds.map(function(numId) {
        return '<w:num w:numId="' + numId + '"><w:abstractNumId w:val="' + targetAbstractNumId + '"/></w:num>';
    }).join('');
    
    numberingXml = numberingXml.replace('</w:numbering>', newEntries + '</w:numbering>');
    zip.file("word/numbering.xml", numberingXml);
}
```

## Technical Details

### numId Allocation
- **Template's existing numIds**: 1-34 (unchanged)
- **Dynamic numIds for lists**: Start at 100, increment per `<ol>`
- **Safety margin**: Using 100+ avoids conflicts with template's existing definitions

### AbstractNumId Detection
- Dynamically reads the `abstractNumId` from template's `numId="2"` definition
- All new numIds reference the same formatting definition
- Template-agnostic: works with any template that has `numId="2"`

### OOXML Structure Added
```xml
<w:num w:numId="100">
    <w:abstractNumId w:val="18"/>
</w:num>
<w:num w:numId="101">
    <w:abstractNumId w:val="18"/>
</w:num>
<!-- etc. -->
```

## Benefits

1. **Separate list numbering**: Each `<ol>` restarts at 1
2. **Template compatibility**: Works with any existing template
3. **Dynamic allocation**: Only creates numIds for lists actually used
4. **Minimal template dependency**: Detects abstractNumId dynamically
5. **No breaking changes**: Existing documents continue to work

## User Impact

**Before:**
- Finding 1: Steps 1, 2, 3
- Finding 2: Steps 4, 5, 6 (wrong - continued from previous)

**After:**
- Finding 1: Steps 1, 2, 3
- Finding 2: Steps 1, 2, 3 (correct - restarted)

## Testing

Test scenarios:
- Multiple findings with numbered lists
- Nested numbered lists within same finding
- Bullet lists (unchanged behavior)
- Mixed bullet and numbered lists
- Single finding with multiple separate numbered lists

---

**End of Numbered List Restart Fix Documentation**
