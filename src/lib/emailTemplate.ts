/**
 * Branded HTML email template for LedgerOne alert notifications.
 * Table-based layout with inline CSS for maximum email-client compatibility.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildAlertEmailHtml(opts: {
  headline: string
  reviewUrl: string
  timestamp?: string
}): string {
  const headline = escapeHtml(opts.headline)
  const reviewUrl = escapeHtml(opts.reviewUrl)
  const ts = opts.timestamp ?? new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>LedgerOne Alert</title>
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#131415;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#131415;">
<tr><td align="center" style="padding:32px 16px 0 16px;">

<!-- Brand header -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td align="center" style="padding-bottom:8px;">
<span style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:4px;color:#e5e7eb;">LEDGERONE</span>
</td></tr>
<tr><td align="center" style="padding-bottom:28px;">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;letter-spacing:2px;">planner &middot; tracker</span>
</td></tr>
</table>

<!-- Card -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background-color:#1f2021;border-radius:8px;">
<tr><td style="padding:32px 28px 28px 28px;">

<!-- Headline -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:26px;color:#e5e7eb;padding-bottom:24px;">
${headline}
</td></tr>
</table>

<!-- CTA button -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="border-radius:6px;background-color:#6366f1;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${reviewUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" strokecolor="#6366f1" fillcolor="#6366f1">
<w:anchorlock/>
<center style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;">Review on LedgerOne</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!--><a href="${reviewUrl}" target="_blank" style="display:inline-block;padding:12px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;background-color:#6366f1;border-radius:6px;text-decoration:none;text-align:center;">Review on LedgerOne</a><!--<![endif]-->
</td></tr>
</table>

</td></tr>
</table>

<!-- Footer -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td style="padding:24px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;text-align:center;">
${ts}
</td></tr>
<tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;text-align:center;">
This is an automated alert based on your planner settings. Not financial advice.
</td></tr>
<tr><td style="padding:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;text-align:center;">
LedgerOne.app
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`
}
