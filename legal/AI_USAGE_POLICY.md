# AI Usage Policy
**Organization:** INMARTECH PVT LTD  
**Product:** Lumorius AI Enterprise Platform  
**Version:** 1.0 · June 2026  
**Owner:** Chief Technology Officer

---

## 1. Purpose

This policy governs the development, deployment, and use of artificial intelligence and machine learning features within Lumorius AI. It establishes standards for responsible AI use that are fair, transparent, safe, and compliant with applicable laws.

---

## 2. Scope

This policy applies to:
- All Lumorius AI platform features powered by large language models (LLMs)
- AI-generated outputs delivered to customers and end users
- Internal use of AI tools by INMARTECH employees and contractors
- Third-party AI APIs integrated into the platform (OpenAI, Anthropic, etc.)

---

## 3. Permitted Uses

The following uses of AI within Lumorius are explicitly permitted:

| Use Case | Feature | Model |
|----------|---------|-------|
| Document summarization and Q&A | Knowledge Base | GPT-4o |
| Meeting transcription | Meetings | Whisper |
| Meeting analysis and action items | Meetings | GPT-4o |
| Goal and KPI recommendations | FounderOS | GPT-4o |
| Task description generation | Tasks | GPT-4 |
| AI chat assistant | AI Module | GPT-4o |
| Email draft assistance | Notifications | GPT-4 |

---

## 4. Prohibited Uses

The following uses are explicitly prohibited:

4.1 **Harmful Content Generation:** Using Lumorius AI to generate content that is hateful, harassing, violent, sexually explicit, or discriminatory.

4.2 **Deceptive Use:** Deploying AI outputs to deceive users into believing they are interacting with a human without disclosure.

4.3 **Unauthorized Data Processing:** Processing special category personal data (health, biometric, financial, political) through AI features without explicit consent and DPIA.

4.4 **Autonomous High-Risk Decisions:** Using AI outputs to make fully automated decisions with significant legal or financial impact on individuals without human review.

4.5 **Model Extraction:** Attempting to extract, replicate, or reverse-engineer underlying AI models.

4.6 **Prompt Injection:** Attempting to override system prompts to manipulate AI behaviour in unauthorized ways.

4.7 **Training on Customer Data:** INMARTECH will not use Customer Data to train or fine-tune AI models without explicit written consent. Customer Data is processed in-context only (RAG pattern).

---

## 5. AI Transparency Standards

5.1 **Disclosure.** All AI-generated content within the Lumorius interface is labelled with an AI indicator icon.

5.2 **Source Citation.** RAG responses include source document citations so users can verify AI-generated answers.

5.3 **Confidence Indicators.** Where technically feasible, AI features display confidence levels or uncertainty indicators.

5.4 **Human Override.** All AI-generated suggestions, summaries, and recommendations can be edited or rejected by users.

5.5 **No Autonomous Actions.** Lumorius AI does not take autonomous actions (send emails, delete data, make payments) without explicit user confirmation.

---

## 6. Data Handling for AI

6.1 Customer documents and meeting transcripts are stored encrypted and only accessed when the user explicitly invokes an AI feature.

6.2 Data sent to third-party AI providers (e.g., OpenAI) is governed by their respective data processing agreements. Lumorius uses OpenAI's zero data retention API configuration where available.

6.3 AI conversation history is stored in the Lumorius database, encrypted at rest, and subject to the same retention policies as other Customer Data.

6.4 Customers may request deletion of AI conversation history at any time via the GDPR data deletion workflow or the Settings dashboard.

---

## 7. Model Governance

7.1 **Model Versioning.** All AI model versions used in production are documented in the internal model registry.

7.2 **Model Updates.** When a third-party model version is updated, INMARTECH will test the updated model against a standard evaluation set before deploying to production.

7.3 **Fallback.** All AI features have graceful degradation — if the AI API is unavailable, features display a clear error message and the platform remains fully functional without AI.

7.4 **Cost Controls.** Per-organization token limits are enforced. Usage is monitored and organizations approaching limits receive advance warnings.

---

## 8. Bias and Fairness

8.1 INMARTECH is committed to identifying and mitigating bias in AI outputs. Known limitations of AI models are documented in the product help centre.

8.2 INMARTECH will not use AI in hiring, performance evaluation, or other employment decisions without rigorous bias testing and human oversight.

8.3 Customers who identify potentially biased or harmful AI outputs should report them to ai-safety@lumorius.com.

---

## 9. Security

9.1 All AI API keys are stored in secrets management (Vault/environment secrets), never in code or logs.

9.2 Prompt injection defenses are implemented at the API layer. User inputs are sanitized and constrained within defined system prompt templates.

9.3 AI feature usage is logged in the audit trail for security analysis.

---

## 10. Compliance

This policy aligns with:
- EU AI Act (high-risk system exclusions where applicable)
- NIST AI Risk Management Framework (AI RMF)
- OpenAI Usage Policies
- GDPR Article 22 (automated decision-making)

---

## 11. Policy Review

This policy is reviewed annually or upon significant changes to AI features or applicable regulation.

**Contact:** ai-safety@lumorius.com | CTO · INMARTECH PVT LTD
