//Type Definitions

export type LoginMethod = "password" | "passkey" | "oauth";
export type UserRole = "admin" | "analityk" | "pracownik";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";
// Zgodne z 03-create-app.sql: IncidentStatus ENUM (polskie nazwy)
export type IncidentStatus =
	| "Zgłoszony"
	| "Raport w trakcie"
	| "Raport złożony"
	| "Sprawozdanie w trakcie"
	| "Sprawozdanie złożone"
	| "Odrzucone";

// Zgodne z 03-create-app.sql: incident_category ENUM
export type IncidentCategory = "Czerwony" | "Żółty" | "Zielony";

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
	};
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface User {
	id: string;
	name: string | null;
	email: string;
	emailVerified: boolean;
	image: string | null;
	isActive: boolean;
	passwordCompromised: boolean | null;
	passwordLastCheckedAt: Date | null;
	lastLoginMethod: LoginMethod | null;
	lastLoginAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Organization {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date | null;
}

export interface Member {
	id: string;
	organizationId: string;
	userId: string;
	role: UserRole;
	createdAt: Date;
	updatedAt: Date | null;
}

export interface Team {
	id: string;
	organizationId: string;
	name: string;
	createdAt: Date;
	updatedAt: Date | null;
}

// Zgodne z 03-create-app.sql: tabela incidents
export interface Incident {
	id: string;
	dataZgloszenia: Date;
	userId: string;
	organizationId: string;
	status: IncidentStatus;
	userDescription: string;
	// Screenshot (opcjonalny)
	userScreenshotPath: string | null;
	userScreenshotMetadata: Record<string, unknown>;
	// Attachment (opcjonalny)
	userAttachmentPath: string | null;
	userAttachmentMetadata: Record<string, unknown>;
	// Analityk
	analystId: string | null;
	analystNote: string | null;
	czyRozwiazany: boolean;
	dataRozwiazania: Date | null;
	// Raport analityka
	analystReportPath: string | null;
	analystReportMetadata: Record<string, unknown>;
	analystReportData: Date | null;
	// Sprawozdanie analityka
	analystStatementPath: string | null;
	analystStatementMetadata: Record<string, unknown>;
	analystStatementData: Date | null;
	// LLM kategoria
	llmCategory: IncidentCategory | null;
	createdAt: Date;
	updatedAt: Date;
}

// Typ dla tworzenia incydentu
export interface CreateIncidentInput {
	userDescription: string;
	screenshot?: File;
	attachment?: File;
}

// Typ dla metadanych plików
export interface FileMetadata {
	originalName: string;
	size: number;
	mimeType: string;
	uploadedAt: string;
}

export interface IncidentAuditLog {
	id: number;
	incidentId: string;
	changedBy: string | null;
	oldStatus: IncidentStatus | null;
	newStatus: IncidentStatus | null;
	changedAt: Date;
}

export interface ExtendedSession {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	activeOrganizationId: string | null;
	activeTeamId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

