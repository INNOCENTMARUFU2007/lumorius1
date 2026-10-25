"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let EmailService = EmailService_1 = class EmailService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EmailService_1.name);
        this.transporter = null;
        const host = this.configService.get('email.host');
        if (host) {
            const port = this.configService.get('email.port', 587);
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: {
                    user: this.configService.get('email.user'),
                    pass: this.configService.get('email.pass'),
                },
            });
        }
        else {
            this.logger.warn('SMTP not configured — emails will be logged only');
        }
    }
    get from() {
        return `"Lumorius AI" <${this.configService.get('email.from', 'no-reply@lumorius.com')}>`;
    }
    get appUrl() {
        return this.configService.get('appUrl', 'http://localhost:3000');
    }
    escapeHtml(value) {
        const replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
    }
    getNotificationActionUrl(actionUrl) {
        try {
            const baseUrl = this.appUrl.replace(/\/+$/, '');
            const appOrigin = new URL(baseUrl).origin;
            const fallbackUrl = new URL('/notifications', appOrigin).toString();
            if (!actionUrl ||
                !actionUrl.startsWith('/') ||
                actionUrl.startsWith('//') ||
                actionUrl.includes('\\')) {
                return fallbackUrl;
            }
            const resolvedUrl = new URL(actionUrl, `${appOrigin}/`);
            if (resolvedUrl.origin !== appOrigin) {
                return fallbackUrl;
            }
            return resolvedUrl.toString();
        }
        catch {
            this.logger.warn('Invalid application URL or notification action URL');
            return 'http://localhost:3000/notifications';
        }
    }
    layout(preheader, body) {
        const safePreheader = this.escapeHtml(preheader);
        const appUrl = this.configService.get('appUrl', 'http://localhost:3000');
        let preferencesUrl = `${appUrl.replace(/\/+$/, '')}/settings/notifications`;
        try {
            const base = new URL(appUrl);
            preferencesUrl = new URL('/settings/notifications', base.origin).toString();
        }
        catch {
            this.logger.warn('Invalid app URL when generating notification preferences link');
        }
        const safePreferencesUrl = this.escapeHtml(preferencesUrl);
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#c9d1d9}
.preheader{display:none;max-height:0;overflow:hidden}
.wrap{max-width:600px;margin:32px auto;background:#13131f;border-radius:16px;overflow:hidden;border:1px solid #21213a}
.header{background:linear-gradient(135deg,#4245a8 0%,#6554d9 100%);padding:36px 40px;text-align:center}
.logo{font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px}
.logo em{color:#c4b5fd;font-style:normal}
.sub{color:rgba(255,255,255,.75);font-size:12px;margin-top:6px;letter-spacing:.5px;text-transform:uppercase}
.body{padding:36px 40px}
h1{font-size:22px;font-weight:700;color:#fff;margin-bottom:14px;line-height:1.3}
p{font-size:15px;line-height:1.7;color:#9ca3af;margin-bottom:14px}
.btn{display:inline-block;background:#6554d9;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:.2px;margin:6px 0 20px}
.code-box{background:#0a0a14;border:1px solid #21213a;border-radius:8px;padding:12px 18px;font-family:'Courier New',monospace;font-size:13px;color:#a78bfa;word-break:break-all;margin:12px 0}
.info-box{background:#13131f;border:1px solid #21213a;border-left:3px solid #7c3aed;border-radius:8px;padding:16px 20px;margin:14px 0}
.info-box p{margin:0;color:#d1d5db;font-size:14px;overflow-wrap:anywhere}
.warn-box{background:#1c1209;border-left:3px solid #f59e0b;border-radius:8px;padding:14px 18px;margin:14px 0}
.warn-box p{margin:0;color:#d97706;font-size:13px}
.success-box{background:#091c12;border-left:3px solid #10b981;border-radius:8px;padding:14px 18px;margin:14px 0}
.success-box p{margin:0;color:#34d399;font-size:13px}
.error-box{background:#1c0a09;border-left:3px solid #ef4444;border-radius:8px;padding:14px 18px;margin:14px 0}
.error-box p{margin:0;color:#f87171;font-size:13px}
hr{border:none;border-top:1px solid #21213a;margin:24px}
.footer{text-align:center;font-size:12px;color:#6b7280;padding:0 40px 28px;line-height:1.8}
.footer p{font-size:12px}
.feature-list{list-style:none;padding:0}
.feature-list li{padding:7px 0;font-size:14px;color:#d1d5db;display:flex;gap:8px}
.feature-list li::before{content:"✦";color:#a78bfa;flex-shrink:0}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}
.stat-card{background:#0d0d1a;border:1px solid #21213a;border-radius:10px;padding:16px;text-align:center}
.stat-num{font-size:28px;font-weight:800;color:#fff}
.stat-label{font-size:12px;color:#6b7280;margin-top:4px}
.task-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #21213a}
.task-row:last-child{border-bottom:none}
.badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600}
.badge-urgent{background:#450a0a;color:#f87171}
.badge-high{background:#431407;color:#fb923c}
.badge-medium{background:#1c1a05;color:#facc15}
.badge-low{background:#052e16;color:#4ade80}
a{overflow-wrap:anywhere}
@media(max-width:480px){
  .wrap{margin:0;border-radius:0}
  .header{padding:28px 20px}
  .body{padding:28px 20px}
  .footer{padding:0 20px 24px}
  hr{margin:20px}
  .btn{padding:12px 20px}
}
</style>
</head>
<body>
<div class="preheader">${safePreheader}</div>
<div class="wrap">
  <div class="header">
    <div class="logo">Lumorius</div>
    <div class="sub">Enterprise AI Platform · INMARTECH PVT LTD</div>
  </div>
  <div class="body">${body}</div>
  <hr>
  <div class="footer">
    <p>© ${new Date().getFullYear()} INMARTECH PVT LTD · All rights reserved.</p>
    <p style="margin-top:4px">Lumorius AI Platform · If you didn't request this, you can safely ignore it.</p>
    <p style="margin-top:4px"><a href="${safePreferencesUrl}" style="color:#818cf8">Manage notification preferences</a></p>
  </div>
</div>
</body>
</html>`;
    }
    async send(to, subject, html) {
        if (!this.transporter) {
            this.logger.log(`[EMAIL-DEV] To: ${to} | Subject: ${subject}`);
            return;
        }
        try {
            const info = await this.transporter.sendMail({
                from: this.from,
                to,
                subject,
                html,
            });
            this.logger.log(`Email sent to ${to}: ${info.messageId}`);
        }
        catch (error) {
            this.logger.error(`Failed to send email to ${to}`, error instanceof Error ? error.stack : String(error));
        }
    }
    async sendWelcome(email, name) {
        const safeName = this.escapeHtml(name);
        const body = `
      <h1>Welcome to Lumorius, ${safeName}! 🚀</h1>
      <p>Your AI operating system is live. Here's what you can explore:</p>
      <ul class="feature-list">
        <li>Company Brain — Upload documents and ask questions about your knowledge base</li>
        <li>Meeting Intelligence — Meeting transcription, summaries and action items</li>
        <li>Founder OS — Business goals, KPIs and performance insights</li>
        <li>Knowledge Graph — Connect your organisation's knowledge</li>
        <li>Workflow Automation — Manage your business workflows</li>
        <li>AI Strategy Advisor — Get assistance with business decisions</li>
      </ul>
      <a class="btn" href="${this.getNotificationActionUrl('/dashboard')}">Open Your Dashboard →</a>
      <p>Welcome to your Lumorius workspace.</p>`;
        await this.send(email, 'Welcome to Lumorius AI', this.layout('Your Lumorius workspace is ready.', body));
    }
    async sendVerificationEmail(email, name, token) {
        const url = `${this.appUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
        const safeName = this.escapeHtml(name);
        const safeUrl = this.escapeHtml(url);
        const body = `
      <h1>Verify your email address</h1>
      <p>Hi <strong>${safeName}</strong>, please verify your email to unlock all available Lumorius features.</p>
      <a class="btn" href="${safeUrl}">Verify Email Address →</a>
      <p>Or copy this link into your browser:</p>
      <div class="code-box">${safeUrl}</div>
      <div class="warn-box"><p>This link expires in <strong>24 hours</strong>.</p></div>`;
        await this.send(email, 'Verify your Lumorius email address', this.layout('Please verify your email address.', body));
    }
    async sendPasswordReset(email, name, token, ip) {
        const url = `${this.appUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
        const safeName = this.escapeHtml(name);
        const safeUrl = this.escapeHtml(url);
        const safeIp = this.escapeHtml(ip ?? 'unknown');
        const body = `
      <h1>Reset your password</h1>
      <p>Hi <strong>${safeName}</strong>, we received a request to reset your Lumorius password.</p>
      <a class="btn" href="${safeUrl}">Set New Password →</a>
      <p>Or copy this link:</p>
      <div class="code-box">${safeUrl}</div>
      <div class="info-box"><p>Request IP address: <strong>${safeIp}</strong></p></div>
      <div class="warn-box"><p>This link expires in <strong>1 hour</strong>. If you did not request this, no changes have been made.</p></div>`;
        await this.send(email, 'Reset your Lumorius password', this.layout('Password reset requested.', body));
    }
    async sendMagicLink(email, url) {
        let safeUrl;
        try {
            const parsedUrl = new URL(url);
            const appOrigin = new URL(this.appUrl).origin;
            if (parsedUrl.origin !== appOrigin) {
                this.logger.warn('Rejected external magic-link URL');
                return;
            }
            safeUrl = this.escapeHtml(parsedUrl.toString());
        }
        catch {
            this.logger.warn('Invalid magic-link URL');
            return;
        }
        const body = `
      <h1>Your sign-in link</h1>
      <p>Click below to sign in to Lumorius.</p>
      <a class="btn" href="${safeUrl}">Sign In to Lumorius →</a>
      <p>Or copy this link:</p>
      <div class="code-box">${safeUrl}</div>
      <div class="warn-box"><p>This link expires in <strong>15 minutes</strong> and is single-use.</p></div>`;
        await this.send(email, 'Your Lumorius sign-in link', this.layout('One-click sign-in link.', body));
    }
    async sendLoginAlert(email, name, ip, device) {
        const safeName = this.escapeHtml(name);
        const safeIp = this.escapeHtml(ip);
        const safeDevice = this.escapeHtml(device);
        const securityUrl = this.escapeHtml(this.getNotificationActionUrl('/security'));
        const body = `
      <h1>New sign-in detected</h1>
      <p>Hi <strong>${safeName}</strong>, we detected a new sign-in to your Lumorius account.</p>
      <div class="info-box">
        <p><strong>IP address:</strong> ${safeIp}<br>
        <strong>Device / Browser:</strong> ${safeDevice}<br>
        <strong>Time:</strong> ${new Date().toUTCString()}</p>
      </div>
      <div class="warn-box">
        <p>Wasn't you? <a href="${securityUrl}" style="color:#f59e0b">Review your account security</a> and change your password.</p>
      </div>`;
        await this.send(email, 'Security alert: New sign-in to Lumorius', this.layout('A new sign-in was detected.', body));
    }
    async sendTeamInvitation(email, inviterName, orgName, token) {
        const url = `${this.appUrl.replace(/\/+$/, '')}/invite?token=${encodeURIComponent(token)}`;
        const safeUrl = this.escapeHtml(url);
        const safeInviter = this.escapeHtml(inviterName);
        const safeOrg = this.escapeHtml(orgName);
        const body = `
      <h1>You're invited to join ${safeOrg}</h1>
      <p><strong>${safeInviter}</strong> has invited you to collaborate on <strong>${safeOrg}</strong>'s Lumorius workspace.</p>
      <a class="btn" href="${safeUrl}">Accept Invitation →</a>
      <div class="warn-box"><p>This invitation expires in <strong>7 days</strong>.</p></div>`;
        await this.send(email, `You're invited to ${orgName} on Lumorius`, this.layout(`${safeInviter} invited you.`, body));
    }
    async sendNotificationEmail(email, name, title, message, actionUrl = '/notifications', actionLabel = 'Open Lumorius') {
        const safeName = this.escapeHtml(name || 'there');
        const safeTitle = this.escapeHtml(title || 'Lumorius notification');
        const safeMessage = this.escapeHtml(message || '');
        const safeActionLabel = this.escapeHtml(actionLabel || 'Open Lumorius');
        const safeUrl = this.escapeHtml(this.getNotificationActionUrl(actionUrl));
        const subject = (title || 'Lumorius notification')
            .replace(/[\r\n]+/g, ' ')
            .trim()
            .slice(0, 180) || 'Lumorius notification';
        const body = `
      <h1>${safeTitle}</h1>
      <p>Hi <strong>${safeName}</strong>,</p>
      <div class="info-box">
        <p>${safeMessage}</p>
      </div>
      <a class="btn" href="${safeUrl}">${safeActionLabel} →</a>
      <p style="font-size:13px;color:#6b7280">
        You can also review this notification in your Lumorius workspace.
      </p>`;
        await this.send(email, subject, this.layout(safeTitle, body));
    }
    async sendSubscriptionConfirmation(email, name, planName, amountUsd, nextBillingDate) {
        const safeName = this.escapeHtml(name);
        const safePlan = this.escapeHtml(planName);
        const safeAmount = this.escapeHtml(amountUsd);
        const safeDate = this.escapeHtml(nextBillingDate);
        const billingUrl = this.escapeHtml(this.getNotificationActionUrl('/billing'));
        const body = `
      <h1>Subscription activated! 🎉</h1>
      <p>Hi <strong>${safeName}</strong>, your Lumorius subscription is now active.</p>
      <div class="success-box">
        <p><strong>Plan:</strong> ${safePlan}<br>
        <strong>Amount:</strong> $${safeAmount} USD / month<br>
        <strong>Next billing:</strong> ${safeDate}</p>
      </div>
      <a class="btn" href="${billingUrl}">Manage Subscription →</a>
      <p>Thank you for choosing Lumorius.</p>`;
        await this.send(email, `Lumorius ${planName} plan activated`, this.layout('Subscription confirmed.', body));
    }
    async sendPaymentFailed(email, name, planName, retryUrl) {
        const safeName = this.escapeHtml(name);
        const safePlan = this.escapeHtml(planName);
        const safeUrl = this.escapeHtml(this.getNotificationActionUrl(retryUrl));
        const body = `
      <h1>Payment failed ⚠️</h1>
      <p>Hi <strong>${safeName}</strong>, we couldn't process your payment for the <strong>${safePlan}</strong> plan.</p>
      <div class="warn-box">
        <p>Review your billing details to resolve the payment issue.</p>
      </div>
      <a class="btn" href="${safeUrl}">Review Billing →</a>`;
        await this.send(email, 'Payment failed — action required', this.layout('Action needed on your subscription.', body));
    }
    async sendApiKeyCreated(email, name, keyName, keyPrefix) {
        const safeName = this.escapeHtml(name);
        const safeKeyName = this.escapeHtml(keyName);
        const safeKeyPrefix = this.escapeHtml(keyPrefix);
        const securityUrl = this.escapeHtml(this.getNotificationActionUrl('/security'));
        const body = `
      <h1>New API key created</h1>
      <p>Hi <strong>${safeName}</strong>, a new API key has been generated for your Lumorius account.</p>
      <div class="info-box">
        <p><strong>Key name:</strong> ${safeKeyName}<br>
        <strong>Prefix:</strong> <code>${safeKeyPrefix}…</code><br>
        <strong>Created:</strong> ${new Date().toUTCString()}</p>
      </div>
      <div class="warn-box">
        <p>If you did not create this key, <a href="${securityUrl}" style="color:#f59e0b">review your account security</a>.</p>
      </div>`;
        await this.send(email, 'New API key created — Lumorius', this.layout('API key created.', body));
    }
    async sendTaskAssigned(email, name, taskTitle, taskId, assignerName, priority, dueDate) {
        const safeName = this.escapeHtml(name);
        const safeTitle = this.escapeHtml(taskTitle);
        const safeAssigner = this.escapeHtml(assignerName);
        const safePriority = this.escapeHtml(priority);
        const badgeClass = ['urgent', 'high', 'medium', 'low'].includes(priority.toLowerCase())
            ? priority.toLowerCase()
            : 'medium';
        const dueLine = dueDate
            ? `<br><strong>Due:</strong> ${this.escapeHtml(new Date(dueDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }))}`
            : '';
        const taskUrl = this.escapeHtml(this.getNotificationActionUrl(`/tasks/${encodeURIComponent(taskId)}`));
        const body = `
      <h1>You have a new task</h1>
      <p>Hi <strong>${safeName}</strong>, <strong>${safeAssigner}</strong> assigned you a task on Lumorius.</p>
      <div class="info-box">
        <p><strong>${safeTitle}</strong><br>
        <span class="badge badge-${badgeClass}">${safePriority.toUpperCase()}</span>${dueLine}</p>
      </div>
      <a class="btn" href="${taskUrl}">View Task →</a>
      <p style="font-size:13px;color:#6b7280">You can update the task's status, add comments, and track progress in Lumorius.</p>`;
        await this.send(email, `New task: ${taskTitle}`, this.layout(`${safeAssigner} assigned you a task.`, body));
    }
    async sendMeetingReady(email, name, meetingTitle, meetingId, summary, actionItemCount) {
        const safeName = this.escapeHtml(name);
        const safeTitle = this.escapeHtml(meetingTitle);
        const safeSummary = this.escapeHtml(summary.substring(0, 300));
        const meetingUrl = this.escapeHtml(this.getNotificationActionUrl(`/meetings/${encodeURIComponent(meetingId)}`));
        const summaryHtml = summary
            ? `<div style="background:#0d0d1a;border:1px solid #21213a;border-radius:10px;padding:16px 20px;margin:14px 0"><p style="font-size:14px;color:#d1d5db;margin:0"><strong>Summary:</strong><br>${safeSummary}${summary.length > 300 ? '…' : ''}</p></div>`
            : '';
        const body = `
      <h1>Meeting analysis is ready 🎙️</h1>
      <p>Hi <strong>${safeName}</strong>, your meeting has been transcribed and analysed by AI.</p>
      <div class="info-box">
        <p><strong>${safeTitle}</strong><br>
        <strong>${actionItemCount}</strong> action item${actionItemCount !== 1 ? 's' : ''} extracted</p>
      </div>
      ${summaryHtml}
      <a class="btn" href="${meetingUrl}">View Full Analysis →</a>
      <p style="font-size:13px;color:#6b7280">Includes transcript, action items, key decisions, and strategic insights.</p>`;
        await this.send(email, `Meeting ready: ${meetingTitle}`, this.layout('Your meeting analysis is ready.', body));
    }
    async sendDocumentIndexed(email, name, docName, docId, chunkCount) {
        const safeName = this.escapeHtml(name);
        const safeDocName = this.escapeHtml(docName);
        const brainUrl = this.escapeHtml(this.getNotificationActionUrl('/brain'));
        const body = `
      <h1>Document indexed ✅</h1>
      <p>Hi <strong>${safeName}</strong>, your document has been processed and is now searchable via AI.</p>
      <div class="success-box">
        <p><strong>${safeDocName}</strong><br>
        <strong>${chunkCount}</strong> knowledge chunk${chunkCount !== 1 ? 's' : ''} created<br>
        Ready for AI-powered semantic search</p>
      </div>
      <a class="btn" href="${brainUrl}">Ask AI About This Doc →</a>
      <p style="font-size:13px;color:#6b7280">You can now ask questions about this document in Company Brain.</p>`;
        await this.send(email, `Document ready: ${docName}`, this.layout('Your document is indexed and searchable.', body));
    }
    async sendDocumentFailed(email, name, docName, errorMessage) {
        const safeName = this.escapeHtml(name);
        const safeDocName = this.escapeHtml(docName);
        const safeError = this.escapeHtml(errorMessage.substring(0, 200));
        const brainUrl = this.escapeHtml(this.getNotificationActionUrl('/brain'));
        const body = `
      <h1>Document processing failed ❌</h1>
      <p>Hi <strong>${safeName}</strong>, we were unable to process your document.</p>
      <div class="error-box">
        <p><strong>${safeDocName}</strong><br>
        ${safeError}</p>
      </div>
      <p>Common reasons include a corrupted file, a password-protected PDF, or unsupported encoding. Please try re-uploading.</p>
      <a class="btn" href="${brainUrl}">Re-upload Document →</a>
      <p style="font-size:13px;color:#6b7280">If the issue persists, contact support with the document name.</p>`;
        await this.send(email, `Processing failed: ${docName}`, this.layout('Your document could not be processed.', body));
    }
    async sendGoalAchieved(email, name, goalTitle) {
        const safeName = this.escapeHtml(name);
        const safeGoalTitle = this.escapeHtml(goalTitle);
        const goalsUrl = this.escapeHtml(this.getNotificationActionUrl('/founder-os'));
        const body = `
      <h1>🎉 Goal achieved!</h1>
      <p>Hi <strong>${safeName}</strong>, congratulations — you've hit your target.</p>
      <div class="success-box">
        <p><strong>${safeGoalTitle}</strong><br>
        Status: <strong>Completed ✅</strong></p>
      </div>
      <a class="btn" href="${goalsUrl}">View All Goals →</a>
      <p>Keep the momentum going — what's the next goal?</p>`;
        await this.send(email, `Goal achieved: ${goalTitle}`, this.layout('You hit your target!', body));
    }
    async sendOverdueTasksSummary(email, name, tasks) {
        const safeName = this.escapeHtml(name);
        const taskRows = tasks
            .slice(0, 10)
            .map((task) => {
            const badgeClass = [
                'urgent',
                'high',
                'medium',
                'low',
            ].includes(task.priority.toLowerCase())
                ? task.priority.toLowerCase()
                : 'medium';
            const safePriority = this.escapeHtml(task.priority);
            const safeTitle = this.escapeHtml(task.title);
            const dueDate = this.escapeHtml(new Date(task.dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            }));
            const taskUrl = this.escapeHtml(this.getNotificationActionUrl(`/tasks/${encodeURIComponent(task.id)}`));
            return `
          <div class="task-row">
            <span class="badge badge-${badgeClass}">${safePriority.toUpperCase()}</span>
            <div style="flex:1;min-width:0">
              <p style="margin:0;font-size:14px;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                <a href="${taskUrl}" style="color:#a78bfa;text-decoration:none">${safeTitle}</a>
              </p>
              <p style="margin:0;font-size:12px;color:#6b7280">Was due ${dueDate}</p>
            </div>
          </div>`;
        })
            .join('');
        const more = tasks.length > 10
            ? `<p style="text-align:center;font-size:13px;color:#6b7280">+${tasks.length - 10} more overdue tasks</p>`
            : '';
        const tasksUrl = this.escapeHtml(this.getNotificationActionUrl('/tasks?status=overdue'));
        const body = `
      <h1>You have ${tasks.length} overdue task${tasks.length !== 1 ? 's' : ''}</h1>
      <p>Hi <strong>${safeName}</strong>, these tasks are past their due date and need your attention.</p>
      ${taskRows}
      ${more}
      <a class="btn" href="${tasksUrl}" style="margin-top:20px">View All Overdue Tasks →</a>`;
        await this.send(email, `${tasks.length} overdue task${tasks.length !== 1 ? 's' : ''} need your attention`, this.layout('Tasks need your attention.', body));
    }
    async sendWeeklyDigest(email, name, orgName, stats) {
        const safeName = this.escapeHtml(name);
        const safeOrgName = this.escapeHtml(orgName);
        const weekOf = new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        const overdueWarning = stats.overdueTasks > 0
            ? `<div class="warn-box"><p><strong>${stats.overdueTasks}</strong> task${stats.overdueTasks !== 1 ? 's are' : ' is'} overdue and need attention.</p></div>`
            : '<div class="success-box"><p>No overdue tasks this week — great work!</p></div>';
        const goalsAchieved = stats.goalsAchievedThisWeek > 0
            ? ` · <strong>${stats.goalsAchievedThisWeek} achieved this week 🏆</strong>`
            : '';
        const body = `
      <h1>Your weekly snapshot 📊</h1>
      <p>Hi <strong>${safeName}</strong>, here's what happened at <strong>${safeOrgName}</strong> this week ending ${this.escapeHtml(weekOf)}.</p>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-num">${stats.tasksCompletedThisWeek}</div>
          <div class="stat-label">Tasks Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${stats.openTasks}</div>
          <div class="stat-label">Open Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${stats.meetingsCompleted}</div>
          <div class="stat-label">Meetings Analysed</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${stats.docsUploadedThisWeek}</div>
          <div class="stat-label">Docs Uploaded</div>
        </div>
      </div>

      ${overdueWarning}

      <div class="info-box">
        <p>
          <strong>Knowledge Base:</strong> ${stats.totalDocsIndexed} indexed documents<br>
          <strong>Active Goals:</strong> ${stats.activeGoals}${goalsAchieved}<br>
          <strong>Urgent open tasks:</strong> ${stats.urgentOpenTasks}
        </p>
      </div>

      <a class="btn" href="${this.escapeHtml(this.getNotificationActionUrl('/dashboard'))}">View Full Dashboard →</a>
      <p style="font-size:13px;color:#6b7280">Sent every Monday. <a href="${this.escapeHtml(this.getNotificationActionUrl('/settings/notifications'))}" style="color:#818cf8">Manage notification preferences</a></p>`;
        await this.send(email, `Lumorius weekly digest — ${orgName}`, this.layout(`${stats.tasksCompletedThisWeek} tasks done · ${stats.openTasks} open`, body));
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
//# sourceMappingURL=email.service.js.map