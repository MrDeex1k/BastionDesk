import type { ApiResponse, PaginatedApiResponse } from "./common";

export interface ApiFileMetadata {
  bucket?: string;
  filename?: string;
  mimeType?: string;
  originalName?: string;
  path?: string;
  size?: number;
  uploadedAt?: string;
}

interface Incident {
  id: string;
  dataZgloszenia: string;
  userId: string;
  organizationId: string;
  status: string;
  userDescription: string;
  userScreenshotPath?: string | null;
  userScreenshotMetadata?: ApiFileMetadata | null;
  userAttachmentPath?: string | null;
  userAttachmentMetadata?: ApiFileMetadata | null;
  analystId?: string | null;
  analystNote?: string | null;
  czyRozwiazany: boolean;
  dataRozwiazania?: string | null;
  analystReportPath?: string | null;
  analystReportMetadata?: ApiFileMetadata | null;
  analystReportData?: string | null;
  analystStatementPath?: string | null;
  analystStatementMetadata?: ApiFileMetadata | null;
  analystStatementData?: string | null;
  llmCategory?: string | null;
  createdAt?: string;
  updatedAt?: string;
  userName?: string | null;
  analystName?: string | null;
}

export type IncidentDetail = Incident;

export type IncidentDetailResponse = ApiResponse<IncidentDetail>;

export type IncidentsResponse = PaginatedApiResponse<Incident>;

export interface AdminIncidentAnalystFilter {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
}

export type AdminIncidentFiltersResponse = ApiResponse<{
  analysts: AdminIncidentAnalystFilter[];
}>;

export interface AdminIncidentsQueryInput {
  pagination: {
    page: number;
    limit: number;
  };
  filters?: {
    statuses?: string[];
    search?: string;
    analystIds?: string[];
    assignment?: "all" | "assigned" | "unassigned";
    resolved?: boolean;
    createdAt?: {
      from?: string;
      to?: string;
    };
    categories?: string[];
  };
  sort: Array<{
    field: "createdAt" | "updatedAt" | "status" | "dataZgloszenia" | "userId" | "analystId";
    direction: "asc" | "desc";
  }>;
}
