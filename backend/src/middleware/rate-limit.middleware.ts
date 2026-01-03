/**
 * Rate Limiting Middleware
 *
 * Zabezpiecza własne endpointy przed nadmierną liczbą requestów.
 * Konfiguracja odpowiada domyślnym ustawieniom Better-Auth:
 * - 100 requestów na 10 sekund (default Better-Auth)
 */

import { rateLimit } from "express-rate-limit";

/**
 * Główny limiter dla wszystkich własnych endpointów
 * Dopasowany do domyślnej konfiguracji Better-Auth
 */
export const apiRateLimiter = rateLimit({
	windowMs: 10 * 1000, // 10 sekund (jak Better-Auth domyślnie)
	limit: 100, // 100 requestów na okno (jak Better-Auth domyślnie)

	// Standardowe nagłówki rate limit (draft-8 - najnowszy)
	standardHeaders: "draft-8",
	legacyHeaders: false,

	// Message zwracany po przekroczeniu limitu
	message: {
		success: false,
		error: "Too many requests, please try again later.",
		code: "RATE_LIMIT_EXCEEDED",
	},

	// Status code
	statusCode: 429,

	// Dodaj informacje o rate limit do req object
	requestPropertyName: "rateLimit",

	// Skip successful requests (nie liczmy pomyślnych odpowiedzi)
	skipSuccessfulRequests: false,

	// Skip failed requests
	skipFailedRequests: false,
});

/**
 * Bardziej restrykcyjny limiter dla wrażliwych operacji
 * (np. upload plików, tworzenie raportów)
 */
export const strictRateLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minuta
	limit: 10, // Tylko 10 requestów na minutę

	standardHeaders: "draft-8",
	legacyHeaders: false,

	message: {
		success: false,
		error: "Too many requests for this operation, please try again later.",
		code: "RATE_LIMIT_EXCEEDED",
	},

	statusCode: 429,
	requestPropertyName: "rateLimit",
});
