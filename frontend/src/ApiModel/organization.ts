interface OrganizationMemberUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: string;
  user: OrganizationMemberUser;
}

export interface OrganizationMembersResponse {
  members: OrganizationMember[];
  total: number;
  limit: number;
  offset: number;
}
