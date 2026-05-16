export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
  pagination: Pagination;
}
