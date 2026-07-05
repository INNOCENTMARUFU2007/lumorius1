# Lumorius AI — Privacy Policy

**Effective Date:** June 17, 2026  
**Last Updated:** June 17, 2026  
**Data Controller:** INMARTECH PVT LTD

---

## 1. Introduction

INMARTECH PVT LTD ("we", "us", "our") operates the Lumorius AI platform ("Service"). This Privacy Policy explains how we collect, use, store, share, and protect your personal data when you use our Service.

We are committed to GDPR compliance (EU Regulation 2016/679), the IT Act 2000 (India), and applicable data protection laws. If you are an EEA or UK resident, you have additional rights described in Section 10.

---

## 2. Data We Collect

### 2.1 Account Data
- Full name, email address, job title, profile picture
- Password (stored as bcrypt hash — we never see your plain-text password)
- Organization name and size
- Role within your organization

### 2.2 Usage Data
- Pages and features visited, actions taken, feature usage frequency
- Session timestamps and duration
- API requests (endpoint, method, status code, response time)
- Error logs and crash reports

### 2.3 Content You Upload
- Documents, files, PDFs, and their extracted text (for Company Brain RAG)
- Meeting audio recordings and transcripts
- Tasks, notes, comments, goal descriptions, and KPI data
- AI chat conversations and queries

### 2.4 Technical Data
- IP address, browser type, operating system, device type
- Cookie identifiers (see our Cookie Policy)
- Authentication tokens (short-lived JWTs)

### 2.5 Billing Data
- Billing name and address (for invoicing)
- Payment card details are processed and stored by Stripe — we never store raw card numbers

### 2.6 Communications
- Support emails and in-app messages you send to us
- Survey responses and feedback

---

## 3. How We Use Your Data

| Purpose | Legal Basis |
|---|---|
| Providing and operating the Service | Contract performance |
| Account authentication and security | Contract performance + Legitimate interest |
| Processing documents and meetings with AI | Contract performance |
| Sending transactional emails (verification, password reset, notifications) | Contract performance |
| Improving Service features and fixing bugs | Legitimate interest |
| Fraud prevention and security monitoring | Legitimate interest |
| Compliance with legal obligations | Legal obligation |
| Sending weekly digest emails | Legitimate interest (opt-out available) |
| Analytics and product research (aggregated/anonymized) | Legitimate interest |
| Marketing communications | Consent (opt-in required) |

---

## 4. AI Processing

**4.1** Documents, meeting transcripts, and queries you submit are processed by AI models to deliver Service features. This may involve sending your content to third-party AI APIs (OpenAI, Anthropic, Google).

**4.2** We do not use your content to train external AI models. OpenAI API data submitted via our API keys is governed by OpenAI's API data usage policy, which excludes your data from model training.

**4.3** AI-generated outputs (summaries, analyses, action items) are stored in association with your account so you can access them later.

---

## 5. Data Sharing

We do not sell your personal data. We share data only as follows:

**5.1 Service Providers (Data Processors)**

| Provider | Purpose | Location |
|---|---|---|
| OpenAI | AI text processing (GPT-4) | USA |
| Anthropic | AI text processing (Claude) | USA |
| Google | AI text processing (Gemini) | USA |
| AWS / S3-compatible | File and media storage | Configurable |
| Stripe | Payment processing | USA/EU |
| Sentry | Error monitoring | USA/EU |
| SendGrid / SMTP provider | Transactional email | USA/EU |

All data processors are bound by Data Processing Agreements (DPAs) and provide appropriate safeguards (SCCs or adequacy decisions) for international transfers.

**5.2 Legal Requirements.** We may disclose data if required by law, court order, or governmental authority.

**5.3 Business Transfers.** In the event of a merger, acquisition, or asset sale, your data may be transferred. We will provide notice before your data is transferred and becomes subject to a different privacy policy.

**5.4 With Your Consent.** We share data with third parties when you have explicitly consented.

---

## 6. Data Retention

| Data Type | Retention Period |
|---|---|
| Account and profile data | Duration of account + 30 days after deletion |
| Uploaded documents and chunks | Duration of account + 30 days |
| Meeting transcripts and analyses | Duration of account + 30 days |
| Audit logs | 2 years |
| Billing records | 7 years (legal requirement) |
| Backup data | Up to 90 days after deletion |
| AI conversation history | 12 months (configurable) |

---

## 7. Data Security

We implement appropriate technical and organizational measures including:

- AES-256 encryption at rest for all stored data
- TLS 1.3 encryption in transit
- bcrypt password hashing (cost factor 12)
- JWT tokens with 15-minute expiry
- Rate limiting and brute-force protection
- Role-based access control (RBAC)
- Audit logging for all sensitive operations
- Regular security assessments and penetration testing

Despite these measures, no system is 100% secure. In the event of a data breach affecting your rights, we will notify you within 72 hours as required by GDPR.

---

## 8. Cookies

We use cookies and similar technologies as described in our Cookie Policy. You can manage cookie preferences via our cookie consent banner.

---

## 9. Children's Privacy

The Service is not directed at individuals under 18. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a child, please contact us at privacy@lumorius.com.

---

## 10. Your Rights

Depending on your jurisdiction, you have the following rights:

**All users:**
- **Access** — Request a copy of your personal data
- **Correction** — Request correction of inaccurate data
- **Deletion** — Request deletion of your data ("right to be forgotten")
- **Portability** — Receive your data in a machine-readable format (JSON/CSV)
- **Opt-out** — Unsubscribe from marketing communications at any time

**EEA / UK residents (GDPR / UK GDPR):**
- **Restriction** — Request restriction of processing
- **Objection** — Object to processing based on legitimate interest
- **Withdraw consent** — At any time, without affecting prior processing
- **Lodge a complaint** with your supervisory authority (e.g., ICO for UK)

**To exercise rights:** Visit **Settings → Privacy** in the app (GDPR export and account deletion are available self-serve) or email privacy@lumorius.com. We respond within 30 days.

---

## 11. International Data Transfers

Our servers may be located in various regions. When transferring data from the EEA/UK to countries without adequate protection, we rely on:

- Standard Contractual Clauses (SCCs) approved by the European Commission
- Adequacy decisions where applicable
- Binding Corporate Rules for intra-group transfers

---

## 12. Changes to This Policy

We will notify you via email and in-app notification of material changes at least 14 days before they take effect.

---

## 13. Contact & Data Protection Officer

**INMARTECH PVT LTD**  
Email: privacy@lumorius.com  
Website: https://lumorius.com  

For EEA/UK data subjects with complaints that we haven't resolved, you have the right to contact your local supervisory authority.
