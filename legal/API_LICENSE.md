# Lumorius AI — API License Agreement
**Provider:** INMARTECH PVT LTD  
**Version:** 1.0 · June 2026

---

## 1. Grant of License

Subject to the terms of this Agreement and payment of applicable fees, INMARTECH PVT LTD grants you a limited, non-exclusive, non-transferable, non-sublicensable license to access and use the Lumorius AI API (the "API") solely for:

(a) Building applications and integrations that enhance your use of Lumorius AI;  
(b) Automating your organization's workflows through programmatic access;  
(c) Embedding Lumorius AI capabilities into your own enterprise applications.

---

## 2. API Access Tiers

| Tier | Requests/Month | Rate Limit | SLA |
|------|---------------|------------|-----|
| Developer | 10,000 | 10 req/sec | None |
| Professional | 500,000 | 100 req/sec | 99.5% |
| Enterprise | Unlimited | Custom | 99.9% |

Rate limits apply per API key. Excess requests receive HTTP 429 (Too Many Requests).

---

## 3. Restrictions

You may NOT:
- (a) Use the API to build a competing product or service;
- (b) Resell or sublicense API access to third parties without written consent;
- (c) Use the API to scrape, harvest, or aggregate Lumorius platform data at scale;
- (d) Attempt to circumvent rate limits through multiple API keys;
- (e) Use the API in a manner that violates applicable law or INMARTECH's Acceptable Use Policy;
- (f) Cache or store AI-generated responses for more than 24 hours without prior approval;
- (g) Represent API outputs as your own original work without appropriate disclosure.

---

## 4. API Keys

4.1 You are responsible for all API usage made with your API keys.

4.2 You must not share API keys publicly or commit them to version control.

4.3 INMARTECH may revoke API keys for suspected abuse or policy violations without notice.

4.4 Report compromised API keys immediately to security@lumorius.com.

---

## 5. Data and Privacy

5.1 Data submitted through the API is subject to the Lumorius Privacy Policy and, where applicable, the Data Processing Agreement.

5.2 API responses may include AI-generated content. You are responsible for reviewing AI outputs before using them in customer-facing applications.

5.3 INMARTECH does not use API request payloads to train AI models without explicit consent.

---

## 6. Versioning and Deprecation

6.1 The current stable API version is `/api/v1`.

6.2 INMARTECH will maintain each API version for a minimum of 12 months after a successor version is released.

6.3 Deprecation notices are provided at least 6 months in advance via email, the developer portal, and API response headers (`Deprecation: <date>`).

---

## 7. Attribution

Applications built using the Lumorius API must include the following attribution where technically feasible:
> "Powered by Lumorius AI · lumorius.com"

Enterprise customers may request white-label attribution terms.

---

## 8. Warranty Disclaimer

THE API IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. INMARTECH DOES NOT WARRANT THAT THE API WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI OUTPUTS WILL BE ACCURATE, COMPLETE, OR FIT FOR ANY PARTICULAR PURPOSE.

---

## 9. Limitation of Liability

IN NO EVENT SHALL INMARTECH BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE API. INMARTECH'S AGGREGATE LIABILITY IS LIMITED TO THE FEES PAID FOR API ACCESS IN THE PRECEDING 12 MONTHS.

---

## 10. Term and Termination

10.1 This license is effective until terminated.

10.2 INMARTECH may terminate or suspend API access for breach of this Agreement, abuse of the API, or non-payment.

10.3 You may terminate by deleting all API keys and ceasing API usage.

---

## 11. Governing Law

This Agreement is governed by the laws of Zimbabwe. Disputes shall be resolved in the courts of Zimbabwe, Harare.

---

*Developer Support: developers@lumorius.com · Documentation: docs.lumorius.com*  
*INMARTECH PVT LTD · Harare, Zimbabwe*
