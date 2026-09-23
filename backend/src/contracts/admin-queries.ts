import { z } from "zod";
import { incidentCategorySchema, incidentStatusSchema, pageRequestSchema } from "./index.js";

const userIdSchema = z.string().min(1).max(128);

const sortFieldSchema = z.enum([
	"createdAt",
	"updatedAt",
	"status",
	"dataZgloszenia",
	"userId",
	"analystId",
]);

const sortDirectionSchema = z.enum(["asc", "desc"]);

const dateRangeSchema = z
	.strictObject({
		from: z.iso.datetime({ offset: true }).optional(),
		to: z.iso.datetime({ offset: true }).optional(),
	})
	.refine(({ from, to }) => from !== undefined || to !== undefined, {
		message: "Zakres dat musi zawierać co najmniej pole from lub to",
	})
	.refine(({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to), {
		message: "Początek zakresu dat nie może być późniejszy niż koniec",
		path: ["to"],
	})
	.refine(
		({ from, to }) =>
			!from || !to || Date.parse(to) - Date.parse(from) <= 366 * 24 * 60 * 60 * 1000,
		{
			message: "Zakres dat nie może przekraczać 366 dni",
			path: ["to"],
		},
	);

const analyticsRangeSchema = z.union([
	z.strictObject({
		lastDays: z.number().int().min(1).max(365),
	}),
	z
		.strictObject({
			from: z.iso.datetime({ offset: true }),
			to: z.iso.datetime({ offset: true }),
		})
		.refine(({ from, to }) => Date.parse(from) <= Date.parse(to), {
			message: "Początek zakresu dat nie może być późniejszy niż koniec",
			path: ["to"],
		})
		.refine(({ from, to }) => Date.parse(to) - Date.parse(from) <= 366 * 24 * 60 * 60 * 1000, {
			message: "Zakres dat nie może przekraczać 366 dni",
			path: ["to"],
		}),
]);

const timezoneSchema = z
	.string()
	.min(1)
	.max(100)
	.refine(
		(timezone) => {
			try {
				new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
				return true;
			} catch {
				return false;
			}
		},
		{ message: "Nieprawidłowa strefa czasowa" },
	);

export const adminIncidentsQuerySchema = z
	.strictObject({
		pagination: pageRequestSchema.default({ page: 1, limit: 20 }),
		filters: z
			.strictObject({
				statuses: z.array(incidentStatusSchema).max(6).optional(),
				search: z.string().trim().min(1).max(200).optional(),
				analystIds: z.array(userIdSchema).max(50).optional(),
				assignment: z.enum(["all", "assigned", "unassigned"]).default("all"),
				resolved: z.boolean().optional(),
				createdAt: dateRangeSchema.optional(),
				categories: z.array(incidentCategorySchema).max(3).optional(),
			})
			.default({ assignment: "all" }),
		sort: z
			.array(
				z.strictObject({
					field: sortFieldSchema,
					direction: sortDirectionSchema,
				}),
			)
			.min(1)
			.max(3)
			.default([{ field: "createdAt", direction: "desc" }]),
	})
	.refine(({ filters }) => filters.assignment !== "unassigned" || !filters.analystIds?.length, {
		message: "Nie można łączyć assignment=unassigned z analystIds",
		path: ["filters", "analystIds"],
	});

const analyticsMetricSchema = z.enum([
	"incidentsCreated",
	"incidentsResolved",
	"averageResolutionTime",
	"topUsers",
	"topAnalysts",
]);

export const adminMetricsQuerySchema = z.strictObject({
	range: analyticsRangeSchema.default({ lastDays: 30 }),
	timezone: timezoneSchema.default("Europe/Warsaw"),
	groupBy: z.enum(["day", "week", "month"]).default("day"),
	filters: z
		.strictObject({
			statuses: z.array(incidentStatusSchema).max(6).optional(),
			categories: z.array(incidentCategorySchema).max(3).optional(),
			analystIds: z.array(userIdSchema).max(50).optional(),
		})
		.default({}),
	metrics: z
		.array(analyticsMetricSchema)
		.min(1)
		.max(5)
		.default([
			"incidentsCreated",
			"incidentsResolved",
			"averageResolutionTime",
			"topUsers",
			"topAnalysts",
		]),
});

export type AdminIncidentsQuery = z.infer<typeof adminIncidentsQuerySchema>;
export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;
