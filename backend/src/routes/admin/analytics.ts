import { Router } from 'express';
import type { Request, Response } from 'express';
import { query, queryOne } from '../../lib/database.js';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

// Wszystkie endpointy wymagają autoryzacji administratora
router.use(requireAuth);
router.use(requireRole(['admin']));

/**
 * Pobierz podstawowe statystyki incydentów dla organizacji administratora
 */
async function getIncidentStats(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = authReq.organizationId!;

		// Pobierz całkowitą liczbę incydentów
		const totalResult = await queryOne<{ count: number }>(`
			SELECT COUNT(*) as count FROM incidents WHERE "organizationId" = $1
		`, [organizationId]);

		const totalIncidents = totalResult?.count || 0;

		// Pobierz liczbę rozwiązanych incydentów
		const resolvedResult = await queryOne<{ count: number }>(`
			SELECT COUNT(*) as count FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true
		`, [organizationId]);

		const resolvedIncidents = resolvedResult?.count || 0;

		// Oblicz procent rozwiązanych
		const resolvedPercentage = totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 0;

		// Pobierz średni czas rozwiązywania w sekundach
		const avgTimeResult = await queryOne<{ avg_time_seconds: number | null }>(`
			SELECT
				AVG(EXTRACT(EPOCH FROM ("dataRozwiazania" - "dataZgloszenia"))) as avg_time_seconds
			FROM incidents
			WHERE "organizationId" = $1 AND "czyRozwiazany" = true AND "dataRozwiazania" IS NOT NULL
		`, [organizationId]);

		let avgResolutionTime = null;
		if (avgTimeResult?.avg_time_seconds) {
			const totalSeconds = Math.floor(avgTimeResult.avg_time_seconds);
			const days = Math.floor(totalSeconds / 86400);
			const hours = Math.floor((totalSeconds % 86400) / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			const seconds = totalSeconds % 60;

			avgResolutionTime = {
				days,
				hours,
				minutes,
				seconds,
				totalSeconds
			};
		}

		// Pobierz rozkład po statusach
		const statusStats = await query<{ status: string; count: number }>(`
			SELECT status, COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1
			GROUP BY status
			ORDER BY count DESC
		`, [organizationId]);

		// Pobierz rozkład po kategoriach LLM
		const categoryStats = await query<{ category: string; count: number }>(`
			SELECT "llmCategory" as category, COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1 AND "llmCategory" IS NOT NULL
			GROUP BY "llmCategory"
			ORDER BY count DESC
		`, [organizationId]);

		res.json({
			success: true,
			data: {
				totalIncidents,
				resolvedIncidents,
				resolvedPercentage: Math.round(resolvedPercentage * 100) / 100, // Zaokrąglij do 2 miejsc po przecinku
				avgResolutionTime,
				statusBreakdown: statusStats,
				categoryBreakdown: categoryStats,
			},
		});
	} catch (error) {
		console.error('[ADMIN] Get incident stats error:', error);
		res.status(500).json({
			success: false,
			error: {
				code: 'GET_STATS_ERROR',
				message: 'Nie udało się pobrać statystyk',
			},
		});
	}
}

/**
 * Pobierz szczegółowe metryki incydentów dla organizacji administratora
 */
async function getIncidentMetrics(req: Request, res: Response) {
	try {
		const authReq = req as AuthenticatedRequest;
		const organizationId = authReq.organizationId!;
		const period = (req.query.period as string) || '30'; // Domyślnie 30 dni
		const days = parseInt(period, 10);

		if (isNaN(days) || days < 1 || days > 365) {
			return res.status(400).json({
				success: false,
				error: {
					code: 'INVALID_PERIOD',
					message: 'Okres musi być liczbą między 1 a 365 dni',
				},
			});
		}

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		// Incydenty w okresie czasu
		const periodStats = await query<{ date: string; count: number }>(`
			SELECT
				DATE("createdAt") as date,
				COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1 AND "createdAt" >= $2
			GROUP BY DATE("createdAt")
			ORDER BY date
		`, [organizationId, cutoffDate.toISOString()]);

		// Rozwiązania w okresie czasu
		const resolutionStats = await query<{ date: string; count: number }>(`
			SELECT
				DATE("dataRozwiazania") as date,
				COUNT(*) as count
			FROM incidents
			WHERE "organizationId" = $1 AND "dataRozwiazania" >= $2
			GROUP BY DATE("dataRozwiazania")
			ORDER BY date
		`, [organizationId, cutoffDate.toISOString()]);

		// Średni czas rozwiązywania dziennie
		const dailyAvgTime = await query<{ date: string; avg_time_hours: number }>(`
			SELECT
				DATE("dataRozwiazania") as date,
				AVG(EXTRACT(EPOCH FROM ("dataRozwiazania" - "dataZgloszenia")) / 3600) as avg_time_hours
			FROM incidents
			WHERE "organizationId" = $1 AND "dataRozwiazania" >= $2 AND "czyRozwiazany" = true
			GROUP BY DATE("dataRozwiazania")
			ORDER BY date
		`, [organizationId, cutoffDate.toISOString()]);

		// Statystyki po użytkownikach (top reporterzy)
		const userStats = await query<{ userId: string; userName: string; count: number }>(`
			SELECT
				i."userId",
				u.name as "userName",
				COUNT(*) as count
			FROM incidents i
			LEFT JOIN "user" u ON i."userId" = u.id
			WHERE i."organizationId" = $1 AND i."createdAt" >= $2
			GROUP BY i."userId", u.name
			ORDER BY count DESC
			LIMIT 10
		`, [organizationId, cutoffDate.toISOString()]);

		// Statystyki po analitykach (top rozwiązywacze)
		const analystStats = await query<{ analystId: string; analystName: string; resolved: number }>(`
			SELECT
				i."analystId",
				a.name as "analystName",
				COUNT(*) as resolved
			FROM incidents i
			LEFT JOIN "user" a ON i."analystId" = a.id
			WHERE i."organizationId" = $1 AND i."czyRozwiazany" = true AND i."dataRozwiazania" >= $2
			GROUP BY i."analystId", a.name
			ORDER BY resolved DESC
			LIMIT 10
		`, [organizationId, cutoffDate.toISOString()]);

		res.json({
			success: true,
			data: {
				period: {
					days,
					startDate: cutoffDate.toISOString(),
				},
				timeSeries: {
					incidentsCreated: periodStats,
					incidentsResolved: resolutionStats,
					avgResolutionTimeHours: dailyAvgTime,
				},
				topUsers: userStats,
				topAnalysts: analystStats,
			},
		});
	} catch (error) {
		console.error('[ADMIN] Get incident metrics error:', error);
		res.status(500).json({
			success: false,
			error: {
				code: 'GET_METRICS_ERROR',
				message: 'Nie udało się pobrać metryk',
			},
		});
	}
}

// Routes
router.get('/stats', getIncidentStats);
router.get('/metrics', getIncidentMetrics);

export default router;