# Roles

> PwnDoc supports a flexible, composable role system where users can have multiple roles.
> Each role inherits from a base `user` and adds specific capabilities.

## Role Model Overview

| Role | Inherits | Purpose |
|------|---------|---------|
| `user` | — (base) | Default role for all users |
| `pentester-senior` | user | Senior pentesters who manage multiple audits |
| `reviewer` | user | Review audits they are assigned to |
| `reviewer-lead` | reviewer | Lead reviewers who can review all audits |
| `vuln-librarian` | user | Manage vulnerability library |
| `data-manager` | user | Manage master data (clients, companies, languages, etc.) |
| `template-manager` | user | Manage report templates |
| `audit-manager` | user | Manage all audits (read/delete) |
| `user-manager` | user | Create/update user accounts |
| `backup-operator` | user | Manage backups |
| `ai-admin` | user | Configure AI settings |
| `admin` | wildcard | Full access to everything |

## Multi-Role Support

Users can have **multiple roles** assigned. For example:

```json
{
  "username": "john",
  "roles": ["user", "reviewer", "vuln-librarian"]
}
```

Permissions are **unioned** — a user with `["user", "reviewer"]` gets all permissions from both roles.

## Migration

The old `report` role has been **removed**. Existing users with `role: "report"` are automatically migrated to:

```json
{
  "roles": ["user", "reviewer-lead"]
}
```

## List of permissions

Here is the list of available permissions to access data:

| Audits            | Audits Review           | Audits Comments         | Users             | Clients            | Companies         |
|:-----------------|:---------------------|:----------------------|:-----------------|:-----------------|:-----------------|
| audits:create    | audits:review        | audits:comments:create | users:create   | clients:create   | companies:create |
| audits:read      | audits:review-all    | audits:comments:update  | users:read      | clients:read     | companies:read   |
| audits:read-all   | audits:comments:needs-work | audits:comments:delete | users:update    | clients:update   | companies:update |
| audits:update    |                     | audits:comments:create-all |                | clients:delete  | companies:delete |
| audits:update-all  |                     | audits:comments:update-all |               |                 |                 |
| audits:delete    |                     | audits:comments:delete-all |               |                 |                 |
| audits:delete-all |                     |                      |                |                 |                 |


| Templates         | Vulnerabilities            | Languages         | Audit Types       | Vuln Types         | Vuln Categories   |
|:-----------------|:----------------------|:-----------------|:-----------------|:-----------------|:-----------------|
| templates:create | vulnerabilities:create   | languages:create | audit-types:create | vuln-types:create | vuln-categories:create |
| templates:read   | vulnerabilities:read     | languages:read   | audit-types:read   | vuln-types:read   | vuln-categories:read |
| templates:update | vulnerabilities:update   | languages:update | audit-types:update | vuln-types:update | vuln-categories:update |
| templates:delete | vulnerabilities:delete   | languages:delete | audit-types:delete | vuln-types:delete | vuln-categories:delete |
| templates:download | vulnerability-updates:create |                   |                 |                 |                 |


| Sections        | Custom Fields       | Settings        | Backups          | Roles    | Images        |
|:-----------------|:-------------------|:-----------------|:----------------|:---------|:-------------|
| sections:create  | custom-fields:create | settings:read    | backups:read    | roles:read | images:create |
| sections:read    | custom-fields:read  | settings:read-public | backups:create |           | images:read  |
| sections:update  | custom-fields:update | settings:update  | backups:update  |           | images:delete |
| sections:delete  | custom-fields:delete |                  | backups:delete   |           |              |


| Spellcheck      | Data           | AI           | Other               |
|:---------------|:---------------|:-------------|:-------------------|
| spellcheck:read  | data:access   | ai:use      | audits:users-connected |
| spellcheck:create | data:stats   | ai:configure |                    |
| spellcheck:delete |                |             |                    |


## Built-In Roles

### user

This is the base role that all users receive by default. It has following permissions:

- Audits: read, read-all, update
- Comments: create, update, delete
- Images: create, read
- Clients: read
- Companies: read
- Languages: read
- Audit Types: read
- Vulnerability Types: read
- Vulnerability Categories: read
- Sections: read
- Users: read
- Vulnerabilities: read, vulnerability-updates:create
- Custom Fields: read
- Settings: read-public
- Spellcheck: read, create
- Data: access
- AI: use

### admin

This role has full permissions access (wildcard `*`).

## Creating Custom Roles

Custom roles can be defined in `backend/src/config/roles.json`
The format is:

```json
role_name: {
  "inherits": ["user"],    // Roles to inherit from
  "allows": ["permission1", "permission2"]  // Additional permissions
}
```

Example - a custom pentester role that inherits from user and adds the ability to update all audits:

```json
"pentester": {
  "inherits": ["user"],
  "allows": [
    "audits:update-all"
  ]
}
```

## Role Inheritance

Roles can inherit from other roles. For example, `reviewer-lead` inherits from `reviewer`:

```json
"reviewer-lead": {
  "inherits": ["reviewer"],
  "allows": [
    "audits:review-all",
    "audits:comments:update-all",
    "data:stats"
  ]
}
```

This means `reviewer-lead` gets all permissions from `reviewer` (which itself inherits from `user`), plus the additional ones listed.

## Review Process

To use the review feature, a user needs either the `audits:review` or `audits:review-all` permission. This can be granted through the `reviewer` or `reviewer-lead` role.

A reviewer with only the `audits:review` permission can only review audits they are assigned to. A reviewer with `audits:review-all` can review any audit.

Note: A reviewer cannot review an audit for which they are the creator or a collaborator.