import 'server-only'

import { escapeHtml } from './send'

export interface EmailButton {
  label: string
  href: string
}

export interface EmailTemplateOptions {
  /** Short preview text shown in Gmail/Outlook inbox list next to the subject. */
  preheader: string
  /** Optional small pill above the heading, e.g. "New ticket". */
  eyebrow?: string
  /** Main heading. Escaped automatically. */
  heading: string
  /**
   * Main body content. If you pass raw HTML here (e.g. from `paragraphs()`),
   * it is rendered as-is — you are responsible for having escaped user input
   * yourself. If you have plain text, use `paragraphs()`, which escapes for you.
   */
  bodyHtml: string
  /** Optional CTA button. */
  button?: EmailButton
  /**
   * Optional labeled key/value list rendered under the body (e.g. From /
   * Subject / Message). Values are escaped automatically by the template;
   * newlines in a value are preserved as line breaks.
   */
  meta?: Array<{ label: string; value: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zrecipe.ie'
const LOGO_URL = `${SITE_URL}/images/fundobranco2.png`

/** Builds bodyHtml from plain-text paragraphs — each line is HTML-escaped. */
export function paragraphs(...lines: string[]): string {
  return lines
    .filter(Boolean)
    .map(
      (l) =>
        `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">${escapeHtml(l)}</p>`
    )
    .join('')
}

export function renderEmail(opts: EmailTemplateOptions): string {
  const { preheader, eyebrow, heading, bodyHtml, button, meta } = opts
  const year = new Date().getFullYear()

  const eyebrowHtml = eyebrow
    ? `<tr><td style="padding:0 0 12px;">
        <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;letter-spacing:.02em;">
          ${escapeHtml(eyebrow)}
        </span>
      </td></tr>`
    : ''

  const metaHtml =
    meta && meta.length > 0
      ? `<tr><td style="padding:8px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;">
            <tr><td style="padding:16px 18px;">
              ${meta
                .map(
                  (m) => `
                <div style="margin:0 0 10px;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 2px;">${escapeHtml(m.label)}</div>
                  <div style="font-size:14px;color:#0f172a;line-height:1.5;">${escapeHtml(m.value).replace(/\n/g, '<br>')}</div>
                </div>`
                )
                .join('')}
            </td></tr>
          </table>
        </td></tr>`
      : ''

  const buttonHtml = button
    ? `<tr><td style="padding:24px 0 4px;">
        <a href="${escapeHtml(button.href)}" role="button"
           style="display:inline-block;background:#059669;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;mso-padding-alt:0;">
          <!--[if mso]>&nbsp;<![endif]-->${escapeHtml(button.label)}<!--[if mso]>&nbsp;<![endif]-->
        </a>
      </td></tr>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(heading)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .email-wrapper { padding: 16px !important; }
    .email-card { padding: 24px !important; }
    .email-heading { font-size: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#faf8f4;-webkit-text-size-adjust:100%;">
  <div style="display:none;visibility:hidden;opacity:0;height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;">
    <tr>
      <td align="center" class="email-wrapper" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px;text-align:center;">
              <img src="${LOGO_URL}" width="140" height="auto" alt="ZRecipe" style="display:inline-block;width:140px;height:auto;max-width:140px;border:0;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="email-card" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${eyebrowHtml}
                <tr>
                  <td class="email-heading" style="font-size:22px;font-weight:700;color:#0f172a;padding:0 0 16px;font-family:Georgia,'Playfair Display',serif;">
                    ${escapeHtml(heading)}
                  </td>
                </tr>
                <tr><td>${bodyHtml}</td></tr>
                ${metaHtml}
                ${buttonHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding:20px 0 0;text-align:center;">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#059669;">ZRecipe</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Recipe costing for independent food businesses.</p>
                    <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">This is an automated message from ZRecipe Support. Reply to this email to respond.</p>
                    <p style="margin:0;font-size:10px;color:#cbd5e1;text-align:center;">&copy; ${year} Ziffera</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
