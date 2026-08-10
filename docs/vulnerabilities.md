# Vulnerabilities

> Pwndoc can manage Vulnerabilities in order to simplify redaction of an Audit. They can be added when editing an Audit as a Finding.<br>
> Each vulnerability can have multiple languages. 

## Browsing the database

The Vulnerabilities page is split in two: the list on the left, and the selected vulnerability on the right. Selecting a row opens it for editing in place; creating, merging, and QA all use the same right-hand pane.

![Vulnerabilities page list and detail layout](/_images/vulnerabilities-list-overview.png)

- **Views** filter the list by status: All, Valid, New (pending creation requests), and Updates (templates with pending update proposals).
- The funnel button opens filters for category, type, CVSS range, creator, and templates with unsaved local drafts. The badge shows how many filters are active.
- **Sort By** orders the list by title, category, or last modified date.
- The fingerprint icon on a row searches the audits that use that vulnerability in a finding.

![Vulnerability filters popover](/_images/vulnerabilities-filters.png)

## Create

When creating a Vulnerability, a Category must be selected (or No Category)

A Vulnerability is defined by:

- Title
- Type
- Language
- Description
- Observation
- CVSS (v3 and/or v4, depending on which scoring types are enabled in [Settings](settings.md#scoring-types))
- Remediation
- Remediation Complexity
- Remediation Priority
- References
- Category
- (Additional fields from Category)

!> Title must be unique since it's used for another functionality allowing users to request creation/modification of vulnerabilities when redacting an Audit.

## Import/Export

Vulnerabilities can be exported/imported in Data menu.

The export format is yaml. Both CVSSv3 and CVSSv4 strings are included when present.

**Example**
```
- references:
    - reference1
    - reference2
  cvssv3: 'CVSS:3.0/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N'
  cvssScore: '3.1'
  cvssSeverity: Low
  priority: 2
  remediationComplexity: 2
  details:
    - locale: fr
      title: Attributs des cookies
      vulnType: Application Web
      description: >-
        Les cookies permettent de stocker des informations relatives à
        l'utilisateur comme par exemple ses informations de session.

        Il est donc important qu'ils soient sécurisés au maximum afin de
        prévenir toute fuite d'informations. Pour cela il existe des «flags» à
        définir lors de la création d'un cookie:

        - le flag «Secure» indique que le cookie ne peut être transmis que si le
        canal de communication est chiffré (HTTPS)

        - le flag «HttpOnly» indique que le cookie ne peut être récupéré par du
        code JavaScript ce qui prévient sa récupération par des attaques de type
        XSS
      observation: null
      remediation: Définir les flags «Secure» et «HttpOnly» lors de la création de cookies
    - locale: en
      title: Cookie Without the HTTPOnly and Secure Flags
      vulnType: Web Application
      description: >-
        Session tokens stored in the “Cookie” headers can be protected from client-side attacks. Those protections are referred to as flags that the web server declares on each cookie it sets. 
        Among those flags, the “HTTPOnly” flag restricts access to the cookie from the JavaScript code. The “secure” flag restricts the transmission of the protected cookie on a regular HTTP channel. Those two flags were not set for some cookies used by the application.
      observation: >-
        With a successful Cross-Site Scripting (XSS) exploitation, the attacker could access the cookies using JavaScript and steal the session token of the victim to impersonate him on the application. The “HTTPOnly” flag would prevent the attacker from accessing the cookie in this scenario.
        Another strategy an attacker could exploit is eavesdropping on web traffic and wait for the client to use resources over the HTTP cleartext protocol. If the resources reside on the same domain, the vulnerable cookie will be used over this channel and captured by the attacker. Also, a "man-in-the-middle" (MITM) technique called “SSL Stripping” could be performed by the attacker to force usage of the insecure HTTP protocol. Again, the session token could be captured when the “secure” flag is not set.
      remediation: |
        Ensure the “HTTPOnly” and “secure” flags are set on each cookie that is used by the application.
```

For import, the Serpico format is also accepted allowing easier transition or just to have a default set of vulnerabilities.

## Merge

It's possible to merge vulnerabilities for cases where 2 different vulnerabilities exist for 2 different languages. The goal is to avoid duplicates and better multilanguage management.

![Merge Vulns](/_images/merge_vulns.png)

When both languages have been selected, only Vulnerabilities that don't have the other column language will be displayed.  
In this example :
- In the left column only Vulnerabilities having English language AND no French language are displayed
- In the right column only Vulnerabilities having French language AND no English language are displayed

The language details from the Vulnerability of the right column will be moved to the Vulnerability of the left column. So this is *CVSS*, *references*, *etc* of the left column that will be kept.

## Validate

All users can request creation or modifications on a vulnerability when redacting findings in an Audit. Users with admin role can see and validate those requests in the Vulnerabilities menu. Use the **New** and **Updates** views to list them.

![New view listing pending creation requests](/_images/new_updates_vulns.png)

### New

Select a pending vulnerability to open it. Before approving, it's possible to make changes including adding Languages. Saving it validates the request.

![Pending vulnerability opened for review](/_images/new_vuln.png)

### Updates

Update proposals are handled separately from the editor. When a vulnerability has pending proposals, an **Updates available** button appears in its toolbar; click it to open the review modal.

![Vulnerability update proposals modal](/_images/vulnerabilities-updates-modal.png)

The left side is the current vulnerability, the right side the selected proposal. Pick another proposal from the dropdown in the header — proposals are grouped by language, and the counter shows how many exist in total. Differences are highlighted to make them easier to spot.

Copy what you want from the proposal into the left side, then **Save**. Saving keeps the remaining proposals: they are only removed when you dismiss them.

Dismissing is explicit and permanent:

| Action | Effect |
|--------|--------|
| **Dismiss selected proposal** | Deletes the proposal currently shown |
| **Dismiss all {language} proposals** | Deletes every proposal for the language you are reviewing |
| **Dismiss all proposals** | Deletes every proposal for the vulnerability, in every language |

## Quality Assurance

QA reviews vulnerability templates and reports what needs fixing. Two kinds of checks run:

- **Built-in checks** are programmatic and always available: completeness, reference link reachability, image captions, and structural duplicate detection.
- **AI checks** send template content to the configured AI provider: AI duplicate detection, unlinked translations, writing guidelines review, customer alignment, and your QA instructions. They require AI integration to be enabled in [Settings](settings.md#ai-integration).

Which checks are enabled is configured in [Data → Quality Assurance](data.md#quality-assurance).

### Single vulnerability QA

When editing a saved vulnerability, click **QA** in the pane header to open the QA panel beside the form. The panel loads the stored report for the current language; run built-in checks, AI checks, or both from the buttons at the top. Issues are grouped by the field they affect, and the counters at the top filter the list by severity.

![Single vulnerability QA panel](/_images/vulnerabilities-qa-single-panel.png)

Cross-vulnerability findings that involve the open template (duplicates, unlinked translations) appear in a **Cross-vulnerability checks** group. They come from the last database-wide run — use **Show QA review** to refresh them.

Requires `vulnerabilities:qa` to run built-in checks and `vulnerabilities:ai-qa` to run AI checks. `vulnerabilities:qa-read` alone shows the stored report without the run buttons.

### Database-wide QA

**Show QA review** above the vulnerability list opens a docked report panel covering every template with content in the selected language.

![Vulnerabilities page with the QA review panel docked](/_images/vulnerabilities-qa-all-full.png)

The review runs as a background job on the server:

- Progress is shown live (vulnerabilities checked, then cross-vulnerability check batches). You can keep working, navigate away, or reload the page — the run continues and the panel re-attaches to it.
- Re-runs are incremental: templates unchanged since their last check are reused, so only new or edited templates are sent for review again.
- One run can be active per language. **Cancel** stops the run after the in-flight checks finish; completed results are kept.

The report groups issues per vulnerability under the same categories as the list, with the most severely affected vulnerabilities first.

![QA review panel with a category group expanded](/_images/vulnerabilities-qa-all-panel-expanded.png)

- **Go to vulnerability** selects the template in the list and opens it for editing — the report stays docked beside the editor, so you can work through issues one at a time.
- The refresh button on a row re-checks just that template after a fix and updates the report in place. It runs the same checks as the last database-wide run, so a built-in-only run never triggers AI checks from a row re-check.
- Rows marked **outdated** were edited after their last check. **Run again** re-checks only those.
- Use the filter field to narrow the report to matching titles, and the **Active / Outdated / Resolved / All** chips to filter by status.

Requires `vulnerabilities:qa-catalog` (built-in) and `vulnerabilities:ai-qa-catalog` (AI). These are separate from the single-vulnerability permissions. `vulnerabilities:qa-read-catalog` is view-only.

#### Resolving issues

Not every flagged issue is a real problem — AI reviews in particular raise judgment calls you may disagree with. Use the check icon to mark an item resolved: it is hidden from the report and stops counting toward the totals.

- On a vulnerability row, the check icon resolves the whole template at once. On a cross-vulnerability issue, it resolves that single issue.
- Select the **Resolved** filter chip to see resolved items and restore any of them.
- Resolving a template is tied to its content: editing the template clears it, so the next check re-evaluates everything against the new content.
- Resolutions on cross-vulnerability issues (e.g. "not a duplicate") persist until restored.

Resolving requires a catalog run permission (`vulnerabilities:qa-catalog` or `vulnerabilities:ai-qa-catalog`).

> AI checks are advisory. Template content — including text imported from external sources — is sent to the configured AI provider, so crafted content could try to influence the AI's output. Verify AI-sourced findings before acting on them.

## AI-assisted writing

When AI integration is enabled and your role has `vulnerabilities:ai-assist`, the Description, Observation, Remediation, References, and AI-enabled custom fields show a sparkle button in the editor toolbar. Clicking it opens the AI assistant beside the form. The assistant also needs the matching edit permission (`vulnerabilities:update`, or `vulnerabilities:create` for a new template), since drafts are written into editable fields.

![AI assistant panel on a vulnerability field](/_images/ai-chat-drawer.png)

- **Field prompt** uses the instructions configured for that field in [Data → Assisted Writing](data.md#assisted-writing). Generic prompts (proofread, translate, rewrite, …) are listed below it, or type your own request.
- Select text in the field before clicking the sparkle to work on that selection only.
- Responses are drafts: **Apply to field** (or **Apply to selection**) writes the result into the editor, **Insert at cursor** adds it without replacing, and **Preview changes** shows an inline diff against the current content. You still have to save the vulnerability.
- Pick a different provider from the selector at the bottom, when your administrator has allowed more than one.

## Local Draft Recovery

When you create or edit a vulnerability, PwnDoc keeps a local recovery draft in your browser for unsaved changes. Drafts are tracked separately for new vulnerabilities and existing vulnerabilities.

Local drafts are not saved to the server and are not visible to other users. They are used only to recover work from the same browser session after a page refresh, navigation, browser crash, or temporary connection issue.

When a local draft exists, PwnDoc shows an orange draft indicator next to the affected vulnerability in the vulnerability list. New vulnerability drafts also appear in the **New Vulnerability** category menu, so you can recover a draft created under a specific category or under **No Category**.

Inside the create or edit dialog, the draft recovery status menu shows whether you are viewing the server version or a local draft, when the draft was last saved, and when it expires.

If you reopen a vulnerability with a local draft, PwnDoc compares the server version with the local draft and lets you restore, discard, review, or permanently delete the draft. Restoring a draft applies it in the editor only; click **Create** or **Update** to save it to the server.

Local drafts expire after 7 days of inactivity. Creating or updating the vulnerability clears the local draft for that vulnerability.

![Vulnerability draft recovery status menu](/_images/vulnerabilities-draft-recovery-status.png)

![Vulnerability draft recovery view changes modal](/_images/vulnerabilities-draft-recovery-view-changes.png)