# Lumorius AI — Cookie Policy

**Effective Date:** June 17, 2026  
**Last Updated:** June 17, 2026  
**Published by:** INMARTECH PVT LTD

---

## 1. What Are Cookies?

Cookies are small text files placed on your device when you visit a website or use a web application. They help websites remember information about your visit, improve your experience, and gather analytics.

Lumorius also uses similar technologies such as localStorage and sessionStorage in your browser, and HTTP-only cookies for authentication.

---

## 2. Cookies We Use

### 2.1 Strictly Necessary Cookies

These cookies are essential for the Service to function. You cannot opt out of these.

| Name | Purpose | Type | Expiry |
|---|---|---|---|
| `lumorius_access` | Stores your JWT access token to authenticate API requests across page loads | HTTP, SameSite=Strict | 15 minutes |
| `lumorius_session` | Server-side session identifier for middleware authentication checks | HTTP-only, SameSite=Strict | Session |
| `csrf_token` | Cross-site request forgery protection token | HTTP, SameSite=Strict | Session |

### 2.2 Functional Cookies

These cookies enable enhanced functionality. Disabling them may affect how the Service works.

| Name | Purpose | Type | Expiry |
|---|---|---|---|
| `lumorius_theme` | Remembers your chosen UI theme (dark/light) | localStorage | Persistent |
| `lumorius_sidebar` | Remembers sidebar collapsed/expanded state | localStorage | Persistent |
| `lumorius_locale` | Remembers your preferred language/locale | localStorage | Persistent |
| `lumorius_onboarding` | Tracks which onboarding steps you've completed | localStorage | 30 days |

### 2.3 Analytics Cookies

These cookies help us understand how users use Lumorius so we can improve the platform. Data is aggregated and anonymized where possible.

| Name | Purpose | Provider | Expiry |
|---|---|---|---|
| `_ga` | Distinguishes unique users (Google Analytics) | Google | 2 years |
| `_ga_*` | Stores and counts pageviews (GA4) | Google | 2 years |

> **Note:** We use Google Analytics in anonymized mode (IP anonymization enabled). We do not share this data with Google for advertising purposes.

### 2.4 Security Cookies

| Name | Purpose | Type | Expiry |
|---|---|---|---|
| `lumorius_mfa_verified` | Records that MFA was completed for this session | HTTP-only, Secure | Session |
| `lumorius_device_id` | Remembers known trusted devices to reduce MFA friction | HTTP-only, Secure | 30 days |

---

## 3. Third-Party Cookies

Some Service features may cause third-party cookies to be set:

| Third Party | Why | Their Policy |
|---|---|---|
| Google (Fonts/Analytics) | Font delivery and usage analytics | https://policies.google.com/privacy |
| Stripe | Payment processing (billing pages only) | https://stripe.com/privacy |
| Sentry | Error monitoring and performance tracing | https://sentry.io/privacy/ |

We do not use any advertising or tracking cookies. We do not participate in cross-site tracking networks.

---

## 4. localStorage and sessionStorage

In addition to cookies, Lumorius uses browser storage:

| Key | Purpose | Storage | Cleared When |
|---|---|---|---|
| `lumorius_access` | JWT access token (mirrors the cookie) | localStorage | On logout or expiry |
| `lumorius_refresh` | JWT refresh token | localStorage | On logout or expiry |
| `lumorius_user` | Cached user profile (non-sensitive fields only) | localStorage | On logout |
| `lumorius_draft_*` | Auto-saved form drafts | localStorage | After submission |

---

## 5. Managing Cookies

### Browser Settings

You can control cookies through your browser settings. Most browsers allow you to:
- View which cookies are set
- Block all cookies (note: this will break the Service)
- Delete cookies for specific sites
- Set up notifications when cookies are placed

Guides for popular browsers:
- [Chrome](https://support.google.com/chrome/answer/95647)
- [Firefox](https://support.mozilla.org/kb/cookies-information-websites-store-on-your-computer)
- [Safari](https://support.apple.com/guide/safari/sfri11471)
- [Edge](https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge)

### In-App Cookie Preferences

Visit **Settings → Privacy → Cookie Preferences** to manage analytics cookies. Strictly necessary cookies cannot be disabled as they are required for the Service to function.

### Opt-Out of Analytics

To opt out of Google Analytics specifically:
- Install the [Google Analytics Opt-out Add-on](https://tools.google.com/dlpage/gaoptout)
- Or use your browser's Do Not Track setting (we honour it for analytics)

---

## 6. Cookie Consent

When you first use the Service, we display a cookie consent banner. By clicking "Accept All", you consent to all cookies described in this policy. By clicking "Manage Preferences" or "Necessary Only", you can limit cookies to strictly necessary ones.

We record your consent choice with a timestamp. You can change your preferences at any time via **Settings → Privacy → Cookie Preferences**.

---

## 7. Do Not Track

Lumorius respects the Do Not Track (DNT) browser signal. If DNT is enabled in your browser, we disable Google Analytics and do not place non-essential cookies.

---

## 8. Changes to This Policy

We will update this Cookie Policy when we add or change cookies. Material changes will be notified via our standard notification channels with 14 days' notice.

---

## 9. Contact

For questions about cookies or our use of tracking technologies:

**INMARTECH PVT LTD**  
Email: privacy@lumorius.com  
Website: https://lumorius.com
