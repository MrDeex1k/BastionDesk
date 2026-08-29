# Security Policy

## Supported Versions

Security updates are planned for the latest released version of BastionDesk.

| Version | Supported |
| ------- | --------- |
| 1.0.3   | Yes       |
| <= 1.0.2 | No       |

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues, pull requests, or discussions.

To report a vulnerability, use GitHub's private vulnerability reporting flow:

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Select **Report a vulnerability**.
4. Include a clear description, reproduction steps, affected versions, and potential impact.

Anonymous reports are accepted. A private email channel is not used for vulnerability intake.

If private vulnerability reporting is temporarily unavailable, open a public issue that only says you need the private security reporting channel restored. Do not include exploit details, secrets, logs, payloads, or proof-of-concept code in that public issue.

## Response Expectations

- Initial acknowledgement: within 7 days.
- Triage: after acknowledgement, the report is reviewed for validity, impact, reproducibility, scope, and severity.
- Fix timeline: when the report is accepted and confirmed, a patch is planned within 30 days from acknowledgement where reasonably possible.
- Communication: additional details may be requested during investigation, follow-up questions may be sent through the GitHub vulnerability report thread, and progress updates are provided there as the report moves through validation, remediation, and release.
- Disclosure: vulnerability details remain private until a fix is released or mitigation is available. After that, a public technical summary may be published without proof-of-concept exploit details.
- Recognition: accepted reporters may be listed in the project's Hall of Fame unless they prefer to remain anonymous.

## Scope

Please include enough information to reproduce and assess the issue:

- affected component or service,
- affected version or commit,
- impact and attack scenario,
- reproduction steps,
- relevant configuration details,
- suggested mitigation, if known.

Reports related to the following areas are in scope:

- the BastionDesk application itself,
- self-hosted deployment configuration,
- Docker and Docker Compose configuration shipped with the project,
- TLS and certificate handling,
- the `llm_service`,
- third-party dependencies used by the project when they create a concrete security impact for BastionDesk deployments.

## Out of Scope

The following reports may be closed as out of scope unless they demonstrate a concrete security impact:

- automated scanner output without analysis,
- missing security headers without a realistic exploit path,
- denial-of-service claims without practical impact,
- social engineering or physical attacks,
- issues requiring access to secrets, credentials, or internal systems not controlled by the project.

Because BastionDesk is not operated as a public hosted service by the project, reports must stay within lawful, good-faith testing boundaries. Do not attempt destructive testing, persistence, unauthorized access to third-party systems, data exfiltration, or public disclosure before a fix or agreed mitigation is available.

## Rewards

BastionDesk does not currently offer a paid bug bounty program.

Accepted reporters may be credited in the project's Hall of Fame. After remediation, the project may also publish a public technical description of the issue without proof-of-concept exploit details.
