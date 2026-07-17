# Vulnerabilities

> Pwndoc can manage Vulnerabilities in order to simplify redaction of an Audit. They can be added when editing an Audit as a Finding.<br>
> Each vulnerability can have multiple languages. 

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

There is also the possibility to search Audits containing the Vulnerability in its findings (search by Title) :<br> 
![Search in Audits](/_images/action_buttons.png)

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

All users can request creation or modifications on a vulnerability when redacting findings in an Audit. Users with admin role can see and validate those modifications in Vulnerabilities menu.

![Validate](/_images/new_updates_vulns.png)

### New

![New vuln](/_images/new_vuln.png)

Before approving, it's possible to make changes to the Vulnerability including adding Languages.

### Updates

![Updates vuln](/_images/updates_vuln.png)

The left side is the current Vulnerability

The right side has multiple tabs, each representing change requests made by users. There is syntax highlighting to make it easier to spot differences.

The admin user must manually make changes in the left side with what he wants from the right side. When clicking the Update button the left side will be saved and all update requests from the right side will be deleted.

## Quality Assurance

> Requires AI integration to be enabled in Settings. QA checks combine fast built-in checks (completeness, reference links, duplicates) with AI-powered content review (redaction compliance, customer alignment, duplicate detection, unlinked translations). Which checks run is configured in Settings.

### Single vulnerability QA

When creating or editing a vulnerability, click the QA button in the pane header to open the QA panel next to the form. Run built-in checks, AI checks, or both. Issues are listed by severity with the affected field.

Cross-template findings that involve the open vulnerability (duplicates, unlinked translations) appear in their own **Cross-template checks** group. They come from the last database-wide QA run — re-run **QA all vulnerabilities** to refresh them.

### QA all vulnerabilities

The **QA all vulnerabilities** button above the vulnerability list opens a docked report panel and reviews every template that has content in the selected language.

The review runs as a background job on the server:

- Progress is shown live (templates checked, cross-template check batches). You can keep working, navigate away, or reload the page — the run continues and the panel re-attaches to it.
- Re-runs are incremental: templates that have not changed since their last check are reused instantly, and only new or edited templates are sent for review again.
- One run can be active per language. **Cancel** stops the run after the in-flight checks finish; completed results are kept.

The report groups issues per vulnerability, under the same categories as the list. Within each category, the vulnerabilities with the most severe issues are listed first.

- **Go to finding** selects the vulnerability in the list and opens it for editing — the report stays docked beside the editor so you can work through issues one by one.
- The refresh button on a row re-checks just that template after you fix it and updates the report in place. The re-check runs the same checks as the last database-wide run (a built-in-only run never triggers AI checks from a row re-check).
- Rows marked **outdated** were edited after their last check; run QA again (or re-check the row) to refresh them. The outdated banner at the top has a **Run again** shortcut — unchanged templates are reused, so re-runs are fast.
- Cross-template issues (duplicates, unlinked translations) show a chip for each involved template; click a chip to open that template directly.
- Use the filter field above the results to narrow the report to templates whose title matches.

> Note: screenshot needed — vulnerabilities page with the docked QA report panel open on the right, showing progress bar and per-vulnerability issue groups.

#### Dismissing issues

Not every flagged issue is a real problem — AI reviews in particular can raise judgment calls you disagree with. Click the eye icon on an issue to dismiss it: it disappears from the report and no longer counts toward the totals, on this run and on future runs.

- Use the **Show dismissed** toggle to see dismissed issues and restore any of them.
- Dismissals on a template's own issues are tied to its content: editing the template clears its dismissals, so the next check re-evaluates everything against the new content.
- Dismissals on cross-template issues (e.g. "not a duplicate") are permanent for that pair of templates until restored.

> Note: screenshot needed — QA report panel with the "Show dismissed" toggle on, showing a dismissed issue with its restore button.

Running **QA all vulnerabilities** requires a role with the `vulnerabilities:ai-qa-all` permission; single-vulnerability QA requires `vulnerabilities:ai-qa`. Dismissing issues requires `vulnerabilities:ai-qa-all`.

## Local Draft Recovery

When you create or edit a vulnerability, PwnDoc keeps a local recovery draft in your browser for unsaved changes. Drafts are tracked separately for new vulnerabilities and existing vulnerabilities.

Local drafts are not saved to the server and are not visible to other users. They are used only to recover work from the same browser session after a page refresh, navigation, browser crash, or temporary connection issue.

When a local draft exists, PwnDoc shows an orange draft indicator next to the affected vulnerability in the vulnerability list. New vulnerability drafts also appear in the **New Vulnerability** category menu, so you can recover a draft created under a specific category or under **No Category**.

Inside the create or edit dialog, the draft recovery status menu shows whether you are viewing the server version or a local draft, when the draft was last saved, and when it expires.

If you reopen a vulnerability with a local draft, PwnDoc compares the server version with the local draft and lets you restore, discard, review, or permanently delete the draft. Restoring a draft applies it in the editor only; click **Create** or **Update** to save it to the server.

Local drafts expire after 7 days of inactivity. Creating or updating the vulnerability clears the local draft for that vulnerability.

![Vulnerability draft recovery status menu](/_images/vulnerabilities-draft-recovery-status.png)

![Vulnerability draft recovery view changes modal](/_images/vulnerabilities-draft-recovery-view-changes.png)