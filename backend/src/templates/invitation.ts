/**
 * Email Template - Zaproszenie do Organizacji
 *
 * Template HTML dla emaila z zaproszeniem do dołączenia do organizacji.
 */

export interface InvitationEmailData {
	recipientEmail: string;
	inviterName: string;
	inviterEmail: string;
	organizationName: string;
	inviteUrl: string;
	role?: string; // Opcjonalna rola w organizacji
}

/**
 * Generuje HTML emaila z zaproszeniem
 */
export function generateInvitationEmailHtml(data: InvitationEmailData): string {
	const {
		recipientEmail,
		inviterName,
		inviterEmail,
		organizationName,
		inviteUrl,
		role = "członek",
	} = data;

	return `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zaproszenie do organizacji - BastionDesk</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
            color: #333333;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            color: #ffffff;
            font-size: 28px;
            font-weight: 600;
        }
        .header p {
            margin: 10px 0 0 0;
            color: #dbeafe;
            font-size: 14px;
        }
        .content {
            padding: 40px 30px;
        }
        .invitation-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .invitation-icon {
            font-size: 64px;
            margin-bottom: 10px;
        }
        .invitation-title {
            font-size: 24px;
            color: #1a202c;
            margin: 10px 0;
            font-weight: 600;
        }
        .message {
            font-size: 16px;
            line-height: 1.6;
            color: #4a5568;
            margin: 0 0 25px 0;
            text-align: center;
        }
        .organization-card {
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            margin: 30px 0;
            box-shadow: 0 4px 6px rgba(59, 130, 246, 0.15);
        }
        .organization-name {
            font-size: 26px;
            color: #ffffff;
            margin: 0;
            font-weight: 700;
        }
        .organization-role {
            font-size: 14px;
            color: #e0e7ff;
            margin: 10px 0 0 0;
        }
        .inviter-info {
            background-color: #f1f5f9;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
            margin: 20px 0;
        }
        .inviter-info p {
            margin: 5px 0;
            font-size: 14px;
            color: #4a5568;
        }
        .inviter-name {
            font-weight: 600;
            color: #2d3748;
        }
        .button-container {
            text-align: center;
            margin: 40px 0;
        }
        .button {
            display: inline-block;
            padding: 16px 40px;
            background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 6px rgba(59, 130, 246, 0.25);
        }
        .button:hover {
            opacity: 0.9;
        }
        .divider {
            border-top: 1px solid #e2e8f0;
            margin: 30px 0;
        }
        .alternative-link {
            background-color: #f1f5f9;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
            margin: 20px 0;
        }
        .alternative-link p {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #4a5568;
        }
        .link-text {
            word-break: break-all;
            font-size: 13px;
            color: #3b82f6;
            font-family: monospace;
        }
        .benefits {
            background-color: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 20px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .benefits h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #065f46;
        }
        .benefits ul {
            margin: 0;
            padding-left: 20px;
            font-size: 14px;
            color: #047857;
        }
        .benefits li {
            margin: 8px 0;
        }
        .info-box {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info-box p {
            margin: 0;
            font-size: 13px;
            color: #92400e;
        }
        .footer {
            background-color: #1e293b;
            padding: 30px;
            text-align: center;
        }
        .footer p {
            margin: 5px 0;
            font-size: 13px;
            color: #a0aec0;
        }
        .footer a {
            color: #90cdf4;
            text-decoration: none;
        }
        @media only screen and (max-width: 600px) {
            .content {
                padding: 30px 20px;
            }
            .button {
                padding: 14px 30px;
                font-size: 15px;
            }
            .organization-name {
                font-size: 22px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <h1>BastionDesk</h1>
            <p>Bezpieczne zarządzanie incydentami</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Invitation Header -->
            <div class="invitation-header">
                <div class="invitation-icon">📨</div>
                <h2 class="invitation-title">Masz nowe zaproszenie!</h2>
            </div>
            
            <p class="message">
                Zostałeś zaproszony do dołączenia do organizacji w systemie BastionDesk.
            </p>

            <!-- Organization Card -->
            <div class="organization-card">
                <p class="organization-name">${organizationName}</p>
                <p class="organization-role">Rola: ${role}</p>
            </div>

            <!-- Inviter Info -->
            <div class="inviter-info">
                <p><strong>Zaproszenie od:</strong></p>
                <p class="inviter-name">${inviterName}</p>
                <p>${inviterEmail}</p>
            </div>

            <!-- Benefits -->
            <div class="benefits">
                <h3>Co zyskujesz dołączając:</h3>
                <ul>
                    <li>Dostęp do współdzielonego systemu zarządzania incydentami</li>
                    <li>Współpracę z zespołem w czasie rzeczywistym</li>
                    <li>Narzędzia do śledzenia i analizy incydentów bezpieczeństwa</li>
                    <li>Bezpieczne przechowywanie dokumentacji</li>
                    <li>Zaawansowane raportowanie i analitykę</li>
                </ul>
            </div>

            <!-- CTA Button -->
            <div class="button-container">
                <a href="${inviteUrl}" class="button">
                    ✓ Akceptuj zaproszenie
                </a>
            </div>

            <p class="message" style="font-size: 14px; color: #718096;">
                Zaproszenie jest ważne przez <strong>7 dni</strong> od momentu wysłania.
            </p>

            <div class="divider"></div>

            <!-- Alternative Link -->
            <div class="alternative-link">
                <p><strong>Nie działa przycisk?</strong></p>
                <p>Skopiuj i wklej poniższy link do przeglądarki:</p>
                <p class="link-text">${inviteUrl}</p>
            </div>

            <!-- Info Box -->
            <div class="info-box">
                <p>
                    <strong>Informacja:</strong> 
                    Jeśli nie masz jeszcze konta w BastionDesk, zostaniesz poproszony 
                    o utworzenie konta podczas akceptacji zaproszenia. Twój adres email 
                    <strong>${recipientEmail}</strong> zostanie automatycznie powiązany 
                    z organizacją.
                </p>
            </div>

            <p class="message" style="font-size: 14px; margin-top: 30px;">
                Masz pytania dotyczące zaproszenia? Skontaktuj się z osobą, 
                która wysłała zaproszenie, lub z naszym zespołem wsparcia.
            </p>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p><strong>BastionDesk</strong></p>
            <p>Profesjonalny system zarządzania incydentami bezpieczeństwa</p>
            <p style="margin-top: 15px;">
                © ${new Date().getFullYear()} BastionDesk. Wszelkie prawa zastrzeżone.
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Generuje subject emaila z zaproszeniem
 */
export function getInvitationEmailSubject(organizationName: string): string {
	return `Zaproszenie do organizacji "${organizationName}" - BastionDesk`;
}
