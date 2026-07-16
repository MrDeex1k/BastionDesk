/**
 * Email Template - Reset Hasła
 *
 * Template HTML dla emaila z linkiem do resetowania hasła.
 */

export interface PasswordResetEmailData {
	userName: string;
	userEmail: string;
	resetUrl: string;
	token?: string; // Opcjonalnie
}

/**
 * Generuje HTML emaila resetującego hasło
 */
export function generatePasswordResetEmailHtml(data: PasswordResetEmailData): string {
	const { userName, userEmail, resetUrl } = data;

	return `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset hasła - BastionDesk</title>
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
            background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
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
            color: #cffafe;
            font-size: 14px;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            color: #1a202c;
            margin: 0 0 20px 0;
        }
        .message {
            font-size: 16px;
            line-height: 1.6;
            color: #4a5568;
            margin: 0 0 30px 0;
        }
        .button-container {
            text-align: center;
            margin: 40px 0;
        }
        .button {
            display: inline-block;
            padding: 16px 40px;
            background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 6px rgba(6, 182, 212, 0.25);
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
            border-left: 4px solid #06b6d4;
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
            color: #06b6d4;
            font-family: monospace;
        }
        .warning {
            background-color: #fff5f5;
            border-left: 4px solid #f56565;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .warning p {
            margin: 0;
            font-size: 14px;
            color: #742a2a;
        }
        .info-box {
            background-color: #fef5e7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info-box p {
            margin: 0;
            font-size: 14px;
            color: #92400e;
        }
        .security-tips {
            background-color: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .security-tips h3 {
            margin: 0 0 10px 0;
            font-size: 15px;
            color: #065f46;
        }
        .security-tips ul {
            margin: 0;
            padding-left: 20px;
            font-size: 13px;
            color: #047857;
        }
        .security-tips li {
            margin: 5px 0;
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
            <p class="greeting">Witaj, ${userName}!</p>
            
            <p class="message">
                Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w systemie 
                <strong>BastionDesk</strong>. Kliknij poniższy przycisk, aby ustawić 
                nowe hasło.
            </p>

            <div class="info-box">
                <p><strong>Konto:</strong> ${userEmail}</p>
            </div>

            <!-- CTA Button -->
            <div class="button-container">
                <a href="${resetUrl}" class="button">
                    Resetuj hasło
                </a>
            </div>

            <p class="message" style="text-align: center; font-size: 14px; color: #718096;">
                Ten link jest ważny przez <strong>1 godzinę</strong> od momentu wysłania.
            </p>

            <div class="divider"></div>

            <!-- Alternative Link -->
            <div class="alternative-link">
                <p><strong>Nie działa przycisk?</strong></p>
                <p>Skopiuj i wklej poniższy link do przeglądarki:</p>
                <p class="link-text">${resetUrl}</p>
            </div>

            <!-- Warning -->
            <div class="warning">
                <p>
                    <strong>Nie prosiłeś o reset hasła?</strong><br>
                    Jeśli to nie Ty wysłałeś tę prośbę, zignoruj ten email. 
                    Twoje hasło pozostanie niezmienione. Zalecamy jednak zmianę hasła 
                    i włączenie uwierzytelniania dwuskładnikowego dla większego bezpieczeństwa.
                </p>
            </div>

            <!-- Security Tips -->
            <div class="security-tips">
                <h3>Wskazówki dotyczące bezpiecznego hasła:</h3>
                <ul>
                    <li>Użyj co najmniej 10 znaków</li>
                    <li>Połącz wielkie i małe litery, cyfry oraz znaki specjalne</li>
                    <li>Unikaj popularnych słów i dat urodzenia</li>
                    <li>Nie używaj tego samego hasła w różnych serwisach</li>
                    <li>Rozważ użycie menedżera haseł</li>
                </ul>
            </div>

            <p class="message" style="font-size: 14px; margin-top: 30px;">
                Po zresetowaniu hasła zalecamy włączenie uwierzytelniania 
                dwuskładnikowego (2FA) w ustawieniach konta.
            </p>

            <p class="message" style="font-size: 14px;">
                Masz pytania? Skontaktuj się z naszym zespołem wsparcia.
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
 * Generuje subject emaila resetującego hasło
 */
export function getPasswordResetEmailSubject(): string {
	return "Reset hasła do konta BastionDesk";
}
